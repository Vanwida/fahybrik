/** Postgres error helpers — tolerancia cuando faltan migraciones en dev. */

export { isPgMissingColumn, isPgMissingRelation } from '@fahybrid/shared/domain/db/pg-errors';
