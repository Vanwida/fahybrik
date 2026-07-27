// @fahybrid/shared/domain/free-plan — the FREE Plan tab's computed payload.
//
// Two questions, one module: what his imported races prove about HIM (and, just
// as importantly, what they do NOT prove — the stations of a doubles race are
// not his), and what a week built on those numbers would look like.
//
// Pure and I/O-free: the web loader supplies rows, this decides meaning, iOS
// renders. One place where "what counts as evidence" is decided, so the client
// and the server can never disagree about it.

export {
  admissibleRaces,
  bestRun,
  buildGoalCheck,
  buildRaceEvidence,
  isComparable,
  latestRun,
  runTrend,
  TREND_DEAD_BAND_S_PER_KM,
  TREND_MIN_RACES,
  type RaceRow,
  type TargetRaceRow,
} from './race-evidence';

export {
  buildErg,
  buildStrength,
  buildWeek,
  MIN_SESSIONS,
  runCapacity,
  VISIBLE_SESSIONS,
  type StrengthMaxRow,
  type WeekInputs,
} from './week';

export type {
  ErgPrescription,
  FinishEvidence,
  FreePlanPayload,
  GoalCheck,
  NotComparableReason,
  PlannedSession,
  PlannedWeek,
  RaceEvidence,
  RaceFormat,
  RaceRef,
  RoxzoneEvidence,
  RunEvidence,
  RunPrescription,
  RunShape,
  RunTrend,
  SessionBasis,
  SessionKind,
  StationWork,
  StrengthPrescription,
} from './types';
