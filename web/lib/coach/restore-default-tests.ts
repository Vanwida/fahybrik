import 'server-only';

// #34 — restore the DEFAULT calibration battery for a coach. Materializes the four
// standard hybrid tests (5K control, 2K remo, batería 1RM, HYROX half-sim) from
// DEFAULT_CALIBRATION_BATTERY — the SINGLE source of truth for the WHAT — into the coach's
// coach_calibration_tests (+ results + schedule + content template). Backs the
// "Restaurar batería por defecto" button: predefined-but-editable defaults the coach
// keeps, reorders, edits or removes.
//
// IDEMPOTENT + non-destructive to CUSTOM tests: it only ever touches the four
// default slugs. An existing (even archived) default is un-archived and refreshed;
// its sort_order is preserved (so a coach's reorder survives a restore); its
// results + default schedule are reset to the default contract.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { DEFAULT_CALIBRATION_BATTERY } from '@fahybrid/shared/domain/coach/test-battery';
import { materializeTestContent } from '@/lib/coach/calibration-content';
import { listCoachTests, type CoachCalibrationTest } from '@/lib/coach/coach-tests';

export interface RestoreDefaultsResult {
  created: number;
  restored: number;
  tests: CoachCalibrationTest[];
}

export async function restoreDefaultTests(
  coach_id: number | bigint,
  client: Sql = defaultSql,
): Promise<RestoreDefaultsResult> {
  const cid = Number(coach_id);
  let created = 0;
  let restored = 0;

  for (const protocol of DEFAULT_CALIBRATION_BATTERY) {
    const specs = [...protocol.store_results];

    await client.begin(async (tx) => {
      // Existing row for this default slug (archived or not — the unique key
      // (coach_id, slug) ignores archived_at).
      const existing = await tx<{ id: string; template_id: string | null }[]>`
        select id::text as id, template_id::text as template_id
        from coach_calibration_tests
        where coach_id = ${cid} and slug = ${protocol.slug}
        limit 1
      `;
      const existingRow = existing[0] ?? null;

      const templateId = await materializeTestContent(tx, {
        coach_id: cid,
        name: protocol.label,
        format: protocol.format,
        protocol: protocol.protocol,
        testSlug: protocol.slug,
        specs,
        existingTemplateId: existingRow?.template_id ? Number(existingRow.template_id) : null,
        content: protocol.content,
      });

      let testId: number;
      if (existingRow) {
        // Refresh + un-archive; keep the coach's sort_order. Ownership rides the
        // WRITE (no check-then-act window after the coach-scoped select above).
        await tx`
          update coach_calibration_tests set
            name = ${protocol.label},
            protocol = ${protocol.protocol},
            format = ${protocol.format}::template_format,
            primary_modality = ${protocol.primary_modality},
            template_id = ${templateId},
            enabled = true,
            archived_at = null,
            updated_at = now()
          where id = ${Number(existingRow.id)} and coach_id = ${cid}
        `;
        testId = Number(existingRow.id);
        restored += 1;
      } else {
        const sortRows = await tx<{ next: number }[]>`
          select coalesce(max(sort_order), -1) + 1 as next
          from coach_calibration_tests where coach_id = ${cid}
        `;
        const rows = await tx<{ id: string }[]>`
          insert into coach_calibration_tests
            (coach_id, slug, name, protocol, format, primary_modality, template_id, enabled, sort_order)
          values (
            ${cid}, ${protocol.slug}, ${protocol.label}, ${protocol.protocol},
            ${protocol.format}::template_format, ${protocol.primary_modality},
            ${templateId}, true, ${sortRows[0]?.next ?? 0}
          )
          returning id::text as id
        `;
        testId = Number(rows[0]!.id);
        created += 1;
      }

      // Reset results to the default contract (source of truth).
      await tx`delete from coach_test_results where test_id = ${testId}`;
      for (let i = 0; i < specs.length; i += 1) {
        const s = specs[i]!;
        await tx`
          insert into coach_test_results (test_id, slug, label, measure, unit, derives, modality, optional, sort_order)
          values (${testId}, ${s.slug}, ${s.label}, ${s.measure}, ${s.unit}, ${s.derives}, ${s.modality ?? null}, ${s.optional ?? false}, ${i})
        `;
      }

      // Reset the schedule to the default (week 1, its suggested weekday).
      await tx`delete from coach_test_schedule where test_id = ${testId}`;
      await tx`
        insert into coach_test_schedule (test_id, week_offset, day_of_week, enabled)
        values (${testId}, ${protocol.week_offset}, ${protocol.day_of_week}, true)
      `;
    });
  }

  const tests = await listCoachTests(cid, {}, client);
  return { created, restored, tests };
}
