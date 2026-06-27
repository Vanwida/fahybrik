import { z } from 'zod';
import {
  STATION_INDEX_STATION,
  HYROX_STATION_LABELS,
} from './hyrox-layout';

// Dobles SIMULATION — the coach-authored joint HYROX Doubles race strategy.
//
// DB shape in infra/migrations/0055_dobles_simulations.sql.
// iOS read contract in ios/FAHYBRIK/Dobles/DoblesService.swift
//   (DoblesSimulation / DoblesStationSplit).
//
// One source of truth for the wire shape (snake_case) shared by:
//   - PUT  /api/coach/athletes/[id]/dobles-simulation  (coach writes)
//   - GET  /api/coach/athletes/[id]/dobles-simulation  (coach reads / prefill)
//   - GET  /api/athlete/dobles/simulation              (athlete reads, future)
//
// STORAGE IS A/B-NEUTRAL, READ IS PER-ATHLETE
// -------------------------------------------
// Stored `self_share` is ALWAYS athlete A's share (0..1). When 'split', B's
// share = 1 - self_share. The athlete API flips it for the reader (B sees
// 1 - stored). The coach editor is A-centric: "self" in the editor = the
// athlete in the route ([id]) = athlete A.

/** The 8 canonical HYROX functional stations, in race order, with labels. */
export const DOBLES_STATIONS: ReadonlyArray<{
  station_index: number;
  label: string;
}> = STATION_INDEX_STATION.map((station_index) => ({
  station_index,
  label: HYROX_STATION_LABELS[station_index] ?? `Estación ${station_index}`,
}));

/** Valid canonical station indices for a Dobles split (2,4,6,8,10,12,14,16). */
export const DOBLES_STATION_INDICES = STATION_INDEX_STATION;

/** Who carries a station: athlete A, athlete B, or a split between them. */
export const doblesAssignedTo = z.enum(['a', 'b', 'split']);
export type DoblesAssignedTo = z.infer<typeof doblesAssignedTo>;

/**
 * One station's split. `self_share` is athlete A's share (0..1); meaningful
 * when `assigned_to === 'split'`. For 'a' it is 1, for 'b' it is 0 — the API
 * normalizes these on write so the stored share is never contradictory.
 */
export const doblesStationSplitSchema = z
  .object({
    station_index: z
      .number()
      .int()
      .refine((i) => (STATION_INDEX_STATION as readonly number[]).includes(i), {
        message: 'station_index debe ser una estación HYROX (2,4,…,16)',
      }),
    assigned_to: doblesAssignedTo,
    /** Athlete A's share of the station, 0..1. */
    self_share: z.number().min(0).max(1),
    /** Optional reparto note, e.g. "alterna 250m" / "A 60 / B 40". */
    note: z.string().trim().max(120).optional(),
  })
  .strict();
export type DoblesStationSplit = z.infer<typeof doblesStationSplitSchema>;

/** Free-form coach tactical notes shared by every variant. Trimmed, bounded. */
const noteField = z.string().trim().max(500).nullable().optional();

/**
 * The full saved simulation as it lives at the API boundary. `station_splits`
 * must cover exactly the 8 canonical stations, each present once.
 */
export const doblesSimulationSchema = z
  .object({
    target_event_id: z.number().int().positive().nullable().default(null),
    station_splits: z
      .array(doblesStationSplitSchema)
      .length(STATION_INDEX_STATION.length)
      .refine(
        (splits) => {
          const seen = new Set(splits.map((s) => s.station_index));
          return (
            seen.size === STATION_INDEX_STATION.length &&
            STATION_INDEX_STATION.every((i) => seen.has(i))
          );
        },
        { message: 'station_splits debe cubrir las 8 estaciones, una sola vez' },
      ),
    running_note: noteField,
    roxzone_note: noteField,
    tactical_note: noteField,
  })
  .strict();
export type DoblesSimulationInput = z.infer<typeof doblesSimulationSchema>;

/** PUT body = the simulation (target_event_id optional in the body). */
export const doblesSimulationPutSchema = doblesSimulationSchema;
export type DoblesSimulationPutInput = z.infer<typeof doblesSimulationPutSchema>;

/**
 * Normalize a station split so the stored `self_share` is consistent with
 * `assigned_to`: 'a' → 1, 'b' → 0, 'split' → clamp(self_share). This is the
 * write-side invariant; readers never see a contradictory share.
 */
export function normalizeStationSplit(
  split: DoblesStationSplit,
): DoblesStationSplit {
  if (split.assigned_to === 'a') return { ...split, self_share: 1 };
  if (split.assigned_to === 'b') return { ...split, self_share: 0 };
  return { ...split, self_share: Math.min(1, Math.max(0, split.self_share)) };
}

/**
 * A sensible PRE-FILLED default so the coach starts from something, not blank:
 * every station is a 50/50 split (both athletes share equally), no notes. The
 * coach then nudges each station with one tap/drag.
 */
export function defaultStationSplits(): DoblesStationSplit[] {
  return STATION_INDEX_STATION.map((station_index) => ({
    station_index,
    assigned_to: 'split' as const,
    self_share: 0.5,
  }));
}

/**
 * The coach GET response: the saved simulation OR a prefilled default, plus the
 * static station labels and the two athlete display names so the editor can
 * render without a second round-trip.
 */
export interface DoblesSimulationCoachResponse {
  /** True when a row already exists; false when this is the prefilled default. */
  exists: boolean;
  /** Display name for athlete A (the athlete in the route, the "self" side). */
  athlete_a_name: string | null;
  /** Display name for athlete B (the linked partner). null when unpaired. */
  athlete_b_name: string | null;
  /** Whether the athlete has a linked Dobles partner at all. */
  has_partner: boolean;
  target_event_id: number | null;
  station_splits: Array<DoblesStationSplit & { label: string }>;
  running_note: string | null;
  roxzone_note: string | null;
  tactical_note: string | null;
  updated_at: string | null;
}
