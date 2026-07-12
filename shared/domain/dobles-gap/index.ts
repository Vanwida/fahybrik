// @fahybrid/shared/domain/dobles-gap — the PAIR goal / prediction / gap layer.
//
// The doubles counterpart of shared/domain/goal-gap: two athletes' solo
// predictions + the pair's reparto → the pair-predicted time per segment vs the
// pair's goal. Pure + DB-free so web, infra and the iOS contract share one set of
// rules; it REUSES the singles engine's normalization (raceFractions) and
// apportionment (largestRemainder) rather than duplicating them. The web loader
// (web/lib/athlete/dobles-gap.ts) fetches the rows and calls computeDoblesGap.

export * from './types';
export * from './compute';
