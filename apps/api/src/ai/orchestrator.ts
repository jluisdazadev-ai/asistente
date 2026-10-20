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

  // Mapear historial al formato de Gemini garantizando alternancia estricta (user -> model)
  const sanitizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  // Excluimos el último mensaje ya que se envía como prompt activo en chat.sendMessage
  const historyPool = recentMessages.slice(0, -1);

  for (const msg of historyPool) {
    if (!msg.body || msg.body.trim().length === 0) continue;
    const role: 'user' | 'model' = msg.sender === MessageSender.CUSTOMER ? 'user' : 'model';

    if (sanitizedHistory.length === 0) {
      if (role !== 'user') continue; // El primer turno en Gemini debe ser 'user'
      sanitizedHistory.push({ role: 'user', parts: [{ text: msg.body }] });
      continue;
    }

    const last = sanitizedHistory[sanitizedHistory.length - 1];
    if (last.role === role) {
      last.parts[0].text += `\n${msg.body}`;
    } else {
      sanitizedHistory.push({ role, parts: [{ text: msg.body }] });
    }
  }

  // Si el historial termina en 'user', retirarlo para que no haya dos 'user' seguidos con sendMessage
  if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
    sanitizedHistory.pop();
  }

  // 5. Inicializar modelo de Gemini con Function Calling
  try {
    const model = getGeminiModel({
      systemInstruction,
      temperature: Number(botConfig.temperature),
      tools: [{ functionDeclarations: aiFunctionDeclarations }],
    });

    const chat = model.startChat({
      history: sanitizedHistory,
    });

    let result = await chat.sendMessage(unifiedPromptText);
    let response = result.response;

    // Helper seguro para obtener functionCalls
    const extractCalls = (res: any) => {
      if (typeof res.functionCalls === 'function') return res.functionCalls() || [];
      return res.functionCalls || [];
    };

    let calls = extractCalls(response);
    let maxLoops = 5;

    while (calls.length > 0 && maxLoops > 0) {
      maxLoops--;
      console.log(`🤖 [Gemini Function Call] Disparando ${calls.length} herramientas...`);
      const functionResponses: any[] = [];

      for (const call of calls) {
        console.log(`🔧 [Tool Ejecutada] ${call.name} con parámetros:`, JSON.stringify(call.args));
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

      result = await chat.sendMessage(functionResponses);
      response = result.response;
      calls = extractCalls(response);
    }

    let replyText = '';
    try {
      replyText = response.text();
    } catch {
      const candidate = response.candidates?.[0];
      const textParts = candidate?.content?.parts?.filter((p: any) => p.text)?.map((p: any) => p.text);
      replyText = textParts?.join('\n') || '';
    }

    return replyText;
  } catch (err: any) {
    console.error('⚠️ [Error Gemini con Tools]:', err.message || err);

    // Fallback conversacional sin herramientas
    try {
      console.log('🔄 [Gemini Fallback] Intentando generar respuesta conversacional directa sin herramientas...');
      const fallbackModel = getGeminiModel({
        systemInstruction,
        temperature: Number(botConfig.temperature),
      });

      const fallbackChat = fallbackModel.startChat({
        history: sanitizedHistory,
      });

      const fallbackResult = await fallbackChat.sendMessage(unifiedPromptText);
      const reply = fallbackResult.response.text();
      console.log(`✅ [Gemini Fallback Exitoso]: "${reply.substring(0, 50)}..."`);
      return reply;
    } catch (fallbackErr: any) {
      console.error('❌ [Error Gemini Fallback Crítico]:', fallbackErr.message || fallbackErr);
      return '¡Hola! He recibido tu mensaje pero tuve un pequeño inconveniente procesándolo. En un momento un asesor te atenderá.';
    }
  }
}
