// @fahybrid/shared/domain/strength — the STRENGTH / 1RM domain layer.
//
// Single source of truth for:
//   · one-rm    — the standard 1RM estimators (Epley/Brzycki/Lombardi), agnostic
//                 per coach (coach_methodology.one_rm_estimation, default Epley)
//   · exercises — the tracked lift catalog + exercise→1RM-benchmark mapping
//   · resolve   — resolvePercentRmToKg(pct, 1RM) → absolute load
//   · origen    — de dónde sale un kilo (source + assignment_id → lectura honesta)
//
// Mirrors the dedup pattern of domain/methodology: logic lives here once; web,
// iOS contract and infra import it. Persisted by migration 0076
// (athlete_strength_maxes — the strength analog of athlete_zone_profiles).

export * from './one-rm';
export * from './exercises';
export * from './resolve';
export * from './origen';
export * from './velocity-loss';
export * from './velocity-bands';
