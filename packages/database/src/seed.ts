import { PrismaClient, UserRole, BotTone, GatewayProvider, ConnectionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando Seed de la Base de Datos...');

  // 1. Planes SaaS
  const planStarter = await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {},
    create: {
      name: 'Plan Starter',
      slug: 'starter',
      priceCents: 2900, // $29 USD
      currency: 'USD',
      maxConversationsPerMonth: 1000,
      maxTeamMembers: 2,
      maxKnowledgeDocs: 3,
      allowQrGateway: true,
      allowOfficialGateway: false,
      allowVoiceNotes: true,
      allowVisionOcr: true,
    },
  });

  const planPro = await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      name: 'Plan Pro Omnicanal',
      slug: 'pro',
      priceCents: 7900, // $79 USD
      currency: 'USD',
      maxConversationsPerMonth: 5000,
      maxTeamMembers: 5,
      maxKnowledgeDocs: 15,
      allowQrGateway: true,
      allowOfficialGateway: true,
      allowVoiceNotes: true,
      allowVisionOcr: true,
    },
  });

  console.log('✅ Planes creados:', planStarter.name, ',', planPro.name);

  // 2. SuperAdmin Global
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@crmwhatsapp.com' },
    update: {},
    create: {
      email: 'admin@crmwhatsapp.com',
      passwordHash: adminPasswordHash,
      fullName: 'Super Administrador Global',
      role: UserRole.SUPERADMIN,
      isActive: true,
    },
  });
  console.log('✅ SuperAdmin global creado:', superAdmin.email);

  // 3. Tenant Demo: "Burger Master Gourmet"
  const tenantSlug = 'burger-master';
  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: {
      businessName: 'Burger Master Gourmet',
      slug: tenantSlug,
      planId: planPro.id,
      billingEmail: 'contacto@burgermaster.com',
      phone: '+573001234567',
      countryCode: 'CO',
      currency: 'COP',
      isActive: true,
    },
  });

  // 4. Usuario Dueño del Tenant
  const ownerPasswordHash = await bcrypt.hash('owner123', 10);
  await prisma.user.upsert({
    where: { email: 'owner@burgermaster.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@burgermaster.com',
      passwordHash: ownerPasswordHash,
      fullName: 'Carlos Gómez (Dueño)',
      role: UserRole.TENANT_OWNER,
      isActive: true,
    },
  });

  // 5. Configuración de Conexión de WhatsApp por defecto (QR / Baileys)
  await prisma.whatsAppConnection.upsert({
    where: {
      tenantId_gatewayType: {
        tenantId: tenant.id,
        gatewayType: GatewayProvider.QR_BAILEYS,
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      gatewayType: GatewayProvider.QR_BAILEYS,
      status: ConnectionStatus.DISCONNECTED,
      displayName: 'WhatsApp Principal Restaurante',
      sessionId: `session_${tenant.id}`,
    },
  });

  // 6. Configuración del Asistente Virtual IA
  await prisma.botConfiguration.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      botName: 'Max Burgers',
      roleDescription: 'Mesero y asesor virtual experto en tomar pedidos para Burger Master Gourmet. Conoce todos los combos, salsas, precios y costos de domicilio.',
      tone: BotTone.FRIENDLY,
      temperature: 0.40,
      businessRules: '1. Pedido mínimo para domicilio: $25.000 COP.\n2. Todo pedido requiere comprobante de pago anticipado si es transferencia (Nequi o Bancolombia).\n3. El tiempo promedio de entrega es de 35 a 50 minutos.\n4. Si el cliente tiene dudas sobre ingredientes o alergias, ser muy específico.',
      debounceSeconds: 6,
      typingSimulationEnabled: true,
      minTypingDelayMs: 1200,
      maxTypingDelayMs: 4000,
      voiceInEnabled: true,
      voiceOutEnabled: false,
      visionOcrEnabled: true,
      outOfHoursReplyEnabled: true,
      outOfHoursMessage: '¡Hola! En este momento nuestra cocina está cerrada. Nuestro horario es de Martes a Domingo de 12:00 PM a 10:30 PM. ¡Déjanos tu pedido para mañana!',
      isActive: true,
    },
  });

  // 7. Cuentas Bancarias
  const existingAccounts = await prisma.bankAccount.findMany({ where: { tenantId: tenant.id } });
  if (existingAccounts.length === 0) {
    await prisma.bankAccount.createMany({
      data: [
        {
          tenantId: tenant.id,
          bankName: 'Nequi',
          accountType: 'Billetera Digital',
          accountNumber: '3001234567',
          holderName: 'Burger Master Gourmet SAS',
          holderId: '901.234.567-8',
          isActive: true,
        },
        {
          tenantId: tenant.id,
          bankName: 'Bancolombia',
          accountType: 'Cuenta de Ahorros',
          accountNumber: '123-456789-00',
          holderName: 'Burger Master Gourmet SAS',
          holderId: '901.234.567-8',
          isActive: true,
        },
      ],
    });
  }

  // 8. Zonas de Domicilio
  const existingZones = await prisma.deliveryZone.findMany({ where: { tenantId: tenant.id } });
  if (existingZones.length === 0) {
    await prisma.deliveryZone.createMany({
      data: [
        { tenantId: tenant.id, zoneName: 'Zona Norte / Rosales', price: 6000, estimatedMinutes: 35 },
        { tenantId: tenant.id, zoneName: 'Zona Centro / Chapinero', price: 5000, estimatedMinutes: 30 },
        { tenantId: tenant.id, zoneName: 'Zona Sur / Teusaquillo', price: 8000, estimatedMinutes: 45 },
      ],
    });
  }

  // 9. Pipeline CRM y Etapas Kanban
  const pipeline = await prisma.crmPipeline.upsert({
    where: { id: `pipeline_${tenant.id}` },
    update: {},
    create: {
      id: `pipeline_${tenant.id}`,
      tenantId: tenant.id,
      name: 'Embudo de Ventas WhatsApp',
      isDefault: true,
    },
  });

  const stagesData = [
    { name: 'Nuevo Lead', stageKey: 'NEW_LEAD', orderIndex: 0, color: '#64748B' },
    { name: 'En Consulta / Carta', stageKey: 'IN_QUERY', orderIndex: 1, color: '#3B82F6' },
    { name: 'Esperando Pago', stageKey: 'AWAITING_PAYMENT', orderIndex: 2, color: '#F59E0B' },
    { name: 'Pedido Confirmado', stageKey: 'CONFIRMED', orderIndex: 3, color: '#10B981' },
    { name: 'Entregado / Finalizado', stageKey: 'COMPLETED', orderIndex: 4, color: '#8B5CF6' },
  ];

  for (const st of stagesData) {
    await prisma.crmStage.upsert({
      where: {
        pipelineId_orderIndex: {
          pipelineId: pipeline.id,
          orderIndex: st.orderIndex,
        },
      },
      update: {},
      create: {
        pipelineId: pipeline.id,
        name: st.name,
        stageKey: st.stageKey,
        orderIndex: st.orderIndex,
        color: st.color,
      },
    });
  }

  // 10. Catálogo de Productos
  const productsCount = await prisma.product.count({ where: { tenantId: tenant.id } });
  if (productsCount === 0) {
    await prisma.product.createMany({
      data: [
        {
          tenantId: tenant.id,
          sku: 'BM-001',
          name: 'Hamburguesa Doble Master Bacon',
          description: '200g de carne angus certificada, doble queso cheddar fundido, tocineta ahumada crujiente, cebolla caramelizada y salsa especial de la casa en pan brioche.',
          category: 'Hamburguesas',
          price: 28900,
          stockQuantity: 50,
          isStockActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
          variants: [
            { name: 'Término de la carne', options: ['Medio', 'Tres Cuartos', 'Bien Asada'] },
            { name: 'Adición', options: ['Papas Rústicas (+ $5.000)', 'Aros de Cebolla (+ $6.000)'] },
          ],
        },
        {
          tenantId: tenant.id,
          sku: 'BM-002',
          name: 'Hamburguesa Trufada & Champiñones',
          description: 'Carne de res seleccionada, reducción de champiñones al vino blanco, queso provolone y mayonesa de trufa negra.',
          category: 'Hamburguesas',
          price: 31500,
          stockQuantity: 35,
          isStockActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600',
          variants: [{ name: 'Término de la carne', options: ['Medio', 'Tres Cuartos', 'Bien Asada'] }],
        },
        {
          tenantId: tenant.id,
          sku: 'BM-003',
          name: 'Papas Rústicas con Queso Cheddar y Tocineta',
          description: 'Papas naturales en cascos con piel sazonadas con paprika y finas hierbas, bañadas en queso cheddar fundido y trozos de tocineta.',
          category: 'Acompañamientos',
          price: 13900,
          stockQuantity: 100,
          isStockActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600',
        },
        {
          tenantId: tenant.id,
          sku: 'BM-004',
          name: 'Malteada Artesanal de Caramelo Salado',
          description: 'Helado artesanal de vainilla macerado con caramelo toffee de sal marina y crema chantilly.',
          category: 'Bebidas',
          price: 12500,
          stockQuantity: 40,
          isStockActive: true,
          imageUrl: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600',
        },
      ],
    });
  // 6. Tenant Oficial del SaaS para Ventas Facebook Ads (SuperAdmin)
  const saasTenant = await prisma.tenant.upsert({
    where: { slug: 'plataforma-saas' },
    update: {},
    create: {
      businessName: 'Plataforma CRM & Bots WhatsApp SaaS',
      slug: 'plataforma-saas',
      planId: planPro.id,
      billingEmail: 'ventas@crmwhatsapp.com',
      phone: '+573009998877',
      countryCode: 'CO',
      currency: 'USD',
      isActive: true,
    },
  });

  await prisma.botConfiguration.upsert({
    where: { tenantId: saasTenant.id },
    update: {},
    create: {
      tenantId: saasTenant.id,
      botName: 'Sofía',
      roleDescription: 'Asesora comercial experta en la plataforma de CRM y Asistentes Virtuales de WhatsApp.',
      tone: BotTone.AGGRESSIVE_SALES,
      temperature: 0.35,
      debounceSeconds: 2,
    },
  });

  console.log('✅ Demo Tenant y Plataforma SaaS configurados exitosamente.');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
