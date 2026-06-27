import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { isIntakePending } from '@fahybrid/shared/domain/coach/intake-pending';
import { getTargetRaceRow } from '@fahybrid/shared/domain/coach/target-race';

export type ReadinessLabel = 'READY' | 'CAUTION' | 'LOW';

export type AthleteModality = 'individual' | 'dobles' | 'pro_elite';

export type AthleteProfileShell = {
  athlete_id: string;
  full_name: string;
  /** Current microciclo NAME (coach data), null when none active. */
  block_type: string | null;
  block_week: number | null;
  readiness_score: number | null;
  readiness_label: ReadinessLabel | null;
  a_event: { name: string; iso_date: string; days_until: number } | null;
  /** Current microciclo NAME (coach data), null when none active. */
  macro_block: string | null;
  /** Athlete finished onboarding but the coach hasn't reviewed intake yet. */
  intake_pending: boolean;
  /** Modalidad de plan (suscripción más reciente) — null si aún no hay suscripción. */
  modality: AthleteModality | null;
  /** Real level name from athlete_levels.name (e.g. 'N1'–'N5'); null when not assigned. */
  level_name: string | null;
  /** sort_order from athlete_levels for ranking; 0 when null. */
  level_sort: number;
  /** Pareja de Dobles (users.partner_id → atleta del mismo coach), null si no aplica. */
  partner: { athlete_id: string; full_name: string } | null;
};

function readinessLabel(score: number | null): ReadinessLabel | null {
  if (score == null) return null;
  if (score >= 70) return 'READY';
  if (score >= 45) return 'CAUTION';
  return 'LOW';
}

export async function fetchAthleteProfileShell(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteProfileShell | null> {
  const client = params.client ?? defaultSql;

  const rows = await client<
    Array<{
      id: string;
      full_name: string;
      level_name: string | null;
      level_sort: number;
      block_type: string | null;
      block_week: number | null;
      readiness_score: number | null;
      onboarded_at: Date | null;
      intake_completed_at: Date | null;
      modality: string | null;
      partner_athlete_id: string | null;
      partner_full_name: string | null;
    }>
  >`
    select
      a.id::text,
      a.full_name,
      al.name as level_name,
      coalesce(al.sort_order, 0)::int as level_sort,
      ab.block_type as block_type,
      ab.block_week as block_week,
      rds.score as readiness_score,
      a.onboarded_at,
      a.intake_completed_at,
      sub.plan_type as modality,
      pa.id::text as partner_athlete_id,
      pa.full_name as partner_full_name
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    left join lateral (
      select s.plan_type
      from subscriptions s
      where s.user_id = a.user_id
      -- Prefer the live (active) subscription so modality reflects current
      -- access; fall back to the most recent otherwise (same rule as roster).
      order by (s.status = 'active') desc, s.created_at desc
      limit 1
    ) sub on true
    left join users u on u.id = a.user_id
    left join athletes pa
      on pa.user_id = u.partner_id and pa.coach_id = a.coach_id
    left join lateral (
      -- Current microciclo (AGNOSTIC): the assignment receipt whose dated window
      -- contains today → its template NAME + the 1-based week within that window.
      select
        m.name as block_type,
        greatest(
          1,
          (floor((current_date - date_trunc('week', ama.start_date)::date) / 7) + 1)::int
        ) as block_week
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = a.id
        and current_date between ama.start_date and ama.end_date
      order by ama.start_date desc
      limit 1
    ) ab on true
    left join lateral (
      select score from athlete_daily_readiness_snapshots
      where athlete_id = a.id
      order by recorded_for desc
      limit 1
    ) rds on true
    where a.id = ${params.athlete_id} and a.coach_id = ${params.coach_id}
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  // Target race = soonest upcoming race with priority='target' (unified spine).
  const targetRace = await getTargetRaceRow(params.athlete_id, client);

  const blockType = row.block_type ?? null;

  return {
    athlete_id: row.id,
    full_name: row.full_name,
    block_type: blockType,
    block_week: row.block_week,
    readiness_score: row.readiness_score,
    readiness_label: readinessLabel(row.readiness_score),
    a_event: targetRace
      ? { name: targetRace.name, iso_date: targetRace.race_date, days_until: targetRace.days_until }
      : null,
    macro_block: blockType,
    intake_pending: isIntakePending({
      onboarded_at: row.onboarded_at,
      intake_completed_at: row.intake_completed_at,
    }),
    modality: isAthleteModality(row.modality) ? row.modality : null,
    level_name: row.level_name,
    level_sort: row.level_sort,
    partner:
      row.partner_athlete_id && row.partner_full_name
        ? { athlete_id: row.partner_athlete_id, full_name: row.partner_full_name }
        : null,
  };
}

function isAthleteModality(value: string | null): value is AthleteModality {
  return value === 'individual' || value === 'dobles' || value === 'pro_elite';
}
