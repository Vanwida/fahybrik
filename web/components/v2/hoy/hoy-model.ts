// Hoy — la lógica PURA de la pantalla (sin React): qué vista enseña qué, los
// recuentos de cada chip, lo que el coach ya ha tocado y todavía no ha vuelto
// del servidor (optimista), el orden que recorren J/K y los rangos de Shift.
// Se prueba en node: web/tests/hoy/hoy-model.test.ts.

import type { AthleteSignal, SignalLens } from '@fahybrid/shared/domain/coach/athlete-state';
import type { SignalKind } from '@fahybrid/shared/domain/coach/signals';
import type { SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyRow, HoySnoozedRow, HoyView, SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import type { HoyPerson } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';

// ── Vistas (?vista=) ──────────────────────────────────────────────────────────

export type HoyVista = 'todo' | 'responder' | 'sesiones' | 'fisiologia' | 'plan' | 'altas';

export const VISTAS: ReadonlyArray<{ key: HoyVista; label: string }> = [
  { key: 'todo', label: 'Todo' },
  { key: 'responder', label: 'Por responder' },
  { key: 'sesiones', label: 'Sesiones' },
  { key: 'fisiologia', label: 'Fisiología' },
  { key: 'plan', label: 'Plan' },
  { key: 'altas', label: 'Altas' },
];

export function parseVista(raw: string | string[] | null | undefined): HoyVista {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VISTAS.some((x) => x.key === v) ? (v as HoyVista) : 'todo';
}

/** El filtro de señales que corresponde a cada vista (null = todas / ninguna). */
const VISTA_LENS: Record<HoyVista, SignalLens | null> = {
  todo: null,
  responder: 'mensajes',
  sesiones: 'sesiones',
  fisiologia: 'fisiologia',
  plan: 'plan',
  altas: 'altas',
};

function rowSignals(row: Pick<HoyRow, 'primary' | 'others'>): AthleteSignal[] {
  return [row.primary, ...(row.others ?? [])];
}

/** ¿La fila sale en la vista? Cuenta cualquiera de sus señales, no solo la principal. */
export function rowInVista(row: Pick<HoyRow, 'primary' | 'others'>, vista: HoyVista): boolean {
  if (vista === 'todo') return true;
  const lens = VISTA_LENS[vista];
  return rowSignals(row).some((s) => s.lens === lens);
}

/** ¿El grupo sale en la vista? Plan = semanas ocultas y sin programa; Altas = altas. */
export function groupInVista(group: Pick<SystemicGroup, 'kind'>, vista: HoyVista): boolean {
  if (vista === 'todo') return true;
  if (vista === 'plan') return group.kind === 'week_hidden' || group.kind === 'no_program';
  if (vista === 'altas') return group.kind === 'intake_pending';
  return false;
}

/** Identidad de un grupo (hay dos «week_hidden»: esta semana y la que viene). */
export function groupKey(group: Pick<SystemicGroup, 'kind' | 'week_start'>): string {
  return `${group.kind}:${group.week_start ?? ''}`;
}

// ── Optimista: lo tocado que aún no ha vuelto del servidor ─────────────────────

export type PendingKind = 'done' | 'snooze';

export interface PendingRow {
  kind: PendingKind;
  row: HoyRow;
  /** Para posponer: hasta cuándo (null = hasta nueva señal). */
  until: string | null;
  /** ms (reloj del navegador) en que el servidor confirmó; null = en vuelo. */
  settled_at: number | null;
}

export interface VisibleInbox {
  systemic: SystemicGroup[];
  critico: HoyRow[];
  vigilar: HoyRow[];
  /** Por responder sin fila (solo en su filtro). */
  replies: HoyRow[];
  /** Atletas (no filas): los de los grupos y las filas, cada uno una vez. */
  needs_you: number;
  resolved_today: number;
  snoozed: number;
}

/**
 * La bandeja tal como la ve el coach AHORA: la del servidor menos lo que ya ha
 * tocado. El recuento de cabecera baja al actuar; «Resuelto hoy» y «Pospuesto»
 * suben — sin contar dos veces lo que el servidor ya refleja.
 */
export function visibleInbox(
  view: Pick<HoyView, 'systemic' | 'critico' | 'vigilar' | 'counts'> & { replies?: HoyRow[] },
  pending: ReadonlyMap<string, PendingRow>,
  hiddenGroups: ReadonlySet<string>,
): VisibleInbox {
  const systemic = view.systemic.filter((g) => !hiddenGroups.has(groupKey(g)));
  const critico = view.critico.filter((r) => !pending.has(r.athlete_id));
  const vigilar = view.vigilar.filter((r) => !pending.has(r.athlete_id));
  const replies = (view.replies ?? []).filter((r) => !pending.has(r.athlete_id));
  const onServer = new Set([...view.critico, ...view.vigilar, ...(view.replies ?? [])].map((r) => r.athlete_id));
  let done = 0;
  let snoozed = 0;
  for (const [id, p] of pending) {
    if (!onServer.has(id)) continue; // el servidor ya lo cuenta
    if (p.kind === 'done') done += 1;
    else snoozed += 1;
  }
  return {
    systemic,
    critico,
    vigilar,
    replies,
    needs_you: athletesIn(systemic, [...critico, ...vigilar]).size,
    resolved_today: view.counts.resolved_today + done,
    snoozed: view.counts.snoozed + snoozed,
  };
}

/**
 * Tras un refresco, se olvida lo que el servidor ya ha visto: lo confirmado antes
 * de que se generara la vista (con margen por reloj), o hace más de un minuto.
 */
export function prunePending(
  pending: ReadonlyMap<string, PendingRow>,
  generated_at_ms: number,
  now_ms: number,
): Map<string, PendingRow> {
  const next = new Map<string, PendingRow>();
  for (const [id, p] of pending) {
    if (p.settled_at != null && (p.settled_at <= generated_at_ms || now_ms - p.settled_at > 60_000)) continue;
    next.set(id, p);
  }
  return next;
}

/**
 * Los atletas (ids) de unos grupos y unas filas, cada uno una vez: la unidad de
 * «te necesitan» (grupos de Negocio no llevan atletas y no cuentan).
 */
export function athletesIn(
  groups: ReadonlyArray<Pick<SystemicGroup, 'athlete_ids'>>,
  rows: ReadonlyArray<Pick<HoyRow, 'athlete_id'>>,
): Set<string> {
  const ids = new Set<string>();
  for (const g of groups) for (const id of g.athlete_ids) ids.add(id);
  for (const r of rows) ids.add(r.athlete_id);
  return ids;
}

/**
 * Recuento de cada chip sobre la bandeja visible, en ATLETAS (la misma unidad que
 * la cabecera). «Por responder» = sus filas + las esperas sin fila: el mismo
 * conjunto y la misma cifra que Mensajes. Altas = atletas con alta pendiente.
 */
export function vistaCounts(
  inbox: Pick<VisibleInbox, 'systemic' | 'critico' | 'vigilar' | 'needs_you'> & { replies?: HoyRow[] },
): Record<HoyVista, number> {
  const rows = [...inbox.critico, ...inbox.vigilar];
  const count = (v: HoyVista) =>
    athletesIn(
      inbox.systemic.filter((g) => groupInVista(g, v)),
      rows.filter((r) => rowInVista(r, v)),
    ).size;
  const altas = inbox.systemic.find((g) => g.kind === 'intake_pending')?.count ?? 0;
  return {
    todo: inbox.needs_you,
    responder: count('responder') + (inbox.replies?.length ?? 0),
    sesiones: count('sesiones'),
    fisiologia: count('fisiologia'),
    plan: count('plan'),
    altas,
  };
}

/**
 * A qué señales va «Hecho/Posponer» de cada fila. Una fila normal = el atleta
 * entero (el servidor elige sus señales accionables). Una espera sin fila no
 * tiene señal del motor todavía: se nombra (`message_unanswered`), que es lo que
 * leen Mensajes y su insignia.
 */
export function overrideTargets(
  rows: ReadonlyArray<Pick<HoyRow, 'athlete_id' | 'primary'>>,
): Array<{ athlete_id: string; signal_kind?: SignalKind }> {
  return rows.map((r) =>
    r.primary.severity === 'info'
      ? { athlete_id: r.athlete_id, signal_kind: r.primary.kind }
      : { athlete_id: r.athlete_id },
  );
}

// ── Recorrido con teclado ────────────────────────────────────────────────────

/** Vigilar se pliega a partir de aquí. */
export const VIGILAR_FOLD = 10;

/** El orden que recorren J/K: crítico y luego vigilar (lo plegado no, salvo desplegado). */
export function navOrder(critico: ReadonlyArray<HoyRow>, vigilar: ReadonlyArray<HoyRow>, expanded: boolean): string[] {
  const v = expanded ? vigilar : vigilar.slice(0, VIGILAR_FOLD);
  return [...critico, ...v].map((r) => r.athlete_id);
}

/** Siguiente/anterior de `current` en `order` (sin salirse). Sin actual: el primero. */
export function step(order: ReadonlyArray<string>, current: string | null, delta: 1 | -1): string | null {
  if (order.length === 0) return null;
  const i = current == null ? -1 : order.indexOf(current);
  if (i < 0) return order[0]!;
  return order[Math.min(order.length - 1, Math.max(0, i + delta))]!;
}

/** Los ids entre `a` y `b` (ambos incluidos) en el orden de la lista. */
export function rangeIds(order: ReadonlyArray<string>, a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return j >= 0 ? [b] : [];
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

/** Tras quitar filas, a quién pasa el foco: la siguiente que quede, si no la anterior. */
export function nextAfterRemoval(order: ReadonlyArray<string>, removed: ReadonlySet<string>, current: string | null): string | null {
  if (current == null || !removed.has(current)) return current;
  const i = order.indexOf(current);
  for (let k = i + 1; k < order.length; k += 1) if (!removed.has(order[k]!)) return order[k]!;
  for (let k = i - 1; k >= 0; k -= 1) if (!removed.has(order[k]!)) return order[k]!;
  return null;
}

// ── Pie: pospuestos y resueltos, con cómo reabrirlos ──────────────────────────

export interface ReopenTarget {
  athlete_id: string;
  signal_kind: SignalKind;
}

/** Reabrir = quitar el override de cada señal (el deshacer de la API con `previous: null`). */
export function reopenPayload(targets: ReadonlyArray<ReopenTarget>): {
  action: 'undo';
  restore: Array<{ athlete_id: string; signal_kind: SignalKind; previous: null }>;
} {
  const seen = new Set<string>();
  const restore: Array<{ athlete_id: string; signal_kind: SignalKind; previous: null }> = [];
  for (const t of targets) {
    const k = `${t.athlete_id}|${t.signal_kind}`;
    if (seen.has(k)) continue;
    seen.add(k);
    restore.push({ athlete_id: t.athlete_id, signal_kind: t.signal_kind, previous: null });
  }
  return { action: 'undo', restore };
}

export function snoozedTargets(row: Pick<HoySnoozedRow, 'athlete_id' | 'primary' | 'others'>): ReopenTarget[] {
  return rowSignals(row).map((s) => ({ athlete_id: row.athlete_id, signal_kind: s.kind }));
}

// ── Textos ───────────────────────────────────────────────────────────────────

/** «+1 señal» / «+3 señales». */
export function otherSignalsLabel(n: number): string | null {
  if (n <= 0) return null;
  return `+${n} ${n === 1 ? 'señal' : 'señales'}`;
}

/** «N te necesitan» con su concordancia. */
export function needsYouLabel(n: number): string {
  if (n === 0) return 'Nadie te necesita ahora';
  return n === 1 ? '1 te necesita' : `${n} te necesitan`;
}

/** «Publicar a los 47» / «Publicar a 1». */
export function toTheN(verb: string, n: number): string {
  return n === 1 ? `${verb} a 1` : `${verb} a los ${n}`;
}

/** Nombre corto de cada tipo de señal (el pie dice qué se cerró). */
export const SIGNAL_KIND_LABEL: Record<SignalKind, string> = {
  hrv_crash: 'HRV hundida',
  no_sync: 'Sin sincronizar',
  missed_sessions: 'Entrenos sin hacer',
  rpe_high: 'RPE alto',
  discomfort_reported: 'Molestia',
  checkin_skipped: 'Sin check-in',
  message_unanswered: 'Por responder',
  readiness_low: 'Readiness baja',
  transition_ready: 'Listo para progresar',
  programming_status: 'Plan',
  microcycle_ending: 'Programa acabando',
  a_event_near: 'Carrera cerca',
  test_logged: 'Test registrado',
  race_completed: 'Carrera hecha',
  workout_libre: 'Entreno libre',
  intake_pending: 'Alta pendiente',
  week_adjustment_pending: 'Ajuste de semana',
  monthly_block_pending: 'Propuesta de programa',
  billing_at_risk: 'Pago',
  test_due: 'Test pendiente',
  communication_question_unanswered: 'Pregunta sin contestar',
  communication_task_overdue: 'Tarea vencida',
  communication_protocol_unopened: 'Protocolo sin abrir',
  review_1on1_due: 'Revisión 1:1',
  video_review_pending: 'Vídeo por revisar',
  mass_adjustment_pending: 'Ajuste en bloque',
  compliance_drop: 'Adherencia a la baja',
};

/** «Readiness baja · RPE alto». */
export function kindsLabel(kinds: ReadonlyArray<SignalKind>): string {
  return [...new Set(kinds)].map((k) => SIGNAL_KIND_LABEL[k] ?? k).join(' · ');
}

// ── Navegación ──────────────────────────────────────────────────────────────

/** Adónde lleva una acción que es navegación (null = la hace la pantalla). */
export function actionHref(action: SignalAction, athleteId: string, negocio: boolean): string | null {
  switch (action) {
    case 'revisar_alta':
      return `/atletas/${athleteId}/intake`;
    case 'recordar_pago':
      return negocio ? '/negocio/cobros' : `/atletas/${athleteId}`;
    case 'abrir_ficha':
      return `/atletas/${athleteId}`;
    default:
      return null;
  }
}

/** `/atletas/<primera>/intake?fila=<resto>` (null si no hay ninguna). */
export function intakeQueueHref(ids: ReadonlyArray<string>): string | null {
  if (ids.length === 0) return null;
  const [first, ...rest] = ids;
  return rest.length > 0 ? `/atletas/${first}/intake?fila=${rest.join(',')}` : `/atletas/${first}/intake`;
}

/** Las altas en orden de espera (la más antigua primero). */
export function sortIntakes(people: ReadonlyArray<HoyPerson>): HoyPerson[] {
  return [...people].sort((a, b) => (a.onboarded_at ?? '').localeCompare(b.onboarded_at ?? ''));
}

