// The days/week axis of the periodization matrix. One source of truth, shared by
// the server loader (lib/dashboard/v2/secuencias) and the client matrix/editor.
// HYROX/hybrid realistic cadence — mirrors sequenceDaysPerWeek (3..6) in the
// shared Zod schema. Client-safe (no server-only dependency).

export const SEQUENCE_DAYS_OPTIONS = [3, 4, 5, 6] as const;
export type SequenceDays = (typeof SEQUENCE_DAYS_OPTIONS)[number];
