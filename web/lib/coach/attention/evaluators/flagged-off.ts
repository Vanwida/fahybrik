// F7-follow-up evaluators whose backing data does NOT yet exist (SPEC §8 "gap"
// rows). They are registered so the engine shape is complete and exhaustive, but
// `enabled: false` and `evaluate` returns null → they emit NOTHING. When the F7
// migration lands, each gets real logic and the flag flips to true.

import {
  type SignalEvaluator,
  type SignalKind,
  FLAGGED_OFF_SIGNAL_KINDS,
} from '@fahybrid/shared/domain/coach/signals';

/** Build a disabled evaluator that never fires for a flagged-off kind. */
function disabledEvaluator(kind: SignalKind): SignalEvaluator {
  return {
    kind,
    default_severity: 'info',
    enabled: false,
    evaluate() {
      return null;
    },
  };
}

export const FLAGGED_OFF_EVALUATORS: SignalEvaluator[] =
  FLAGGED_OFF_SIGNAL_KINDS.map((kind) => disabledEvaluator(kind));
