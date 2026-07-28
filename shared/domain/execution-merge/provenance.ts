// @fahybrid/shared/domain/execution-merge — PROVENANCE derived from the tramos.
//
// The sibling `precedence.ts` fuses SEVERAL sources that each claim the same
// workout. This module answers the question that comes first, for the ordinary
// single-source case: given the segments the app just posted, WHICH APPARATUS
// produced these numbers and HOW did the record come to exist?
//
// Those are two different questions, and answering them with one column is what
// broke: four sessions Alex ran live with a PM5 and a treadmill were stored with
// `source = 'manual'` and shown as «Registro: A mano». `biometric_source` is
// vocabulary for APPARATUS — it has no way to say "he ran it in the app" — so the
// live path sent the only value left, which meant the opposite of the truth.
//
//   source               WHICH apparatus the numbers came from  (biometric_source)
//   contributing_sources ALL the apparatus that contributed     (biometric_source[])
//   totals_source        the apparatus owning the totals        (biometric_source)
//   recorded_via         HOW the record came to exist           (live|manual|imported)
//
// The evidence is already in the payload: `segment_executions.source`, one token
// per tramo. This module is the ONE place that knows what those tokens mean.
// Pure and framework-free — no db, no io — so it is testable on its own and
// mirrors the SQL backfill in migration 0144 case for case.

import { biometricSource, type BiometricSource, type ExecutionRecordingMethod } from '../../schema/_primitives';

// Per-tramo `source` tokens that name an APPARATUS, mapped to the apparatus they
// mean. An ALLOW-LIST on purpose: `segment_executions.source` is free text, and
// every value we lift out of it is cast to the `biometric_source` enum, so an
// unknown token has to fall out here rather than blow up the insert.
//
// 'pm5' normalises to 'concept2' — a PM5 IS the monitor of a Concept2, and the
// vocabulary is not duplicated. 'manual' and 'demo' are deliberately ABSENT:
// neither is an apparatus, so a session made only of them contributes an empty
// array, which is real information ("nothing measured this"), not a gap.
// Same nine tokens the 0144 backfill reads.
const SEGMENT_SOURCE_TO_APPARATUS: Readonly<Record<string, BiometricSource>> = {
  pm5: 'concept2',
  concept2: 'concept2',
  treadmill: 'treadmill',
  gps: 'gps',
  healthkit: 'healthkit',
  garmin: 'garmin',
  polar: 'polar',
  coros: 'coros',
  wahoo: 'wahoo',
};

// Per-tramo `source` tokens ONLY the app's live engine writes. Their presence is
// proof the athlete ran the session in the app: the manual log ("Ya lo hice")
// posts no segments at all, because no clock ever ran.
//
// 'manual' belongs here even though it is not an apparatus: the live engine
// stamps it on a tramo it timed but no device measured (a strength block with
// hand-entered reps). 'concept2' does NOT belong here — that is the ingestor's
// token, not the engine's.
const LIVE_ENGINE_SEGMENT_SOURCES: ReadonlySet<string> = new Set([
  'pm5',
  'treadmill',
  'gps',
  'manual',
  'healthkit',
]);

// Whole-execution fallback kept from before this module existed: a client that
// posts neither segments nor a source is the passive Apple-Health path. Changing
// it would relabel every older client's writes, so it stays as the LAST resort.
const LEGACY_DEFAULT_SOURCE: BiometricSource = 'healthkit';

// Enum position per value. Postgres orders an enum array by declaration order,
// not alphabetically, so sorting by this index makes a `contributing_sources`
// written at runtime identical to one produced by the SQL backfill.
const APPARATUS_ORDER: ReadonlyMap<BiometricSource, number> = new Map(
  biometricSource.options.map((v, i) => [v, i]),
);

/** The apparatus a per-tramo `source` token names, or null when it names none. */
export function apparatusOfSegmentSource(raw: string | null | undefined): BiometricSource | null {
  if (raw == null) return null;
  return SEGMENT_SOURCE_TO_APPARATUS[raw.trim().toLowerCase()] ?? null;
}

/** True when the token is one only the app's live engine writes. */
export function isLiveEngineSegmentSource(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  return LIVE_ENGINE_SEGMENT_SOURCES.has(raw.trim().toLowerCase());
}

/** The evidence one tramo carries. Both fields optional — an older client omits them. */
export interface ProvenanceSegment {
  /** The per-tramo `source` token, verbatim from the client. */
  source?: string | null;
  /** Measured duration in seconds, or null when unknown. Never invented. */
  duration_seconds?: number | null;
}

export interface ExecutionProvenance {
  /** The principal apparatus — what `workout_executions.source` should hold. */
  source: BiometricSource;
  /** How the record came to exist, or null when the evidence cannot say. */
  recorded_via: ExecutionRecordingMethod | null;
  /** The apparatus owning the totals (the longest tramo's), or null when none. */
  totals_source: BiometricSource | null;
  /** Every apparatus that contributed, deduped and in enum order. */
  contributing_sources: BiometricSource[];
}

/**
 * Derive the four provenance fields from the tramos of ONE execution.
 *
 * `declared_*` are what the client asserted; they are honoured where the tramos
 * cannot contradict them. The apparatus is the one thing the tramos DO settle,
 * so a measured `totals_source` outranks a declared source — that is precisely
 * the correction the live path needs, since it declares 'manual' while posting
 * PM5 tramos.
 */
export function deriveExecutionProvenance(input: {
  segments?: readonly ProvenanceSegment[] | null;
  declared_source?: BiometricSource | null;
  declared_recorded_via?: ExecutionRecordingMethod | null;
}): ExecutionProvenance {
  const segments = input.segments ?? [];

  // --- contributing_sources: every distinct apparatus, in enum order ---------
  const apparatus = new Set<BiometricSource>();
  for (const seg of segments) {
    const a = apparatusOfSegmentSource(seg.source);
    if (a) apparatus.add(a);
  }
  const contributing_sources = [...apparatus].sort(
    (a, b) => (APPARATUS_ORDER.get(a) ?? 0) - (APPARATUS_ORDER.get(b) ?? 0),
  );

  // --- totals_source: the apparatus of the LONGEST tramo ---------------------
  // It dominates duration and distance, so it owns the totals. A tramo of
  // unknown duration still qualifies (it may be the only measured one) but
  // ranks below every measured tramo — the SQL's `desc nulls last`. Ties keep
  // the earlier tramo, so the result is order-stable.
  let totals_source: BiometricSource | null = null;
  let longest = Number.NEGATIVE_INFINITY;
  for (const seg of segments) {
    const a = apparatusOfSegmentSource(seg.source);
    if (!a) continue;
    const d = seg.duration_seconds ?? -1;
    if (d > longest) {
      longest = d;
      totals_source = a;
    }
  }

  // --- recorded_via ---------------------------------------------------------
  // The client knows best and says so when it can; otherwise read the evidence:
  //   no tramos at all      → nobody timed anything, so it was typed in
  //   engine vocabulary     → the athlete ran it in the app
  //   some other apparatus  → a non-engine pipeline stamped it: imported
  //   tramos with no token  → unknowable. NULL is the honest answer (mig 0144),
  //                           never a guess dressed as a fact.
  const recorded_via: ExecutionRecordingMethod | null =
    input.declared_recorded_via ??
    (segments.length === 0
      ? 'manual'
      : segments.some((s) => isLiveEngineSegmentSource(s.source))
        ? 'live'
        : segments.some((s) => apparatusOfSegmentSource(s.source) != null)
          ? 'imported'
          : null);

  // --- source: the principal apparatus --------------------------------------
  // Measured beats declared; a live session with no apparatus at all really was
  // measured by hand; and only a payload with no signal whatsoever falls back to
  // the legacy default.
  const source: BiometricSource =
    totals_source ??
    input.declared_source ??
    (recorded_via === 'live' ? 'manual' : LEGACY_DEFAULT_SOURCE);

  return { source, recorded_via, totals_source, contributing_sources };
}
