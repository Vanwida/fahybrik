// Date helpers for calendar-day planning. Planning is at *calendar-day*
// granularity, not minute granularity. Two distinct concerns live here, do not
// conflate them:
//
//   1. STORAGE / SERIALIZATION (timestamps): persisted as UTC. ISO calendar dates
//      (`YYYY-MM-DD`) are anchored at UTC midnight so they round-trip losslessly to
//      iOS (which receives ISO `YYYY-MM-DD` strings — that contract never changes).
//      The pure helpers below — parseIsoDate, isoDateString, addDays, diffDays,
//      startOfDayUtc, mondayOfWeek — operate on these canonical UTC-midnight Dates
//      and stay in UTC. They are safe: their input is *already* a calendar day, so
//      there is no wall-clock-to-day conversion happening.
//
//   2. WALL-CLOCK → DAY/WEEK (the coach's "today"): when a live instant (`new Date()`,
//      i.e. the moment the coach is acting) must be resolved to "what calendar day /
//      which Mon–Sun week is it *for the coach*", we interpret it in the coach's box
//      timezone, NOT UTC. Otherwise an action at 23:30 local in Barcelona resolves to
//      the *next* UTC day and the workout lands on the wrong day. Use
//      `startOfDayInBox(instant)` / `mondayOfWeekInBox(instant)` for this — never
//      `startOfDayUtc(new Date())`.
//
// DEUDA CONOCIDA (29-jul-2026) — esto es un DEFECTO DE DESPLIEGUE, no una verdad.
//
// El producto ya es multi-coach: hay varios coaches en la misma base, y esta
// constante le da a todos el mismo "hoy". Un coach fuera de este huso ve su
// dashboard, sus métricas semanales y sus "próximo lunes" en un día que no es el
// suyo. NO se arregla poniendo otro `?? 'Europe/Madrid'` en el siguiente sitio.
//
// De quién debe salir el huso, según el caso:
//   · día del ATLETA (readiness, check-in, historial, plan de la semana, rachas)
//     → `athletes.timezone`, vía `loadAthleteTimezone` en `db/athlete-timezone.ts`.
//       El mecanismo YA existe y lo escribe el iPhone en cada sync de HealthKit.
//   · día del COACH (su "Hoy", métricas, fecha de publicación, lunes de assign)
//     → NO existe `coaches.timezone`. Hace falta migración + `tz` explícito en
//       estos helpers. Es lo que hoy usa `startOfDayInBox`/`mondayOfWeekInBox`.
//   · reloj de negocio (huecos de cita, hora en los emails) → el del coach también.
//
// Hasta que exista `coaches.timezone`, esto es el defecto y así se documenta.
export const BOX_TIMEZONE = 'Europe/Madrid';

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

/** Monday of the ISO week containing `d` (UTC). */
export function mondayOfWeek(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(startOfDayUtc(d), offset);
}

// Reused formatters — instantiating Intl.DateTimeFormat is comparatively expensive,
// so build one per timezone and memoize. en-CA yields ISO-shaped `YYYY-MM-DD` parts.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();
function dayFormatterFor(tz: string): Intl.DateTimeFormat {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayFormatters.set(tz, f);
  }
  return f;
}

/** Calendar day (ISO `YYYY-MM-DD`) that the live instant falls on *in `tz`*. */
export function zonedDayString(instant: Date, tz: string): string {
  const parts = dayFormatterFor(tz).formatToParts(instant);
  let y = 0;
  let mo = 0;
  let d = 0;
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') mo = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Resolve a live instant to the calendar day it falls on *in the box timezone*,
 * returned as a UTC-midnight Date so it composes with the UTC calendar helpers above
 * (addDays, mondayOfWeek, isoDateString). Use this for the coach's "today" — never
 * `startOfDayUtc(new Date())`, which would shift across the UTC date boundary in the
 * evening (e.g. 23:30 Europe/Madrid).
 */
export function startOfDayInBox(instant: Date): Date {
  return parseIsoDate(zonedDayString(instant, BOX_TIMEZONE));
}

// ---- Zoned wall-clock → UTC instant --------------------------------------------
//
// `biometric_streams.recorded_at` is an absolute instant (timestamptz). To ask
// "which samples fall in last night / today *for this athlete*", the window must be
// built as absolute UTC instants from wall-clock boundaries in the athlete's IANA
// timezone — NOT `recorded_at::date = ...`, which buckets by the DB session tz (UTC)
// and drops last night's sleep (after 22:00 UTC = 00:00 local) and the early-morning
// resting-HR sample. Whoop/Garmin compute the day in the athlete's own zone; so do we.

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetFormatterFor(tz: string): Intl.DateTimeFormat {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    offsetFormatters.set(tz, f);
  }
  return f;
}

/** Offset in ms east of UTC that `tz` is at the given absolute `instant`. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = offsetFormatterFor(tz).formatToParts(instant);
  let y = 0;
  let mo = 0;
  let d = 0;
  let h = 0;
  let mi = 0;
  let s = 0;
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') mo = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
    else if (p.type === 'hour') h = Number(p.value);
    else if (p.type === 'minute') mi = Number(p.value);
    else if (p.type === 'second') s = Number(p.value);
  }
  // Read the tz wall-clock as if it were UTC, then subtract the real instant.
  // `hour` can format as 24 at midnight in some engines, so wrap it.
  const asUtc = Date.UTC(y, mo - 1, d, h % 24, mi, s);
  return asUtc - instant.getTime();
}

/**
 * The absolute UTC instant of a wall-clock time in `tz`, expressed relative to a base
 * calendar day (`baseDay`, a UTC-midnight Date such as `parseIsoDate(recorded_for)`)
 * plus day/hour/minute offsets. E.g. `zonedWallClockToUtc(day, tz, { days: -1, hours: 18 })`
 * = "yesterday 18:00 local". Two-pass so a boundary landing inside a DST transition
 * resolves to the offset actually in effect at the target instant.
 */
export function zonedWallClockToUtc(
  baseDay: Date,
  tz: string,
  opts: { days?: number; hours?: number; minutes?: number } = {},
): Date {
  const { days = 0, hours = 0, minutes = 0 } = opts;
  const naiveUtc = Date.UTC(
    baseDay.getUTCFullYear(),
    baseDay.getUTCMonth(),
    baseDay.getUTCDate() + days,
    hours,
    minutes,
    0,
  );
  const firstGuess = naiveUtc - zoneOffsetMs(new Date(naiveUtc), tz);
  const offset = zoneOffsetMs(new Date(firstGuess), tz);
  return new Date(naiveUtc - offset);
}

/** Monday (Mon–Sun week) of the box-local week containing the live instant `instant`. */
export function mondayOfWeekInBox(instant: Date): Date {
  return mondayOfWeek(startOfDayInBox(instant));
}

/** Los meses en castellano. Vocabulario, no lógica: aquí porque quien escribe
 *  una fecha para un atleta no puede tener su propia lista. */
const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/**
 * Un día del calendario dicho como se dice en voz alta: «25 de octubre».
 *
 * Sin año a propósito — dentro de un plan de doce semanas el año no aporta nada
 * y alarga la línea. Una fecha que no se puede leer vuelve tal cual: es un dato
 * roto y disfrazarlo lo esconde.
 */
export function longDateEs(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${d} de ${MESES_ES[m - 1]}`;
}
