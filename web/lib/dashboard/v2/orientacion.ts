import 'server-only';

// v2 · ORIENTACIÓN — SERVER loader for the inline-orientation PipelineCue.
//
// The coach builds their method along ONE pipeline (5 steps):
//   1 · Niveles          (athlete_levels)                         → Periodización
//   2 · Sesiones         (templates)                              → Biblioteca
//   3 · Bloques          (blocks)                                 → Biblioteca
//   4 · Microciclos      (program_month_templates)               → Biblioteca
//   5 · Secuencias       (program_sequences)                     → Periodización
//
// A step is "done" when it has ≥1 row of the coach's own content. We surface REAL
// progress (per the approved UX pass — "nada de estados falsos"): the cue shows a
// passive checklist, never a wizard, never a fake "step 5/5".
//
// The TYPES + step constants live in ./orientacion-types (client-safe). This file
// holds ONLY the DB query, so it can stay `server-only` without leaking into the
// client bundle. One lightweight round-trip: COUNT(*) over the tables (no row
// payloads). All coach-scoped. AGNOSTIC: levels via athlete_levels.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { EMPTY_PIPELINE_PROGRESS, type PipelineProgress } from './orientacion-types';

// Re-export the client-safe surface so server callers (pages) have one import.
export {
  PIPELINE_STEPS,
  EMPTY_PIPELINE_PROGRESS,
  type PipelineStepKey,
  type PipelineProgress,
} from './orientacion-types';

type CountRow = {
  levels: string;
  sesiones: string;
  bloques: string;
  microciclos: string;
  secuencias: string;
};

/**
 * Compute which pipeline steps the coach has populated. One query, counts only.
 * Step 1 (Niveles) is "done" once the coach has ≥1 athlete_level (the structural
 * minimum — the matrix rows).
 */
export async function loadPipelineProgress(
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<PipelineProgress> {
  const cid = Number(coachId);
  const rows = await client<CountRow[]>`
    select
      (select count(*) from athlete_levels         where coach_id = ${cid})::text as levels,
      (select count(*) from templates              where coach_id = ${cid})::text as sesiones,
      (select count(*) from blocks                 where coach_id = ${cid})::text as bloques,
      (select count(*) from program_month_templates where coach_id = ${cid})::text as microciclos,
      (select count(*) from program_sequences      where coach_id = ${cid})::text as secuencias
  `;
  const r = rows[0];
  if (!r) return EMPTY_PIPELINE_PROGRESS;
  return {
    niveles_fases: Number(r.levels) > 0,
    sesiones: Number(r.sesiones) > 0,
    bloques: Number(r.bloques) > 0,
    microciclos: Number(r.microciclos) > 0,
    secuencias: Number(r.secuencias) > 0,
  };
}
