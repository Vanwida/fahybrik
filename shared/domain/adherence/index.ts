// @fahybrid/shared/domain/adherence — adherence band config (prescribed vs real).
// Single source of truth for the green/amber/red thresholds, keyed per metric
// kind (a RIR miss ≠ a distance miss). Config + types only; the prescribed-vs-
// real compute lands in F6.

export * from './bands';
export * from './completion';
