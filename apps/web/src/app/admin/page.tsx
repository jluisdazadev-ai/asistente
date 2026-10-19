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
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function SuperAdminPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenant, setNewTenant] = useState({
    businessName: '',
    slug: '',
    billingEmail: '',
    phone: '+57',
    ownerName: '',
    ownerPassword: '',
  });

  const loadAdminData = async () => {
    try {
      const [resStats, resTenants] = await Promise.all([
        fetchWithAuth('/admin/stats'),
        fetchWithAuth('/admin/tenants'),
      ]);
      const dataStats = await resStats.json();
      const dataTenants = await resTenants.json();

      setStats(dataStats);
      setTenants(dataTenants.tenants || []);
    } catch (err) {
      console.error('Error cargando panel de SuperAdmin:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

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
        });
        loadAdminData();
      }
    } catch (err) {
      console.error('Error creando negocio:', err);
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
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
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
            <p className="text-xs text-slate-400">Control maestro de planes, suscripciones y clientes comerciales.</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Registrar Nuevo Cliente</span>
          </button>

          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
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

        {/* Tabla de Negocios Clientes */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Listado de Negocios Suscritos (Tenants)</h2>
            <span className="text-xs text-slate-400">{tenants.length} registrados</span>
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
                          {t.plan?.name || 'Plan Pro'}
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
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            t.isActive
                              ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                        >
                          {t.isActive ? 'Suspender' : 'Reactivar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal Crear Nuevo Cliente */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white mb-1">Registrar Nuevo Negocio Cliente</h3>
            <p className="text-xs text-slate-400 mb-4">Crea el inquilino (Tenant) y las credenciales de su dueño.</p>

            <form onSubmit={handleCreateTenant} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Nombre Comercial del Negocio</label>
                <input
                  type="text"
                  required
                  value={newTenant.businessName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                    setNewTenant({ ...newTenant, businessName: name, slug });
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white"
                  placeholder="Ej. Clínica Dental Sonrisas"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Slug / Identificador URL</label>
                <input
                  type="text"
                  required
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white font-mono"
                  placeholder="clinica-dental-sonrisas"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Correo del Dueño (Login)</label>
                <input
                  type="email"
                  required
                  value={newTenant.billingEmail}
                  onChange={(e) => setNewTenant({ ...newTenant, billingEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white"
                  placeholder="admin@clinica.com"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Contraseña de Acceso</label>
                <input
                  type="password"
                  required
                  value={newTenant.ownerPassword}
                  onChange={(e) => setNewTenant({ ...newTenant, ownerPassword: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-white"
                  placeholder="••••••••"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500"
                >
                  Crear y Activar Negocio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
