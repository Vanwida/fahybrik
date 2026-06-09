/**
 * Restore Week-1 BALANCED content (program_week_templates id 51 + session
 * templates 76-81) that lost its structured dosage.
 *
 * ROOT CAUSE
 * ----------
 * Athlete 2's plan points each week-1 workout_assignment directly at the
 * BALANCED week-1 session templates 76-81 (Lun-Sáb). Those templates kept their
 * row + metadata but their `template_segments` were lost → every week-1 session
 * opens EMPTY. Weeks 2-12 are unaffected (they use other, intact templates).
 *
 * pwt 51's `slots_json` still carries the full inline content for each session
 * (exercise_id + params_json + notes + block grouping = the exact CAPA-2 of the
 * Excel sheet "Semana 1"), but its items lack the structured per-set
 * `prescription_json` that weeks 2-12 and the profile siblings (pwt 82-85,
 * templates 82-93) carry.
 *
 * FIX (root-cause, idempotent, mirrors seed_hyrox_week1_profiles.ts)
 * ------------------------------------------------------------------
 * This script is the single source of the BALANCED week-1 dosage. For each of
 * the 6 sessions it:
 *   1. Reads pwt 51's slots_json item order (exercise_id + params_json + notes +
 *      block_title/format) — NO content is re-typed; only the structured
 *      `prescription` per item is added here (CAPA 2 · %RM/RPE/zones).
 *   2. Validates every prescription against @fahybrid/shared/domain/prescription.
 *   3. Rebuilds `template_segments` for templates 76-81 (delete + reinsert), each
 *      segment carrying params_json (scalar fallback) + notes + block grouping +
 *      structured prescription_json — exactly the shape weeks 2-12 use.
 *   4. Writes the same prescription_json back into pwt 51's slots_json items so
 *      the source week template is complete (matching pwt 80-85), so any future
 *      re-instantiation via materializeInlineSessionTemplate produces correct
 *      segments.
 *
 * Touches ONLY templates 76-81 and pwt 51. Weeks 2-12, other athletes, and the
 * completed executions (weeks 2-3) are never referenced.
 *
 * Idempotent: re-running deletes + reinserts the same 76-81 segments and
 * overwrites pwt 51 slots deterministically. No new templates, no repointing of
 * assignments, no dupes.
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/fix_week1_balanced_segments.ts
 */
import { parsePrescription } from '@fahybrid/shared/domain/prescription';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const PWT_ID = 51;
const TEMPLATE_IDS = [76, 77, 78, 79, 80, 81] as const;

// ── Prescription builders (mirror the sibling script's conventions exactly) ──
const steady = (total_s: number, target?: Prescription['target']): Prescription =>
  target ? { scheme: 'steady', total_s, target } : { scheme: 'steady', total_s };
const interval = (
  rounds: number,
  work_s: number,
  rest_s: number | undefined,
  target?: Prescription['target'],
): Prescription => {
  const p: Prescription = { scheme: 'interval', rounds, work_s };
  if (rest_s !== undefined) p.rest_s = rest_s;
  if (target) p.target = target;
  return p;
};
// strength "wave": explicit per-set reps + a shared %RM range + rest.
const wave = (
  reps: number[],
  pctMin: number,
  pctMax: number,
  rest_s: number,
): Prescription => ({
  scheme: 'sets',
  sets: reps.map((r) => ({
    reps: r,
    load: { type: 'percent_rm', min: pctMin, max: pctMax },
    rest_s,
  })),
});
const repsOnly = (reps: number[]): Prescription => ({
  scheme: 'sets',
  sets: reps.map((r) => ({ reps: r })),
});

// ── Per-item prescriptions keyed by (day_of_week, item index within the day's
//    flattened slots order). The order matches the slots_json item order proven
//    by the diagnostic query (block-by-block, position-by-position). CAPA 2 of
//    the Excel "Semana 1" sheet + the balanced inline blocks of pwt 51. ───────
//
// hr_zone vs rpe: easy/cool-down runs and Z2 work carry the zone/RPE Pablo
// wrote; the 3'/9'/30' tests are RPE10 maximal efforts; the fartlek bouts are
// Z4 RPE7-8. No free text — every intensity is a typed target.
const Z2: Prescription['target'] = { kind: 'hr_zone', value: 2 };
const RPE = (v: number): Prescription['target'] => ({ kind: 'rpe', value: v });
const RPE_RANGE = (min: number, max: number): Prescription['target'] => ({
  kind: 'rpe',
  min,
  max,
});

const PRESCRIPTIONS: Record<number, Prescription[]> = {
  // ── Lunes — TEST 3'/9' ──
  1: [
    steady(600), // movilidad cadera
    steady(300), // técnica carrera
    steady(900, RPE(5)), // 15' easy run RPE5
    steady(180, RPE(10)), // 3' RPE10 test
    steady(600), // 10' caminando recuperación
    steady(540, RPE(10)), // 9' RPE10 test
    steady(900, RPE(3)), // 15' cool down trote RPE3
  ],
  // ── Martes — Fuerza inferior + Row técnico ──
  2: [
    // Back Squat 5 rounds 10/10/8/8/6 @ 60/65/70/70/75% RM, rest 2'30".
    // %RM varies per set, so build the wave explicitly per the Excel.
    {
      scheme: 'sets',
      sets: [
        { reps: 10, load: { type: 'percent_rm', value: 60 }, rest_s: 150 },
        { reps: 10, load: { type: 'percent_rm', value: 65 }, rest_s: 150 },
        { reps: 8, load: { type: 'percent_rm', value: 70 }, rest_s: 150 },
        { reps: 8, load: { type: 'percent_rm', value: 70 }, rest_s: 150 },
        { reps: 6, load: { type: 'percent_rm', value: 75 }, rest_s: 150 },
      ],
    },
    steady(300), // Row 5' warm up
    interval(5, 180, 45, RPE(8)), // Row 5×3' RPE8 / 45" rest
  ],
  // ── Miércoles — TEST umbral 30' ──
  3: [
    steady(600), // movilidad
    steady(300), // técnica
    steady(900, RPE(5)), // 15' easy run RPE5
    steady(1800, RPE(10)), // 30' RPE10 test
    steady(600, RPE(4)), // 10' cool down RPE4
  ],
  // ── Jueves — Fuerza superior + Core ──
  4: [
    wave([10, 10, 8, 6], 65, 80, 120), // Strict Shoulder Press 10-10-8-6 @ 65-80%
    repsOnly([10, 10, 8, 8]), // Pull-ups 10-10-8-8
    repsOnly([10, 10, 8, 8]), // Dips 10-10-8-8
    // Side plank 4×40"/20" rest (per side); duration work, no intensity target.
    {
      scheme: 'sets',
      sets: [
        { duration_s: 40, rest_s: 20, note: 'por lado' },
        { duration_s: 40, rest_s: 20, note: 'por lado' },
        { duration_s: 40, rest_s: 20, note: 'por lado' },
        { duration_s: 40, rest_s: 20, note: 'por lado' },
      ],
    },
    // Turkish get-up 4×4/lado
    {
      scheme: 'sets',
      sets: [
        { reps: 4, note: 'por lado' },
        { reps: 4, note: 'por lado' },
        { reps: 4, note: 'por lado' },
        { reps: 4, note: 'por lado' },
      ],
    },
  ],
  // ── Viernes — Carrera calidad · Fartlek ──
  5: [
    steady(600, RPE(5)), // 10' warm up RPE5
    steady(120), // 2' caminando
    interval(5, 300, 60, RPE_RANGE(7, 8)), // 5×(5' Z4 RPE7-8 / 1' Z2)
    steady(300), // 5' cool down
  ],
  // ── Sábado — Día largo mixto Z2 ──
  6: [
    steady(2700, Z2), // 45' carrera Z2
    steady(1800, Z2), // 30' bike Z2
    interval(6, 30, undefined), // 6×30" strides
  ],
};

type SlotItem = {
  exercise_id: number;
  exercise_name?: string;
  params_json?: Record<string, number>;
  notes?: string | null;
  prescription_json?: unknown;
};
type SlotBlock = { uid?: string; title?: string | null; format: string; config_json?: unknown; items: SlotItem[] };
type SlotSession = { kind: string; focus?: string; notes?: string | null; template_id?: number; blocks?: SlotBlock[] };
type SlotDay = { day_of_week: number; sessions: SlotSession[] };
type Slots = { days: SlotDay[] };

async function main() {
  const sql = getSql();

  // Validate every prescription against the shared Zod schema BEFORE any write.
  for (const day of Object.keys(PRESCRIPTIONS)) {
    for (const p of PRESCRIPTIONS[Number(day)]!) parsePrescription(p);
  }

  const [{ slots_json } = { slots_json: null }] = await sql<Array<{ slots_json: Slots }>>`
    select slots_json from program_week_templates where id = ${PWT_ID}
  `;
  if (!slots_json) throw new Error(`pwt ${PWT_ID} not found`);

  // Map day_of_week → its workout session's template_id (76-81) for segment writes.
  const templateByDay = new Map<number, number>();
  for (const d of slots_json.days) {
    const ws = (d.sessions ?? []).find((s) => s.kind === 'workout' && s.template_id != null);
    if (ws?.template_id != null) templateByDay.set(d.day_of_week, Number(ws.template_id));
  }

  const report: Record<string, unknown> = {};

  await sql.begin(async (tx) => {
    for (const d of slots_json.days) {
      const dow = d.day_of_week;
      const session = (d.sessions ?? []).find((s) => s.kind === 'workout');
      if (!session || !session.blocks?.length) continue; // rest day (Domingo)
      const presList = PRESCRIPTIONS[dow];
      const templateId = templateByDay.get(dow);
      if (!presList || templateId == null) {
        throw new Error(`Missing prescriptions or template for day ${dow}`);
      }

      // Flatten items in block/position order; attach prescription by index and
      // rebuild segments. Also enriches slots item.prescription_json in place.
      let idx = 0;
      let position = 0;
      const segmentRows: Array<{
        position: number;
        block_position: number;
        block_title: string | null;
        block_format: string;
        exercise_id: number;
        params_json: Record<string, number>;
        notes: string | null;
        prescription: Prescription;
      }> = [];

      for (let bi = 0; bi < session.blocks.length; bi++) {
        const block = session.blocks[bi]!;
        for (const item of block.items ?? []) {
          const pres = presList[idx];
          if (!pres) throw new Error(`Day ${dow}: no prescription for item index ${idx}`);
          // Normalize to canonical shape exactly as the server materializer does
          // (parse → validate → store the parsed value).
          const parsed = parsePrescription(pres);
          item.prescription_json = parsed; // enrich slots_json source
          segmentRows.push({
            position,
            block_position: bi,
            block_title: block.title ?? null,
            block_format: block.format,
            exercise_id: Number(item.exercise_id),
            params_json: item.params_json ?? {},
            notes: item.notes ?? null,
            prescription: parsed,
          });
          idx++;
          position++;
        }
      }
      if (idx !== presList.length) {
        throw new Error(`Day ${dow}: ${idx} items but ${presList.length} prescriptions`);
      }

      // Rebuild template_segments for this session (idempotent).
      await tx`delete from template_segments where template_id = ${templateId}`;
      for (const r of segmentRows) {
        await tx`
          insert into template_segments (
            template_id, position, block_position, block_title, block_format,
            exercise_id, params_json, notes, prescription_json
          )
          values (
            ${templateId},
            ${r.position},
            ${r.block_position},
            ${r.block_title},
            ${r.block_format},
            ${r.exercise_id},
            ${tx.json(r.params_json as Parameters<typeof tx.json>[0])},
            ${r.notes},
            ${tx.json(r.prescription as unknown as Parameters<typeof tx.json>[0])}
          )
        `;
      }
      report[`day_${dow}`] = { template_id: templateId, segments: segmentRows.length };
    }

    // Write enriched slots_json back to pwt 51.
    await tx`
      update program_week_templates
      set slots_json = ${sql.json(slots_json as Parameters<typeof sql.json>[0])}, updated_at = now()
      where id = ${PWT_ID}
    `;
  });

  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
