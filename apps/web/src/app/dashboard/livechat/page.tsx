'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Search,
  Bot,
  User,
  Send,
  Phone,
  CheckCheck,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  FileText,
  Volume2,
  ShieldAlert,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Contact {
  id: string;
  name: string;
  phoneNumber: string;
}

interface Conversation {
  id: string;
  status: 'BOT_ACTIVE' | 'HUMAN_AGENT' | 'CLOSED';
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
  contact: Contact;
  needsHumanReason?: string;
  isPaymentVerified?: boolean;
}

interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  sender: 'CUSTOMER' | 'BOT' | 'HUMAN_AGENT' | 'SYSTEM';
  format: string;
  body: string;
  mediaUrl?: string;
  visionAnalysis?: any;
  createdAt: string;
}

export default function LiveChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Cargar pipeline y conversaciones iniciales
  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth('/crm/pipeline');
      const data = await res.json();
      if (data.pipeline) {
        const allConvs: Conversation[] = [];
        data.pipeline.stages.forEach((stage: any) => {
          if (stage.conversations) {
            allConvs.push(...stage.conversations);
          }
        });
        setConversations(allConvs);
        if (!selectedConv && allConvs.length > 0) {
          setSelectedConv(allConvs[0]);
        }
      }
    } catch (err) {
      console.error('Error cargando conversaciones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();

    const userStr = localStorage.getItem('user');
    const tenantId = userStr ? JSON.parse(userStr).tenantId : null;
    const socket = getSocket(tenantId);

    const handleNewMessage = (payload: { conversationId: string; message: Message }) => {
      // Actualizar chat activo si coincide
      if (selectedConv && payload.conversationId === selectedConv.id) {
        setMessages((prev) => [...prev, payload.message]);
      }
      // Actualizar listado de conversaciones
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                lastMessageText: payload.message.body,
                lastMessageAt: payload.message.createdAt,
                unreadCount: selectedConv?.id === c.id ? 0 : c.unreadCount + 1,
              }
            : c
        )
      );
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [selectedConv]);

  // Cargar mensajes al seleccionar una conversación
  useEffect(() => {
    if (!selectedConv) return;
    const loadMessages = async () => {
      try {
        const res = await fetchWithAuth(`/crm/conversations/${selectedConv.id}/messages`);
        const data = await res.json();
        setMessages(data.messages || []);
      } catch (err) {
        console.error('Error cargando mensajes:', err);
      }
    };
    loadMessages();
  }, [selectedConv]);

  // Scroll automático hacia el final del chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Alternar estado: Bot Activo vs Atención Humana
  const toggleBotStatus = async () => {
    if (!selectedConv) return;
    const newStatus = selectedConv.status === 'BOT_ACTIVE' ? 'HUMAN_AGENT' : 'BOT_ACTIVE';

    try {
      const res = await fetchWithAuth(`/crm/conversations/${selectedConv.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.conversation) {
        setSelectedConv((prev) => prev ? { ...prev, status: newStatus } : null);
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedConv.id ? { ...c, status: newStatus } : c))
        );
      }
    } catch (err) {
      console.error('Error cambiando estado del bot:', err);
    }
  };

  // Enviar mensaje como Agente Humano
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedConv || sending) return;

    setSending(true);
    const textToSend = inputText;
    setInputText('');

    try {
      const res = await fetchWithAuth(`/crm/conversations/${selectedConv.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: textToSend }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        // Si enviamos mensaje humano, pasar automáticamente a HUMAN_AGENT
        setSelectedConv((prev) => prev ? { ...prev, status: 'HUMAN_AGENT' } : null);
      }
    } catch (err) {
      console.error('Error enviando mensaje humano:', err);
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = conversations.filter(
    (c) =>
      c.contact?.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.contact?.phoneNumber?.includes(search)
  );

  return (
    <div className="flex h-full bg-white">
      {/* Columna Izquierda: Lista de Chats */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
        <div className="p-3.5 border-b border-slate-200 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar chat o teléfono..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-400">Cargando chats...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No hay conversaciones activas.</div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = selectedConv?.id === c.id;
              const isBotActive = c.status === 'BOT_ACTIVE';

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedConv(c)}
                  className={`w-full p-3.5 text-left transition-colors flex items-start space-x-3 ${
                    isSelected ? 'bg-emerald-50/70 border-l-4 border-emerald-600' : 'hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-xs">
                    {c.contact.name?.[0]?.toUpperCase() || 'W'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-900 truncate">
                        {c.contact.name || c.contact.phoneNumber}
                      </h4>
                      <span className="text-[10px] text-slate-400">
                        {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {c.lastMessageText || 'Sin mensajes'}
                    </p>

                    <div className="flex items-center justify-between mt-1.5">
                      <span
                        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          isBotActive
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isBotActive ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                        <span>{isBotActive ? 'Bot IA' : 'Humano'}</span>
                      </span>

                      {c.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Columna Derecha: Ventana de Conversación */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0 bg-[#EFEAE2]">
          {/* Header del Chat */}
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white font-bold text-sm">
                {selectedConv.contact.name?.[0]?.toUpperCase() || 'W'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <span>{selectedConv.contact.name || selectedConv.contact.phoneNumber}</span>
                  {selectedConv.isPaymentVerified && (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Pago Verificado</span>
                    </span>
                  )}
                </h3>
                <div className="text-xs text-slate-500 flex items-center space-x-1">
                  <Phone className="h-3 w-3" />
                  <span>+{selectedConv.contact.phoneNumber}</span>
                </div>
              </div>
            </div>

            {/* INTERRUPTOR: Bot Activo vs Atención Humana */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-800">
                  {selectedConv.status === 'BOT_ACTIVE' ? 'Asistente IA Activo' : 'Atención Humana'}
                </div>
                <div className="text-[10px] text-slate-500">
                  {selectedConv.status === 'BOT_ACTIVE' ? 'Gemini 1.5 responde automáticamente' : 'IA pausada para operador'}
                </div>
              </div>

              <button
                onClick={toggleBotStatus}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm ${
                  selectedConv.status === 'BOT_ACTIVE'
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-300'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-600 ring-2 ring-amber-300'
                }`}
              >
                {selectedConv.status === 'BOT_ACTIVE' ? (
                  <>
                    <Bot className="h-4 w-4" />
                    <span>BOT ACTIVO</span>
                  </>
                ) : (
                  <>
                    <User className="h-4 w-4" />
                    <span>HUMANO ACTIVO</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-[#efeae2] bg-opacity-95">
            {messages.map((m) => {
              const isCustomer = m.sender === 'CUSTOMER';
              const isBot = m.sender === 'BOT';

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`relative max-w-md sm:max-w-lg rounded-2xl px-4 py-2.5 text-xs shadow-sm ${
                      isCustomer
                        ? 'bg-white text-slate-800 rounded-tl-sm'
                        : isBot
                        ? 'bg-[#DCF8C6] text-slate-800 rounded-tr-sm border border-emerald-200'
                        : 'bg-emerald-700 text-white rounded-tr-sm'
                    }`}
                  >
                    {/* Badge de Emisor */}
                    <div className="flex items-center justify-between mb-1 space-x-2">
                      <span
                        className={`text-[10px] font-bold ${
                          isCustomer
                            ? 'text-slate-500'
                            : isBot
                            ? 'text-emerald-700 flex items-center space-x-1'
                            : 'text-emerald-200'
                        }`}
                      >
                        {isCustomer ? (
                          'Cliente'
                        ) : isBot ? (
                          <>
                            <Bot className="h-3 w-3 inline" />
                            <span>Max Burgers (IA)</span>
                          </>
                        ) : (
                          'Agente Humano'
                        )}
                      </span>
                      <span className="text-[9px] opacity-70">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Contenido Visual si es Comprobante de Pago */}
                    {m.visionAnalysis && m.visionAnalysis.is_valid_receipt && (
                      <div className="my-2 rounded-lg bg-emerald-100/90 border border-emerald-300 p-2 text-slate-900 text-[11px]">
                        <div className="font-bold text-emerald-800 flex items-center space-x-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Comprobante Bancario Detectado:</span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-[10px]">
                          <div>• Banco: <strong>{m.visionAnalysis.bank_name}</strong></div>
                          <div>• Monto: <strong>${Number(m.visionAnalysis.amount).toLocaleString('es-CO')} COP</strong></div>
                          <div>• Ref: <strong>{m.visionAnalysis.reference_code}</strong></div>
                        </div>
                      </div>
                    )}

                    {/* Cuerpo del Mensaje */}
                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input para el Agente Humano */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
              <input
                type="text"
                placeholder={
                  selectedConv.status === 'BOT_ACTIVE'
                    ? 'Escribe un mensaje (al enviar, la IA se pausará automáticamente)...'
                    : 'Escribe tu respuesta como agente humano...'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-slate-50">
          <Bot className="h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-sm font-semibold text-slate-600">Selecciona una conversación</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Visualiza los mensajes en vivo, verifica comprobantes de pago o interrumpe la IA en cualquier momento.
          </p>
        </div>
      )}
    </div>
  );
}
