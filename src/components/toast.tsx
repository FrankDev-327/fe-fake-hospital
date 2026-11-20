import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from './toast-context';

/** Short "Saved" messages at the bottom of the screen. Screen readers announce them (aria-live). */
interface Toast {
  id: number;
  text: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  return (
    <ToastContext value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 space-y-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
