'use client';

import { useState, useEffect } from 'react';
import {
  Bot,
  Sliders,
  Clock,
  CreditCard,
  Truck,
  Shield,
  Save,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

export default function BotBuilderPage() {
  const [activeTab, setActiveTab] = useState<'identity' | 'hours' | 'payments' | 'delivery' | 'antiban'>('identity');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Estados del Bot
  const [botConfig, setBotConfig] = useState({
    botName: 'Max Burgers',
    roleDescription: 'Mesero y asesor virtual experto en tomar pedidos para Burger Master Gourmet.',
    tone: 'FRIENDLY',
    temperature: 0.4,
    businessRules: '',
    customSystemPrompt: '',
    debounceSeconds: 6,
    typingSimulationEnabled: true,
    minTypingDelayMs: 1200,
    maxTypingDelayMs: 4000,
    voiceInEnabled: true,
    visionOcrEnabled: true,
    outOfHoursReplyEnabled: true,
    outOfHoursMessage: '¡Hola! En este momento nuestra cocina está cerrada. Te responderemos a primera hora.',
    isActive: true,
  });

  const [businessHours, setBusinessHours] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);

  // Nuevos registros temporales
  const [newBank, setNewBank] = useState({ bankName: 'Nequi', accountType: 'Billetera', accountNumber: '', holderName: '' });
  const [newZone, setNewZone] = useState({ zoneName: '', price: 5000, estimatedMinutes: 40 });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetchWithAuth('/bot-config');
        const data = await res.json();
        if (data.botConfig) setBotConfig(data.botConfig);
        if (data.businessHours) setBusinessHours(data.businessHours);
        if (data.bankAccounts) setBankAccounts(data.bankAccounts);
        if (data.deliveryZones) setDeliveryZones(data.deliveryZones);
      } catch (err) {
        console.error('Error cargando configuración:', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await fetchWithAuth('/bot-config', {
        method: 'PUT',
        body: JSON.stringify(botConfig),
      });

      if (businessHours.length > 0) {
        await fetchWithAuth('/bot-config/hours', {
          method: 'PUT',
          body: JSON.stringify({ hours: businessHours }),
        });
      }

      setSuccessMsg('¡Configuración guardada exitosamente!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Error guardando configuración:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.accountNumber || !newBank.holderName) return;

    try {
      const res = await fetchWithAuth('/bot-config/bank-accounts', {
        method: 'POST',
        body: JSON.stringify(newBank),
      });
      const data = await res.json();
      if (data.account) {
        setBankAccounts((prev) => [...prev, data.account]);
        setNewBank({ bankName: 'Nequi', accountType: 'Billetera', accountNumber: '', holderName: '' });
      }
    } catch (err) {
      console.error('Error añadiendo cuenta bancaria:', err);
    }
  };

  const handleDeleteBank = async (id: string) => {
    try {
      await fetchWithAuth(`/bot-config/bank-accounts/${id}`, { method: 'DELETE' });
      setBankAccounts((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Error eliminando cuenta:', err);
    }
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZone.zoneName) return;

    try {
      const res = await fetchWithAuth('/bot-config/delivery-zones', {
        method: 'POST',
        body: JSON.stringify(newZone),
      });
      const data = await res.json();
      if (data.zone) {
        setDeliveryZones((prev) => [...prev, data.zone]);
        setNewZone({ zoneName: '', price: 5000, estimatedMinutes: 40 });
      }
    } catch (err) {
      console.error('Error añadiendo zona:', err);
    }
  };

  const handleDeleteZone = async (id: string) => {
    try {
      await fetchWithAuth(`/bot-config/delivery-zones/${id}`, { method: 'DELETE' });
      setDeliveryZones((prev) => prev.filter((z) => z.id !== id));
    } catch (err) {
      console.error('Error eliminando zona:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Bot className="h-5 w-5 text-emerald-600" />
            <span>Configurador Profundo del Asistente IA (Bot Builder)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta la personalidad, reglas comerciales, debounce buffer anti-bloqueo y medios de pago de tu negocio.
          </p>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={saving}
          className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
        </button>
      </div>

      {successMsg && (
        <div className="mb-4 rounded-lg bg-emerald-100 border border-emerald-300 p-3 text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Selector de Pestañas */}
      <div className="flex space-x-2 border-b border-slate-200 mb-6 shrink-0">
        {[
          { id: 'identity', label: '1. Identidad y Tono', icon: Sliders },
          { id: 'hours', label: '2. Horarios de Atención', icon: Clock },
          { id: 'payments', label: '3. Medios de Pago (Nequi/Bancos)', icon: CreditCard },
          { id: 'delivery', label: '4. Zonas de Domicilio', icon: Truck },
          { id: 'antiban', label: '5. Anti-Ban y Buffer', icon: Shield },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
                isActive
                  ? 'border-emerald-600 text-emerald-600 bg-white rounded-t-lg'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido de las Pestañas */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 p-6 shadow-sm max-w-4xl">
        {/* PESTAÑA 1: Identidad y Tono */}
        {activeTab === 'identity' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del Asistente</label>
                <input
                  type="text"
                  value={botConfig.botName}
                  onChange={(e) => setBotConfig({ ...botConfig, botName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  placeholder="Ej. Max Burgers"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tono de Voz de la IA</label>
                <select
                  value={botConfig.tone}
                  onChange={(e) => setBotConfig({ ...botConfig, tone: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                >
                  <option value="FRIENDLY">Amigable y Empático (Ideal restaurantes/tiendas)</option>
                  <option value="FORMAL">Formal y Corporativo (Clínicas, bufetes, B2B)</option>
                  <option value="AGGRESSIVE_SALES">Vendedor Persuasivo (Cierre rápido y promos)</option>
                  <option value="TECH_SUPPORT">Soporte Técnico (ISPs, software, paso a paso)</option>
                  <option value="CONCILIATORY">Conciliador (Atención de PQR y garantías)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rol y Objetivo Principal</label>
              <textarea
                rows={2}
                value={botConfig.roleDescription}
                onChange={(e) => setBotConfig({ ...botConfig, roleDescription: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                placeholder="Describe qué hace el bot..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700">Creatividad / Temperatura de la IA</label>
                <span className="text-xs font-mono font-bold text-emerald-600">{botConfig.temperature}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={botConfig.temperature}
                onChange={(e) => setBotConfig({ ...botConfig, temperature: parseFloat(e.target.value) })}
                className="w-full accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>0.0 (Extremadamente preciso)</span>
                <span>0.4 (Recomendado para ventas)</span>
                <span>1.0 (Muy creativo)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Políticas y Reglas Estrictas del Negocio</label>
              <textarea
                rows={4}
                value={botConfig.businessRules || ''}
                onChange={(e) => setBotConfig({ ...botConfig, businessRules: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                placeholder="1. Pedido mínimo: $25.000 COP&#10;2. No se despacha sin comprobante verificado..."
              />
            </div>
          </div>
        )}

        {/* PESTAÑA 2: Horarios de Atención */}
        {activeTab === 'hours' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <h4 className="text-xs font-bold text-slate-800">Respuesta Fuera de Horario</h4>
                <p className="text-[11px] text-slate-500">Enviar mensaje automático si un cliente escribe fuera de turno.</p>
              </div>
              <input
                type="checkbox"
                checked={botConfig.outOfHoursReplyEnabled}
                onChange={(e) => setBotConfig({ ...botConfig, outOfHoursReplyEnabled: e.target.checked })}
                className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Mensaje Fuera de Horario</label>
              <textarea
                rows={2}
                value={botConfig.outOfHoursMessage || ''}
                onChange={(e) => setBotConfig({ ...botConfig, outOfHoursMessage: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Día</th>
                    <th className="p-2.5">Apertura</th>
                    <th className="p-2.5">Cierre</th>
                    <th className="p-2.5 text-center">Cerrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'].map((dayName, idx) => {
                    const row = businessHours.find((h) => h.dayOfWeek === idx) || { openTime: '12:00', closeTime: '22:00', isClosed: false };

                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 font-medium text-slate-800">{dayName}</td>
                        <td className="p-2.5">
                          <input
                            type="time"
                            value={row.openTime}
                            onChange={(e) => {
                              const updated = [...businessHours];
                              const found = updated.find((h) => h.dayOfWeek === idx);
                              if (found) found.openTime = e.target.value;
                              else updated.push({ dayOfWeek: idx, openTime: e.target.value, closeTime: '22:00', isClosed: false });
                              setBusinessHours(updated);
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="time"
                            value={row.closeTime}
                            onChange={(e) => {
                              const updated = [...businessHours];
                              const found = updated.find((h) => h.dayOfWeek === idx);
                              if (found) found.closeTime = e.target.value;
                              else updated.push({ dayOfWeek: idx, openTime: '12:00', closeTime: e.target.value, isClosed: false });
                              setBusinessHours(updated);
                            }}
                            className="rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.isClosed}
                            onChange={(e) => {
                              const updated = [...businessHours];
                              const found = updated.find((h) => h.dayOfWeek === idx);
                              if (found) found.isClosed = e.target.checked;
                              else updated.push({ dayOfWeek: idx, openTime: '12:00', closeTime: '22:00', isClosed: e.target.checked });
                              setBusinessHours(updated);
                            }}
                            className="accent-emerald-600 h-4 w-4"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: Medios de Pago */}
        {activeTab === 'payments' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-800 mb-1">Cuentas Bancarias y Billeteras Digitales</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                La IA ofrecerá estas cuentas cuando el cliente solicite pagar o confirmar un pedido.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                {bankAccounts.map((acc) => (
                  <div key={acc.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex items-start justify-between">
                    <div>
                      <span className="font-bold text-xs text-slate-900">{acc.bankName}</span>
                      <div className="text-[11px] text-slate-600 mt-0.5">{acc.accountType}: <strong>{acc.accountNumber}</strong></div>
                      <div className="text-[10px] text-slate-400">Titular: {acc.holderName}</div>
                    </div>
                    <button onClick={() => handleDeleteBank(acc.id)} className="text-slate-400 hover:text-rose-500 p-1">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Formulario para agregar cuenta */}
              <form onSubmit={handleAddBank} className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/40 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Banco (Nequi, Bancolombia)"
                  value={newBank.bankName}
                  onChange={(e) => setNewBank({ ...newBank, bankName: e.target.value })}
                  className="rounded border border-slate-300 p-2"
                />
                <input
                  type="text"
                  placeholder="Tipo (Ahorros, Billetera)"
                  value={newBank.accountType}
                  onChange={(e) => setNewBank({ ...newBank, accountType: e.target.value })}
                  className="rounded border border-slate-300 p-2"
                />
                <input
                  type="text"
                  placeholder="Número de cuenta / Celular"
                  value={newBank.accountNumber}
                  onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
                  className="rounded border border-slate-300 p-2"
                />
                <input
                  type="text"
                  placeholder="Nombre Titular"
                  value={newBank.holderName}
                  onChange={(e) => setNewBank({ ...newBank, holderName: e.target.value })}
                  className="rounded border border-slate-300 p-2"
                />
                <button
                  type="submit"
                  className="bg-emerald-600 text-white font-semibold rounded p-2 hover:bg-emerald-700 flex items-center justify-center space-x-1"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA 4: Zonas de Domicilio */}
        {activeTab === 'delivery' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-800 mb-1">Zonas y Tarifas de Domicilio</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                La IA calculará el costo de envío sumándolo al subtotal del pedido según el barrio del cliente.
              </p>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden mb-4">
                {deliveryZones.map((z) => (
                  <div key={z.id} className="p-3 flex items-center justify-between text-xs bg-white hover:bg-slate-50">
                    <span className="font-semibold text-slate-800">{z.zoneName}</span>
                    <div className="flex items-center space-x-4">
                      <span className="font-mono font-bold text-emerald-600">${Number(z.price).toLocaleString('es-CO')} COP</span>
                      <span className="text-[10px] text-slate-400">~{z.estimatedMinutes} mins</span>
                      <button onClick={() => handleDeleteZone(z.id)} className="text-slate-400 hover:text-rose-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Formulario para agregar zona */}
              <form onSubmit={handleAddZone} className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/40 flex space-x-2 text-xs">
                <input
                  type="text"
                  placeholder="Nombre de la Zona / Barrio"
                  value={newZone.zoneName}
                  onChange={(e) => setNewZone({ ...newZone, zoneName: e.target.value })}
                  className="flex-1 rounded border border-slate-300 p-2"
                />
                <input
                  type="number"
                  placeholder="Precio COP"
                  value={newZone.price}
                  onChange={(e) => setNewZone({ ...newZone, price: parseFloat(e.target.value) || 0 })}
                  className="w-32 rounded border border-slate-300 p-2 font-mono"
                />
                <button
                  type="submit"
                  className="bg-emerald-600 text-white font-semibold rounded px-4 py-2 hover:bg-emerald-700 flex items-center space-x-1 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar Zona</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA 5: Anti-Ban y Buffer */}
        {activeTab === 'antiban' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Agrupador de Mensajes (Debounce Buffer)</h4>
                  <p className="text-[11px] text-slate-500">
                    Espera X segundos tras la llegada de un mensaje. Si el cliente envía 4 mensajes seguidos, los unifica en un solo contexto de IA.
                  </p>
                </div>
                <span className="text-sm font-mono font-bold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded">
                  {botConfig.debounceSeconds} segundos
                </span>
              </div>
              <input
                type="range"
                min="3"
                max="15"
                step="1"
                value={botConfig.debounceSeconds}
                onChange={(e) => setBotConfig({ ...botConfig, debounceSeconds: parseInt(e.target.value, 10) })}
                className="w-full accent-emerald-600 mt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>3s (Respuesta rápida)</span>
                <span>6s (Recomendado)</span>
                <span>15s (Máximo ahorro de tokens)</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Simulador de Escritura Humana ("Escribiendo...")</h4>
                <p className="text-[11px] text-slate-500">
                  Muestra el estado "composing" con un retardo dinámico según la longitud del texto para evitar baneos por mensajes instantáneos.
                </p>
              </div>
              <input
                type="checkbox"
                checked={botConfig.typingSimulationEnabled}
                onChange={(e) => setBotConfig({ ...botConfig, typingSimulationEnabled: e.target.checked })}
                className="h-4 w-4 accent-emerald-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
