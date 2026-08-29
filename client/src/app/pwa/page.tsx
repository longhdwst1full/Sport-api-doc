'use client';

import { useEffect, useState } from 'react';
import { resetPwaAndReload } from '@/pwa/reset-pwa';

export default function PwaDiagnosticsPage() {
  const [online, setOnline] = useState(true);
  const [controller, setController] = useState<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    setController(navigator.serviceWorker?.controller?.scriptURL ?? null);
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-16">
      <p className="font-bold uppercase tracking-[.2em] text-brand-600">Diagnostics</p>
      <h1 className="mt-3 text-4xl font-extrabold">Trạng thái PWA</h1>
      <dl className="mt-8 grid gap-3 rounded-3xl bg-white p-6 shadow-card">
        <div className="flex justify-between gap-4">
          <dt>Kết nối</dt>
          <dd className="font-bold">{online ? 'Online' : 'Offline'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Service worker</dt>
          <dd className="max-w-sm break-all text-right font-bold">
            {controller ?? 'Chưa điều khiển trang'}
          </dd>
        </div>
      </dl>
      <button
        className="mt-6 rounded-full bg-ink px-6 py-3 font-bold text-white"
        onClick={() => void resetPwaAndReload()}
      >
        Reset cache và service worker
      </button>
    </main>
  );
}
