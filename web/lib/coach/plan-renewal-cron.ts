// El cron diario de «renovar el plan de un grupo». Para cada atleta que sigue el
// plan de un grupo:
//   1. pone su cursor donde está HOY según su plan (el cursor solo sabe por dónde
//      entró: sin esto, «en qué programa va» y volver de una pausa mentirían);
//   2. si el grupo termina en «repetir» o «subir de nivel» y a su plan le quedan
//      N días o menos, prepara la vuelta siguiente entera (`advanceSequenceForAthlete`
//      en modo renovación). Con «parar» no se hace nada.
// N es del coach (`coaches.plan_renewal_days_before`, defecto de dominio) y nunca
// baja de los días con que se abre cada semana: si no, la primera semana de la
// vuelta nueva existiría después de su día de apertura.
//
// Cada atleta va en su transacción y con el candado de su plan (el mismo que
// «Asignar»), así que no se cruza con una asignación a mano. Un fallo de uno no
// tumba a los demás; al día siguiente se reintenta.

import 'server-only';
import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, BOX_TIMEZONE, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { effectivePlanRenewalDays, renewalHorizonDays } from '@fahybrid/shared/domain/coach/plan-renewal';
import { effectiveAutoPublishDays } from '@fahybrid/shared/domain/coach/week-publishing';
import { currentChainPosition, type ChainReceipt } from '@fahybrid/shared/domain/coach/plan-placement';
import { advanceSequenceForAthlete } from '@/lib/dashboard/coach/assign-sequence';
import { captureRouteError } from '@/lib/observability/capture';
import { nestedClient } from './assign-many-apply';

export interface PlanRenewalRunResult {
  /** Atletas con plan de grupo revisados. */
  checked: number;
  /** Cursores que se han puesto al día. */
  synced: number;
  /** Atletas a los que se les ha preparado la vuelta siguiente (o el nivel siguiente). */
  renewed: number;
  /** Atletas que han fallado (se reintentan mañana). */
  failed: number;
}

interface EnrollmentRow {
  progress_id: string;
  athlete_id: string;
  coach_id: string;
  current_position: number;
  end_policy: 'repeat' | 'level_up' | 'stop';
  renewal_days: number | null;
  auto_publish_days: number | null;
  today: string;
  chain: Array<{ position: number; template_id: string }> | null;
  receipts: ChainReceipt[] | null;
}

export async function runPlanRenewal(
  params: { client?: Sql; now?: Date; coach_id?: number | bigint } = {},
): Promise<PlanRenewalRunResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const onlyCoach = params.coach_id == null ? null : Number(params.coach_id);

  // «Hoy» es el de CADA coach (su huso; uno que Postgres no conozca cae al defecto
  // en vez de tumbar el barrido de todos), igual que el cron de publicar semanas.
  const rows = await client<EnrollmentRow[]>`
    with valid as (select name from pg_timezone_names)
    select asp.id::text as progress_id, asp.athlete_id::text, asp.coach_id::text, asp.current_position,
           ps.end_policy, c.plan_renewal_days_before as renewal_days, c.auto_publish_days_before as auto_publish_days,
           to_char((${now.toISOString()}::timestamptz at time zone
             coalesce((select v.name from valid v where v.name = c.timezone), ${BOX_TIMEZONE}))::date, 'YYYY-MM-DD') as today,
           (select json_agg(json_build_object('position', i.position, 'template_id', i.month_template_id::text))
              from program_sequence_items i where i.sequence_id = asp.sequence_id) as chain,
           (select json_agg(json_build_object(
                     'template_id', ama.month_template_id::text,
                     'start_date', to_char(ama.start_date, 'YYYY-MM-DD'),
                     'end_date', to_char(ama.end_date, 'YYYY-MM-DD')))
              from athlete_month_assignments ama where ama.athlete_id = asp.athlete_id) as receipts
    from athlete_sequence_progress asp
    join program_sequences ps on ps.id = asp.sequence_id
    join athletes a on a.id = asp.athlete_id
    join coaches c on c.id = asp.coach_id
    where asp.status = 'active' and a.lifecycle_status = 'activo'
      and (${onlyCoach}::bigint is null or asp.coach_id = ${onlyCoach}::bigint)
    order by asp.id
  `;

  const result: PlanRenewalRunResult = { checked: rows.length, synced: 0, renewed: 0, failed: 0 };
  for (const row of rows) {
    const athleteId = Number(row.athlete_id);
    const coachId = Number(row.coach_id);
    const receipts = row.receipts ?? [];
    const chain = row.chain ?? [];
    try {
      const position = currentChainPosition({ receipts, chain, cursor: row.current_position, today: row.today });
      if (position !== row.current_position) {
        await client`
          update athlete_sequence_progress set current_position = ${position}, updated_at = now()
          where id = ${row.progress_id} and coach_id = ${coachId} and status = 'active'
        `;
        result.synced += 1;
      }

      if (row.end_policy === 'stop' || receipts.length === 0) continue;
      const horizon = renewalHorizonDays(
        effectivePlanRenewalDays(row.renewal_days),
        effectiveAutoPublishDays(row.auto_publish_days),
      );
      const planEnd = receipts.reduce((max, r) => (r.end_date > max ? r.end_date : max), '');
      if (planEnd > isoDateString(addDays(parseIsoDate(row.today), horizon))) continue;

      const outcome = await client.begin(async (raw) => {
        const tx = raw as unknown as Sql;
        await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athleteId}::int)`;
        return advanceSequenceForAthlete(athleteId, coachId, nestedClient(raw as unknown as TransactionClient), { horizon_days: horizon });
      });
      if (outcome.outcome === 'advanced' || outcome.outcome === 'looped' || outcome.outcome === 'leveled_up') {
        result.renewed += 1;
      }
    } catch (err) {
      result.failed += 1;
      captureRouteError(err, { route: 'lib/coach/plan-renewal-cron.runPlanRenewal' });
    }
  }
  return result;
}
