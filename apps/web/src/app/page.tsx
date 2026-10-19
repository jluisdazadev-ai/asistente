'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role === 'SUPERADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-900 text-white">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        <p className="text-slate-400 font-medium">Cargando plataforma SaaS...</p>
      </div>
    </div>
  );
}
