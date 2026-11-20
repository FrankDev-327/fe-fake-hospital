import type { ReactNode } from 'react';

const TONES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
};

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
