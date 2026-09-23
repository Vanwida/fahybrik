// Hoy — la composición PURA de la bandeja (plan §4.3). Sin base de datos: recibe
// lo ya cargado y decide qué es un grupo de causa compartida, qué fila tiene
// cada atleta y en qué orden. `load-hoy.ts` carga; esto compone y se testea solo.
//
// El modelo (informe B de la auditoría, §4):
//   1. GRUPOS primero — una causa que comparten muchos atletas es UNA fila con
//      UNA acción en bloque: «47 no ven su semana» (Publicar a los 47), «25 sin
//      programa» (Asignar…), «6 altas pendientes» (Revisar en fila), «7 pagos
//      vencidos» (Recordar). Leads y llamadas solo con el add-on de Negocio.
//   2. Luego UNA fila por atleta, su peor señal como principal, peor primero.
//      Lo que ya cubre un grupo (el alta, el pago vencido, el hueco de plan) no
//      se repite como fila: el mismo atleta no aparece dos veces por lo mismo.
//   3. Las informativas («Listo para progresar», carrera cerca…) no son filas.
//   4. La cifra «te necesitan» cuenta ATLETAS (`athleteNeedsYou`, la misma
//      definición que el estado del roster y la vista «Necesitan algo»), no
//      filas: un grupo de 47 son 47 personas que te necesitan.
//   5. «Por responder» es el conjunto de Mensajes (`loadReplyStates`): una espera
//      cuenta desde el primer minuto en su filtro; el umbral de horas del coach
//      solo decide cuándo pasa a ser una fila de la bandeja (la señal del motor).

import {
  ageLabel,
  athleteNeedsYou,
  compareSignals,
  isActionable,
  isGroupOwnedSignal,
  shortDate,
  type AthleteSignal,
} from '@fahybrid/shared/domain/coach/athlete-state';
import type { AwaitingReply } from '@/lib/coach/attention/awaiting-reply';
import { liveSignalsOf, weekHiddenOf } from '@/lib/coach/athlete-state';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import type { AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import type { AthleteSignalsRead } from '@/lib/coach/attention/signals-read';
import type { HoyRow, HoySnoozedRow, HoyView, SystemicGroup } from './hoy-types';

export interface NegocioInput {
  leads: Array<{ id: string; created_at: string }>;
  calls: Array<{ id: string; starts_at: string }>;
}

export interface HoyComposeInput {
  now: Date;
  calendar: { today: string; week_start: string; week_end: string; next_week_start: string };
  facts: ReadonlyArray<AthletePlanFacts>;
  signals: ReadonlyMap<string, AthleteSignalsRead>;
  /**
   * Hilos por responder (`loadReplyStates`, la regla de Mensajes). Sin él (tests
   * viejos) no hay filtro «Por responder» propio y la señal del motor no se
   * reconcilia.
   */
  awaiting?: ReadonlyMap<string, AwaitingReply>;
  resolved_today: number;
  /** null = el coach no tiene el add-on de Negocio (sin grupos de leads ni llamadas). */
  negocio: NegocioInput | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** «21 al 27 sept» / «29 sept al 5 oct». */
function weekRange(startIso: string): string {
  const [y, m, d] = startIso.split('-').map(Number);
  const end = new Date(Date.UTC(y!, m! - 1, d! + 6)).toISOString().slice(0, 10);
  const a = shortDate(startIso);
  const b = shortDate(end);
  return a.split(' ')[1] === b.split(' ')[1] ? `${a.split(' ')[0]} al ${b}` : `${a} al ${b}`;
}

function withHeld(base: string, held: number): string {
  return held > 0 ? `${base} · ${plural(held, 'retenida por ti', 'retenidas por ti')}` : base;
}

export function composeHoy(input: HoyComposeInput): HoyView {
  const { now, calendar } = input;
  const active = input.facts.filter((f) => f.lifecycle === 'activo');
  const systemic: SystemicGroup[] = [];
  // Las señales vivas, reconciliadas con los hechos de ahora (un «asignar» o una
  // respuesta no esperan al barrido): la misma lectura que el estado del roster.
  const liveOf = new Map<string, AthleteSignal[]>(
    input.facts.map((f) => [
      f.athlete_id,
      liveSignalsOf(f, input.signals.get(f.athlete_id), input.awaiting ? input.awaiting.has(f.athlete_id) : undefined),
    ]),
  );
  const hasLiveKind = (id: string, kind: string, severity?: string): boolean =>
    (liveOf.get(id) ?? []).some((s) => s.kind === kind && (severity == null || s.severity === severity));

  // ── 1. Semana oculta (la de ahora) ─────────────────────────────────────────
  const hiddenNow = active.filter((f) => f.week_chip.kind === 'no_lo_ve');
  if (hiddenNow.length > 0) {
    const n = hiddenNow.length;
    systemic.push({
      kind: 'week_hidden',
      count: n,
      title: n === 1 ? '1 atleta no ve su semana' : `${n} atletas no ven su semana`,
      detail: withHeld(
        `la semana del ${weekRange(calendar.week_start)} está oculta`,
        hiddenNow.filter((f) => f.week_held).length,
      ),
      athlete_ids: hiddenNow.map((f) => f.athlete_id),
      week_start: calendar.week_start,
    });
  }

  // ── 2. Sin programa (nunca o terminado) — el alta pendiente va en su grupo, y
  //       el invitado sin cuestionario no pide nada todavía ──────────────────
  const noProgram = active.filter(
    (f) => f.plan !== 'con_programa' && !f.intake_pending && !f.not_onboarded,
  );
  if (noProgram.length > 0) {
    const never = noProgram.filter((f) => f.plan === 'sin_programa').length;
    const ended = noProgram.length - never;
    const parts = [
      never > 0 ? (never === 1 ? '1 nunca ha tenido' : `${never} nunca han tenido`) : null,
      ended > 0 ? plural(ended, 'con el programa terminado', 'con el programa terminado') : null,
    ].filter(Boolean);
    systemic.push({
      kind: 'no_program',
      count: noProgram.length,
      title: noProgram.length === 1 ? '1 atleta sin programa' : `${noProgram.length} atletas sin programa`,
      detail: parts.join(' · '),
      athlete_ids: noProgram.map((f) => f.athlete_id),
    });
  }

  // ── 3. Altas pendientes ────────────────────────────────────────────────────
  const intake = active
    .filter((f) => f.intake_pending)
    .sort((a, b) => (a.onboarded_at ?? '').localeCompare(b.onboarded_at ?? ''));
  if (intake.length > 0) {
    const oldest = intake[0]!.onboarded_at;
    systemic.push({
      kind: 'intake_pending',
      count: intake.length,
      title: intake.length === 1 ? '1 alta pendiente' : `${intake.length} altas pendientes`,
      detail: oldest ? `la más antigua, hace ${ageLabel(oldest, now)}` : 'cuestionario de entrada por revisar',
      athlete_ids: intake.map((f) => f.athlete_id),
    });
  }

  // ── 4. Pagos vencidos (la señal viva; un «hecho» del coach la saca) ─────────
  const overdue = active.filter((f) => hasLiveKind(f.athlete_id, 'billing_at_risk', 'critical'));
  if (overdue.length > 0) {
    systemic.push({
      kind: 'payments_overdue',
      count: overdue.length,
      title: overdue.length === 1 ? '1 pago vencido' : `${overdue.length} pagos vencidos`,
      detail: 'suscripción impagada',
      athlete_ids: overdue.map((f) => f.athlete_id),
    });
  }

  // ── 5. La semana que viene, si por la regla del coach ya debería verse ──────
  {
    const hiddenNext = active.filter((f) => weekHiddenOf(f) === 'siguiente');
    if (hiddenNext.length > 0) {
      const n = hiddenNext.length;
      systemic.push({
        kind: 'week_hidden',
        count: n,
        title: n === 1 ? '1 atleta no verá la semana que viene' : `${n} atletas no verán la semana que viene`,
        detail: withHeld(
          `la semana del ${weekRange(calendar.next_week_start)} sigue oculta`,
          hiddenNext.filter((f) => f.next_week_held).length,
        ),
        athlete_ids: hiddenNext.map((f) => f.athlete_id),
        week_start: calendar.next_week_start,
      });
    }
  }

  // ── 6. Negocio (solo con el add-on) ────────────────────────────────────────
  if (input.negocio) {
    const { leads, calls } = input.negocio;
    if (leads.length > 0) {
      const newest = [...leads].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]!;
      systemic.push({
        kind: 'leads_new',
        count: leads.length,
        title: leads.length === 1 ? '1 lead nuevo' : `${leads.length} leads nuevos`,
        detail: `el más reciente, hace ${ageLabel(newest.created_at, now)}`,
        athlete_ids: [],
        item_ids: leads.map((l) => l.id),
      });
    }
    if (calls.length > 0) {
      const first = [...calls].sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0]!;
      systemic.push({
        kind: 'calls_today',
        count: calls.length,
        title: calls.length === 1 ? '1 llamada hoy' : `${calls.length} llamadas hoy`,
        detail: `la primera, a las ${hourLabel(first.starts_at)}`,
        athlete_ids: [],
        item_ids: calls.map((c) => c.id),
      });
    }
  }

  // ── Filas por atleta ───────────────────────────────────────────────────────
  // Lo que ya cubre un grupo no se repite como fila (mismo predicado que usa
  // posponer/hecho de una fila para no silenciar el grupo sin querer).
  const covered = (s: AthleteSignal): boolean => isGroupOwnedSignal(s);

  const critico: HoyRow[] = [];
  const vigilar: HoyRow[] = [];
  const snoozedRows: HoySnoozedRow[] = [];
  const replies: HoyRow[] = [];
  const replySignal = (id: string): AthleteSignal | null => {
    const aw = input.awaiting?.get(id);
    if (!aw || !aw.since) return null;
    if ((liveOf.get(id) ?? []).some((s) => s.kind === 'message_unanswered')) return null;
    return waitingSignal(id, aw, now);
  };
  for (const f of active) {
    const read = input.signals.get(f.athlete_id);
    const actionable = (liveOf.get(f.athlete_id) ?? [])
      .filter((s) => isActionable(s) && !covered(s))
      .sort(compareSignals);
    if (actionable.length > 0) {
      const row = toRow(f, actionable, now);
      // Una espera aún bajo el umbral no es su fila, pero sí la sitúa en
      // «Por responder» (va con las demás señales del atleta).
      const waiting = replySignal(f.athlete_id);
      if (waiting) {
        row.others = [...row.others, waiting];
        row.other_count = row.others.length;
      }
      (row.primary.severity === 'critical' ? critico : vigilar).push(row);
      continue;
    }
    const silenced = (read?.silenced ?? []).filter(
      (x) => x.by === 'snooze' && isActionable(x.signal) && !covered(x.signal),
    );
    if (silenced.length > 0) {
      const sorted = silenced.map((x) => x.signal).sort(compareSignals);
      const untils = silenced.map((x) => x.until);
      const until = untils.includes(null)
        ? null
        : untils.reduce<string | null>((acc, u) => (acc == null || (u ?? '') > acc ? u : acc), null);
      snoozedRows.push({ ...toRow(f, sorted, now), until });
    }
  }

  // Esperas por responder sin fila en la bandeja (bajo el umbral, o de un atleta
  // en pausa): solo salen en el filtro «Por responder», como en Mensajes.
  const inRows = new Set([...critico, ...vigilar].map((r) => r.athlete_id));
  for (const f of input.facts) {
    if (inRows.has(f.athlete_id)) continue;
    const waiting = replySignal(f.athlete_id);
    if (waiting) replies.push({ ...toRow(f, [waiting], now), snoozable: true });
  }

  const byWorst = (a: HoyRow, b: HoyRow) =>
    compareSignals(a.primary, b.primary) || a.name.localeCompare(b.name, 'es');
  critico.sort(byWorst);
  vigilar.sort(byWorst);
  snoozedRows.sort(byWorst);
  // La espera más larga primero (como Mensajes).
  replies.sort((a, b) => (a.primary.observed_at ?? '').localeCompare(b.primary.observed_at ?? ''));

  const visible = active.filter((f) => f.week_chip.kind === 'visible').length;
  const needsYou = active.filter((f) =>
    athleteNeedsYou({
      lifecycle: f.lifecycle,
      intake_pending: f.intake_pending,
      not_onboarded: f.not_onboarded,
      plan: f.plan,
      signals: liveOf.get(f.athlete_id) ?? [],
      week_hidden: weekHiddenOf(f),
    }),
  ).length;
  const factIds = new Set(input.facts.map((f) => f.athlete_id));

  return {
    generated_at: now.toISOString(),
    counts: {
      needs_you: needsYou,
      awaiting_reply: input.awaiting
        ? [...input.awaiting.keys()].filter((id) => factIds.has(id)).length
        : 0,
      critico: critico.length,
      vigilar: vigilar.length,
      resolved_today: input.resolved_today,
      snoozed: snoozedRows.length,
    },
    week_visibility: { visible, total: active.length },
    systemic,
    critico,
    vigilar,
    snoozed_rows: snoozedRows,
    replies,
  };
}

/**
 * La espera de un hilo que aún no es fila (informativa): «Por responder · espera
 * 3 h · 2 mensajes». Misma forma que la señal del motor para que la fila, el
 * vistazo y «Hecho/Posponer» (override de `message_unanswered`) funcionen igual.
 */
function waitingSignal(athlete_id: string, aw: AwaitingReply, now: Date): AthleteSignal {
  const since = aw.since!.toISOString();
  const n = aw.count;
  return {
    kind: 'message_unanswered',
    severity: 'info',
    label: 'Por responder',
    evidence: `espera ${ageLabel(since, now)} · ${n} ${n === 1 ? 'mensaje' : 'mensajes'}`,
    value: null,
    baseline: null,
    window_label: null,
    observed_at: since,
    action: 'responder',
    lens: 'mensajes',
    first_seen_at: since,
    dedupe_key: `message_unanswered:${athlete_id}:${aw.last_at?.toISOString() ?? since}`,
  };
}

function toRow(f: AthletePlanFacts, signals: AthleteSignal[], now: Date): HoyRow {
  const primary = signals[0]!;
  return {
    athlete_id: f.athlete_id,
    name: f.name,
    avatar_url: f.avatar_url,
    level_label: f.level?.label ?? null,
    primary,
    other_count: signals.length - 1,
    age_label: primary.first_seen_at ? ageLabel(primary.first_seen_at, now) : 'ahora',
    snoozable: true,
    others: signals.slice(1),
  };
}

/** «10:30» en el huso de la caja (el del coach hasta que exista `coaches.timezone`). */
function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BOX_TIMEZONE,
  }).format(new Date(iso));
}
