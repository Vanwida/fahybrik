// @fahybrid/shared/domain/coach/plan-placement — DÓNDE cae un programa en el plan
// de un atleta. Funciones puras: la previa y la aplicación de «Asignar a varios» y
// de «Añadir al grupo» usan exactamente estas, así que la previa no puede prometer
// una cosa y la aplicación hacer otra.
//
// EL PLAN DE UN ATLETA es la cadena de recibos (`athlete_month_assignments`) con
// fechas; la base garantiza que no se solapan (0166). Meter un programa nuevo
// donde ya hay otro es un CONFLICTO, y el coach elige qué hacer:
//   · chain   — encadenar detrás: el nuevo empieza el lunes siguiente al final
//               del que estorba (y del siguiente, si también estorba…).
//   · replace — sustituir: el nuevo manda desde su lunes; lo que había se corta
//               la víspera (y lo que empezaba después, entero, se quita).
//   · skip    — saltar: ese atleta se queda como está.
//
// UN GRUPO tiene calendario: sus miembros van juntos por su cadena de programas.
// Quien entra a mitad entra ALINEADO (mismo programa, misma semana) — `projectGroup`.

import { addDays, isoDateString, mondayOfWeek, parseIsoDate } from '../dates';

export const ON_CONFLICT_VALUES = ['chain', 'replace', 'skip'] as const;
export type OnConflict = (typeof ON_CONFLICT_VALUES)[number];

export interface ExistingReceipt {
  id: string;
  month_template_id: string;
  program_name: string;
  start_date: string;
  end_date: string;
}

export type PlacementAction = 'assign' | 'chain' | 'replace' | 'skip';

export interface Placement {
  action: PlacementAction;
  /** Lunes en que empieza (tras encadenar, si hizo falta). */
  start_date: string;
  /** Domingo en que acaba. */
  end_date: string;
  /** Los recibos que estorbaban (chain: detrás de cuáles; replace: cuáles se cortan). */
  conflicts: ExistingReceipt[];
}

export function isMonday(iso: string): boolean {
  return parseIsoDate(iso).getUTCDay() === 1;
}

/** Domingo final de `weeks` semanas desde el lunes `start`. */
export function windowEnd(start: string, weeks: number): string {
  return isoDateString(addDays(parseIsoDate(start), weeks * 7 - 1));
}

/** El primer lunes estrictamente posterior a `iso`. */
export function mondayAfter(iso: string): string {
  return isoDateString(addDays(mondayOfWeek(parseIsoDate(iso)), 7));
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function overlapping(receipts: ExistingReceipt[], start: string, end: string): ExistingReceipt[] {
  return receipts
    .filter((r) => overlaps(r.start_date, r.end_date, start, end))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}

/**
 * Coloca `weeks` semanas desde el lunes `start` según la política. `start` tiene
 * que ser lunes (quien llama lo valida). Encadenar avanza hasta el primer hueco
 * libre del tamaño del programa, aunque haya varios recibos seguidos.
 */
export function placeProgram(input: {
  receipts: ExistingReceipt[];
  start: string;
  weeks: number;
  policy: OnConflict;
}): Placement {
  const { receipts, weeks, policy } = input;
  let start = input.start;
  let end = windowEnd(start, weeks);
  const first = overlapping(receipts, start, end);
  if (first.length === 0) return { action: 'assign', start_date: start, end_date: end, conflicts: [] };

  if (policy === 'skip') return { action: 'skip', start_date: start, end_date: end, conflicts: first };
  if (policy === 'replace') return { action: 'replace', start_date: start, end_date: end, conflicts: first };

  const passed: ExistingReceipt[] = [];
  let blocking = first;
  // Cada vuelta deja atrás al menos un recibo, así que termina en ≤ n+1 vueltas.
  for (let guard = 0; blocking.length > 0 && guard <= receipts.length + 1; guard++) {
    for (const r of blocking) if (!passed.some((p) => p.id === r.id)) passed.push(r);
    const lastEnd = blocking.reduce((max, r) => (r.end_date > max ? r.end_date : max), blocking[0]!.end_date);
    start = mondayAfter(lastEnd);
    end = windowEnd(start, weeks);
    blocking = overlapping(receipts, start, end);
  }
  return { action: 'chain', start_date: start, end_date: end, conflicts: passed };
}

// ── Calendario de un grupo ──────────────────────────────────────────────────

export interface ChainItem {
  position: number;
  weeks: number;
}

export type GroupEndPolicy = 'repeat' | 'level_up' | 'stop';

/** Dónde está el grupo: un programa de su cadena y el lunes de SU semana 1. */
export interface GroupAnchor {
  position: number;
  program_start: string;
}

export interface GroupPoint {
  position: number;
  /** Semana (1-based) del programa en la que cae la fecha pedida. */
  week: number;
  /** Lunes de la semana 1 de ese programa. */
  program_start: string;
}

/**
 * Dónde está el grupo en la fecha `date` (un lunes), partiendo de su ancla.
 * Si el grupo aún no ha llegado al programa del ancla, devuelve el ancla en su
 * semana 1 (quien entra, entra cuando entra el grupo). Tras el último programa:
 * `repeat` vuelve al primero; `stop` y `level_up` → null (el plan del grupo acabó).
 */
export function projectGroup(
  chain: ChainItem[],
  endPolicy: GroupEndPolicy,
  anchor: GroupAnchor,
  date: string,
): GroupPoint | null {
  const ordered = [...chain].sort((a, b) => a.position - b.position);
  const idx0 = ordered.findIndex((c) => c.position === anchor.position);
  if (idx0 < 0 || ordered.some((c) => c.weeks < 1)) return null;

  let idx = idx0;
  let programStart = anchor.program_start;
  if (date < programStart) return { position: anchor.position, week: 1, program_start: programStart };

  // Cota: como mucho recorre la cadena tantas veces como semanas hay de
  // distancia (una semana por programa como mínimo). Evita bucles sin fin.
  const maxSteps = Math.ceil((parseIsoDate(date).getTime() - parseIsoDate(programStart).getTime()) / 604_800_000) + ordered.length + 1;
  for (let step = 0; step <= maxSteps; step++) {
    const item = ordered[idx]!;
    const end = windowEnd(programStart, item.weeks);
    if (date <= end) {
      const days = Math.round((parseIsoDate(date).getTime() - parseIsoDate(programStart).getTime()) / 86_400_000);
      return { position: item.position, week: Math.floor(days / 7) + 1, program_start: programStart };
    }
    programStart = mondayAfter(end);
    if (idx + 1 < ordered.length) idx += 1;
    else if (endPolicy === 'repeat') idx = 0;
    else return null;
  }
  return null;
}

/** Lo que dice de sí un miembro activo para votar el ancla del grupo. */
export interface MemberAnchorVote {
  position: number;
  /** Semanas del programa de esa posición. */
  program_weeks: number;
  /** Fin del recibo del programa en curso (un recibo acaba donde acaba el programa,
   *  también el de quien entró a mitad: se materializa hasta el final). */
  receipt_end: string;
  /** ¿El recibo sigue vivo (acaba hoy o después)? Los vivos votan primero. */
  current: boolean;
}

/**
 * El ancla del grupo = lo que dice la mayoría de sus miembros. El lunes de la
 * semana 1 se deduce del FINAL del recibo (fin + 1 − semanas×7), que es robusto
 * a quien entró a mitad. Un miembro desviado (recortado, adelantado) pierde la
 * votación. Empate: el más reciente. Sin miembros → null.
 */
export function groupAnchorFromMembers(votes: MemberAnchorVote[]): GroupAnchor | null {
  const live = votes.filter((v) => v.current);
  const pool = live.length > 0 ? live : votes;
  if (pool.length === 0) return null;
  const tally = new Map<string, { anchor: GroupAnchor; n: number }>();
  for (const v of pool) {
    if (v.program_weeks < 1) continue;
    const programStart = isoDateString(
      mondayOfWeek(addDays(parseIsoDate(v.receipt_end), 1 - v.program_weeks * 7)),
    );
    const key = `${v.position}|${programStart}`;
    const cur = tally.get(key);
    if (cur) cur.n += 1;
    else tally.set(key, { anchor: { position: v.position, program_start: programStart }, n: 1 });
  }
  let best: { anchor: GroupAnchor; n: number } | null = null;
  for (const entry of tally.values()) {
    if (
      !best ||
      entry.n > best.n ||
      (entry.n === best.n && entry.anchor.program_start > best.anchor.program_start)
    ) {
      best = entry;
    }
  }
  return best?.anchor ?? null;
}

/**
 * Ancla que define una petición cuando el grupo no tiene miembros que voten (o el
 * coach eligió a mano desde dónde): el programa `position` empieza su semana
 * `week` el lunes `start`.
 */
export function anchorFromRequest(position: number, week: number, start: string): GroupAnchor {
  return { position, program_start: isoDateString(addDays(parseIsoDate(start), -(week - 1) * 7)) };
}

export interface GroupPlacement {
  placement: Placement;
  /** Programa de la cadena y semana por la que entra. */
  position: number;
  week: number;
}

/**
 * Entrar en un grupo: dónde está el grupo cuando el atleta puede empezar, y qué
 * pasa con lo que ya tiene. Si encadenar le retrasa el arranque, se vuelve a
 * alinear con el grupo en la nueva fecha (el grupo habrá avanzado), hasta que
 * cuadra. Null = el plan del grupo ya acabó en esa fecha (política «parar»).
 */
export function placeInGroup(input: {
  receipts: ExistingReceipt[];
  start: string;
  policy: OnConflict;
  chain: ChainItem[];
  endPolicy: GroupEndPolicy;
  anchor: GroupAnchor;
}): GroupPlacement | null {
  const byPosition = new Map(input.chain.map((c) => [c.position, c]));
  const passed: ExistingReceipt[] = [];
  let desired = input.start;
  for (let guard = 0; guard <= input.receipts.length + 2; guard++) {
    const point = projectGroup(input.chain, input.endPolicy, input.anchor, desired);
    if (!point) return null;
    const item = byPosition.get(point.position);
    if (!item) return null;
    const start = desired < point.program_start ? point.program_start : desired;
    const weeks = item.weeks - point.week + 1;
    const placed = placeProgram({ receipts: input.receipts, start, weeks, policy: input.policy });
    if (placed.action !== 'chain' || placed.start_date === start) {
      const moved = passed.length > 0;
      return {
        placement: moved
          ? { action: 'chain', start_date: placed.start_date, end_date: placed.end_date, conflicts: passed }
          : placed,
        position: point.position,
        week: point.week,
      };
    }
    for (const r of placed.conflicts) if (!passed.some((p) => p.id === r.id)) passed.push(r);
    desired = placed.start_date;
  }
  return null;
}
