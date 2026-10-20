import { prisma, ConversationStatus, MessageFormat, MessageDirection, MessageSender } from '@crm/database';
import { getGeminiModel } from '../lib/gemini';

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

  // 3. Consultar productos, cuentas y zonas para inyectar en el contexto de Gemini
  const isSaasSales = conversation.tenant.slug === 'plataforma-saas';

  const [products, bankAccounts, deliveryZones, activePlans] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isStockActive: true },
      take: 20,
    }),
    prisma.bankAccount.findMany({
      where: { tenantId, isActive: true },
    }),
    prisma.deliveryZone.findMany({
      where: { tenantId },
    }),
    isSaasSales
      ? prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceCents: 'asc' } })
      : Promise.resolve([]),
  ]);

  const plansSnippet = activePlans.length > 0
    ? activePlans
        .map(
          (p) =>
            `• ${p.name}: $${(p.priceCents / 100).toFixed(0)} ${p.currency}/mes\n  - Límite de conversaciones: ${p.maxConversationsPerMonth.toLocaleString()} mensajes/mes\n  - Usuarios simultáneos: ${p.maxTeamMembers} agentes\n  - Características: ${p.allowQrGateway ? 'Conexión QR' : ''} ${p.allowOfficialGateway ? '+ Meta API Oficial' : ''} ${p.allowVisionOcr ? '+ Validación de comprobantes con IA' : ''} ${p.allowVoiceNotes ? '+ Notas de voz' : ''}`
        )
        .join('\n\n')
    : '';

  const catalogSnippet = isSaasSales
    ? `PLANES Y SUSCRIPCIONES OFICIALES DISPONIBLES:\n${plansSnippet}`
    : products.length > 0
    ? products.map((p) => `• ${p.name} ($${p.price.toLocaleString('es-CO')}): ${p.description}`).join('\n')
    : 'Menú disponible consultando directamente con un asesor.';

  const bankSnippet = bankAccounts.length > 0
    ? bankAccounts.map((b) => `• ${b.bankName} (${b.accountType}): ${b.accountNumber} - Titular: ${b.holderName}`).join('\n')
    : 'Cuentas para transferencia: Nequi / Bancolombia.';

  const zonesSnippet = deliveryZones.length > 0
    ? deliveryZones.map((z) => `• ${z.zoneName}: $${z.price.toLocaleString('es-CO')} (aprox. ${z.estimatedMinutes} min)`).join('\n')
    : 'Cobertura en toda la ciudad.';

  // 4. Construir System Instruction dinámico enriquecido
  const toneMap: Record<string, string> = {
    FRIENDLY: 'Cálido, amable, servicial y empático. Usa emojis moderados.',
    FORMAL: 'Corporativo, respetuoso, pulcro y sumamente profesional.',
    AGGRESSIVE_SALES: 'Enfocado en cerrar la venta ya, resaltar promociones y escasez con entusiasmo.',
    TECH_SUPPORT: 'Analítico, paciente, orientado a resolver problemas paso a paso.',
    CONCILIATORY: 'Comprensivo, calmado y enfocado en resolver quejas cordialmente.',
  };

  const saasDirectives = `
DIRECTIVAS DE VENTA DEL SAAS (FACEBOOK ADS):
1. Eres "Sofía", asesora comercial experta en la plataforma de CRM y Asistentes Virtuales de WhatsApp para negocios.
2. Tu objetivo es cautivar a los prospectos que vienen de anuncios de Facebook/Instagram (*Click to WhatsApp*), resolver dudas y guiarlos a contratar uno de los planes.
3. Explica los beneficios clave:
   - Atención inmediata 24/7 sin perder clientes.
   - Ahorro de más del 70% en personal de atención al cliente.
   - Validación automática de comprobantes de pago por transferencia bancaria (Nequi, Bancolombia, etc.).
   - Anti-baneo con simulación de comportamiento y escritura humana.
   - Bandeja multi-agente para que varios operadores atiendan la misma línea.
4. Cuando pregunten por precios o planes, cotiza con precisión los planes disponibles arriba.
5. Invita a activar su negocio o solicitar datos para darles una demostración personalizada.
`.trim();

  const systemInstruction = `
Eres "${botConfig.botName}", el asistente virtual oficial de "${conversation.tenant.businessName}".
Tu rol principal: ${botConfig.roleDescription}

TONO DE VOZ:
${toneMap[botConfig.tone] || toneMap.FRIENDLY}

REGLAS DE NEGOCIO ESTRICTAS:
${botConfig.businessRules || 'Atiende amablemente y brinda información veraz.'}

${isSaasSales ? saasDirectives : `CATÁLOGO OFICIAL Y PRECIOS:\n${catalogSnippet}\n\nZONAS DE DOMICILIO:\n${zonesSnippet}\n\nCUENTAS PARA PAGO / TRANSFERENCIA:\n${bankSnippet}`}

DIRECTIVAS OPERATIVAS:
1. Responde de forma concisa, cálida y amigable, con un formato limpio ideal para WhatsApp (párrafos cortos, viñetas para listar opciones).
2. Si preguntan si hay servicio o saludan, confirma con entusiasmo el servicio activo y menciona las hamburguesas más pedidas con sus precios reales.
3. Si el cliente pide productos o un pedido, suma los productos más el domicilio según su zona y dale el total claro.
4. Si pide cómo pagar o confirma el pedido, suministra las cuentas de transferencia (Nequi, Bancolombia).
5. Si el cliente pide hablar con un humano o asesor, indícale amablemente que un asesor se comunicará en breve y agrega al final de tu mensaje la etiqueta [ACCION: HUMANO].
6. A medida que avance el pedido, puedes agregar discretamente al final de tu mensaje una etiqueta para el embudo: [ETAPA: IN_QUERY], [ETAPA: AWAITING_PAYMENT], o [ETAPA: CONFIRMED].

${botConfig.customSystemPrompt ? `INSTRUCCIONES ADICIONALES DEL DUEÑO:\n${botConfig.customSystemPrompt}` : ''}
`.trim();

  // 5. Cargar historial reciente de mensajes
  const recentMessages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  recentMessages.reverse();

  const sanitizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  const historyPool = recentMessages.slice(0, -1);

  for (const msg of historyPool) {
    if (!msg.body || msg.body.trim().length === 0) continue;
    const role: 'user' | 'model' = msg.sender === MessageSender.CUSTOMER ? 'user' : 'model';

    if (sanitizedHistory.length === 0) {
      if (role !== 'user') continue;
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

  if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
    sanitizedHistory.pop();
  }

  // 6. Ejecución del modelo Gemini
  try {
    const model = getGeminiModel({
      systemInstruction,
      temperature: Number(botConfig.temperature),
    });

    const chat = model.startChat({
      history: sanitizedHistory,
    });

    console.log(`🤖 [Gemini IA] Generando respuesta para conv ${conversationId} con mensaje: "${unifiedPromptText}"`);
    let result = await chat.sendMessage(unifiedPromptText);
    let replyText = result.response.text();

    // Procesar etiquetas de control CRM
    if (replyText.includes('[ACCION: HUMANO]')) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: ConversationStatus.HUMAN_AGENT },
      });
      replyText = replyText.replace('[ACCION: HUMANO]', '').trim();
    }

    const stageMatch = replyText.match(/\[ETAPA:\s*([A-Z_]+)\]/);
    if (stageMatch) {
      const stageKey = stageMatch[1];
      const targetStage = await prisma.crmStage.findFirst({
        where: { pipeline: { tenantId }, stageKey },
      });
      if (targetStage) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { stageId: targetStage.id },
        });
      }
      replyText = replyText.replace(stageMatch[0], '').trim();
    }

    console.log(`✅ [Gemini IA Respuesta Lista]: "${replyText.substring(0, 60)}..."`);
    return replyText;
  } catch (err: any) {
    console.error('⚠️ [Error Gemini]:', err.message || err);

    // Fallback conversacional directo
    try {
      console.log('🔄 [Gemini Fallback Directo] Intentando llamada generateContent directa...');
      const fallbackModel = getGeminiModel({
        systemInstruction,
        temperature: Number(botConfig.temperature),
      });

      const fallbackResult = await fallbackModel.generateContent(unifiedPromptText);
      const reply = fallbackResult.response.text();
      console.log(`✅ [Gemini Fallback Exitoso]: "${reply.substring(0, 60)}..."`);
      return reply;
    } catch (fallbackErr: any) {
      console.error('❌ [Error Crítico]:', fallbackErr.message || fallbackErr);
      return '¡Hola! He recibido tu mensaje. En un momento un asesor te atenderá con todo gusto.';
    }
  }
}
