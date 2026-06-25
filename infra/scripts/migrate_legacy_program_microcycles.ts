/**
 * Data migration — idempotent. NOT a schema change.
 *
 * 1) Rename "DEMO Pro · …" week templates → "Pro · …" (coach 4).
 * 2) Group orphan program_week_templates (no junction row) into a legacy
 *    microciclo "Plantillas legacy · Pro · ACC" (coach 4). Max 4 weeks per
 *    microciclo; if >4 orphans, spill into "Plantillas legacy · Otras".
 *
 * Safe to re-run: rename uses replace() + LIKE guard; legacy month is matched
 * by exact name before insert; junction inserts use NOT EXISTS guard.
 */
import { getSql } from './_db.ts';

const COACH_ID = 4;
const LEGACY_NAME_PRIMARY = 'Plantillas legacy · Pro · ACC';
const LEGACY_NAME_OVERFLOW = 'Plantillas legacy · Otras';
const LEGACY_FOCUS = 'Semanas plantilla heredadas; reasignar a microciclo cuando aplique';

const sql = getSql();

async function ensureLegacyMonth(name: string): Promise<number> {
  const existing = await sql<Array<{ id: string }>>`
    select id::text from program_month_templates
    where coach_id = ${COACH_ID} and name = ${name}
    limit 1
  `;
  if (existing[0]) return Number(existing[0].id);
  const inserted = await sql<Array<{ id: string }>>`
    insert into program_month_templates (coach_id, name)
    values (${COACH_ID}, ${name})
    returning id::text
  `;
  return Number(inserted[0]!.id);
}

async function attachOrphansToMonth(
  monthId: number,
  weekIds: number[],
): Promise<void> {
  for (let i = 0; i < weekIds.length; i++) {
    const weekId = weekIds[i]!;
    await sql`
      insert into program_month_weeks (month_template_id, week_template_id, position)
      select ${monthId}, ${weekId}, ${i}
      where not exists (
        select 1 from program_month_weeks
        where month_template_id = ${monthId} and position = ${i}
      )
        and not exists (
          select 1 from program_month_weeks where week_template_id = ${weekId}
        )
    `;
  }
}

async function applyLegacyFocusIfBlank(weekIds: number[]): Promise<void> {
  if (weekIds.length === 0) return;
  await sql`
    update program_week_templates
    set focus = ${LEGACY_FOCUS}, updated_at = now()
    where id = any(${weekIds}::bigint[])
      and coach_id = ${COACH_ID}
      and (focus is null or focus = '')
  `;
}

try {
  // 1) Rename DEMO templates → drop "DEMO " prefix.
  const renamed = await sql<Array<{ id: string; name: string }>>`
    update program_week_templates
    set name = replace(name, 'DEMO Pro ·', 'Pro ·'), updated_at = now()
    where coach_id = ${COACH_ID} and name like 'DEMO Pro ·%'
    returning id::text, name
  `;
  console.log(`Renamed ${renamed.length} week templates:`);
  for (const r of renamed) console.log(`  #${r.id} → ${r.name}`);

  // 2) Find orphans (coach 4).
  const orphans = await sql<Array<{ id: string; name: string }>>`
    select pw.id::text, pw.name
    from program_week_templates pw
    left join program_month_weeks pmw on pmw.week_template_id = pw.id
    where pw.coach_id = ${COACH_ID} and pmw.week_template_id is null
    order by pw.id
  `;
  console.log(`Orphan weeks before migration: ${orphans.length}`);
  for (const o of orphans) console.log(`  #${o.id} ${o.name}`);

  if (orphans.length === 0) {
    console.log('Nothing to migrate.');
  } else {
    const primaryIds = orphans.slice(0, 4).map((o) => Number(o.id));
    const overflowIds = orphans.slice(4).map((o) => Number(o.id));

    const primaryMonth = await ensureLegacyMonth(LEGACY_NAME_PRIMARY);
    console.log(`Legacy primary month: #${primaryMonth} (${LEGACY_NAME_PRIMARY})`);
    await attachOrphansToMonth(primaryMonth, primaryIds);
    await applyLegacyFocusIfBlank(primaryIds);

    if (overflowIds.length > 0) {
      const overflowMonth = await ensureLegacyMonth(LEGACY_NAME_OVERFLOW);
      console.log(`Legacy overflow month: #${overflowMonth} (${LEGACY_NAME_OVERFLOW})`);
      // Cap at 4 inside the overflow microciclo too; if there are >4 here,
      // the rest stay orphan — caller can re-run if seed extends them.
      const cappedOverflow = overflowIds.slice(0, 4);
      await attachOrphansToMonth(overflowMonth, cappedOverflow);
      await applyLegacyFocusIfBlank(cappedOverflow);
      if (overflowIds.length > 4) {
        console.warn(
          `WARN: ${overflowIds.length - 4} orphan(s) still unattached (cap 4 per microciclo).`,
        );
      }
    }
  }

  // 3) Verification queries.
  const monthCount = await sql<Array<{ cnt: string }>>`
    select count(*)::text as cnt from program_month_templates where coach_id = ${COACH_ID}
  `;
  console.log(`program_month_templates(coach=${COACH_ID}) count: ${monthCount[0]!.cnt}`);

  const remainingOrphans = await sql<Array<{ cnt: string }>>`
    select count(*)::text as cnt
    from program_week_templates pw
    left join program_month_weeks pmw on pmw.week_template_id = pw.id
    where pw.coach_id = ${COACH_ID} and pmw.month_template_id is null
  `;
  console.log(`Remaining orphan weeks: ${remainingOrphans[0]!.cnt}`);

  console.log('Migration complete.');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
