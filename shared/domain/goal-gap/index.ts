// @fahybrid/shared/domain/goal-gap — the GOAL / prediction / gap domain layer.
//
// The single source of truth for turning an athlete's target time into a
// per-segment budget, projecting what they'll actually run from their training +
// race history, and reading the gap — plus the honest predicted-vs-real hindsight.
// Pure + DB-free so web, infra and the iOS contract share the same rules. The web
// loader (web/lib/athlete/goal-gap.ts) fetches the rows and calls these.

export * from './types';
export * from './budget';
export * from './predict';
export * from './compute';
export * from './review';
export * from './label';
