// @fahybrid/shared/domain/goal-gap — WHAT WOULD SHARPEN THIS (pure, no I/O).
//
// A range the athlete cannot act on is a shrug. Every projection therefore ships
// with the measurements that would tighten it, best return first, in the words the
// athlete uses ("Mide tu SkiErg 1000", not "provide an erg benchmark").
//
// The ordering is not a hand-written priority list: it falls out of the bands.
//   · A segment with NO number at all comes first — a hole is worse than a wide
//     band, and unlike a band its size is unknown until it is measured.
//   · Among holes, what the athlete can measure alone today beats what needs a
//     race import or a full simulation.
//   · Among segments that DO have a number, the one whose band would shrink the
//     most seconds.

import { BAND_MEASURED, BAND_OBSERVED, type EvidenceSource } from '../evidence';
import type { NextInput, SegmentDef, SegmentResult } from './types';

/**
 * The measurement that upgrades a segment, by slug. Only the run and the two ergs
 * have a mark in the «Probarme» catalog; the six functional stations and the
 * roxzone have no self-test, so the only way to observe them is to race one or
 * simulate one.
 *
 * The slugs are the canonical segment slugs the skeleton is built from
 * (web/lib/athlete/goal-gap → buildSegments), so this map is keyed on the same
 * identity the predictions carry.
 */
const SELF_MEASURABLE: Record<string, string> = {
  run: 'Mide tu 5K',
  'ski-erg': 'Mide tu SkiErg 1000',
  row: 'Mide tu remo 1000',
};

/** The fallback for everything with no self-test: put it on a clock for real. */
const IMPORT_ACTION = 'Importa tu última carrera';
const SIMULATE_ACTION = 'Haz una simulación HYROX completa';

/** Sources already at the top of the ladder — nothing to propose. */
const AT_BEST: ReadonlySet<EvidenceSource> = new Set<EvidenceSource>(['carrera', 'simulacion']);

/** The band a segment would end up with if the athlete took the proposed action. */
function achievableBand(slug: string): number {
  // A mark is a measurement of the athlete at a known distance → the measured band.
  // A race/simulation split is the segment itself → the observed band.
  return SELF_MEASURABLE[slug] != null ? BAND_MEASURED : BAND_OBSERVED;
}

function actionFor(slug: string, kind: SegmentDef['kind']): string {
  const own = SELF_MEASURABLE[slug];
  if (own) return own;
  return kind === 'roxzone' ? IMPORT_ACTION : SIMULATE_ACTION;
}

/**
 * Rank the measurements that would sharpen this projection.
 *
 * `limit` caps the list because this is product copy, not a dump: three actions is
 * a nudge, ten is a chore.
 */
export function rankNextInputs(
  segments: SegmentDef[],
  results: SegmentResult[],
  limit = 3,
): NextInput[] {
  const holes: NextInput[] = [];
  const narrowings: NextInput[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const seg = segments[i];
    if (!r || !seg) continue;

    // No number at all → a hole. Its win cannot be sized before it is measured.
    if (r.predicted_s == null || r.band_s == null) {
      holes.push({
        slug: r.slug,
        label_es: r.label_es,
        action_es: actionFor(r.slug, seg.kind),
        band_gain_s: null,
      });
      continue;
    }

    if (AT_BEST.has(r.source)) continue;

    const gain = r.band_s - Math.round(r.predicted_s * achievableBand(r.slug));
    if (gain <= 0) continue;
    narrowings.push({
      slug: r.slug,
      label_es: r.label_es,
      action_es: actionFor(r.slug, seg.kind),
      band_gain_s: gain,
    });
  }

  // Holes first, self-measurable ones ahead of the rest; then the biggest wins.
  holes.sort((a, b) => {
    const aOwn = SELF_MEASURABLE[a.slug] != null ? 0 : 1;
    const bOwn = SELF_MEASURABLE[b.slug] != null ? 0 : 1;
    return aOwn - bOwn;
  });
  narrowings.sort((a, b) => (b.band_gain_s ?? 0) - (a.band_gain_s ?? 0));

  return [...holes, ...narrowings].slice(0, limit);
}
