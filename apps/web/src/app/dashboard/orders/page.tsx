'use client';

import { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  CheckCircle2,
  Clock,
  Bike,
  AlertCircle,
  FileText,
  DollarSign,
  Search,
  ExternalLink,
  X,
  Phone,
  MapPin,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  variantSelected?: any;
}

interface Order {
  id: string;
  shortCode?: string;
  status: 'DRAFT' | 'AWAITING_PAYMENT' | 'PAID' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  subtotal: number;
  deliveryCost: number;
  total: number;
  deliveryAddress?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paymentReceiptUrl?: string;
  extractedReceiptData?: any;
  notes?: string;
  createdAt: string;
  contact: {
    id: string;
    name: string;
    phoneNumber: string;
  };
  orderItems: OrderItem[];
  deliveryZone?: {
    zoneName: string;
    estimatedMinutes: number;
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [rejectModalOrder, setRejectModalOrder] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/orders');
      const data = await res.json();
      if (data.orders) {
        setOrders(data.orders);
      }
    } catch (err) {
      console.error('Error cargando órdenes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10000); // Polling cada 10s para comandas en vivo
    return () => clearInterval(interval);
  }, []);

  const handleApprovePayment = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      const res = await fetchWithAuth(`/orders/${orderId}/approve-payment`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        loadOrders();
      }
    } catch (err) {
      console.error('Error aprobando pago:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDispatch = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      const res = await fetchWithAuth(`/orders/${orderId}/dispatch`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        loadOrders();
      }
    } catch (err) {
      console.error('Error despachando orden:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalOrder) return;
    try {
      setActionLoadingId(rejectModalOrder.id);
      await fetchWithAuth(`/orders/${rejectModalOrder.id}/reject-payment`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectModalOrder(null);
      setRejectReason('');
      loadOrders();
    } catch (err) {
      console.error('Error rechazando comprobante:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase();
    const code = (o.shortCode || o.id.slice(-6)).toLowerCase();
    const name = (o.contact?.name || '').toLowerCase();
    const phone = o.contact?.phoneNumber || '';
    return code.includes(q) || name.includes(q) || phone.includes(q);
  });

  const awaitingPaymentOrders = filteredOrders.filter((o) => o.status === 'AWAITING_PAYMENT');
  const preparingOrders = filteredOrders.filter((o) => o.status === 'PREPARING');
  const shippedOrders = filteredOrders.filter((o) => o.status === 'SHIPPED');

  const formatElapsed = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'Hace un momento';
    if (mins < 60) return `Hace ${mins} min`;
    return `Hace ${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Header */}
      <header className="p-4 sm:p-5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <UtensilsCrossed className="h-6 w-6 text-emerald-600" />
            <span>Pantalla de Pedidos & Cocina (KDS)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Confirma pagos de transferencias bancarias y despacha pedidos con notificación automática por WhatsApp.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por orden, cliente o tel..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={loadOrders}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </header>

      {/* Métricas Rápidas */}
      <div className="grid grid-cols-3 gap-3 p-4 bg-slate-100 border-b border-slate-200 shrink-0">
        <div className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-amber-200 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Por Validar Pago</div>
            <div className="text-lg font-bold text-amber-700">{awaitingPaymentOrders.length}</div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-blue-200 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">En Cocina (Preparación)</div>
            <div className="text-lg font-bold text-blue-700">{preparingOrders.length}</div>
          </div>
        </div>

        <div className="flex items-center space-x-3 p-3 bg-white rounded-xl border border-emerald-200 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <Bike className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">En Camino (Reparto)</div>
            <div className="text-lg font-bold text-emerald-700">{shippedOrders.length}</div>
          </div>
        </div>
      </div>

      {/* 3 Columnas KDS */}
      <div className="flex-1 overflow-x-auto p-4 flex space-x-4">
        {/* Columna 1: Validación de Pagos */}
        <div className="w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-3.5 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              <h2 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                1. Validación de Comprobantes ({awaitingPaymentOrders.length})
              </h2>
            </div>
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              Requiere Operador
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
            {awaitingPaymentOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No hay comprobantes pendientes de validación.
              </div>
            ) : (
              awaitingPaymentOrders.map((o) => {
                const code = o.shortCode || o.id.slice(-6).toUpperCase();
                const isOperating = actionLoadingId === o.id;

                return (
                  <div key={o.id} className="p-4 bg-white rounded-xl border border-amber-200 shadow-sm hover:shadow transition-shadow">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                        #{code}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatElapsed(o.createdAt)}</span>
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <div className="text-xs font-bold text-slate-800 flex items-center space-x-1">
                        <span>{o.contact?.name || 'Cliente'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                        <Phone className="h-3 w-3" />
                        <span>+{o.contact?.phoneNumber}</span>
                      </div>
                    </div>

                    {/* Desglose de Comprobante / Foto para Verificación Humana */}
                    {o.paymentReceiptUrl && (
                      <div className="mt-3 p-2.5 bg-amber-50/90 rounded-lg border border-amber-200 text-xs">
                        <div className="font-bold text-amber-900 flex items-center justify-between text-[11px] mb-1.5">
                          <span>Comprobante de Transferencia:</span>
                          <button
                            onClick={() => setPreviewReceiptUrl(o.paymentReceiptUrl!)}
                            className="text-amber-800 hover:text-amber-950 font-bold underline flex items-center space-x-1 bg-amber-100 px-2 py-0.5 rounded"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Ver Foto Completa</span>
                          </button>
                        </div>
                        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setPreviewReceiptUrl(o.paymentReceiptUrl!)}>
                          <img
                            src={o.paymentReceiptUrl}
                            alt="Comprobante"
                            className="w-16 h-16 object-cover rounded-lg border border-amber-300 shadow-xs hover:opacity-80 transition-opacity"
                          />
                          <div className="text-[11px] text-slate-700 space-y-0.5">
                            <div>• Verifica el valor en tu app bancaria</div>
                            <div>• Haz clic en la foto para ampliar</div>
                            <div>• Presiona Aprobar Pago abajo</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Total y Productos */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium">Total de la Orden:</span>
                      <span className="text-sm font-extrabold text-emerald-600">
                        ${Number(o.total).toLocaleString('es-CO')} COP
                      </span>
                    </div>

                    {/* Botones de Acción */}
                    <div className="mt-3.5 grid grid-cols-2 gap-2">
                      <button
                        disabled={isOperating}
                        onClick={() => handleApprovePayment(o.id)}
                        className="flex items-center justify-center space-x-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{isOperating ? 'Aprobando...' : 'Aprobar Pago'}</span>
                      </button>

                      <button
                        disabled={isOperating}
                        onClick={() => setRejectModalOrder(o)}
                        className="flex items-center justify-center space-x-1 py-2 px-3 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-lg text-xs font-semibold transition-colors border border-slate-200"
                      >
                        <X className="h-4 w-4" />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna 2: En Cocina / Preparación */}
        <div className="w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-3.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
              <h2 className="text-xs font-bold text-blue-900 uppercase tracking-wider">
                2. En Cocina / Preparación ({preparingOrders.length})
              </h2>
            </div>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
              Comandas Activas
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
            {preparingOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No hay comandas en preparación en este momento.
              </div>
            ) : (
              preparingOrders.map((o) => {
                const code = o.shortCode || o.id.slice(-6).toUpperCase();
                const isOperating = actionLoadingId === o.id;

                return (
                  <div key={o.id} className="p-4 bg-white rounded-xl border border-blue-200 shadow-sm hover:shadow transition-shadow">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                        #{code}
                      </span>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded flex items-center space-x-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatElapsed(o.createdAt)}</span>
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <div className="text-xs font-bold text-slate-900">{o.contact?.name || 'Cliente'}</div>
                      <div className="text-[11px] text-slate-600 flex items-start space-x-1 mt-1">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>{o.deliveryAddress || 'En restaurante / recoger'}</span>
                      </div>
                    </div>

                    {/* Lista de Productos para Cocina */}
                    <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Items del Pedido:
                      </div>
                      <div className="space-y-1.5">
                        {o.orderItems.map((item) => (
                          <div key={item.id} className="text-xs font-semibold text-slate-800 flex items-start justify-between">
                            <span>
                              <strong className="text-emerald-700 mr-1">{item.quantity}x</strong>
                              {item.productName}
                            </span>
                          </div>
                        ))}
                      </div>
                      {o.notes && (
                        <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-amber-800 font-medium">
                          📝 <em>Notas: {o.notes}</em>
                        </div>
                      )}
                    </div>

                    {/* Botón de Despachar */}
                    <div className="mt-3.5">
                      <button
                        disabled={isOperating}
                        onClick={() => handleDispatch(o.id)}
                        className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow disabled:opacity-50"
                      >
                        <Bike className="h-4 w-4" />
                        <span>{isOperating ? 'Despachando...' : '🛵 Marcar Despachado (Avisar en Camino)'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Columna 3: En Camino / Despachados */}
        <div className="w-96 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-3.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bike className="h-4 w-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                3. En Camino / Despachados ({shippedOrders.length})
              </h2>
            </div>
            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
              Reparto
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
            {shippedOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No hay pedidos en ruta en este momento.
              </div>
            ) : (
              shippedOrders.map((o) => {
                const code = o.shortCode || o.id.slice(-6).toUpperCase();

                return (
                  <div key={o.id} className="p-4 bg-white rounded-xl border border-emerald-200 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        #{code}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center space-x-1">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Notificado por WhatsApp</span>
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <div className="text-xs font-bold text-slate-900">{o.contact?.name || 'Cliente'}</div>
                      <div className="text-[11px] text-slate-600 flex items-start space-x-1 mt-1">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
                        <span>{o.deliveryAddress || 'Domicilio'}</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>Total: ${Number(o.total).toLocaleString('es-CO')}</span>
                      <span>{formatElapsed(o.createdAt)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal para Visualizar Comprobante */}
      {previewReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="text-xs font-bold">Comprobante de Transferencia Bancaria</h3>
              <button
                onClick={() => setPreviewReceiptUrl(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 flex justify-center max-h-[75vh] overflow-y-auto">
              <img
                src={previewReceiptUrl}
                alt="Comprobante de pago"
                className="rounded-lg object-contain max-h-[70vh] shadow"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal para Rechazar Comprobante */}
      {rejectModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />
              <span>Rechazar Comprobante #{rejectModalOrder.shortCode || rejectModalOrder.id.slice(-6)}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1.5">
              Al rechazar el comprobante, el bot enviará un mensaje al cliente informando el motivo y transferirá la conversación a un asesor humano.
            </p>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Motivo del rechazo:</label>
              <input
                type="text"
                placeholder="Ej. El valor no coincide con el total de la orden."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full mt-1.5 rounded-lg border border-slate-300 p-2.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="mt-5 flex justify-end space-x-2">
              <button
                onClick={() => setRejectModalOrder(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConfirm}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
