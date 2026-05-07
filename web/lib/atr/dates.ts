// Date helpers — all UTC, all calendar-day. ATR planning is at day granularity,
// not minute granularity, so we never deal with timezones inside the engine.

export function parseIsoDate(d: string): Date {
  // YYYY-MM-DD → midnight UTC
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`invalid ISO date: ${d}`);
  const [, y, mo, dd] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(dd)));
}

export function isoDateString(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

export function diffDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime();
  return Math.round(ms / 86_400_000);
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
