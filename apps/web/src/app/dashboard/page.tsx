'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/livechat');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center text-slate-400 text-xs">
      Redirigiendo a la bandeja de entrada en vivo...
    </div>
  );
}
