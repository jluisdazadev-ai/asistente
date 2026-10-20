'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Building2,
  Users,
  MessageSquare,
  DollarSign,
  Plus,
  Power,
  LogOut,
  ExternalLink,
  CheckCircle2,
  Flame,
  QrCode,
  Send,
  RefreshCw,
  Edit2,
  Trash2,
  Check,
  X,
  Phone,
  Sparkles,
  Bot,
  User,
  Clock,
  Layers,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function SuperAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'sales_bot'>('tenants');
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal para Registrar Nuevo Tenant
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenant, setNewTenant] = useState({
    businessName: '',
    slug: '',
    billingEmail: '',
    phone: '+57',
    ownerName: '',
    ownerPassword: '',
    planId: '',
  });

  // Modal para Crear / Editar Plan
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    slug: '',
    priceCents: 2900,
    currency: 'USD',
    maxConversationsPerMonth: 1000,
    maxTeamMembers: 2,
    maxKnowledgeDocs: 3,
    allowQrGateway: true,
    allowOfficialGateway: false,
    allowVoiceNotes: true,
    allowVisionOcr: true,
  });

  // Estado del Bot de Ventas Facebook Ads
  const [salesBotConn, setSalesBotConn] = useState<any>(null);
  const [salesLeads, setSalesLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [leadMessageText, setLeadMessageText] = useState('');
  const [qrLoading, setQrLoading] = useState(false);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [resStats, resTenants, resPlans] = await Promise.all([
        fetchWithAuth('/admin/stats'),
        fetchWithAuth('/admin/tenants'),
        fetchWithAuth('/admin/plans'),
      ]);
      const dataStats = await resStats.json();
      const dataTenants = await resTenants.json();
      const dataPlans = await resPlans.json();

      setStats(dataStats);
      setTenants(dataTenants.tenants || []);
      setPlans(dataPlans.plans || []);
    } catch (err) {
      console.error('Error cargando panel de SuperAdmin:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesBotData = async () => {
    try {
      const [resConn, resLeads] = await Promise.all([
        fetchWithAuth('/admin/sales-bot/connection'),
        fetchWithAuth('/admin/sales-bot/leads'),
      ]);
      const dataConn = await resConn.json();
      const dataLeads = await resLeads.json();

      setSalesBotConn(dataConn.connection);
      setSalesLeads(dataLeads.conversations || []);
      if (!selectedLead && dataLeads.conversations?.length > 0) {
        setSelectedLead(dataLeads.conversations[0]);
      }
    } catch (err) {
      console.error('Error cargando datos del bot de ventas:', err);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  useEffect(() => {
    if (activeTab === 'sales_bot') {
      loadSalesBotData();
      const interval = setInterval(loadSalesBotData, 8000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleInitSalesQr = async () => {
    try {
      setQrLoading(true);
      const res = await fetchWithAuth('/admin/sales-bot/qr/init', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        loadSalesBotData();
      }
    } catch (err) {
      console.error('Error inicializando QR de ventas:', err);
    } finally {
      setQrLoading(false);
    }
  };

  const handleSendLeadMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadMessageText.trim() || !selectedLead) return;

    try {
      const text = leadMessageText;
      setLeadMessageText('');
      await fetchWithAuth(`/admin/sales-bot/leads/${selectedLead.id}/message`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      loadSalesBotData();
    } catch (err) {
      console.error('Error enviando mensaje a lead:', err);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetchWithAuth('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify(newTenant),
      });
      const data = await res.json();
      if (data.tenant) {
        setShowCreateModal(false);
        setNewTenant({
          businessName: '',
          slug: '',
          billingEmail: '',
          phone: '+57',
          ownerName: '',
          ownerPassword: '',
          planId: '',
        });
        loadAdminData();
      }
    } catch (err) {
      console.error('Error creando negocio:', err);
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlanId) {
        await fetchWithAuth(`/admin/plans/${editingPlanId}`, {
          method: 'PUT',
          body: JSON.stringify(planForm),
        });
      } else {
        await fetchWithAuth('/admin/plans', {
          method: 'POST',
          body: JSON.stringify(planForm),
        });
      }
      setShowPlanModal(false);
      setEditingPlanId(null);
      loadAdminData();
    } catch (err) {
      console.error('Error guardando plan:', err);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este plan?')) return;
    try {
      const res = await fetchWithAuth(`/admin/plans/${planId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadAdminData();
      } else {
        alert(data.error || 'No se pudo eliminar el plan.');
      }
    } catch (err) {
      console.error('Error eliminando plan:', err);
    }
  };

  const handleToggleTenantStatus = async (tenant: any) => {
    const updatedStatus = !tenant.isActive;
    try {
      await fetchWithAuth(`/admin/tenants/${tenant.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: updatedStatus }),
      });
      setTenants((prev) =>
        prev.map((t) => (t.id === tenant.id ? { ...t, isActive: updatedStatus } : t))
      );
    } catch (err) {
      console.error('Error alternando estado del tenant:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center space-x-2">
              <span>SuperAdmin Global</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded font-mono">
                SaaS Owner
              </span>
            </h1>
            <p className="text-xs text-slate-400">Control maestro de planes, suscripciones y bot comercial de Facebook Ads.</p>
          </div>
        </div>

        {/* Pestañas de Navegación */}
        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'tenants' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Empresas ({tenants.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('plans')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'plans' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Planes SaaS ({plans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('sales_bot')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'sales_bot' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="h-4 w-4 text-rose-500" />
            <span>Bot de Ventas Facebook Ads</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Negocios Clientes</span>
                <Building2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalTenants}</div>
              <div className="text-[11px] text-emerald-400 mt-1">{stats.activeTenants} activos en producción</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Conversaciones Totales</span>
                <Users className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalConversations}</div>
              <div className="text-[11px] text-slate-400 mt-1">Chats atendidos por IA y humanos</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Mensajes Despachados</span>
                <MessageSquare className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">{stats.totalMessages}</div>
              <div className="text-[11px] text-slate-400 mt-1">A través de Baileys y Meta API</div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                <span>Volumen de Pedidos</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-white">
                ${Number(stats.totalRevenuePaid).toLocaleString('es-CO')}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1">{stats.totalOrders} pedidos cerrados</div>
            </div>
          </div>
        )}

        {/* PESTAÑA 1: Negocios Clientes */}
        {activeTab === 'tenants' && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Listado de Negocios Suscritos (Tenants)</h2>
                <span className="text-xs text-slate-400">{tenants.length} registrados</span>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>+ Registrar Empresa</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Negocio / Cliente</th>
                    <th className="p-3.5">Plan Contratado</th>
                    <th className="p-3.5">WhatsApp Gateway</th>
                    <th className="p-3.5">Chats Atendidos</th>
                    <th className="p-3.5">Estado</th>
                    <th className="p-3.5 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {tenants.map((t) => {
                    const conn = t.connections?.[0];

                    return (
                      <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3.5">
                          <div className="font-bold text-white">{t.businessName}</div>
                          <div className="text-[11px] text-slate-400">{t.billingEmail} • {t.slug}</div>
                        </td>
                        <td className="p-3.5">
                          <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded font-semibold border border-emerald-500/20">
                            {t.plan?.name || 'Sin Plan'}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <span className="text-slate-300 font-mono text-[11px]">
                            {conn?.gatewayType || 'QR_BAILEYS'} ({conn?.status || 'CONFIGURANDO'})
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-white">
                          {t._count?.conversations || 0}
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.isActive
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {t.isActive ? 'ACTIVO' : 'SUSPENDIDO'}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => handleToggleTenantStatus(t)}
                            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                              t.isActive
                                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                            }`}
                          >
                            {t.isActive ? 'Suspender' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: Planes SaaS CRUD */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white">Planes de Suscripción Oficiales</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Los planes definidos aquí son los que "Sofía" cotiza en tiempo real a los prospectos de Facebook Ads.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingPlanId(null);
                  setPlanForm({
                    name: '',
                    slug: '',
                    priceCents: 2900,
                    currency: 'USD',
                    maxConversationsPerMonth: 1000,
                    maxTeamMembers: 2,
                    maxKnowledgeDocs: 3,
                    allowQrGateway: true,
                    allowOfficialGateway: false,
                    allowVoiceNotes: true,
                    allowVisionOcr: true,
                  });
                  setShowPlanModal(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>+ Crear Nuevo Plan</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((p) => (
                <div key={p.id} className="p-5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-white">{p.name}</h3>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        {p.slug}
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline space-x-1">
                      <span className="text-2xl font-black text-white">
                        ${(p.priceCents / 100).toFixed(0)}
                      </span>
                      <span className="text-xs text-slate-400">{p.currency} / mes</span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Conversaciones:</span>
                        <span className="font-bold">{p.maxConversationsPerMonth.toLocaleString()} / mes</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Agentes humanos:</span>
                        <span className="font-bold">{p.maxTeamMembers} simultáneos</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Documentos RAG IA:</span>
                        <span className="font-bold">{p.maxKnowledgeDocs} archivos</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Conexión QR Baileys:</span>
                        <span className={p.allowQrGateway ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {p.allowQrGateway ? 'Sí' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Meta API Oficial:</span>
                        <span className={p.allowOfficialGateway ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {p.allowOfficialGateway ? 'Sí' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">OCR Comprobantes IA:</span>
                        <span className={p.allowVisionOcr ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          {p.allowVisionOcr ? 'Sí' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      {p._count?.tenants || 0} empresas suscritas
                    </span>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setEditingPlanId(p.id);
                          setPlanForm({
                            name: p.name,
                            slug: p.slug,
                            priceCents: p.priceCents,
                            currency: p.currency,
                            maxConversationsPerMonth: p.maxConversationsPerMonth,
                            maxTeamMembers: p.maxTeamMembers,
                            maxKnowledgeDocs: p.maxKnowledgeDocs,
                            allowQrGateway: p.allowQrGateway,
                            allowOfficialGateway: p.allowOfficialGateway,
                            allowVoiceNotes: p.allowVoiceNotes,
                            allowVisionOcr: p.allowVisionOcr,
                          });
                          setShowPlanModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-800 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeletePlan(p.id)}
                        disabled={(p._count?.tenants || 0) > 0}
                        className="p-1.5 text-rose-400 hover:text-rose-300 rounded bg-rose-500/10 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA 3: Bot de Ventas Facebook Ads */}
        {activeTab === 'sales_bot' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna Izquierda: Conexión QR de Ventas */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-4">
              <div className="flex items-center space-x-2">
                <Flame className="h-5 w-5 text-rose-500" />
                <h3 className="text-sm font-bold text-white">Línea Oficial Facebook Ads</h3>
              </div>
              <p className="text-xs text-slate-400">
                Esta línea de WhatsApp está asignada exclusivamente al SuperAdmin para atender a los prospectos de tus campañas publicitarias.
              </p>

              {/* Tarjeta de Estado de Conexión */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center">
                <div className="text-xs font-semibold text-slate-300">
                  Estado:{' '}
                  <span
                    className={`font-bold ${
                      salesBotConn?.status === 'CONNECTED'
                        ? 'text-emerald-400'
                        : salesBotConn?.status === 'SCAN_QR'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {salesBotConn?.status || 'DESCONECTADO'}
                  </span>
                </div>

                {salesBotConn?.status === 'CONNECTED' ? (
                  <div className="my-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                    <div className="text-xs font-bold text-emerald-300">¡Línea Comercial Conectada!</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Sofía está atendiendo prospectos de tus anuncios en tiempo real.
                    </div>
                  </div>
                ) : salesBotConn?.qrCodeBase64 ? (
                  <div className="my-4 flex flex-col items-center">
                    <img
                      src={salesBotConn.qrCodeBase64}
                      alt="QR Ventas"
                      className="w-48 h-48 rounded-lg bg-white p-2 shadow-md"
                    />
                    <span className="text-[11px] text-slate-400 mt-2">
                      Escanea con tu WhatsApp comercial
                    </span>
                  </div>
                ) : (
                  <div className="my-6 text-xs text-slate-500">
                    No hay sesión activa. Haz clic abajo para generar el código QR.
                  </div>
                )}

                <button
                  disabled={qrLoading}
                  onClick={handleInitSalesQr}
                  className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${qrLoading ? 'animate-spin' : ''}`} />
                  <span>{qrLoading ? 'Generando QR...' : 'Vincular / Reiniciar QR'}</span>
                </button>
              </div>

              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div>• <strong>Asesora IA:</strong> Sofía</div>
                <div>• <strong>Tono:</strong> Ventas persuasivas (Aggressive Sales)</div>
                <div>• <strong>Catálogo:</strong> Planes sincronizados dinámicamente</div>
              </div>
            </div>

            {/* Columna Derecha: Bandeja de Prospectos en Vivo */}
            <div className="lg:col-span-2 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col h-[580px] overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Prospectos de Facebook Ads ({salesLeads.length})</h3>
                </div>
                <span className="text-xs text-slate-400">Sincronización en vivo</span>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Lista de Leads */}
                <div className="w-64 border-r border-slate-800 overflow-y-auto divide-y divide-slate-800/60">
                  {salesLeads.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Aún no han llegado prospectos de tus campañas de anuncios.
                    </div>
                  ) : (
                    salesLeads.map((lead) => {
                      const isSelected = selectedLead?.id === lead.id;
                      return (
                        <button
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          className={`w-full p-3 text-left transition-colors flex items-start space-x-2.5 ${
                            isSelected ? 'bg-slate-900 border-l-2 border-emerald-500' : 'hover:bg-slate-900/50'
                          }`}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300 font-bold text-xs">
                            {lead.contact?.name?.[0]?.toUpperCase() || 'W'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-white truncate">
                              {lead.contact?.name || lead.contact?.phoneNumber}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {lead.lastMessageText || 'Sin mensajes'}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Chat con el Lead */}
                {selectedLead ? (
                  <div className="flex-1 flex flex-col bg-slate-900/50">
                    <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
                      <div>
                        <div className="text-xs font-bold text-white">
                          {selectedLead.contact?.name || selectedLead.contact?.phoneNumber}
                        </div>
                        <div className="text-[10px] text-slate-400">+{selectedLead.contact?.phoneNumber}</div>
                      </div>

                      <button
                        onClick={() => {
                          setNewTenant({
                            businessName: selectedLead.contact?.name || 'Nuevo Negocio',
                            slug: (selectedLead.contact?.name || 'cliente').toLowerCase().replace(/[^a-z0-9]/g, '-'),
                            billingEmail: '',
                            phone: `+${selectedLead.contact?.phoneNumber}`,
                            ownerName: selectedLead.contact?.name || '',
                            ownerPassword: '',
                            planId: plans[0]?.id || '',
                          });
                          setShowCreateModal(true);
                        }}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Crear Negocio</span>
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {(selectedLead.messages || []).map((m: any) => {
                        const isCustomer = m.sender === 'CUSTOMER';
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                          >
                            <div
                              className={`max-w-md rounded-xl p-2.5 text-xs ${
                                isCustomer
                                  ? 'bg-slate-800 text-white rounded-tl-sm'
                                  : 'bg-emerald-700 text-white rounded-tr-sm'
                              }`}
                            >
                              <div className="text-[10px] opacity-70 mb-1">
                                {isCustomer ? 'Prospecto' : 'Sofía (Ventas)'}
                              </div>
                              <p className="whitespace-pre-wrap">{m.body}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form onSubmit={handleSendLeadMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex space-x-2">
                      <input
                        type="text"
                        placeholder="Escribe como SuperAdmin para intervenir..."
                        value={leadMessageText}
                        onChange={(e) => setLeadMessageText(e.target.value)}
                        className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                    Selecciona un prospecto para ver el historial
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal Registrar Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4">Registrar Nueva Empresa Cliente</h3>
            <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400">Nombre de la Empresa:</label>
                <input
                  type="text"
                  required
                  value={newTenant.businessName}
                  onChange={(e) => setNewTenant({ ...newTenant, businessName: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-slate-400">Slug identificador (único):</label>
                <input
                  type="text"
                  required
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-slate-400">Correo Electrónico Dueño:</label>
                <input
                  type="email"
                  required
                  value={newTenant.billingEmail}
                  onChange={(e) => setNewTenant({ ...newTenant, billingEmail: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-slate-400">Contraseña de Acceso:</label>
                <input
                  type="password"
                  required
                  value={newTenant.ownerPassword}
                  onChange={(e) => setNewTenant({ ...newTenant, ownerPassword: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                >
                  Crear Negocio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Plan */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-4">
              {editingPlanId ? 'Editar Plan de Suscripción' : 'Crear Nuevo Plan SaaS'}
            </h3>
            <form onSubmit={handleSavePlan} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400">Nombre del Plan:</label>
                  <input
                    type="text"
                    required
                    placeholder="Plan Básico"
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Slug:</label>
                  <input
                    type="text"
                    required
                    placeholder="basico"
                    value={planForm.slug}
                    onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400">Precio en USD ($):</label>
                  <input
                    type="number"
                    required
                    value={planForm.priceCents / 100}
                    onChange={(e) => setPlanForm({ ...planForm, priceCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Límite Conversaciones/mes:</label>
                  <input
                    type="number"
                    required
                    value={planForm.maxConversationsPerMonth}
                    onChange={(e) => setPlanForm({ ...planForm, maxConversationsPerMonth: parseInt(e.target.value, 10) })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400">Máx. Agentes Humanos:</label>
                  <input
                    type="number"
                    required
                    value={planForm.maxTeamMembers}
                    onChange={(e) => setPlanForm({ ...planForm, maxTeamMembers: parseInt(e.target.value, 10) })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Docs RAG IA:</label>
                  <input
                    type="number"
                    required
                    value={planForm.maxKnowledgeDocs}
                    onChange={(e) => setPlanForm({ ...planForm, maxKnowledgeDocs: parseInt(e.target.value, 10) })}
                    className="w-full mt-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.allowQrGateway}
                    onChange={(e) => setPlanForm({ ...planForm, allowQrGateway: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-600"
                  />
                  <span>Permitir Conexión WhatsApp QR (Baileys)</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.allowOfficialGateway}
                    onChange={(e) => setPlanForm({ ...planForm, allowOfficialGateway: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-600"
                  />
                  <span>Permitir Meta Cloud API Oficial</span>
                </label>

                <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={planForm.allowVisionOcr}
                    onChange={(e) => setPlanForm({ ...planForm, allowVisionOcr: e.target.checked })}
                    className="rounded bg-slate-900 border-slate-700 text-emerald-600"
                  />
                  <span>Validación de Comprobantes con Gemini Vision</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold"
                >
                  Guardar Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
