import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { AiWorkoutSuggestion } from '@/lib/coach/ai-workout-types';
import {
  blockSnapshots,
  createBlockFromSection,
  type StudioBlock,
} from '@/lib/studio/blocks';
import { HYROX_SECTION_TYPES } from '@/lib/studio/section-types';
import {
  loadCoachExerciseCatalog,
  type CoachCatalogExercise,
} from '@/lib/dashboard/coach/ai/exercise-catalog';

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchExercise(
  name: string,
  byName: Map<string, CoachCatalogExercise>,
): CoachCatalogExercise | null {
  const n = normalize(name);
  const exact = byName.get(n);
  if (exact) return exact;
  for (const [key, e] of byName) {
    if (key.includes(n) || n.includes(key)) return e;
  }
  return null;
}

/** Save an AI workout proposal as a reusable template with segments + studio_blocks. */
export async function persistWorkoutFromAiSuggestion(params: {
  coach_id: bigint;
  suggestion: AiWorkoutSuggestion;
  is_draft?: boolean;
  client?: Sql;
}): Promise<{ id: string; segment_count: number }> {
  const client = params.client ?? defaultSql;
  const is_draft = params.is_draft ?? true;

  // The coach writes the suggestion in THEIR names (overrides applied), so
  // name→id resolution below must match against the same MERGED name — not
  // the base one — or a renamed exercise fails to resolve.
  const exercises = await loadCoachExerciseCatalog(client, params.coach_id, {
    order: 'name',
    limit: 300,
  });
  const byName = new Map(exercises.map((e) => [normalize(e.name), e]));

  const blocks: StudioBlock[] = [];
  const segmentRows: Array<{
    exercise_id: string;
    params_json: Record<string, unknown>;
    notes: string | null;
  }> = [];

  for (const aiBlock of params.suggestion.blocks) {
    const section =
      HYROX_SECTION_TYPES.find((s) => s.id === aiBlock.section_id) ?? HYROX_SECTION_TYPES[0]!;
    const block = createBlockFromSection(section, `blk-${blocks.length}-${Date.now()}`);
    if (aiBlock.title) block.title = aiBlock.title;
    if (aiBlock.config) block.config = { ...block.config, ...aiBlock.config };

    for (const ex of aiBlock.exercises ?? []) {
      const hit = matchExercise(ex.name, byName);
      if (!hit) continue;
      const uid = `seg-${segmentRows.length}`;
      block.segmentUids.push(uid);
      const params_json: Record<string, unknown> = {};
      if (ex.sets != null) params_json.sets = ex.sets;
      if (ex.reps != null) params_json.reps = ex.reps;
      if (ex.distance_meters != null) params_json.distance_meters = ex.distance_meters;
      segmentRows.push({
        exercise_id: hit.id,
        params_json,
        notes: ex.notes ?? null,
      });
    }

    if (block.segmentUids.length > 0 || (aiBlock.exercises?.length ?? 0) === 0) {
      blocks.push(block);
    }
  }

  const snapshots = blockSnapshots(blocks).map((snap, blockIdx) => {
    const block = blocks[blockIdx]!;
    return {
      ...snap,
      segment_uids: block.segmentUids.map((_, segIdx) => `snap-${blockIdx}-${segIdx}`),
    };
  });

  const meta_json = { studio_blocks: snapshots };

  const [row] = await client<{ id: string }[]>`
    insert into templates (
      coach_id, name, format, target_block, is_draft, warmup, coach_notes, meta_json
    )
    values (
      ${params.coach_id},
      ${params.suggestion.name.slice(0, 200)},
      ${params.suggestion.format}::template_format,
      ${params.suggestion.target_block ?? 'any'}::target_block,
      ${is_draft},
      ${params.suggestion.warmup ?? null},
      ${params.suggestion.coach_notes ?? null},
      ${client.json(meta_json)}
    )
    returning id::text as id
  `;

  if (!row) throw new Error('Failed to insert template');

  for (let i = 0; i < segmentRows.length; i++) {
    const s = segmentRows[i]!;
    // TODO(prescription, 0043): when the AI emits structured per-set dosage,
    // build a Prescription (@fahybrid/shared/domain/prescription) and write it
    // to template_segments.prescription_json. Until then this path stays on the
    // legacy params_json shape (DEFERRED — AI consumption is out of scope here).
    await client`
      insert into template_segments (template_id, position, exercise_id, params_json, notes)
      values (
        ${row.id}::bigint,
        ${i},
        ${s.exercise_id}::bigint,
        ${client.json(s.params_json as Parameters<typeof client.json>[0])},
        ${s.notes}
      )
    `;
  }

  return { id: row.id, segment_count: segmentRows.length };
}
