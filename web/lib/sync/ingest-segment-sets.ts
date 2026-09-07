// Per-set strength detail for one segment_executions row.
// Delete-then-insert so a retried sync replaces cleanly. A bad set (index
// missing, duplicate, overflow) is skipped — it must not 500 the session.

import type { Sql, TransactionClient } from '@/lib/db';
import type { RepsStatus } from '@fahybrid/shared/schema';
import {
  SETS_PER_SEGMENT_MAX,
  WEIGHT_KG_MAX,
  clipText,
  sanitizeConfidence,
  sanitizeNonNegative,
  sanitizeNonNegativeInt,
  sanitizeNumericColumn,
  sanitizePositiveInt,
  sanitizeRepsSource,
  sanitizeRepsStatus,
  sanitizeRpe,
} from '@/lib/sync/sanitize-measurement';
import type { SetInput } from '@/lib/sync/segment-input-schema';

/**
 * Derive the honest reps status when the client omits it (locked contract):
 *   actual == null                          → 'skipped'
 *   prescribed != null && actual != presc.  → 'scaled'
 *   else                                    → 'done'
 */
export function deriveRepsStatus(
  actual: number | null | undefined,
  prescribed: number | null | undefined,
): RepsStatus {
  if (actual == null) return 'skipped';
  if (prescribed != null && actual !== prescribed) return 'scaled';
  return 'done';
}

export async function persistSegmentSets(args: {
  sql: Sql | TransactionClient;
  segmentExecutionId: number;
  sets: SetInput[];
}): Promise<void> {
  const { sql, segmentExecutionId, sets } = args;
  if (sets.length === 0) return;

  await sql`delete from set_executions where segment_execution_id = ${segmentExecutionId}`;

  const seen = new Set<number>();
  const incoming = sets.slice(0, SETS_PER_SEGMENT_MAX);
  for (const s of incoming) {
    const setIndex = sanitizePositiveInt(s.set_index);
    if (setIndex == null || seen.has(setIndex)) continue;
    seen.add(setIndex);
    const setActual = sanitizeNonNegativeInt(s.reps_actual);
    const setPrescribed = sanitizeNonNegativeInt(s.reps_prescribed);
    const setStatus = sanitizeRepsStatus(s.status) ?? deriveRepsStatus(setActual, setPrescribed);
    await sql`
      insert into set_executions (
        segment_execution_id, set_index,
        reps_prescribed, reps_actual,
        load_prescribed_kg, load_actual_kg,
        rpe, rir, status, confirmed, tempo, rest_s,
        reps_source, reps_confidence,
        mean_velocity_first_m_s, mean_velocity_last_m_s,
        velocity_loss_pct, rom_m, velocity_confidence
      ) values (
        ${segmentExecutionId}::bigint,
        ${setIndex},
        ${setPrescribed},
        ${setActual},
        ${sanitizeNumericColumn(s.load_prescribed_kg, WEIGHT_KG_MAX)},
        ${sanitizeNumericColumn(s.load_actual_kg, WEIGHT_KG_MAX)},
        ${sanitizeRpe(s.rpe)},
        ${sanitizeRpe(s.rir)},
        ${setStatus},
        ${s.confirmed ?? false},
        ${clipText(s.tempo, 20)},
        ${sanitizeNonNegativeInt(s.rest_s)},
        ${sanitizeRepsSource(s.reps_source)},
        ${sanitizeConfidence(s.reps_confidence)},
        ${sanitizeNonNegative(s.mean_velocity_first_m_s)},
        ${sanitizeNonNegative(s.mean_velocity_last_m_s)},
        ${sanitizeNonNegative(s.velocity_loss_pct)},
        ${sanitizeNonNegative(s.rom_m)},
        ${sanitizeConfidence(s.velocity_confidence)}
      )
    `;
  }
}
