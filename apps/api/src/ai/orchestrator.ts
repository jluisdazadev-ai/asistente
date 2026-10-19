import { prisma, ConversationStatus, MessageFormat, MessageDirection, MessageSender } from '@crm/database';
import { getGeminiModel } from '../lib/gemini';
import { aiFunctionDeclarations } from './tools/definitions';
import { executeToolCall } from './tools/executor';

export interface ProcessInboundPromptOptions {
  tenantId: string;
  conversationId: string;
  contactId: string;
  unifiedPromptText: string;
}

export async function processConversationWithAI(options: ProcessInboundPromptOptions): Promise<string | null> {
  const { tenantId, conversationId, contactId, unifiedPromptText } = options;

  // 1. Verificar estado actual de la conversación
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      tenant: {
        include: {
          botConfig: true,
          businessHours: true,
        },
      },
      contact: true,
    },
  });

  if (!conversation) {
    console.error(`Conversación ${conversationId} no encontrada.`);
    return null;
  }

  // Si está asignado a humano o cerrado, la IA NO interviene
  if (conversation.status !== ConversationStatus.BOT_ACTIVE) {
    console.log(`Conversación ${conversationId} en estado ${conversation.status}. IA silenciada.`);
    return null;
  }

  const botConfig = conversation.tenant.botConfig;
  if (!botConfig || !botConfig.isActive) {
    console.log(`Bot inactivo o no configurado para tenant ${tenantId}.`);
    return null;
  }

  // 2. Verificar horarios de atención
  if (botConfig.outOfHoursReplyEnabled && conversation.tenant.businessHours.length > 0) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHourMin = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const todayHour = conversation.tenant.businessHours.find((h) => h.dayOfWeek === currentDay);
    if (todayHour) {
      const isOutside = todayHour.isClosed || currentHourMin < todayHour.openTime || currentHourMin > todayHour.closeTime;
      if (isOutside) {
        return botConfig.outOfHoursMessage || '¡Hola! En este momento estamos fuera de nuestro horario de atención.';
      }
    }
  }

  // 3. Construir System Instruction dinámico
  const toneMap: Record<string, string> = {
    FRIENDLY: 'Cálido, amable, servicial y empático. Usa emojis moderados.',
    FORMAL: 'Corporativo, respetuoso, pulcro y sumamente profesional.',
    AGGRESSIVE_SALES: 'Enfocado en cerrar la venta ya, resaltar promociones y escasez con entusiasmo.',
    TECH_SUPPORT: 'Analítico, paciente, orientado a resolver problemas paso a paso.',
    CONCILIATORY: 'Comprensivo, calmado y enfocado en resolver quejas cordialmente.',
  };

  const systemInstruction = `
Eres "${botConfig.botName}", el asistente virtual oficial de "${conversation.tenant.businessName}".
Tu rol principal: ${botConfig.roleDescription}

TONO DE VOZ:
${toneMap[botConfig.tone] || toneMap.FRIENDLY}

REGLAS DE NEGOCIO ESTRICTAS:
${botConfig.businessRules || 'Atiende amablemente y brinda información veraz.'}

DIRECTIVAS OPERATIVAS:
1. Responde de forma concisa y amigable, con un formato limpio ideal para WhatsApp (párrafos cortos, viñetas si listas productos).
2. Usa la herramienta 'check_catalog_and_stock' para consultar productos, precios y disponibilidad en lugar de inventar datos.
3. Si el cliente pide productos o un pedido, utiliza 'create_or_update_order' para calcular el monto exacto con domicilio y darle el total.
4. Cuando el cliente pida cómo pagar o envíe el pedido, usa 'get_payment_information' para suministrar las cuentas de transferencia (Nequi, Bancolombia, etc.).
5. Si el cliente envía un comprobante de pago o transferencia, utiliza 'verify_payment_receipt' para confirmarlo. Si es verificado, felicítalo y confirma el pedido.
6. Actualiza las etapas del CRM usando 'update_crm_stage' a medida que la conversación avanza (ej. 'IN_QUERY' al preguntar el menú, 'AWAITING_PAYMENT' al enviar las cuentas, 'CONFIRMED' tras pagar).
7. Si el cliente solicita explícitamente hablar con un humano o se presenta una queja/problema, transfiere de inmediato con 'handoff_to_human_agent'.
8. Si el cliente envía una consulta detallada sobre manuales o políticas complejas, consulta 'search_knowledge_base'.

${botConfig.customSystemPrompt ? `INSTRUCCIONES ADICIONALES DEL DUEÑO:\n${botConfig.customSystemPrompt}` : ''}
`.trim();

  // 4. Cargar historial reciente de mensajes
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  recentMessages.reverse();

  // Mapear historial al formato de Gemini
  const contentsHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of recentMessages) {
    if (!msg.body) continue;
    const role = msg.sender === MessageSender.CUSTOMER ? 'user' : 'model';
    contentsHistory.push({
      role,
      parts: [{ text: msg.body }],
    });
  }

  // 5. Inicializar modelo de Gemini con Function Calling
  const model = getGeminiModel({
    systemInstruction,
    temperature: Number(botConfig.temperature),
    tools: [{ functionDeclarations: aiFunctionDeclarations }],
  });

  const chat = model.startChat({
    history: contentsHistory.slice(0, -1), // dejamos el último turno afuera si ya estaba en BD
  });

  try {
    let result = await chat.sendMessage(unifiedPromptText);
    let response = result.response;

    // Ciclo de Function Calling (máximo 5 iteraciones de herramientas)
    let maxLoops = 5;
    while (response.functionCalls() && response.functionCalls()!.length > 0 && maxLoops > 0) {
      maxLoops--;
      const functionCalls = response.functionCalls()!;
      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        const executionOutput = await executeToolCall(
          tenantId,
          conversationId,
          contactId,
          call.name,
          call.args
        );

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: executionOutput,
          },
        });
      }

      // Enviar resultado de las herramientas al modelo
      result = await chat.sendMessage(functionResponses);
      response = result.response;
    }

    const replyText = response.text();
    return replyText;
  } catch (err: any) {
    console.error('Error durante la orquestación de Gemini con Tools:', err);
    return '¡Hola! He recibido tu mensaje pero tuve un pequeño inconveniente procesándolo. En un momento un asesor te atenderá.';
  }
}
