// @fahybrid/shared/domain/race-transfer — the training × race CROSS domain layer.
//
// The single source of truth for comparing what an athlete TRAINS against what
// they DO in a HYROX race, per station + the run on foot. Pure + DB-free so web,
// infra and the iOS contract all read the same rules. The web loader
// (web/lib/athlete/race-transfer.ts) fetches the rows and calls computeRaceTransfer.

export * from './types';
export * from './compute';
