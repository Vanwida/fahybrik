// @fahybrid/shared/domain/methodology — the coach DECISION layer.
//
// Single source of truth for:
//   · vocabulary  — the closed enums a rule is built from (spec §3)
//   · rule        — the WHEN→THEN rule model + zod validation (spec §2)
//   · conflict    — deterministic 8-step conflict resolution (spec §2)
//   · zone-model  — the 6-zone OFFSET model + resolveZonesForAthlete (0061)
//   · zones       — resolveTarget(label, benchmarks) → prescription Target (spec §5)
//
// Mirrors the dedup pattern of domain/prescription: logic lives here once; web,
// iOS contract and infra import it. Persisted by migration 0048 (the typed axes
// as columns, conditions[]/actions[] as validated JSONB — prescription precedent)
// and 0061 (the 6-zone pace model + versioned athlete zone profiles).

export * from './vocabulary';
export * from './rule';
export * from './conflict';
export * from './zone-model';
export * from './zones';
export * from './segment-resolve';
export * from './zone-onboarding';
export * from './test-types';
