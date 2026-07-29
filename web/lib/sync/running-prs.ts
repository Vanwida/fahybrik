import 'server-only';

// #65 — PR (personal-record) detection at workout close.
//
// After a finished session's run `segment_executions` are ingested, this asks:
// did THIS session set a new running record (1k / 3k / 5k)? It reuses the EXACT
// run-segment resolution + pace/time formulas the analytics card uses
// (`lib/athlete/analytics/running.ts::buildBestEfforts`) — but as a self-contained
// query, because that builder is DB-coupled + private and its 5k comes from test
// benchmarks rather than segments. The distance windows + the pure decision live
// in the shared single source `@fahybrid/shared/domain/running/best-efforts`.
//
// Honesty: a record is only emitted when the session ACTUALLY contains an
// eligible effort at that distance; `prev_value_s` is null when it is the
// athlete's first-ever mark. The prior best is computed over the athlete's OTHER
// executions (this one excluded), so a just-closed session is compared against
// everything else they have ever logged.

import type { Sql, TransactionClient } from '@/lib/db';
import { SEG_IS_WORK_EFFORT } from '@/lib/execution/segment-work';
import {
  RUN_PR_BANDS,
  detectRunningPRs,
  type RunningEffortSet,
  type RunningPR,
} from '@fahybrid/shared/domain/running/best-efforts';

interface EffortRow {
  session_1k: number | null;
  prior_1k: number | null;
  session_3k: number | null;
  prior_3k: number | null;
  session_5k: number | null;
  prior_5k: number | null;
}

/**
 * Detect the running PRs a finished execution set. Runs on the SAME client as
 * the execution insert so it sees the just-ingested segments. Returns [] when
 * the session has no eligible run effort (the common case).
 */
export async function detectExecutionRunningPRs(args: {
  sql: Sql | TransactionClient;
  athleteId: number;
  executionId: number;
}): Promise<RunningPR[]> {
  const { sql, athleteId, executionId } = args;
  if (!Number.isFinite(executionId) || !Number.isFinite(athleteId)) return [];

  const b1 = RUN_PR_BANDS.run_1k;
  const b3 = RUN_PR_BANDS.run_3k;
  const b5 = RUN_PR_BANDS.run_5k;

  // Esto corre a propósito sobre el MISMO cliente que acaba de insertar los tramos
  // — dentro de la transacción del ingest, donde todavía no existen para nadie más.
  // Por eso el predicado compartido acepta `Sql | TransactionClient`.
  const work = SEG_IS_WORK_EFFORT(sql);

  // One round-trip. `run_segs` isolates this athlete's run segments (same
  // modality resolution as analytics), flagging the current execution. `seg_pace`
  // gives per-segment 1k pace; `by_exec` gives per-execution total run distance +
  // time for 3k/5k. The final select reads session (current) + prior (others) for
  // each distance in a single pass.
  const rows = await sql<EffortRow[]>`
    with run_segs as (
      select
        se.execution_id,
        (se.execution_id = ${executionId}) as is_current,
        se.distance_meters::float8 as dist,
        extract(epoch from (se.ended_at - se.started_at))::float8 as dur,
        se.avg_pace_s_per_km::float8 as explicit_pace
      from segment_executions se
      join workout_executions we on we.id = se.execution_id
      left join template_segments ts on ts.id = se.template_segment_id
      left join exercises ex on ex.id = ts.exercise_id
      where we.athlete_id = ${athleteId}
        and coalesce(
          se.modality,
          case when ex.category = 'cardio' and ex.slug ilike '%run%' then 'run' else 'x' end
        ) = 'run'
        -- Un récord es un INTENTO, y desde 0146 una sesión de series graba también
        -- sus trotes de vuelta. Filtrarlos AQUÍ, en el CTE, protege los dos caminos
        -- de abajo de una vez, que es justo lo que hace falta porque rompen distinto:
        --   seg_pace  ensucia la banda de ~1 km con esfuerzos que no lo son.
        --   by_exec   es el peligroso: los metros del trote empujan un 4x1000 fuera
        --             de la banda de 3k y dentro de la de 5k, y el atleta se lleva
        --             una notificación de récord de 5 km que nunca corrió. Y el
        --             tiempo del trote se suma al del intento, así que hasta el
        --             valor del récord sería mentira.
        and ${work}
    ),
    seg_pace as (
      select
        is_current,
        dist,
        coalesce(explicit_pace, case when dur > 0 then dur / (dist / 1000.0) else null end) as pace
      from run_segs
    ),
    by_exec as (
      select execution_id, bool_or(is_current) as is_current,
             sum(dist) as tot_dist, sum(dur) as tot_dur
      from run_segs
      group by execution_id
    )
    select
      (select min(pace) from seg_pace
         where is_current and dist between ${b1.min_meters} and ${b1.max_meters} and pace is not null
      )::float8 as session_1k,
      (select min(pace) from seg_pace
         where not is_current and dist between ${b1.min_meters} and ${b1.max_meters} and pace is not null
      )::float8 as prior_1k,
      (select min(tot_dur) from by_exec
         where is_current and tot_dist between ${b3.min_meters} and ${b3.max_meters} and tot_dur > 0
      )::float8 as session_3k,
      (select min(tot_dur) from by_exec
         where not is_current and tot_dist between ${b3.min_meters} and ${b3.max_meters} and tot_dur > 0
      )::float8 as prior_3k,
      (select min(tot_dur) from by_exec
         where is_current and tot_dist between ${b5.min_meters} and ${b5.max_meters} and tot_dur > 0
      )::float8 as session_5k,
      (select min(tot_dur) from by_exec
         where not is_current and tot_dist between ${b5.min_meters} and ${b5.max_meters} and tot_dur > 0
      )::float8 as prior_5k
  `;

  const r = rows[0];
  if (!r) return [];

  const session: RunningEffortSet = {
    run_1k: r.session_1k,
    run_3k: r.session_3k,
    run_5k: r.session_5k,
  };
  const prior: RunningEffortSet = {
    run_1k: r.prior_1k,
    run_3k: r.prior_3k,
    run_5k: r.prior_5k,
  };
  return detectRunningPRs(session, prior);
}
