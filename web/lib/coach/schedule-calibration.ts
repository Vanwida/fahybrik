import 'server-only';

// #34 — auto-schedule the week-1 calibration battery (Fork A: auto + override).
//
// Called once, when an athlete's FIRST plan is materialized: it injects the four
// calibration tests into week 1 as NORMAL workout_assignments (the coach can then
// move/remove any, like any session — that's the "override"). The tests point at
// per-athlete FORKS of the coach's seeded calibration templates, so their
// meta_json.store_results rides along (badge + bridge). Idempotent and honest: if
// the athlete already has a calibration session, or the coach hasn't seeded the
// templates, it injects nothing (the day-1 promise then degrades to "your coach
// will program them" rather than a fabricated empty session).

import type { Sql } from '@/lib/db';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { FABRIK_WEEK1_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';
import { addDays, isoDateString } from '@fahybrid/shared/domain/dates';

export async function scheduleWeek1Calibration(params: {
  client: Sql;
  coach_id: number | bigint;
  athlete_id: number | bigint;
  /** The Monday of the athlete's first plan week (the anchor for week_offset:1). */
  week1_monday: Date;
  /** The microcycle covering that week (the injected assignments hang off it). */
  microcycle_id: string;
}): Promise<number> {
  const { client } = params;
  const athlete_id = Number(params.athlete_id);
  const coach_id = Number(params.coach_id);

  // Idempotency: never inject twice — skip if the athlete already has ANY
  // calibration session (a template carrying meta_json.calibration).
  const existing = await client<{ one: number }[]>`
    select 1 as one
    from workout_assignments wa
    join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id}
      and t.meta_json ? 'calibration'
    limit 1
  `;
  if (existing.length > 0) return 0;

  // The coach's LIBRARY calibration templates (seeded), keyed by the protocol slug
  // they carry. No seeded templates → inject nothing (honest degradation).
  const libraryRows = await client<{ id: string; slug: string | null }[]>`
    select id::text as id, meta_json ->> 'calibration' as slug
    from templates
    where coach_id = ${coach_id}
      and instance_athlete_id is null
      and archived_at is null
      and meta_json ? 'calibration'
  `;
  if (libraryRows.length === 0) return 0;
  const bySlug = new Map(libraryRows.filter((r) => r.slug).map((r) => [r.slug as string, r.id]));

  let injected = 0;
  for (const p of FABRIK_WEEK1_BATTERY) {
    const libId = bySlug.get(p.slug);
    if (!libId) continue;
    const clone = await cloneTemplateAsInstance({
      client,
      source_template_id: Number(libId),
      athlete_id,
    });
    if (!clone) continue;
    const scheduledFor = isoDateString(addDays(params.week1_monday, p.day_of_week - 1));
    await client`
      insert into workout_assignments (
        athlete_id, microcycle_id, scheduled_for, template_id, template_version, status, notes
      ) values (
        ${athlete_id}, ${Number(params.microcycle_id)}, ${scheduledFor}::date,
        ${clone.template_id}, ${clone.version}, 'scheduled', 'calibration'
      )
    `;
    injected += 1;
  }
  return injected;
}
