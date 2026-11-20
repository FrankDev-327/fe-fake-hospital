/**
 * Fixed fake UUIDs (the backend only accepts UUIDs in URLs), readable by group:
 * staff ...-1xxx, patients ...-2xxx, wards/beds ...-3xxx, clinical ...-4xxx, meds ...-5xxx.
 */
export const fakeId = (n: number) =>
  `0193b000-0000-7000-8000-${String(n).padStart(12, '0')}`;

/** A date/time relative to now, so the fake data always looks current. */
export const daysFromNow = (days: number, hour = 9, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();
