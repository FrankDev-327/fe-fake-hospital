import type { Staff } from '@/auth/types';
import i18n, { t } from '@/i18n';

/** Everyone in the hospital sees Zagreb time, whatever their computer is set to. */
const TZ = 'Europe/Zagreb';
/** Dates follow the chosen language (en-GB: 12 Mar 1948, hr-HR: 12. ožu 1948.) */
const locale = () => (i18n.language === 'hr' ? 'hr-HR' : 'en-GB');

export const displayName = (
  s: Pick<Staff, 'role' | 'firstName' | 'lastName'>,
) =>
  `${s.role === 'doctor' ? `${t('common.dr')} ` : ''}${s.firstName} ${s.lastName}`;

/** "Matić, Josip". A newborn has no first name until the parents choose one. */
export const patientName = (p: {
  firstName: string | null;
  lastName: string;
}) => `${p.lastName}, ${p.firstName ?? 'newborn'}`;

/** "2026-03-12" -> 12 Mar 1948. Dates of birth have no time zone: format them as written. */
export const formatDate = (isoDate: string) =>
  new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(locale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TZ,
  });

/** Age in full years today. */
export function age(dateOfBirth: string, now = new Date()) {
  const [y, m, d] = dateOfBirth.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d))
    years--;
  return years;
}

/** "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.min', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return t('time.h', { n: hours });
  return t('time.days', { n: Math.round(hours / 24) });
}

export const SEX_LABEL: Record<string, string> = {
  female: 'F',
  male: 'M',
  other: 'X',
  unknown: '?',
};

/** "YYYY-MM-DD" in Zagreb, for API date params (from/to) */
export const isoDay = (date: Date) =>
  date.toLocaleDateString('sv-SE', { timeZone: TZ });

/** "14:05" today, "tomorrow 11:05", or "22 Nov, 09:00" further away (Zagreb days). */
export function dueLabel(due: Date, now: number) {
  const time = formatTime(due.toISOString());
  const dayOf = (t: number) => isoDay(new Date(t));
  if (dayOf(due.getTime()) === dayOf(now)) return time;
  if (dayOf(due.getTime()) === dayOf(now + 86_400_000))
    return t('time.tomorrow', { time });
  return formatDateTime(due.toISOString());
}
