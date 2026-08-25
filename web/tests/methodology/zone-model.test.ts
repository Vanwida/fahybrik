// Pure unit tests for the SIX-ZONE pace model + test→zones resolver
// (@fahybrid/shared/domain/methodology, migration 0061).
//
// The single load-bearing assertion: the resolver reproduces Pablo's VERIFIED
// reference numbers EXACTLY for remo 1:55 and ski 2:04. If these drift, the zone
// model is wrong — the whole Test feature is anchored on these bands.
//
// Reference (offset bands in seconds/500m from the threshold = test = Z4 lower):
//   REMO 1:55 (115s): Z1 >2:17, Z2 2:09-2:16, Z3 2:03-2:08, Z4 1:55-2:02,
//                     Z5 1:52-1:54, Z6 1:48-1:51.
//   SKI  2:04 (124s): Z1 >2:26, Z2 2:18-2:25, Z3 2:12-2:17, Z4 2:04-2:11,
//                     Z5 2:01-2:03, Z6 1:57-2:00.

import { describe, expect, test } from 'vitest';
import {
  resolveZonesForAthlete,
  findResolvedZone,
  STANDARD_ZONES_PER_500M,
  STANDARD_ZONES_PER_KM,
  resolveTarget,
  athleteBenchmarksFromSlugRows,
  deriveModalityThresholds,
  isMeasuredZoneProfile,
  measuredThresholdSeconds,
  thresholdUnknownNote,
  type ResolvedZone,
} from '@fahybrid/shared/domain/methodology';

// m:ss → seconds. 1:55 → 115.
const sec = (mmss: string): number => {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
};

// A resolved band as { fast, slow } in m:ss for readable expectations. An open
// band (slow null = Z1) renders slow as null.
const fmt = (z: ResolvedZone): { fast: number; slow: number | null } => ({ fast: z.fast_s, slow: z.slow_s });

const byCode = (zones: ResolvedZone[]) =>
  Object.fromEntries(zones.map((z) => [z.code, fmt(z)])) as Record<string, { fast: number; slow: number | null }>;

describe('6-zone model — reproduces Pablo verified numbers EXACTLY', () => {
  test('REMO test 1:55 (per_500m) → all six bands match the reference', () => {
    const zones = resolveZonesForAthlete(
      { modality: 'row', threshold_s: sec('1:55'), pace_unit: 'per_500m' },
      STANDARD_ZONES_PER_500M.slice(),
    );
    expect(zones).toHaveLength(6);

    const z = byCode(zones);
    // Z4 1:55-2:02 (the threshold band: [0,+7]).
    expect(z.Z4).toEqual({ fast: sec('1:55'), slow: sec('2:02') });
    // Z3 2:03-2:08 ([+8,+13]).
    expect(z.Z3).toEqual({ fast: sec('2:03'), slow: sec('2:08') });
    // Z2 2:09-2:16 ([+14,+21]).
    expect(z.Z2).toEqual({ fast: sec('2:09'), slow: sec('2:16') });
    // Z1 >2:17 (open: fast 2:17, slow null).
    expect(z.Z1).toEqual({ fast: sec('2:17'), slow: null });
    // Z5 1:52-1:54 ([-3,-1]).
    expect(z.Z5).toEqual({ fast: sec('1:52'), slow: sec('1:54') });
    // Z6 1:48-1:51 ([-7,-4]).
    expect(z.Z6).toEqual({ fast: sec('1:48'), slow: sec('1:51') });
  });

  test('SKI test 2:04 (per_500m) → all six bands match the reference', () => {
    const zones = resolveZonesForAthlete(
      { modality: 'ski', threshold_s: sec('2:04'), pace_unit: 'per_500m' },
      STANDARD_ZONES_PER_500M.slice(),
    );
    const z = byCode(zones);
    expect(z.Z4).toEqual({ fast: sec('2:04'), slow: sec('2:11') });
    expect(z.Z3).toEqual({ fast: sec('2:12'), slow: sec('2:17') });
    expect(z.Z2).toEqual({ fast: sec('2:18'), slow: sec('2:25') });
    expect(z.Z1).toEqual({ fast: sec('2:26'), slow: null });
    expect(z.Z5).toEqual({ fast: sec('2:01'), slow: sec('2:03') });
    expect(z.Z6).toEqual({ fast: sec('1:57'), slow: sec('2:00') });
  });

  test('zones are ordered easiest→hardest and Z6 is the new sprint band', () => {
    const zones = resolveZonesForAthlete(
      { modality: 'row', threshold_s: sec('1:55'), pace_unit: 'per_500m' },
      STANDARD_ZONES_PER_500M.slice(),
    );
    expect(zones.map((z) => z.code)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6']);
    expect(findResolvedZone(zones, 'Z6')?.role).toBe('sprint');
    expect(findResolvedZone(zones, 'Z4')?.role).toBe('threshold');
  });

  test('throws on a malformed model (not 6 zones for the unit)', () => {
    expect(() =>
      resolveZonesForAthlete(
        { modality: 'row', threshold_s: 115, pace_unit: 'per_500m' },
        STANDARD_ZONES_PER_500M.slice(0, 5),
      ),
    ).toThrow(/expected 6 zones/);
  });
});

describe('label resolver shares the SAME bands (no divergence)', () => {
  // resolveTarget("Z4 row", benchmarks) must land in the exact Z4 band the test
  // resolver produces for the same threshold. The 2K row split of 1:55/500m =
  // a 2K time of 4×115 = 460s, which the resolver halves-of-two-K → 115 s/500m.
  test('"Z4 row" off a 2K @ 1:55/500m → 1:55-2:02 (matches the test resolver)', () => {
    const r = resolveTarget('Z4 row', { time_2k_row_seconds: 4 * sec('1:55') }, { modality: 'row' });
    expect(r).not.toBeNull();
    expect(r!.target.kind).toBe('pace');
    if (r!.target.kind === 'pace') {
      expect(r!.target.unit).toBe('per_500m');
      expect(r!.target.min_s).toBe(sec('1:55'));
      expect(r!.target.max_s).toBe(sec('2:02'));
    }
  });

  test('"Z6 ski" resolves to the sprint band 1:57-2:00 off a 1K ski @ 2:04/500m', () => {
    // 1K ski time = 2×124 = 248s → 124 s/500m threshold.
    const r = resolveTarget('Z6 ski', { time_1k_ski_seconds: 2 * sec('2:04') }, { modality: 'ski' });
    expect(r).not.toBeNull();
    if (r && r.target.kind === 'pace') {
      expect(r.target.min_s).toBe(sec('1:57'));
      expect(r.target.max_s).toBe(sec('2:00'));
    }
  });

  test('"Z1 row" is open-ended (only a min_s = slower-than bound)', () => {
    const r = resolveTarget('Z1 row', { time_2k_row_seconds: 4 * sec('1:55') }, { modality: 'row' });
    expect(r).not.toBeNull();
    if (r && r.target.kind === 'pace') {
      expect(r.target.min_s).toBe(sec('2:17'));
      expect(r.target.max_s).toBeUndefined();
    }
  });
});

describe('run pace zones (per_km) resolve off threshold', () => {
  test('"Z4 run" off a direct threshold pace of 4:00/km → 4:00-4:14', () => {
    const r = resolveTarget('Z4 run', { time_threshold_pace_s_per_km: sec('4:00') }, { modality: 'run' });
    expect(r).not.toBeNull();
    if (r && r.target.kind === 'pace') {
      expect(r.target.unit).toBe('per_km');
      expect(r.target.min_s).toBe(sec('4:00'));
      expect(r.target.max_s).toBe(sec('4:14'));
    }
  });

  test('the standard per_km set is also a complete 6-zone model', () => {
    const zones = resolveZonesForAthlete(
      { modality: 'run', threshold_s: sec('4:00'), pace_unit: 'per_km' },
      STANDARD_ZONES_PER_KM.slice(),
    );
    expect(zones.map((z) => z.code)).toEqual(['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'Z6']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 29-jul-2026 — THE PACE LADDER'S TOP RUNG.
//
// `deriveModalityThresholds` always preferred a measured threshold over one backed
// out of a time trial, but `athleteBenchmarksFromSlugRows` never handed the
// measured one over, so the preference could not fire. Athlete 66 in production
// held measured run (248 s/km) and row (114 s/500m) thresholds and would have got
// zones off his 5K instead; athlete 67's derivation said 250 s/km while the
// profile HE recorded said 270 — same athlete, two answers, 20 s/km apart.
// ─────────────────────────────────────────────────────────────────────────────
describe('pace ladder — a measured threshold outranks a time trial', () => {
  test('athlete 66: the mapper now carries his measured thresholds through', () => {
    const b = athleteBenchmarksFromSlugRows([
      { exercise_slug: 'run_5k', value: 1155 },
      { exercise_slug: 'row_2k', value: 448 },
      { exercise_slug: 'run_threshold_s_per_km', value: 248 },
      { exercise_slug: 'row_threshold_s_per_500m', value: 114 },
    ]);
    expect(b.time_threshold_pace_s_per_km).toBe(248);
    expect(b.time_threshold_row_s_per_500m).toBe(114);

    const t = Object.fromEntries(deriveModalityThresholds(b).map((x) => [x.modality, x]));
    expect(t.run!.threshold_s).toBe(248); // not 241 (5K/5 + 10 s offset)
    expect(t.run!.estimated).toBe(false);
    expect(t.row!.threshold_s).toBe(114); // not 112 (2K/4)
    expect(t.row!.estimated).toBe(false);
  });

  test('without a measured threshold the time trial still answers, marked ESTIMATED', () => {
    const b = athleteBenchmarksFromSlugRows([
      { exercise_slug: 'run_5k', value: 1155 },
      { exercise_slug: 'row_2k', value: 448 },
      { exercise_slug: 'ski_1k', value: 264 },
    ]);
    const t = Object.fromEntries(deriveModalityThresholds(b).map((x) => [x.modality, x]));
    expect(t.run!.threshold_s).toBe(1155 / 5 + 10);
    expect(t.run!.estimated).toBe(true);
    // These two were hardcoded `estimated: false`. A 2K is held ABOVE threshold, so
    // calling its average split a measured threshold was a lie — the erg ladder's
    // version of anchoring on a birthday and not saying so.
    expect(t.row!.estimated).toBe(true);
    expect(t.ski!.estimated).toBe(true);
  });

  test('athlete 67: the derivation now agrees with the profile he recorded', () => {
    const b = athleteBenchmarksFromSlugRows([
      { exercise_slug: 'run_5k', value: 1198 },
      { exercise_slug: 'run_threshold_s_per_km', value: 270 },
    ]);
    const run = deriveModalityThresholds(b).find((x) => x.modality === 'run')!;
    // athlete_zone_profiles stores threshold_s = 270 for athlete 67, run.
    expect(run.threshold_s).toBe(270);
    expect(run.estimated).toBe(false);
  });

  test('the HR anchor rides the same mapper, so the watch sees a measured threshold', () => {
    expect(athleteBenchmarksFromSlugRows([{ exercise_slug: 'lthr_bpm', value: 168 }]).lthr_bpm).toBe(
      168,
    );
  });
});

// Card 104 — el número que se sirve no es el estimado del 5 km.
describe('umbral servido — un número de verdad o no lo sé', () => {
  test('un test del coach manda: 248 s/km es 248, no el 5 km + 10 s', () => {
    expect(
      measuredThresholdSeconds({
        profile: { threshold_s: 248, source: 'coach_test', needs_review: false },
        thresholdMarkS: 248,
      }),
    ).toBe(248);
  });

  test('sin test, un perfil del alta no inventa umbral', () => {
    expect(
      measuredThresholdSeconds({
        profile: { threshold_s: 241, source: 'onboarding_auto', needs_review: true },
        thresholdMarkS: null,
      }),
    ).toBeNull();
  });

  test('marca de umbral guardada y perfil del alta: gana la marca', () => {
    expect(
      measuredThresholdSeconds({
        profile: { threshold_s: 241, source: 'onboarding_auto', needs_review: true },
        thresholdMarkS: 248,
      }),
    ).toBe(248);
  });

  test('sin perfil y sin marca: vacío honesto', () => {
    expect(measuredThresholdSeconds({ profile: null, thresholdMarkS: null })).toBeNull();
  });

  test('el vacío señala ESE test, sin raya larga', () => {
    expect(thresholdUnknownNote()).toBe('');
    expect(thresholdUnknownNote('Test 5K de zonas')).toBe('');
    expect(thresholdUnknownNote()).not.toMatch(/—/);
  });

  test('onboarding_auto no es un test medido, ni aunque lo confirmen', () => {
    expect(isMeasuredZoneProfile('onboarding_auto', false)).toBe(false);
    expect(isMeasuredZoneProfile('coach_test', false)).toBe(true);
    expect(isMeasuredZoneProfile('coach_test', true)).toBe(false);
    expect(isMeasuredZoneProfile('athlete_test', false)).toBe(true);
  });
});
