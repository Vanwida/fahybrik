import 'server-only';

// El estado de los atletas de un coach (plan §4.1) — la capa con base de datos
// sobre el derivador puro `deriveAthleteStatus`. Dos consultas para N atletas:
// los hechos de plan y ciclo de vida (`loadPlanFacts`) y las señales vivas
// (`loadAthleteSignals`). Hoy y el roster ya cargan esas dos cosas para lo suyo
// y llaman a `buildAthleteStatus` directamente, sin repetir consultas.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  deriveAthleteStatus,
  reconcileSignals,
  type AthleteSignal,
  type AthleteStateInput,
  type AthleteStatus,
} from '@fahybrid/shared/domain/coach/athlete-state';
import { PAUSE_REASON_LABELS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import { loadPlanFacts, type AthletePlanFacts } from '@/lib/dashboard/athletes/plan-facts';
import { loadAthleteSignals, type AthleteSignalsRead } from '@/lib/coach/attention/signals-read';

export type { AthleteStatus };

/** Su semana oculta, en el vocabulario del estado (misma regla que los grupos de Hoy). */
export function weekHiddenOf(facts: AthletePlanFacts): AthleteStateInput['week_hidden'] {
  if (facts.week_chip.kind === 'no_lo_ve') return 'actual';
  if (facts.next_week_hidden && facts.next_week_due) return 'siguiente';
  return null;
}

/** Las señales vivas del motor, reconciliadas con los hechos de ahora. */
export function liveSignalsOf(
  facts: AthletePlanFacts,
  signals: AthleteSignalsRead | undefined,
  awaiting_reply?: boolean,
): AthleteSignal[] {
  return reconcileSignals(signals?.live ?? [], {
    programming_status: facts.programming.status,
    awaiting_reply,
  });
}

/**
 * El estado de un atleta a partir de lo ya cargado (sin consultas).
 * `awaiting_reply`: si se sabe, si su hilo sigue por responder (reconcilia la
 * señal de mensaje con la bandeja de Mensajes).
 */
export function buildAthleteStatus(
  facts: AthletePlanFacts,
  signals: AthleteSignalsRead | undefined,
  now: Date,
  awaiting_reply?: boolean,
): AthleteStatus {
  const week_hidden = weekHiddenOf(facts);
  return deriveAthleteStatus({
    lifecycle: facts.lifecycle,
    pause_label: facts.pause_reason ? PAUSE_REASON_LABELS[facts.pause_reason] : null,
    intake_pending: facts.intake_pending,
    intake_since: facts.onboarded_at,
    not_onboarded: facts.not_onboarded,
    plan: facts.plan,
    plan_ended_on: facts.last_program_end,
    signals: liveSignalsOf(facts, signals, awaiting_reply),
    week_hidden,
    week_held: week_hidden === 'actual' ? facts.week_held : week_hidden === 'siguiente' ? facts.next_week_held : false,
    snoozed_until: signals?.snoozed_until ?? null,
    now,
  });
}

/** El estado de N atletas (todos los del coach si no se pasan ids). Dos consultas. */
export async function loadAthleteStates(params: {
  coach_id: bigint | number;
  athlete_ids?: ReadonlyArray<number | bigint | string>;
  now?: Date;
  client?: Sql;
}): Promise<Map<string, AthleteStatus>> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const [facts, signals] = await Promise.all([
    loadPlanFacts({ coach_id: params.coach_id, athlete_ids: params.athlete_ids, now, client }),
    loadAthleteSignals({ coach_id: params.coach_id, athlete_ids: params.athlete_ids, now, client }),
  ]);
  const out = new Map<string, AthleteStatus>();
  for (const f of facts) out.set(f.athlete_id, buildAthleteStatus(f, signals.get(f.athlete_id), now));
  return out;
}

/** El estado de UN atleta del coach, o null si no es suyo. */
export async function loadAthleteState(params: {
  coach_id: bigint | number;
  athlete_id: number | bigint | string;
  now?: Date;
  client?: Sql;
}): Promise<AthleteStatus | null> {
  const map = await loadAthleteStates({
    coach_id: params.coach_id,
    athlete_ids: [params.athlete_id],
    now: params.now,
    client: params.client,
  });
  return map.get(String(params.athlete_id)) ?? null;
}
