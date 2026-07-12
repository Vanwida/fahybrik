// @fahybrid/shared/domain/adherence — adherence band config (prescribed vs real).
// Single source of truth for the green/amber/red thresholds, keyed per metric
// kind (a RIR miss ≠ a distance miss). `bands.ts` is config + types; `run-
// compliance.ts` is the running-specific directional compute (#66) — did the
// athlete run each tramo inside its prescribed band, too fast, or too slow.

export * from './bands';
export * from './completion';
export * from './order-altered';
export * from './run-compliance';
