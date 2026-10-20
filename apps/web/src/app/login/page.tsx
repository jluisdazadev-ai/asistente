'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, ShieldCheck, Zap, MessageSquare, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@burgermaster.com');
  const [password, setPassword] = useState('owner123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('El backend API (puerto 4000) no está respondiendo o se está reiniciando.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.role === 'SUPERADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const setCredentials = (em: string, pw: string) => {
    setEmail(em);
    setPassword(pw);
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Columna Izquierda: Información de la Plataforma */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-slate-900 via-slate-950 to-emerald-950/40 border-r border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">OmniCRM WhatsApp AI</h1>
            <p className="text-xs text-slate-400">Plataforma SaaS Multi-tenant con Gemini 1.5 Flash</p>
          </div>
        </div>

        <div className="space-y-6 my-auto">
          <div className="inline-flex items-center space-x-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <Zap className="h-3.5 w-3.5" />
            <span>Motor Híbrido: QR Baileys + Meta Cloud API v21</span>
          </div>
          <h2 className="text-4xl font-extrabold text-white tracking-tight leading-tight">
            Vende Asistentes de IA para WhatsApp a cientos de negocios.
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Plataforma con arquitectura de alta concurrencia, debounce buffer anti-bloqueo, RAG con búsqueda vectorial pgvector, procesamiento multimodal (audios y visión de comprobantes de pago) y embudo Kanban automatizado.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <MessageSquare className="h-5 w-5 text-emerald-400 mb-2" />
              <h3 className="text-sm font-semibold text-white">Debounce Buffer</h3>
              <p className="text-xs text-slate-400 mt-1">Agrupa ráfagas de mensajes en 5-8s para ahorrar tokens y sonar humano.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <ShieldCheck className="h-5 w-5 text-emerald-400 mb-2" />
              <h3 className="text-sm font-semibold text-white">Simulador de Escritura</h3>
              <p className="text-xs text-slate-400 mt-1">Presencia de tipeo dinámico para proteger los números contra baneos.</p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          © 2026 OmniCRM WhatsApp. Arquitectura de Grado Empresarial.
        </div>
      </div>

      {/* Columna Derecha: Formulario de Login */}
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-6 sm:px-12 lg:px-20 py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-white">Iniciar Sesión</h2>
            <p className="text-sm text-slate-400 mt-1">Accede a tu panel de SuperAdmin o de Negocio Cliente.</p>
          </div>

          {/* Accesos Rápidos Demo */}
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Accesos Rápidos Demo:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCredentials('admin@crmwhatsapp.com', 'admin123')}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-left text-xs hover:border-emerald-500 transition-colors"
              >
                <div className="font-semibold text-white">SuperAdmin</div>
                <div className="text-slate-400 text-[10px]">Gestor global de planes</div>
              </button>
              <button
                type="button"
                onClick={() => setCredentials('owner@burgermaster.com', 'owner123')}
                className="rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-left text-xs hover:border-emerald-500 transition-colors"
              >
                <div className="font-semibold text-white">Burger Master</div>
                <div className="text-slate-400 text-[10px]">Dueño de negocio</div>
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="tu@correo.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center space-x-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Ingresando...' : 'Entrar al Panel'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
