// Formateadores de la ficha — UNO por concepto (R10: la misma carrera se pintaba de
// tres maneras y mezclando idiomas). Puros; los usan servidor y cliente.

import { shortDate } from '@fahybrid/shared/domain/coach/athlete-state';

const FORMAT_ES: Record<string, string> = {
  singles: 'Individual',
  doubles: 'Dobles',
  relay: 'Relevos',
};

/** Las divisiones son nombres propios de la competición: no se traducen. */
const DIVISION_ES: Record<string, string> = {
  open: 'Open',
  pro: 'Pro',
  elite: 'Elite',
};

/** «Individual · Pro», «Dobles», o null. */
export function raceCategoryLabel(format: string | null | undefined, division: string | null | undefined): string | null {
  const parts = [format ? FORMAT_ES[format] ?? null : null, division ? DIVISION_ES[division] ?? null : null].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

const MODALITY_ES: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'División Pro',
};

/** Modalidad de su suscripción como CAMPO («División Pro»), nunca junto al nivel sin rótulo (H3). */
export function divisionLabel(modality: string | null): string | null {
  return modality ? MODALITY_ES[modality] ?? null : null;
}

/** «1:12:00», «42:10». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/** «24 d · 17 oct», «mañana», «hoy». */
export function raceCountdown(days: number, date: string): string {
  if (days <= 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} d · ${shortDate(date)}`;
}

/** «6 h 10», «7 h». */
export function formatHours(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** «+0:40», «−0:25» (diferencia de sueño en h:mm). */
export function formatHoursDelta(delta: number): string {
  const totalMin = Math.round(Math.abs(delta) * 60);
  const sign = delta >= 0 ? '+' : '−';
  return `${sign}${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`;
}

/** «5 h 10», «45 min» (minutos planificados). */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** Cabecera de fila del calendario: { days: «28–4», months: «sept–oct» }. */
export function weekRowLabel(monday: string): { days: string; months: string } {
  const [y, mo, d] = monday.split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, mo - 1, d));
  const end = new Date(Date.UTC(y, mo - 1, d + 6));
  const sm = MONTHS[start.getUTCMonth()]!;
  const em = MONTHS[end.getUTCMonth()]!;
  return { days: `${start.getUTCDate()}–${end.getUTCDate()}`, months: sm === em ? sm : `${sm}–${em}` };
}

/** «21–27 sept», «28 sept – 4 oct». */
export function weekRangeLabel(monday: string): string {
  const [y, mo, d] = monday.split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, mo - 1, d));
  const end = new Date(Date.UTC(y, mo - 1, d + 6));
  const sm = MONTHS[start.getUTCMonth()]!;
  const em = MONTHS[end.getUTCMonth()]!;
  return sm === em
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${em}`
    : `${start.getUTCDate()} ${sm} – ${end.getUTCDate()} ${em}`;
}
