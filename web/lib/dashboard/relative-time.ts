// Tiempo relativo corto para metadatos de cards ("hace 2 h", "hace 5 d").
// Única fuente de verdad — antes duplicado en el hub de microciclos y el
// catálogo de entrenos (regla DRY: 3 usos → extraer).

const MINUTE_MS = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_BEFORE_ABSOLUTE = 30;

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
