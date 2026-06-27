// v2 · ORIENTACIÓN — shared types + step constants for the inline-orientation
// PipelineCue. NO `server-only` here: this module is client-safe and is imported
// by both the server loader (orientacion.ts) and the client primitives
// (components/v2/orientacion/*). Keeping the DB query out of this file is what
// lets the client bundle reference the step keys without dragging server code.

/** The four canonical pipeline steps, in build order. Shared by client + server. */
export const PIPELINE_STEPS = [
  'niveles_fases',
  'sesiones',
  'microciclos',
  'secuencias',
] as const;

export type PipelineStepKey = (typeof PIPELINE_STEPS)[number];

/** Per-step "has the coach populated this stage?" — drives the progress dots. */
export type PipelineProgress = Record<PipelineStepKey, boolean>;

/** Empty progress — the safe degrade shape when the loader is unavailable. */
export const EMPTY_PIPELINE_PROGRESS: PipelineProgress = {
  niveles_fases: false,
  sesiones: false,
  microciclos: false,
  secuencias: false,
};
