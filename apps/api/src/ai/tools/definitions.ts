import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export const aiFunctionDeclarations: FunctionDeclaration[] = [
  {
    name: 'check_catalog_and_stock',
    description: 'Consulta productos, platos o servicios del catálogo del negocio para saber precios, variantes, ingredientes, fotos y disponibilidad de inventario.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Nombre o término del producto o plato buscado (ej. "hamburguesa doble", "malteada", "combo").',
        },
        category: {
          type: SchemaType.STRING,
          description: 'Categoría opcional (ej. "Hamburguesas", "Bebidas", "Acompañamientos").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Búsqueda semántica RAG en documentos oficiales del negocio (PDFs, políticas de garantía, manuales de servicio, preguntas frecuentes).',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        question: {
          type: SchemaType.STRING,
          description: 'Pregunta detallada a consultar en la base de conocimiento.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'create_or_update_order',
    description: 'Crea o actualiza una orden de pedido en el CRM cuando el cliente confirma lo que va a ordenar.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          description: 'Lista de ítems del pedido.',
          items: {
            type: SchemaType.OBJECT,
            properties: {
              productId: {
                type: SchemaType.STRING,
                description: 'ID del producto obtenido previamente en check_catalog_and_stock.',
              },
              productName: {
                type: SchemaType.STRING,
                description: 'Nombre del producto.',
              },
              quantity: {
                type: SchemaType.INTEGER,
                description: 'Cantidad de unidades.',
              },
              variantSelected: {
                type: SchemaType.STRING,
                description: 'Variante seleccionada si aplica (ej. "Término medio", "Salsa BBQ").',
              },
            },
            required: ['productId', 'productName', 'quantity'],
          },
        },
        deliveryZoneName: {
          type: SchemaType.STRING,
          description: 'Nombre de la zona, barrio o sector para calcular el costo de envío.',
        },
        deliveryAddress: {
          type: SchemaType.STRING,
          description: 'Dirección física completa indicada por el cliente.',
        },
        notes: {
          type: SchemaType.STRING,
          description: 'Instrucciones especiales para cocina o entrega.',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_payment_information',
    description: 'Obtiene las cuentas bancarias autorizadas del negocio (Nequi, Bancolombia, Daviplata) o link de pago para que el cliente transfiera.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        paymentPreference: {
          type: SchemaType.STRING,
          description: 'Preferencia indicada por el cliente (ej. "NEQUI", "BANCOLOMBIA", "DAVIPLATA", "CUALQUIERA").',
        },
      },
      required: ['paymentPreference'],
    },
  },
  {
    name: 'verify_payment_receipt',
    description: 'Valida un comprobante de transferencia bancaria enviado por el cliente frente al valor de la orden pendiente.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        referenceCode: {
          type: SchemaType.STRING,
          description: 'Código de referencia o comprobante de la transacción.',
        },
        amountDetected: {
          type: SchemaType.NUMBER,
          description: 'Monto en dinero detectado en el comprobante.',
        },
        bankDetected: {
          type: SchemaType.STRING,
          description: 'Nombre del banco o billetera digital detectada.',
        },
      },
      required: ['referenceCode', 'amountDetected'],
    },
  },
  {
    name: 'update_crm_stage',
    description: 'Mueve la conversación a la etapa correspondiente en el embudo de ventas Kanban del CRM.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        stageKey: {
          type: SchemaType.STRING,
          description: 'Etapa del CRM: NEW_LEAD, IN_QUERY, AWAITING_PAYMENT, CONFIRMED, COMPLETED, LOST.',
        },
        reason: {
          type: SchemaType.STRING,
          description: 'Justificación del cambio de etapa en el embudo.',
        },
      },
      required: ['stageKey'],
    },
  },
  {
    name: 'handoff_to_human_agent',
    description: 'Pausa el bot de IA inmediatamente y transfiere la conversación a un operador humano del negocio emitiendo una alarma acústica.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: {
          type: SchemaType.STRING,
          description: 'Motivo: CLIENT_REQUESTED_HUMAN, PAYMENT_VERIFIED_NEEDS_CONFIRMATION, COMPLAINT, COMPLEX_INQUIRY.',
        },
        summaryForAgent: {
          type: SchemaType.STRING,
          description: 'Resumen claro en 1-2 frases para que el agente humano entre en contexto al instante.',
        },
        urgency: {
          type: SchemaType.STRING,
          description: 'Nivel de urgencia: NORMAL, HIGH, CRITICAL.',
        },
      },
      required: ['reason', 'summaryForAgent'],
    },
  },
];
