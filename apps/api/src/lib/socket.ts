import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer | null = null;

export function initSocketIO(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    // Unir a sala de tenant específica
    socket.on('join_tenant', (tenantId: string) => {
      socket.join(`tenant_${tenantId}`);
      console.log(`🔌 Socket ${socket.id} unido a sala tenant_${tenantId}`);
    });

    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conv_${conversationId}`);
    });

    socket.on('disconnect', () => {
      // socket desconectado
    });
  });

  return io;
}

export function getSocketIO(): SocketIOServer | null {
  return io;
}

/**
 * Emite un nuevo mensaje a la interfaz web del tenant
 */
export function emitNewMessage(tenantId: string, conversationId: string, message: any) {
  if (!io) return;
  io.to(`tenant_${tenantId}`).emit('new_message', { conversationId, message });
  io.to(`conv_${conversationId}`).emit('new_message', { conversationId, message });
}

/**
 * Emite una alarma sonora y visual cuando la IA transfiere a un Humano
 */
export function emitHandoffAlert(tenantId: string, data: { conversationId: string; contactName: string; reason: string; urgency: string }) {
  if (!io) return;
  io.to(`tenant_${tenantId}`).emit('human_handoff_alert', data);
}

/**
 * Emite la actualización de una tarjeta en el tablero Kanban
 */
export function emitKanbanStageChange(tenantId: string, data: { conversationId: string; newStageId: string; newStageKey: string }) {
  if (!io) return;
  io.to(`tenant_${tenantId}`).emit('crm_stage_updated', data);
}

/**
 * Emite nuevo código QR o cambio de estado de conexión
 */
export function emitConnectionState(tenantId: string, data: { status: string; qrCodeBase64?: string; phoneNumber?: string }) {
  if (!io) return;
  io.to(`tenant_${tenantId}`).emit('whatsapp_connection_updated', data);
}
