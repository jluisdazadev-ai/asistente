'use client';

import { useState, useEffect } from 'react';
import {
  QrCode,
  Globe,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  Key,
  ShieldCheck,
  Send,
  Zap,
} from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { getSocket } from '@/lib/socket';

export default function ConnectionPage() {
  const [activeGateway, setActiveGateway] = useState<'qr' | 'meta'>('qr');
  const [qrStatus, setQrStatus] = useState<'DISCONNECTED' | 'STARTING' | 'SCAN_QR' | 'CONNECTED'>('DISCONNECTED');
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [connectedPhone, setConnectedPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingQr, setGeneratingQr] = useState(false);

  // Meta Cloud API State
  const [metaConfig, setMetaConfig] = useState({
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
  });
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaSuccess, setMetaSuccess] = useState('');

  const loadConnections = async () => {
    try {
      const res = await fetchWithAuth('/connections');
      const data = await res.json();
      if (data.connections) {
        const qrConn = data.connections.find((c: any) => c.gatewayType === 'QR_BAILEYS');
        if (qrConn) {
          setQrStatus(qrConn.status);
          setQrCodeBase64(qrConn.qrCodeBase64);
          setConnectedPhone(qrConn.phoneNumber);
        }

        const metaConn = data.connections.find((c: any) => c.gatewayType === 'META_OFFICIAL');
        if (metaConn) {
          setMetaConfig({
            wabaId: metaConn.wabaId || '',
            phoneNumberId: metaConn.phoneNumberId || '',
            accessToken: metaConn.accessTokenEncrypted || '',
          });
        }
      }
    } catch (err) {
      console.error('Error cargando conexiones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();

    const userStr = localStorage.getItem('user');
    const tenantId = userStr ? JSON.parse(userStr).tenantId : null;
    const socket = getSocket(tenantId);

    // Escuchar eventos de actualización de QR y estado en tiempo real
    const handleConnectionUpdate = (data: any) => {
      console.log('📡 [Evento Conexión] WhatsApp:', data);
      setQrStatus(data.status);
      if (data.qrCodeBase64) setQrCodeBase64(data.qrCodeBase64);
      if (data.phoneNumber) setConnectedPhone(data.phoneNumber);
    };

    socket.on('whatsapp_connection_updated', handleConnectionUpdate);

    return () => {
      socket.off('whatsapp_connection_updated', handleConnectionUpdate);
    };
  }, []);

  // Polling automático mientras el estado sea STARTING
  useEffect(() => {
    let interval: any;
    if (qrStatus === 'STARTING') {
      interval = setInterval(() => {
        loadConnections();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [qrStatus]);

  const handleGenerateQR = async () => {
    setGeneratingQr(true);
    setQrStatus('STARTING');
    try {
      const res = await fetchWithAuth('/connections/qr/init', { method: 'POST' });
      const data = await res.json();
      setQrStatus(data.status || 'STARTING');
      if (data.qrCodeBase64) {
        setQrCodeBase64(data.qrCodeBase64);
        setQrStatus('SCAN_QR');
      }
    } catch (err) {
      console.error('Error generando QR:', err);
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMeta(true);
    setMetaSuccess('');
    try {
      const res = await fetchWithAuth('/connections/meta', {
        method: 'POST',
        body: JSON.stringify(metaConfig),
      });
      const data = await res.json();
      if (data.success) {
        setMetaSuccess('¡Credenciales de Meta Cloud API guardadas y línea verificada!');
      }
    } catch (err) {
      console.error('Error guardando Meta API:', err);
    } finally {
      setSavingMeta(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6 shrink-0">
        <h1 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
          <Zap className="h-5 w-5 text-emerald-600" />
          <span>Motor Híbrido de Conexión a WhatsApp (Gateway Dual)</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Conecta la línea de tu negocio mediante código QR (Baileys) o mediante la API Oficial de Meta Cloud.
        </p>
      </div>

      {/* Selector de Gateway */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mb-6">
        <button
          onClick={() => setActiveGateway('qr')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeGateway === 'qr'
              ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <QrCode className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-sm text-slate-900">Opción A: Escaneo QR (Baileys)</span>
            </div>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
              Activación Inmediata
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Escanea desde la app de WhatsApp de tu teléfono. Sin esperas de verificación de Meta, reconexión automática y simulador anti-ban.
          </p>
        </button>

        <button
          onClick={() => setActiveGateway('meta')}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeGateway === 'meta'
              ? 'border-emerald-600 bg-white ring-2 ring-emerald-500/20 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Globe className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-sm text-slate-900">Opción B: Meta Cloud API Oficial</span>
            </div>
            <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              Empresarial 100% Oficial
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Conexión oficial vía Meta for Developers. Soporta plantillas HSM para iniciar chats después de la ventana de 24 horas y cero riesgo de baneo.
          </p>
        </button>
      </div>

      {/* Panel Opción A: QR / Baileys */}
      {activeGateway === 'qr' && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Estado de Conexión QR</h3>
              <p className="text-xs text-slate-500">Microservicio Baileys nativo de alto rendimiento</p>
            </div>

            <div className="flex items-center space-x-2">
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  qrStatus === 'CONNECTED'
                    ? 'bg-emerald-500'
                    : qrStatus === 'SCAN_QR'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {qrStatus === 'CONNECTED'
                  ? 'Conectado'
                  : qrStatus === 'SCAN_QR'
                  ? 'Esperando Escaneo'
                  : qrStatus === 'STARTING'
                  ? 'Generando...'
                  : 'Desconectado'}
              </span>
            </div>
          </div>

          {qrStatus === 'CONNECTED' ? (
            <div className="text-center py-8 space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="text-base font-bold text-slate-900">¡WhatsApp Vinculado Exitosamente!</h4>
              <p className="text-xs text-slate-500 font-mono">
                Línea activa: {connectedPhone ? `+${connectedPhone}` : 'Número Registrado'}
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                El Asistente de IA está activo respondiendo mensajes con el Debounce Buffer y simulador de escritura.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center py-4 text-center">
              {qrCodeBase64 ? (
                <div className="p-3 bg-white border-2 border-slate-900 rounded-2xl shadow-md mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodeBase64} alt="Código QR WhatsApp" className="h-56 w-56 object-contain" />
                </div>
              ) : (
                <div className="h-56 w-56 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 mb-4 text-slate-400">
                  <QrCode className="h-12 w-12 mb-2 stroke-1" />
                  <span className="text-xs">Presiona generar para obtener QR</span>
                </div>
              )}

              <div className="space-y-1 mb-5">
                <p className="text-xs font-semibold text-slate-800">Pasos para conectar:</p>
                <ol className="text-[11px] text-slate-500 list-decimal list-inside space-y-0.5 text-left">
                  <li>Abre WhatsApp en tu teléfono móvil.</li>
                  <li>Toca Menú (⋮) o Ajustes &gt; Dispositivos vinculados.</li>
                  <li>Toca "Vincular un dispositivo" y apunta la cámara a este código.</li>
                </ol>
              </div>

              <button
                onClick={handleGenerateQR}
                disabled={generatingQr}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${generatingQr ? 'animate-spin' : ''}`} />
                <span>{generatingQr ? 'Generando Código...' : 'Generar / Renovar Código QR'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Panel Opción B: Meta Cloud API Oficial */}
      {activeGateway === 'meta' && (
        <div className="max-w-2xl bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="pb-4 border-b border-slate-100 mb-6">
            <h3 className="text-sm font-bold text-slate-900">Credenciales de Meta Cloud API (v21.0)</h3>
            <p className="text-xs text-slate-500">Obtenidas desde tu panel en developers.facebook.com</p>
          </div>

          {metaSuccess && (
            <div className="mb-4 rounded-lg bg-emerald-100 border border-emerald-300 p-3 text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{metaSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSaveMeta} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">WhatsApp Business Account ID (WABA_ID)</label>
              <input
                type="text"
                required
                value={metaConfig.wabaId}
                onChange={(e) => setMetaConfig({ ...metaConfig, wabaId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2.5 font-mono"
                placeholder="Ej. 109283746592819"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number ID</label>
              <input
                type="text"
                required
                value={metaConfig.phoneNumberId}
                onChange={(e) => setMetaConfig({ ...metaConfig, phoneNumberId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2.5 font-mono"
                placeholder="Ej. 518294719283746"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Permanent System User Access Token (EAAG...)</label>
              <textarea
                rows={3}
                required
                value={metaConfig.accessToken}
                onChange={(e) => setMetaConfig({ ...metaConfig, accessToken: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2.5 font-mono"
                placeholder="EAAGxxxxxxxxxxxxxxxxxxxxxxxx..."
              />
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">URL del Webhook de Meta para configurar en el portal:</div>
              <div className="font-mono bg-white p-1.5 rounded border border-slate-200 select-all text-[10px]">
                https://tudominio.com/api/webhooks/meta
              </div>
              <div className="text-slate-500 text-[10px]">Verify Token: <strong>crm_whatsapp_verify_token_secure_99</strong></div>
            </div>

            <button
              type="submit"
              disabled={savingMeta}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              <Key className="h-4 w-4" />
              <span>{savingMeta ? 'Guardando y Verificando...' : 'Guardar Credenciales Oficiales'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
