// @fahybrid/shared/domain/execution-merge — CHANNEL fidelity (the axis a merge
// ranks by). Part of #36 "Garmin sin SDK": one real workout can be assembled
// from several sources (an Apple-Health device skeleton + a screenshot→IA
// capture + a manual log + the athlete's own edits). To fuse them into ONE
// execution we must know, per field, which source is MORE TRUSTWORTHY.
//
// KEY INSIGHT (why provider ≠ fidelity): the SAME provider enum value can arrive
// through DIFFERENT pipelines with different fidelity. A Garmin watch's summary
// reaches us as a `healthkit` device stream (the HK ingest stamps EVERYTHING
// written into Apple Health as 'healthkit', Garmin/Polar/Coros included), OR as
// a `garmin` OCR capture (a photo of the Garmin app). Same watch, very different
// trust. So the ranking axis is the CHANNEL (how the data was measured), not the
// `biometric_source` provider (who made the device). We store the provider for
// display; we rank by the channel.

import type { BiometricSource } from '../../schema/_primitives';

// How a contribution's data was obtained, best-known → least-known fidelity.
export const MERGE_CHANNELS = [
  // A structured sensor stream imported passively from Apple Health (the Garmin/
  // Polar/Coros/Suunto/Apple-Watch skeleton). Highest fidelity for measured
  // totals (duration, HR, calories, distance).
  'device_stream',
  // FAHYBRIK's own watch/live app recording the session with structured
  // segments. High fidelity, and the one source besides a capture that carries
  // splits.
  'app_structured',
  // A screenshot of a device/app summary read by the vision model. Rich (it is
  // the ONLY source of splits, power, per-500m pace, time-in-zone) but OCR-
  // fallible on the totals.
  'ocr_capture',
  // A human typed it in ("Ya lo hice"), or it is subjective (RPE). Lowest for a
  // device-measurable number; authoritative for what only a human knows.
  'manual',
] as const;
export type MergeChannel = (typeof MERGE_CHANNELS)[number];

// The four groups a workout result splits into. Provenance is tracked per GROUP
// (Fork B): honest without per-column dead weight.
export const MERGE_FIELD_CLASSES = ['totals', 'segments', 'score', 'rpe'] as const;
export type MergeFieldClass = (typeof MERGE_FIELD_CLASSES)[number];

// Fidelity order per field class — FIRST wins. A channel ABSENT from a class's
// list CANNOT supply that class (it is ignored for those fields), which is a
// modelling fact, not an omission:
//   - totals: the sensor stream owns the measured numbers; a screenshot of the
//     same device is second (OCR can misread); a hand-typed total is last.
//     THE FIDELITY RULE (Fork C): a device value REPLACES an OCR value for the
//     same field — never the reverse — even when the OCR capture landed FIRST.
//   - segments (splits / laps / power / per-500m pace / time-in-zone): only a
//     structured app or a screenshot carry them. Apple-Health skeletons do NOT
//     (recon: HKWorkout laps have no per-lap metrics), so `device_stream` is
//     deliberately absent here.
//   - score (For Time / AMRAP / HYROX-sim result): a structured app counter
//     beats a screenshot of the board, which beats memory typed by hand.
//   - rpe: perceived exertion is subjective — it NEVER comes from a sensor or a
//     photo. Manual (the athlete) only.
export const CHANNEL_FIDELITY: Record<MergeFieldClass, readonly MergeChannel[]> = {
  totals: ['device_stream', 'app_structured', 'ocr_capture', 'manual'],
  segments: ['app_structured', 'ocr_capture'],
  score: ['app_structured', 'ocr_capture', 'manual'],
  rpe: ['manual'],
} as const;

// Higher = more trustworthy for this class. -1 ⇒ the channel cannot supply the
// class at all (ignore it for those fields).
export function fidelityRank(cls: MergeFieldClass, channel: MergeChannel): number {
  const order = CHANNEL_FIDELITY[cls];
  const idx = order.indexOf(channel);
  // Reverse the index so the FIRST listed channel scores highest.
  return idx === -1 ? -1 : order.length - idx;
}

// Reconstruct the ingest CHANNEL of an ALREADY-PERSISTED execution source, so
// the deferred reconciler (Fase 2) can decide device-vs-OCR without a stored
// channel column (Fork B: no dead weight). Current-reality mapping:
//   'healthkit' → device_stream   (the sole device-stream marker today: Garmin/
//                                   Polar/Coros writing INTO Apple Health are all
//                                   stamped 'healthkit' by the HK ingest)
//   'manual'    → manual
//   others      → ocr_capture      (the vision path maps app→provider; a
//                                   screenshot of a Garmin/Coros/Concept2/Polar
//                                   summary)
// EVOLUTION: when the official Garmin/Polar WEBHOOKS reopen (paused today — the
// reason #36 exists), a webhook-sourced 'garmin' becomes a device_stream. At
// that point pass an EXPLICIT channel at merge time (the caller knows which
// pipeline produced the contribution) instead of leaning on this classifier.
export function channelOfStoredSource(source: BiometricSource): MergeChannel {
  if (source === 'healthkit') return 'device_stream';
  if (source === 'manual') return 'manual';
  return 'ocr_capture';
}
