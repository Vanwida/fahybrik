import { z } from 'zod';
import { isoDate } from '@fahybrid/shared/schema/_primitives';

// =============================================================================
// AssignFlow — helpers compartidos (fechas lunes-only, formato es-ES, schema
// de validación cliente). Sin dependencias de servidor: todo opera sobre ISO
// strings (YYYY-MM-DD) en UTC para evitar desfases de zona horaria.
// =============================================================================

/** Debounce del preview al cambiar selección (ms). */
export const PREVIEW_DEBOUNCE_MS = 200;
/** Auto-dismiss del toast de éxito (ms) — mockup 04b: 6s. */
export const TOAST_DISMISS_MS = 6000;
/** Nº de lunes futuros ofrecidos en el picker (~4 meses de horizonte). */
export const MONDAY_OPTIONS_COUNT = 16;

export interface AssignFlowAthleteOption {
  id: string;
  full_name: string;
}

export interface AssignFlowMonthOption {
  id: string;
  name: string;
  level: string;
  week_count: number;
  atr_block_hint: string | null;
}

/** Cabeceras de día del mini-calendario (semana lunes→domingo). */
export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** true si el ISO (YYYY-MM-DD) cae en lunes (UTC). */
export function isMondayIso(iso: string): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

/** Suma `n` días a un ISO date (UTC-safe). */
export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Día del mes (1–31) de un ISO date, sin parseo de Date. */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/**
 * Próximos `count` lunes en ISO, empezando por el lunes más cercano
 * (incluye hoy si hoy es lunes — publicar la semana en curso es un caso real).
 * El "hoy" se toma de la fecha LOCAL del coach, normalizada a UTC-midnight.
 */
export function upcomingMondays(count: number): string[] {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dow = todayUtc.getUTCDay();
  const toMonday = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  const first = new Date(todayUtc);
  first.setUTCDate(first.getUTCDate() + toMonday);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(first);
    d.setUTCDate(d.getUTCDate() + i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** "15 jun" — día corto es-ES sin rollover de zona horaria. */
export function fmtDayShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "15 jun – 12 jul" (año en el extremo final solo si no es el año en curso). */
export function fmtRangeShort(fromIso: string, toIso: string): string {
  const sameYear = Number(toIso.slice(0, 4)) === new Date().getFullYear();
  const to = sameYear
    ? fmtDayShort(toIso)
    : new Date(`${toIso}T00:00:00Z`).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
  return `${fmtDayShort(fromIso)} – ${to}`;
}

/** Etiqueta del picker de fecha: "Lunes 15 jun" (+ "· hoy" si aplica). */
export function mondayOptionLabel(iso: string, todayIso: string): string {
  const base = `Lunes ${fmtDayShort(iso)}`;
  return iso === todayIso ? `${base} · hoy` : base;
}

/** ISO de hoy en la zona local del coach. */
export function todayLocalIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

/** Nombre de pila para el copy directo ("Publicar a María"). */
export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/** Iniciales para el avatar del chip (máx. 2). */
export function initials(full: string): string {
  return full
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** "1 sesión" / "N sesiones". */
export function sesionesLabel(n: number): string {
  return `${n} ${n === 1 ? 'sesión' : 'sesiones'}`;
}

/**
 * Validación cliente antes de publicar. El servidor además normaliza cualquier
 * fecha al lunes de su semana (mondayOfWeek), así que esta regla mantiene
 * preview y publicación idénticos.
 */
export const assignFlowSubmitSchema = z.object({
  athlete_id: z.string().min(1, 'Elige un atleta antes de publicar.'),
  month_template_id: z.string().min(1, 'Elige un microciclo antes de publicar.'),
  start_date: isoDate.refine(isMondayIso, 'La fecha de inicio debe ser un lunes.'),
});

export type AssignFlowSubmit = z.infer<typeof assignFlowSubmitSchema>;
