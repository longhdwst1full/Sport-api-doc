'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function PwaRegistration() {
  const [isOnline, setIsOnline] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    let updateTimer: ReturnType<typeof setInterval> | undefined;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const handleControllerChange = () => {
      if (hadController) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        registrationRef.current = registration;
        setUpdateReady(Boolean(registration.waiting));
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });

        const checkForUpdate = () => {
          if (navigator.onLine && document.visibilityState === 'visible') {
            void registration.update();
          }
        };
        updateTimer = setInterval(checkForUpdate, 15 * 60 * 1000);
        document.addEventListener('visibilitychange', checkForUpdate);
      })
      .catch((error: unknown) => console.error('[PWA] Service worker registration failed', error));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (updateTimer) clearInterval(updateTimer);
    };
  }, []);

  const updateNow = useCallback(() => {
    registrationRef.current?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  }, []);

  return (
    <>
      {!isOnline && (
        <div
          className="fixed inset-x-0 top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-bold text-ink"
          role="status"
        >
          Bạn đang ngoại tuyến. Nội dung đã mở vẫn xem được; đặt hàng và thanh toán cần kết nối
          mạng.
        </div>
      )}
      {updateReady && (
        <div
          className="fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,580px)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-4 text-sm text-white shadow-card"
          role="status"
        >
          <span>Đã có phiên bản mới của DCTD Sport.</span>
          <button
            className="shrink-0 rounded-full bg-white px-4 py-2 font-bold text-ink"
            onClick={updateNow}
          >
            Cập nhật
          </button>
        </div>
      )}
    </>
  );
}
