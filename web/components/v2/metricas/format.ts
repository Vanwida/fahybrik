// Presentation helpers for the funnel metrics (#20). Pure formatters — no data
// logic (that lives in lib/dashboard/coach/metrics.ts). Numbers use es-ES so the
// coach reads "1.240" and "120 €" the way Barcelona does.

const NUM_FMT = new Intl.NumberFormat('es-ES');
const EUR_FMT = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
// Money that lives in CENTS (billing / #15): show céntimos only when they are
// non-zero, so "70 €" stays clean but "79,99 €" keeps its precision.
const EUR_CENTS_FMT = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Spanish short month abbreviations (deterministic — avoids Date tz drift). */
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Thousands-grouped integer, e.g. 1240 → "1.240". */
export function formatCount(n: number): string {
  return NUM_FMT.format(n);
}

/** Ratio 0–1 → integer percent "63%"; null (no base) → "—". */
export function formatPct(r: number | null): string {
  if (r == null) return '—';
  return `${Math.round(r * 100)}%`;
}

/** Ratio 0–1 → one-decimal percent "15.7%"; null → "—" (headline conversion). */
export function formatPct1(r: number | null): string {
  if (r == null) return '—';
  return `${(r * 100).toFixed(1)}%`;
}

/** Average price → "120 €"; null → "—". */
export function formatEur(n: number | null): string {
  if (n == null) return '—';
  return EUR_FMT.format(Math.round(n));
}

/** Money in integer CENTS → "70 €" / "79,99 €"; null → "—" (billing, #15). */
export function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  return EUR_CENTS_FMT.format(cents / 100);
}

export interface DeltaView {
  /** Signed percent magnitude, e.g. "12%". */
  pct: string;
  dir: 'up' | 'down' | 'flat';
}

/** Delta direction → v2 color token (up=ok, down=danger, flat=faint). */
export const DELTA_COLOR_VAR: Record<DeltaView['dir'], string> = {
  up: 'var(--v2-ok)',
  down: 'var(--v2-danger)',
  flat: 'var(--v2-faint)',
};

/** Delta direction → arrow glyph (flat = none). */
export const DELTA_ARROW: Record<DeltaView['dir'], string> = { up: '▲', down: '▼', flat: '' };

/** Ratio change → arrow + magnitude, or null when there is no prior base. */
export function formatDelta(r: number | null): DeltaView | null {
  if (r == null) return null;
  const pct = Math.round(r * 100);
  return {
    pct: `${Math.abs(pct)}%`,
    dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

/** ISO calendar date "2026-07-08" → "8 jul". Pure — no Date tz drift (used for the
 *  visits "desde …" disclaimer and week-start markers). */
export function formatIsoDayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${d} ${MONTHS_ES[m - 1]}`;
}

/** ISO instant → "8 jul" for the cohort subtitle range. */
export function formatDayShort(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Madrid',
  })
    .format(dt)
    .replace(/\.$/, '');
}
