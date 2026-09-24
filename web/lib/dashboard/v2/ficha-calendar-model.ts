// El calendario de la ficha, puro (sin BD): rango por zoom, semanas con sus días,
// la modalidad que se pinta, la carga planificada por día y los cambios
// optimistas (mover, quitar) que la pantalla aplica antes de que conteste el
// servidor. Lo usan el cargador (ficha-calendar.ts) y el cliente.

import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '@fahybrid/shared/domain/dates';
import type { SessionModality } from '@/lib/dashboard/v2/editor-axes';
import type {
  CalDay,
  CalModality,
  CalSession,
  CalWeek,
  CalZoom,
  FichaCalendar,
} from './atleta-detalle-types';
import type { AthleteWeekState } from '@fahybrid/shared/schema/week-publishing';

/** El plan entero nunca pinta más de medio año de semanas. */
export const PLAN_ZOOM_MAX_WEEKS = 26;
/** Hacia atrás, el plan entero enseña como mucho estas semanas ya pasadas. */
export const PLAN_ZOOM_BACK_WEEKS = 8;

const shift = (iso: string, days: number) => isoDateString(addDays(parseIsoDate(iso), days));
export const mondayOfIso = (iso: string) => isoDateString(mondayOfWeek(parseIsoDate(iso)));

/**
 * El rango (lunes → domingo) de un zoom:
 *   semana — la semana de hoy;
 *   3sem   — la de hoy y las dos siguientes (el defecto: lo que hay que decidir);
 *   plan   — del primer entreno (hasta 8 semanas atrás) al último programado,
 *            sin pasar de 26 semanas y siempre con la de hoy.
 */
export function calendarRange(
  zoom: CalZoom,
  today: string,
  span: { first: string; last: string } | null,
): { from: string; to: string } {
  const thisMonday = mondayOfIso(today);
  if (zoom === 'semana') return { from: thisMonday, to: shift(thisMonday, 6) };
  if (zoom === '3sem' || !span) return { from: thisMonday, to: shift(thisMonday, 20) };
  const earliest = shift(thisMonday, -7 * PLAN_ZOOM_BACK_WEEKS);
  let from = mondayOfIso(span.first < earliest ? earliest : span.first);
  if (from > thisMonday) from = thisMonday;
  let lastMonday = mondayOfIso(span.last);
  if (lastMonday < thisMonday) lastMonday = thisMonday;
  const maxLast = shift(from, 7 * (PLAN_ZOOM_MAX_WEEKS - 1));
  if (lastMonday > maxLast) lastMonday = maxLast;
  return { from, to: shift(lastMonday, 6) };
}

/** Los lunes entre `from` y `to` (incluidos). */
export function mondaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = mondayOfIso(from); m <= to; m = shift(m, 7)) out.push(m);
  return out;
}

const FORMAT_MODALITY: Record<string, CalModality> = {
  amrap: 'circuito',
  emom: 'circuito',
  for_time: 'circuito',
  circuit: 'circuito',
  hyrox_sim: 'circuito',
  rounds: 'circuito',
  intervals: 'carrera',
  tempo: 'carrera',
  running: 'carrera',
  strength_block: 'fuerza',
  strength: 'fuerza',
  sets: 'fuerza',
  row: 'ergo',
  ergo: 'ergo',
  warmup: 'calentamiento',
  mobility: 'calentamiento',
};

const MODALITY_LABEL: Record<CalModality, string> = {
  carrera: 'Carrera',
  ergo: 'Ergómetro',
  fuerza: 'Fuerza',
  circuito: 'Circuito',
  calentamiento: 'Movilidad',
};

/**
 * La modalidad que se PINTA. Manda la de sus ejercicios (intrínseca, mig 0053);
 * el formato de la plantilla es el último recurso para un entreno sin ejercicios.
 */
export function sessionModality(
  fromExercises: SessionModality | null,
  format: string | null,
): { modality: CalModality | null; label: string } {
  if (fromExercises === 'mixta') return { modality: null, label: 'Mixta' };
  const m = fromExercises ?? (format ? FORMAT_MODALITY[format] ?? null : null);
  if (!m) return { modality: null, label: 'Entreno' };
  return { modality: m, label: MODALITY_LABEL[m] };
}

/** Semanas → días → entrenos, con sus sumas. Las semanas sin fila de estado se ven (sin fila = visible). */
export function buildCalendarWeeks(params: {
  sessions: ReadonlyArray<CalSession>;
  weekStates: ReadonlyMap<string, AthleteWeekState>;
  from: string;
  to: string;
  today: string;
}): CalWeek[] {
  const byDate = new Map<string, CalSession[]>();
  for (const s of params.sessions) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  return mondaysBetween(params.from, params.to).map((monday) => {
    const days: CalDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = shift(monday, i);
      return { date, sessions: byDate.get(date) ?? [] };
    });
    const all = days.flatMap((d) => d.sessions);
    const state =
      params.weekStates.get(monday) ??
      ({
        week_start: monday,
        visible: true,
        held: false,
        status: null,
        opens_on: null,
        sessions: all.length,
      } satisfies AthleteWeekState);
    return summarizeWeek({ week_start: monday, days, state }, params.today);
  });
}

/** Recalcula las sumas de una semana (tras un cambio optimista). */
export function summarizeWeek(
  w: Pick<CalWeek, 'week_start' | 'days' | 'state'>,
  today: string,
): CalWeek {
  let planned_min = 0;
  let planned_open = 0;
  let due = 0;
  let done = 0;
  for (const d of w.days) {
    for (const s of d.sessions) {
      if (s.planned_min != null) planned_min += s.planned_min;
      if (s.planned_open || s.planned_min == null) planned_open += 1;
      if (s.excluded) continue;
      const isDue = s.date < today || (s.date === today && s.done);
      if (!isDue) continue;
      if (!s.done && !w.state.visible) continue;
      due += 1;
      if (s.done) done += 1;
    }
  }
  return { ...w, planned_min, planned_open, due, done };
}

/** Minutos escritos por día (la barra de carga): null = nada escrito ese día. */
export function dayLoads(week: CalWeek): (number | null)[] {
  return week.days.map((d) => {
    const mins = d.sessions.map((s) => s.planned_min).filter((m): m is number => m != null);
    return mins.length > 0 ? mins.reduce((a, b) => a + b, 0) : null;
  });
}

/** El máximo de minutos de un día en todo el calendario (escala común de las barras). */
export function maxDayLoad(cal: Pick<FichaCalendar, 'weeks'>): number {
  let max = 0;
  for (const w of cal.weeks) for (const m of dayLoads(w)) if (m != null && m > max) max = m;
  return max;
}

export function findSession(cal: Pick<FichaCalendar, 'weeks'>, id: string): CalSession | null {
  for (const w of cal.weeks) for (const d of w.days) for (const s of d.sessions) if (s.id === id) return s;
  return null;
}

/** La debida sin hacer más reciente (para «Ajustar …»). */
export function lastMissed(cal: Pick<FichaCalendar, 'weeks'>): CalSession | null {
  let best: CalSession | null = null;
  for (const w of cal.weeks)
    for (const d of w.days) for (const s of d.sessions) if (s.missed && (!best || s.date > best.date)) best = s;
  return best;
}

function mapSessions(
  cal: FichaCalendar,
  fn: (s: CalSession) => CalSession | null,
  extra?: CalSession,
): FichaCalendar {
  const all: CalSession[] = [];
  for (const w of cal.weeks)
    for (const d of w.days)
      for (const s of d.sessions) {
        const next = fn(s);
        if (next) all.push(next);
      }
  if (extra) all.push(extra);
  const states = new Map(cal.weeks.map((w) => [w.week_start, w.state]));
  // Una semana que gana o pierde entrenos cambia su recuento.
  for (const [ws, st] of states) {
    const n = all.filter((s) => mondayOfIso(s.date) === ws).length;
    states.set(ws, { ...st, sessions: n });
  }
  return {
    ...cal,
    weeks: buildCalendarWeeks({ sessions: all, weekStates: states, from: cal.from, to: cal.to, today: cal.today }),
  };
}

/** Mover un entreno a otro día (optimista). Si el destino cae fuera del rango, sale del calendario. */
export function moveSession(cal: FichaCalendar, id: string, toDate: string): FichaCalendar {
  return mapSessions(cal, (s) => (s.id === id ? { ...s, date: toDate, missed: false } : s));
}

/** Quitar un entreno (optimista). */
export function removeSession(cal: FichaCalendar, id: string): FichaCalendar {
  return mapSessions(cal, (s) => (s.id === id ? null : s));
}

/** Añadir un entreno ya creado por el servidor (optimista hasta recargar). */
export function addSession(cal: FichaCalendar, s: CalSession): FichaCalendar {
  return mapSessions(cal, (x) => x, s);
}

/** ¿Se puede soltar un entreno en ese día? Solo hoy o después. */
export function canDropOn(date: string, today: string): boolean {
  return date >= today;
}
