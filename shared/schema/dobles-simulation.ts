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

// =============================================================================
// EDIT PROVENANCE + ATHLETE (self-centric) EDIT — pair-owned reparto (mig 0099)
//
// The reparto is the PAIR's: the coach recommends, but either athlete may adjust
// it from the app (last-write-wins). Every surface shows WHO last edited it.
// The athlete edits from THEIR perspective (self / partner / split); the endpoint
// converts to the A/B-neutral storage via `reader_is_a` — the exact inverse of
// the read flip in lib/athlete/dobles-simulation.ts.
// =============================================================================

/** Which side last edited the simulation. */
export const doblesEditorKind = z.enum(['coach', 'athlete']);
export type DoblesEditorKind = z.infer<typeof doblesEditorKind>;

/** Provenance shown on every surface ("Propuesta de Pablo" / "Ajustado por Guillem"). */
export interface DoblesSimulationProvenance {
  /** null on a legacy row → surfaces fall back to the coach-authored label. */
  last_edited_by_kind: DoblesEditorKind | null;
  /** Display name of the last editor (coach or athlete), null when unknown. */
  last_edited_by_name: string | null;
  /** ISO timestamp of the last edit (updated_at), null when never saved. */
  updated_at: string | null;
}

/** The reading athlete's frame: they do it, the partner does it, or they share. */
export const doblesCarrier = z.enum(['self', 'partner', 'split']);
export type DoblesCarrier = z.infer<typeof doblesCarrier>;

const stationIndexField = z
  .number()
  .int()
  .refine((i) => (STATION_INDEX_STATION as readonly number[]).includes(i), {
    message: 'station_index debe ser una estación HYROX (2,4,…,16)',
  });

/** One station as the ATHLETE edits it — self-centric (not the A/B storage frame). */
export const athleteStationSplitSchema = z
  .object({
    station_index: stationIndexField,
    carrier: doblesCarrier,
    /** The EDITING athlete's share, 0..1. Meaningful when carrier === 'split'. */
    self_share: z.number().min(0).max(1),
    // Nullable + optional: the iOS client encodes an absent note as null (JSON
    // encoders don't omit nil optionals), and an empty note is normalized away.
    note: z.string().trim().max(120).nullable().optional(),
  })
  .strict();
export type AthleteStationSplit = z.infer<typeof athleteStationSplitSchema>;

/**
 * Athlete PUT body — the athlete edits the STATION reparto only (self-centric).
 * The coach's tactical notes (running / roxzone / tactical) are deliberately NOT
 * in scope for the athlete edit: they are preserved server-side on write, so an
 * athlete adjusting the split never clobbers the coach's strategy notes.
 */
export const athleteSimulationPutSchema = z
  .object({
    station_splits: z
      .array(athleteStationSplitSchema)
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
  })
  .strict();
export type AthleteSimulationPutInput = z.infer<typeof athleteSimulationPutSchema>;

/**
 * Convert one self-centric athlete split to the A/B-neutral STORED split, using
 * whether the editing athlete is stored as A (`reader_is_a`). Exact inverse of
 * the read flip: A's stored share is the reader's share when they are A, else its
 * complement; 'self'/'partner' pin to the full carrier on the correct side.
 */
export function athleteSplitToStored(
  split: AthleteStationSplit,
  reader_is_a: boolean,
): DoblesStationSplit {
  const trimmed = split.note?.trim();
  const note = trimmed ? { note: trimmed } : {};
  if (split.carrier === 'self') {
    return { station_index: split.station_index, assigned_to: reader_is_a ? 'a' : 'b', self_share: reader_is_a ? 1 : 0, ...note };
  }
  if (split.carrier === 'partner') {
    return { station_index: split.station_index, assigned_to: reader_is_a ? 'b' : 'a', self_share: reader_is_a ? 0 : 1, ...note };
  }
  // split: the reader's share becomes A's stored share (complement for a B-reader).
  const aShare = reader_is_a ? split.self_share : 1 - split.self_share;
  return { station_index: split.station_index, assigned_to: 'split', self_share: aShare, ...note };
}

/**
 * The reader-frame carrier for a STORED A-centric split — so the app editor opens
 * with the right segment selected. Inverse-consistent with athleteSplitToStored.
 */
export function storedToReaderCarrier(
  assigned_to: DoblesAssignedTo,
  reader_is_a: boolean,
): DoblesCarrier {
  if (assigned_to === 'split') return 'split';
  const readerDoesIt = (assigned_to === 'a' && reader_is_a) || (assigned_to === 'b' && !reader_is_a);
  return readerDoesIt ? 'self' : 'partner';
}

/**
 * The coach GET response: the saved simulation OR a prefilled default, plus the
 * static station labels and the two athlete display names so the editor can
 * render without a second round-trip.
 */
export interface DoblesSimulationCoachResponse extends DoblesSimulationProvenance {
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
  // updated_at + last_edited_by_* come from DoblesSimulationProvenance (extends).
}
