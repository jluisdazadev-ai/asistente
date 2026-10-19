import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(tenantId?: string): Socket {
  if (!socket) {
    socket = io('http://localhost:4000', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('⚡ Conectado a WebSockets del CRM');
      if (tenantId) {
        socket?.emit('join_tenant', tenantId);
      }
    });
  }

  if (tenantId && socket.connected) {
    socket.emit('join_tenant', tenantId);
  }

  return socket;
}

// Generador de sonido sintético para alertas de Handoff sin depender de archivos de audio
export function playHandoffNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (err) {
    console.warn('No se pudo reproducir audio sintetizado:', err);
  }
}
