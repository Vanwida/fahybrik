// v2 · ORIENTACIÓN — shared pipeline metadata for the PipelineCue.
//
// The five build steps, in order, with the coach-facing name + where each step
// lives (its "home" section). This is the single source of truth for the ribbon /
// compact-cue / mini-flow labels across every section, so the order can never
// drift between screens. AGNOSTIC: names are the product's ("Niveles & Fases"),
// not a methodology's; copy elsewhere says "tus niveles / tus microciclos".
//
// The progress (which steps are done) is computed server-side in
// lib/dashboard/v2/orientacion.ts and passed in — never hardcoded here.

import type { PipelineStepKey } from '@/lib/dashboard/v2/orientacion-types';
import { PIPELINE_STEPS } from '@/lib/dashboard/v2/orientacion-types';

export interface PipelineStepMeta {
  key: PipelineStepKey;
  /** 1-based ordinal shown in the dot / node. */
  ord: number;
  /** Coach-facing name (product nomenclature). */
  name: string;
  /** Which section this step lives in (the "dónde" hint under the node). */
  where: 'Periodización' | 'Biblioteca';
}

export const PIPELINE_STEP_META: readonly PipelineStepMeta[] = [
  { key: 'niveles_fases', ord: 1, name: 'Niveles & Fases', where: 'Periodización' },
  { key: 'sesiones', ord: 2, name: 'Sesiones', where: 'Biblioteca' },
  { key: 'bloques', ord: 3, name: 'Bloques', where: 'Biblioteca' },
  { key: 'microciclos', ord: 4, name: 'Microciclos', where: 'Biblioteca' },
  { key: 'secuencias', ord: 5, name: 'Secuencias', where: 'Periodización' },
] as const;

export const PIPELINE_TOTAL = PIPELINE_STEPS.length; // 5

/** Index (0-based) of a step in the canonical order. */
export function pipelineIndex(key: PipelineStepKey): number {
  return PIPELINE_STEP_META.findIndex((s) => s.key === key);
}
