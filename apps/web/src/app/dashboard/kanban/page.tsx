'use client';

import { useState, useEffect } from 'react';
import {
  Kanban,
  Bot,
  User,
  CheckCircle2,
  Clock,
  ArrowRight,
  DollarSign,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Stage {
  id: string;
  name: string;
  stageKey: string;
  orderIndex: number;
  color: string;
  conversations: any[];
}

export default function KanbanPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPipeline = async () => {
    try {
      const res = await fetchWithAuth('/crm/pipeline');
      const data = await res.json();
      if (data.pipeline?.stages) {
        setStages(data.pipeline.stages);
      }
    } catch (err) {
      console.error('Error cargando Kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipeline();

    const userStr = localStorage.getItem('user');
    const tenantId = userStr ? JSON.parse(userStr).tenantId : null;
    const socket = getSocket(tenantId);

    // Escuchar movimientos de tarjeta disparados por la IA en tiempo real
    const handleStageUpdate = (data: { conversationId: string; newStageId: string }) => {
      console.log('🔄 [Kanban IA] Movimiento de tarjeta en vivo:', data);
      loadPipeline();
    };

    socket.on('crm_stage_updated', handleStageUpdate);

    return () => {
      socket.off('crm_stage_updated', handleStageUpdate);
    };
  }, []);

  // Mover tarjeta a otra columna
  const moveConversationStage = async (conversationId: string, targetStageId: string) => {
    try {
      await fetchWithAuth(`/crm/conversations/${conversationId}/stage`, {
        method: 'PUT',
        body: JSON.stringify({ stageId: targetStageId }),
      });
      loadPipeline();
    } catch (err) {
      console.error('Error moviendo etapa:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-100 p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Kanban className="h-5 w-5 text-emerald-600" />
            <span>Embudo de Ventas WhatsApp (Kanban)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Las columnas se actualizan automáticamente en tiempo real mediante las herramientas (Function Calling) de la IA.
          </p>
        </div>

        <button
          onClick={loadPipeline}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Actualizar Tablero</span>
        </button>
      </div>

      {/* Columnas Kanban */}
      <div className="flex-1 flex space-x-4 overflow-x-auto pb-4 items-start min-h-0">
        {loading ? (
          <div className="w-full flex justify-center items-center py-20 text-xs text-slate-400">
            Cargando embudo...
          </div>
        ) : (
          stages.map((stage, colIndex) => {
            const conversations = stage.conversations || [];

            return (
              <div
                key={stage.id}
                className="w-72 shrink-0 bg-slate-200/70 rounded-xl flex flex-col max-h-full border border-slate-300/80 shadow-sm"
              >
                {/* Columna Header */}
                <div className="p-3.5 border-b border-slate-300 flex items-center justify-between bg-white rounded-t-xl">
                  <div className="flex items-center space-x-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: stage.color || '#3B82F6' }}
                    />
                    <h3 className="text-xs font-bold text-slate-900">{stage.name}</h3>
                  </div>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                    {conversations.length}
                  </span>
                </div>

                {/* Lista de Tarjetas */}
                <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
                  {conversations.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400 italic">
                      Sin clientes aquí
                    </div>
                  ) : (
                    conversations.map((c: any) => {
                      const latestOrder = c.orders?.[0];

                      return (
                        <div
                          key={c.id}
                          className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900 truncate">
                              {c.contact.name || c.contact.phoneNumber}
                            </span>
                            <span
                              className={`inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                c.status === 'BOT_ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {c.status === 'BOT_ACTIVE' ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                              <span>{c.status === 'BOT_ACTIVE' ? 'IA' : 'Humano'}</span>
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-500 flex items-center space-x-1 mb-2">
                            <Phone className="h-2.5 w-2.5" />
                            <span>+{c.contact.phoneNumber}</span>
                          </div>

                          {/* Previsualización del último mensaje */}
                          <p className="text-[11px] text-slate-600 line-clamp-2 bg-slate-50 p-1.5 rounded border border-slate-100 mb-2">
                            {c.lastMessageText || 'Sin mensajes'}
                          </p>

                          {/* Orden generada por la IA */}
                          {latestOrder && (
                            <div className="flex items-center justify-between bg-emerald-50/70 p-1.5 rounded border border-emerald-200 text-[10px] font-medium text-emerald-800 mb-2">
                              <span className="flex items-center space-x-1">
                                <DollarSign className="h-3 w-3" />
                                <span>Pedido:</span>
                              </span>
                              <span className="font-bold">
                                ${Number(latestOrder.total).toLocaleString('es-CO')} COP
                              </span>
                            </div>
                          )}

                          {/* Acciones de cambio de columna manual */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
                            {colIndex > 0 ? (
                              <button
                                onClick={() => moveConversationStage(c.id, stages[colIndex - 1].id)}
                                className="text-slate-500 hover:text-slate-900"
                              >
                                ← {stages[colIndex - 1].name.split(' ')[0]}
                              </button>
                            ) : <span />}

                            {colIndex < stages.length - 1 && (
                              <button
                                onClick={() => moveConversationStage(c.id, stages[colIndex + 1].id)}
                                className="font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-0.5 ml-auto"
                              >
                                <span>{stages[colIndex + 1].name.split(' ')[0]}</span>
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
