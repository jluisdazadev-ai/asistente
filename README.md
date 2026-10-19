# OmniCRM WhatsApp AI — SaaS Multi-tenant con Gemini 1.5 Flash

Plataforma SaaS B2B Multi-tenant de alto rendimiento para la venta y despliegue de **Asistentes Virtuales de Inteligencia Artificial en WhatsApp** para todo tipo de negocios (restaurantes, clínicas, tiendas, ISPs, empresas de servicios, etc.).

---

## 🚀 Características Principales

### 1. Gateway Dual Híbrido de WhatsApp
- **Opción A (QR / Baileys Oficial)**: Microservicio ligero en Node.js optimizado con `@whiskeysockets/baileys` (60-120 MB RAM por sesión). Generación de código QR en pantalla en tiempo real, reconexión automática y persistencia desacoplada de sesión.
- **Opción B (Meta Cloud API Oficial v21.0)**: Integración formal mediante Webhooks de Meta con verificación criptográfica, `WABA_ID`, `Phone_Number_ID` y gestión de plantillas HSM oficiales para conversaciones fuera de la ventana de 24 horas.

### 2. Motor de IA Multimodal (Google Gemini 1.5 Flash)
- **Audio Nativo (Voice-to-Text directo)**: Procesa notas de voz de WhatsApp (`.ogg` / opus) en un solo ciclo interpretando tono y contenido sin requerir paso intermedio por Whisper.
- **Visión Artificial Estructurada**: Análisis de imágenes y comprobantes de transferencia (Nequi, Bancolombia, etc.) extrayendo monto, fecha, banco y código de referencia con JSON Schema estricto.
- **Búsqueda Vectorial RAG**: Extensión `pgvector` con índices HNSW en PostgreSQL para consultar catálogos grandes, manuales y políticas de negocio.

### 3. CRM Omnicanal, Live Chat & Handoff Humano
- **Bandeja de Chats en Tiempo Real**: Socket.io con interruptor dinámico `[ Bot Activo ]` <-> `[ Atención Humana ]`.
- **Alerta Sonora & Visual de Handoff**: Detección automática cuando el cliente solicita un operador humano o envía un comprobante de pago, pausando la IA y alertando al equipo.
- **Embudo Kanban**: Columnas arrastrables (*Nuevo Lead*, *En Consulta*, *Esperando Pago*, *Pedido Confirmado*, *Finalizado*) que la IA mueve de forma autónoma mediante **Function Calling**.

### 4. Protección Anti-Ban y Ahorro de Tokens
- **Debounce Buffer Inteligente (BullMQ + Redis)**: Agrupa ráfagas de mensajes del cliente en una ventana configurable (5-8 segundos) para consolidar el contexto en un único prompt y emitir una sola respuesta natural.
- **Simulador de Escritura Humana**: Emite presencia `composing` ("Escribiendo...") con un retardo dinámico proporcional a la longitud del texto.

---

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 15 (App Router), Tailwind CSS, Lucide Icons, Socket.io Client.
- **Backend**: Fastify, TypeScript, BullMQ, IORedis, `@google/generative-ai`, S3 SDK.
- **Microservicio QR**: `@whiskeysockets/baileys` nativo, Fastify, QRCode.
- **Base de Datos**: PostgreSQL 16 con extensión `pgvector` y Prisma ORM.
- **Colas & Cache**: Redis 7.
- **Almacenamiento**: Compatible con Cloudflare R2 ($0 egress fees) y MinIO local.

---

## 📦 Estructura del Monorepo

```
whatsapp-ai-crm/
├── apps/
│   ├── api/                 # Backend Fastify + BullMQ + Gemini 1.5 Flash
│   ├── web/                 # Frontend Next.js 15 (SuperAdmin, Live Chat, Kanban, Bot Builder)
│   └── whatsapp-qr/         # Microservicio ligero de conexión QR con Baileys
├── packages/
│   └── database/            # Prisma Schema con pgvector, tipos compartidos y seed
├── docker-compose.yml       # Postgres (pgvector) + Redis + MinIO
├── .env.example
└── package.json             # Workspaces npm
```

---

## ⚡ Guía de Inicio Rápido

### 1. Iniciar Contenedores de Base de Datos y Redis
```bash
docker compose up -d
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Migrar y Poblar la Base de Datos
```bash
npm run db:push -w @crm/database
npm run db:seed -w @crm/database
```

### 4. Iniciar los Servicios en Modo Desarrollo
```bash
# Iniciar todos los proyectos
npm run dev
```

* **Frontend Web**: `http://localhost:3000`
* **Backend API**: `http://localhost:4000`
* **Microservicio QR**: `http://localhost:4001`

---

## 🔑 Credenciales Demo por Defecto

- **SuperAdmin Global**: `admin@crmwhatsapp.com` / `admin123` (`http://localhost:3000/admin`)
- **Dueño de Negocio (Burger Master)**: `owner@burgermaster.com` / `owner123` (`http://localhost:3000/dashboard`)

---

## 📄 Licencia

Software desarrollado para despliegue empresarial SaaS Multi-tenant.
