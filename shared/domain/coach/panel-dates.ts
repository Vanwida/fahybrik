// Vocabulario de fechas del panel (plan §2: «22 sept», «24 d · 17 oct»): cómo
// dice el panel una fecha, un «hace cuánto» y un número de días. Lo re-exporta
// athlete-state.ts, que es por donde lo importa el resto.

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const;

/** «22 sept». Una fecha ilegible vuelve tal cual. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!m || !d || m < 1 || m > 12) return iso;
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** «hoy», «ayer» o «22 sept», respecto al día `today` (ambos YYYY-MM-DD). */
export function relativeDay(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return 'hoy';
  const t = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const d = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
  if (t - d === 86_400_000) return 'ayer';
  return shortDate(day);
}

/** «ahora», «40 min», «5 h», «3 d» desde `iso` hasta `now`. */
export function ageLabel(iso: string, now: Date): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** «1 día» / «3 días». */
export function dias(n: number): string {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}
