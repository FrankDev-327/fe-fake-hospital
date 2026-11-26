import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { t } from '@/i18n';

/** Small building blocks every page uses. */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({
  title,
  children,
  className = '',
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
    >
      {title && (
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          {title}
        </h2>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const BADGE_TONES = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
  teal: 'bg-teal-100 text-teal-800',
};
export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Tables: same look everywhere */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export const Th = ({ children }: { children?: ReactNode }) => (
  <th className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
    {children}
  </th>
);
export const Td = ({
  children,
  className = '',
}: {
  children?: ReactNode;
  className?: string;
}) => (
  <td className={`border-b border-slate-100 px-4 py-3 ${className}`}>
    {children}
  </td>
);

/**
 * Loading / error / empty for one query, so pages only write the happy path:
 *   <QueryState query={q} empty="No patients">{(data) => ...}</QueryState>
 */
export function QueryState<T>({
  query,
  empty,
  isEmpty,
  children,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean };
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorMessage error={query.error} />;
  const data = query.data as T;
  if (empty && isEmpty?.(data))
    return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  return <>{children(data)}</>;
}

export function Loading() {
  return (
    <div role="status" className="py-6 text-center text-sm text-slate-500">
      {t('common.loading')}
    </div>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  const message =
    error instanceof ApiError && error.isUnavailable
      ? t('errors.unavailableRest')
      : error instanceof ApiError && error.status === 404
        ? t('errors.notFoundShort')
        : t('errors.loadFailed');
  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </div>
  );
}
