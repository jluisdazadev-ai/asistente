'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  Kanban,
  Bot,
  ShoppingBag,
  QrCode,
  LogOut,
  Bell,
  Sparkles,
  AlertTriangle,
  X,
} from 'lucide-react';
import { getSocket, playHandoffNotificationSound } from '@/lib/socket';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [handoffAlert, setHandoffAlert] = useState<{ contactName: string; reason: string; conversationId: string } | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    const parsed = JSON.parse(userStr);
    setUser(parsed);

    // Escuchar alertas de Handoff en tiempo real
    if (parsed.tenantId) {
      const socket = getSocket(parsed.tenantId);

      const handleHandoff = (data: any) => {
        console.log('🚨 ALERTA DE HANDOFF RECIBIDA:', data);
        playHandoffNotificationSound();
        setHandoffAlert({
          contactName: data.contactName,
          reason: data.reason,
          conversationId: data.conversationId,
        });
      };

      socket.on('human_handoff_alert', handleHandoff);

      return () => {
        socket.off('human_handoff_alert', handleHandoff);
      };
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navItems = [
    { label: 'Bandeja en Vivo', href: '/dashboard/livechat', icon: MessageSquare },
    { label: 'Embudo Kanban', href: '/dashboard/kanban', icon: Kanban },
    { label: 'Bot Builder (IA)', href: '/dashboard/bot-builder', icon: Bot },
    { label: 'Catálogo & RAG', href: '/dashboard/catalog', icon: ShoppingBag },
    { label: 'Conexión WhatsApp', href: '/dashboard/connections', icon: QrCode },
  ];

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-800">
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shrink-0">
        {/* Brand */}
        <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Bot className="h-5 w-5" />
          </div>
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-white truncate">{user?.tenant?.name || 'Mi Negocio'}</h2>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-slate-400">Plan Pro Activo</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="overflow-hidden">
            <div className="text-xs font-semibold text-white truncate">{user?.fullName || 'Usuario'}</div>
            <div className="text-[10px] text-slate-400 truncate">{user?.email}</div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* Banner Flotante de Alerta de Handoff */}
        {handoffAlert && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-md animate-bounce">
            <div className="flex items-center space-x-2 text-xs font-bold">
              <AlertTriangle className="h-4 w-4" />
              <span>¡ATENCIÓN REQUERIDA! {handoffAlert.contactName} solicita un humano: {handoffAlert.reason}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Link
                href="/dashboard/livechat"
                onClick={() => setHandoffAlert(null)}
                className="bg-slate-950 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Ir al Chat
              </Link>
              <button onClick={() => setHandoffAlert(null)} className="p-1 hover:text-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
