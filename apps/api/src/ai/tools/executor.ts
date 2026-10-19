import { prisma, ConversationStatus, OrderStatus } from '@crm/database';
import { generateEmbedding } from '../../lib/gemini';
import { emitHandoffAlert, emitKanbanStageChange } from '../../lib/socket';

export async function executeToolCall(
  tenantId: string,
  conversationId: string,
  contactId: string,
  toolName: string,
  args: any
): Promise<any> {
  console.log(`🤖 [IA Tool Call] Ejecutando "${toolName}" con args:`, JSON.stringify(args));

  switch (toolName) {
    case 'check_catalog_and_stock': {
      const { query, category } = args;
      const whereClause: any = {
        tenantId,
        isActive: true,
      };

      if (category) {
        whereClause.category = { contains: category, mode: 'insensitive' };
      }

      if (query) {
        whereClause.OR = [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
        ];
      }

      const products = await prisma.product.findMany({
        where: whereClause,
        take: 5,
        select: {
          id: true,
          sku: true,
          name: true,
          description: true,
          price: true,
          category: true,
          stockQuantity: true,
          isStockActive: true,
          imageUrl: true,
          variants: true,
        },
      });

      return {
        found: products.length > 0,
        count: products.length,
        products: products.map((p) => ({
          ...p,
          priceFormatted: `$${Number(p.price).toLocaleString('es-CO')} COP`,
        })),
      };
    }

    case 'search_knowledge_base': {
      const { question } = args;
      try {
        const queryVector = await generateEmbedding(question);
        const vectorStr = `[${queryVector.join(',')}]`;

        // Búsqueda por similitud de cosenos usando SQL directo con extensión pgvector
        const results = await prisma.$queryRaw<Array<{ id: string; content: string; similarity: number }>>`
          SELECT id, content, 1 - (embedding <=> ${vectorStr}::vector) AS similarity
          FROM knowledge_embeddings
          WHERE tenant_id = ${tenantId}::uuid
          ORDER BY similarity DESC
          LIMIT 3;
        `;

        return {
          matches: results.map((r) => ({ content: r.content, similarity: Number(r.similarity) })),
        };
      } catch (err: any) {
        console.warn('Fallback en RAG Vector Search:', err.message);
        return {
          matches: [],
          note: 'Consulta el documento general de políticas del negocio.',
        };
      }
    }

    case 'create_or_update_order': {
      const { items, deliveryZoneName, deliveryAddress, notes } = args;

      let deliveryCost = 0;
      let deliveryZoneId: string | null = null;

      if (deliveryZoneName) {
        const zone = await prisma.deliveryZone.findFirst({
          where: {
            tenantId,
            zoneName: { contains: deliveryZoneName, mode: 'insensitive' },
            isActive: true,
          },
        });
        if (zone) {
          deliveryCost = Number(zone.price);
          deliveryZoneId = zone.id;
        }
      }

      let subtotal = 0;
      const orderItemsData: any[] = [];

      for (const item of items) {
        const prod = await prisma.product.findUnique({
          where: { id: item.productId },
        });
        const unitPrice = prod ? Number(prod.price) : 0;
        const itemSubtotal = unitPrice * item.quantity;
        subtotal += itemSubtotal;

        orderItemsData.push({
          productId: item.productId,
          productName: item.productName || prod?.name || 'Producto',
          unitPrice,
          quantity: item.quantity,
          subtotal: itemSubtotal,
          variantSelected: item.variantSelected ? { option: item.variantSelected } : {},
        });
      }

      const total = subtotal + deliveryCost;

      // Buscar si ya hay una orden en borrador en esta conversación
      let order = await prisma.order.findFirst({
        where: {
          tenantId,
          conversationId,
          status: { in: [OrderStatus.DRAFT, OrderStatus.AWAITING_PAYMENT] },
        },
      });

      if (order) {
        // Actualizar orden existente
        await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
        order = await prisma.order.update({
          where: { id: order.id },
          data: {
            subtotal,
            deliveryCost,
            total,
            deliveryAddress: deliveryAddress || order.deliveryAddress,
            deliveryZoneId: deliveryZoneId || order.deliveryZoneId,
            notes: notes || order.notes,
            orderItems: { create: orderItemsData },
          },
        });
      } else {
        // Crear nueva orden
        order = await prisma.order.create({
          data: {
            tenantId,
            conversationId,
            contactId,
            status: OrderStatus.DRAFT,
            subtotal,
            deliveryCost,
            total,
            deliveryAddress,
            deliveryZoneId,
            notes,
            orderItems: { create: orderItemsData },
          },
        });
      }

      return {
        orderId: order.id,
        subtotalFormatted: `$${subtotal.toLocaleString('es-CO')} COP`,
        deliveryCostFormatted: `$${deliveryCost.toLocaleString('es-CO')} COP`,
        totalFormatted: `$${total.toLocaleString('es-CO')} COP`,
        itemsCount: orderItemsData.length,
        message: 'Orden calculada exitosamente. Proporciona el resumen al cliente y solicita método de pago.',
      };
    }

    case 'get_payment_information': {
      const accounts = await prisma.bankAccount.findMany({
        where: { tenantId, isActive: true },
        select: {
          bankName: true,
          accountType: true,
          accountNumber: true,
          holderName: true,
          qrImageUrl: true,
        },
      });

      return {
        availableAccounts: accounts,
        paymentLinkAvailable: false,
        instructions: 'Indica al cliente las cuentas bancarias para transferir y solicita que envíe la foto o captura del comprobante.',
      };
    }

    case 'verify_payment_receipt': {
      const { referenceCode, amountDetected, bankDetected } = args;

      // Buscar la orden pendiente en la conversación
      const pendingOrder = await prisma.order.findFirst({
        where: {
          tenantId,
          conversationId,
          status: { in: [OrderStatus.DRAFT, OrderStatus.AWAITING_PAYMENT] },
        },
      });

      if (!pendingOrder) {
        return {
          verified: false,
          message: 'No se encontró una orden pendiente activa en este chat para asociar el comprobante.',
        };
      }

      const orderTotal = Number(pendingOrder.total);
      const isAmountValid = Math.abs(amountDetected - orderTotal) <= 50; // Tolerancia de centavos

      if (isAmountValid) {
        // Actualizar la orden a PAGADA
        await prisma.order.update({
          where: { id: pendingOrder.id },
          data: {
            status: OrderStatus.PAID,
            paymentMethod: bankDetected || 'TRANSFERENCIA',
            paymentReference: referenceCode,
            extractedReceiptData: args,
          },
        });

        // Actualizar conversación
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { isPaymentVerified: true },
        });

        return {
          verified: true,
          orderId: pendingOrder.id,
          amountDetected,
          orderTotal,
          referenceCode,
          message: 'Comprobante verificado correctamente con el valor total de la orden. ¡El pedido queda pagado!',
        };
      } else {
        return {
          verified: false,
          amountDetected,
          orderTotal,
          difference: orderTotal - amountDetected,
          message: `El valor transferido ($${amountDetected}) no coincide exactamente con el total de la orden ($${orderTotal}). Requiere revisión humana.`,
        };
      }
    }

    case 'update_crm_stage': {
      const { stageKey, reason } = args;

      // Buscar la etapa por clave
      const stage = await prisma.crmStage.findFirst({
        where: {
          pipeline: { tenantId },
          stageKey,
        },
      });

      if (stage) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { stageId: stage.id },
        });

        emitKanbanStageChange(tenantId, {
          conversationId,
          newStageId: stage.id,
          newStageKey: stageKey,
        });

        return { success: true, stageName: stage.name, reason };
      }

      return { success: false, error: 'Etapa no encontrada en el pipeline del tenant.' };
    }

    case 'handoff_to_human_agent': {
      const { reason, summaryForAgent, urgency } = args;

      const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: ConversationStatus.HUMAN_AGENT,
          needsHumanReason: `${reason}: ${summaryForAgent}`,
        },
        include: { contact: true },
      });

      emitHandoffAlert(tenantId, {
        conversationId,
        contactName: conversation.contact.name || conversation.contact.phoneNumber,
        reason: summaryForAgent,
        urgency: urgency || 'HIGH',
      });

      return {
        success: true,
        message: 'Chat transferido exitosamente a un agente humano. El bot de IA se mantendrá silenciado.',
      };
    }

    default:
      throw new Error(`Herramienta no implementada: ${toolName}`);
  }
}
