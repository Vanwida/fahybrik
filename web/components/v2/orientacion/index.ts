// Barrel for the v2 inline-orientation system — one set of reusable primitives,
// used across every coach section. Sections import from
// '@/components/v2/orientacion'; the primitives never know which section uses them.

export { IntroStrip, InfoDot, type IntroMicroStep } from './IntroStrip';
export { PipelineCue } from './PipelineCue';
export { TeachingEmptyState } from './TeachingEmptyState';
export { ContextHint } from './ContextHint';
export { useOrientationState, type OrientationState } from './useOrientationState';
export {
  PIPELINE_STEP_META,
  PIPELINE_TOTAL,
  pipelineIndex,
  type PipelineStepMeta,
} from './pipeline';
