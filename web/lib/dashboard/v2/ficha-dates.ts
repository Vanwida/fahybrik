// Fechas de la ficha en su vocabulario (plan §2): «miércoles 23», «mié 23 sept».
// Puras: trabajan con días YYYY-MM-DD ya resueltos en el huso del atleta.

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] as const;

function parts(iso: string): { y: number; m: number; d: number; dow: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** «miércoles 23» */
export function weekdayLabelLong(iso: string): string {
  const p = parts(iso);
  return `${DIAS[p.dow]} ${p.d}`;
}

/** «mié 23 sept» */
export function dayLabel(iso: string): string {
  const p = parts(iso);
  return `${DIAS_CORTOS[p.dow]} ${p.d} ${MESES[p.m - 1]}`;
}

/** «Miércoles 23 de septiembre» sin año (cabecera de un día). */
export function dayTitle(iso: string): string {
  const p = parts(iso);
  const long = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const d = DIAS[p.dow]!;
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} ${p.d} de ${long[p.m - 1]}`;
}

/** «lun», «mar»… */
export function weekdayShort(iso: string): string {
  return DIAS_CORTOS[parts(iso).dow]!;
}

/** Día del mes. */
export function dayOfMonth(iso: string): number {
  return parts(iso).d;
}

/** `iso` + n días. */
export function addDaysIso(iso: string, n: number): string {
  const p = parts(iso);
  return new Date(Date.UTC(p.y, p.m - 1, p.d + n)).toISOString().slice(0, 10);
}

/** Días de `a` a `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}
