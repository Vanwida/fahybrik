// Tiempo relativo corto para metadatos de cards ("hace 2 h", "hace 5 d").
// Única fuente de verdad — antes duplicado en el hub de microciclos y el
// catálogo de entrenos (regla DRY: 3 usos → extraer).

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOUR_MS = MINUTE_MS * MINUTES_PER_HOUR;
const HOURS_PER_DAY = 24;
const DAYS_BEFORE_ABSOLUTE = 30;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const TENURE_WEEKS_FROM_DAYS = 14; // <14 d → días; <60 d → semanas; else meses
const TENURE_MONTHS_FROM_DAYS = 60;

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / MINUTE_MS);
  if (mins < 1) return 'hace instantes';
  if (mins < MINUTES_PER_HOUR) return `hace ${mins} min`;
  const hrs = Math.round(mins / MINUTES_PER_HOUR);
  if (hrs < HOURS_PER_DAY) return `hace ${hrs} h`;
  const days = Math.round(hrs / HOURS_PER_DAY);
  if (days < DAYS_BEFORE_ABSOLUTE) return `hace ${days} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Antigüedad ("tenure") como SUFIJO desde una fecha base (p. ej. `onboarded_at`):
 * "instantes", "5 h", "12 d", "3 sem", "2 meses". `null` si la fecha es inválida
 * o está en el futuro.
 *
 * El PREFIJO ("alta hace" en la ficha del atleta, "esperando" en altas) lo añade
 * cada caller — así el cálculo del tiempo transcurrido es ÚNICO y el MISMO atleta
 * muestra el MISMO número en ambas pantallas.
 */
export function tenureSuffix(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  const diff = Date.now() - ms;
  if (diff < 0) return null;
  const hours = Math.floor(diff / HOUR_MS);
  if (hours < 1) return 'instantes';
  if (hours < HOURS_PER_DAY) return `${hours} h`;
  const days = Math.floor(hours / HOURS_PER_DAY);
  if (days < TENURE_WEEKS_FROM_DAYS) return `${days} d`;
  if (days < TENURE_MONTHS_FROM_DAYS) return `${Math.round(days / DAYS_PER_WEEK)} sem`;
  return `${Math.round(days / DAYS_PER_MONTH)} meses`;
}
