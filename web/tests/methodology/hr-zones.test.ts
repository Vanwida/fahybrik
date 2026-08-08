// THE heart-rate zone model — one anchor, one set of bands, honest absence.
//
// The disjoint-band bug, with the real athlete it hit: id 64, born 1982 (44 y),
// no measured max HR. The server anchored his zones on his threshold; the phone
// anchored them on a percentage of a max it estimated from his age. His Z2 came
// out 128–137 ppm on one and 106–124 ppm on the other — no overlap at all. At
// 130 ppm he was exactly where his coach wanted him and his phone told him he
// was in Z3, pushing too hard.

import { describe, expect, it } from 'vitest';
import { hrZonePosition, resolveHrZones, resolveThresholdHr, zoneForBpm } from '@fahybrid/shared/domain/methodology';

/** What iOS used to do: classify against a fraction of the MAX. Kept here only
 *  to pin the divergence this model exists to remove. */
function legacyIosZone(bpm: number, hrMax: number): number {
  const pct = bpm / hrMax;
  const uppers = [0.6, 0.7, 0.8, 0.9, 1.0];
  for (let i = 0; i < uppers.length; i++) if (pct < uppers[i]!) return i + 1;
  return 5;
}

describe('athlete 64 — 44 years old, no measured max (real production row)', () => {
  const zones = resolveHrZones({ age_years: 44 })!;

  it('anchors on the threshold, not the maximum', () => {
    // Tanaka(44) = 177.2 max → LTHR ≈ 0.88 × 177.2 ≈ 156.
    expect(zones.lthr_bpm).toBe(156);
    expect(zones.estimated).toBe(true);
    expect(zones.source).toBe('from_age');
  });

  it('puts Z2 at 128–137 ppm, where the coach prescribes it', () => {
    const z2 = zones.bands.find((b) => b.zone === 2)!;
    expect(z2.min_bpm).toBe(128);
    expect(z2.max_bpm).toBe(137);
  });

  it('no longer disagrees with itself at 130 ppm', () => {
    const legacyMax = Math.round(208 - 0.7 * 44); // what the phone called his max
    expect(zoneForBpm(130, zones)).toBe(2);
    expect(legacyIosZone(130, legacyMax)).toBe(3); // the bug, pinned
  });

  it('classifies the whole dial without gaps or overlaps', () => {
    expect(zoneForBpm(100, zones)).toBe(1);
    expect(zoneForBpm(140, zones)).toBe(3);
    expect(zoneForBpm(150, zones)).toBe(4);
    expect(zoneForBpm(165, zones)).toBe(5);
    // The top band is open: there is no zone beyond the last one.
    expect(zoneForBpm(200, zones)).toBe(5);
  });
});

describe('athlete 67 — no birth date, no measured max (real production row)', () => {
  it('has NO zones, and says so instead of inventing an anchor', () => {
    expect(resolveThresholdHr({})).toBeNull();
    expect(resolveHrZones({})).toBeNull();
  });
});

describe('the anchor chain', () => {
  it('prefers a measured threshold over everything', () => {
    const a = resolveThresholdHr({ lthr_bpm: 168, max_hr_bpm: 190, age_years: 30 })!;
    expect(a.lthr_bpm).toBe(168);
    expect(a.estimated).toBe(false);
    expect(a.source).toBe('lthr_measured');
  });

  it('falls back to a measured max, marked estimated', () => {
    const a = resolveThresholdHr({ max_hr_bpm: 190, age_years: 30 })!;
    expect(a.lthr_bpm).toBeCloseTo(167.2, 1);
    expect(a.estimated).toBe(true);
    expect(a.source).toBe('from_max_hr');
  });

  it('treats a zero or negative anchor as absent, not as a number', () => {
    expect(resolveThresholdHr({ lthr_bpm: 0, max_hr_bpm: 0, age_years: 0 })).toBeNull();
  });
});

// 29-jul-2026 — the athlete's OWN number is data, not arithmetic. It populates the
// app, labelled as his, and a test supersedes it. Before this rung existed, the
// LTHR he typed in onboarding was binned and he was shown bands off his birthday.
describe('the DECLARED rung — his number beats our arithmetic, loses to a test', () => {
  it('a declared threshold outranks a max HR and an age', () => {
    const a = resolveThresholdHr({ lthr_declared_bpm: 168, max_hr_bpm: 190, age_years: 30 })!;
    expect(a.lthr_bpm).toBe(168);
    expect(a.source).toBe('lthr_declared');
    expect(a.confidence).toBe('declared');
  });

  it('a declared threshold is NOT one of our estimates', () => {
    // `estimated` means "we inferred it". His own number was not inferred, so the
    // surfaces that warn about estimates must not warn about this one.
    expect(resolveThresholdHr({ lthr_declared_bpm: 168 })!.estimated).toBe(false);
  });

  it('a MEASURED threshold supersedes the declared one, whatever he typed', () => {
    const a = resolveThresholdHr({ lthr_bpm: 155, lthr_declared_bpm: 175 })!;
    expect(a.lthr_bpm).toBe(155);
    expect(a.confidence).toBe('measured');
  });

  it('the ladder is measured → declared → max HR → age, and never reorders', () => {
    const full = { lthr_bpm: 150, lthr_declared_bpm: 160, max_hr_bpm: 190, age_years: 44 };
    expect(resolveThresholdHr(full)!.source).toBe('lthr_measured');
    expect(resolveThresholdHr({ ...full, lthr_bpm: null })!.source).toBe('lthr_declared');
    expect(resolveThresholdHr({ ...full, lthr_bpm: null, lthr_declared_bpm: null })!.source).toBe(
      'from_max_hr',
    );
    expect(
      resolveThresholdHr({ ...full, lthr_bpm: null, lthr_declared_bpm: null, max_hr_bpm: null })!
        .source,
    ).toBe('from_age');
  });
});

// The last two rungs exist so nobody trains without zones. They are population
// generalizations and must never be scored as evidence.
describe('the POPULATION rungs are always labelled, never evidence', () => {
  it('both inferred rungs report confidence "estimated"', () => {
    expect(resolveThresholdHr({ max_hr_bpm: 190 })!.confidence).toBe('estimated');
    expect(resolveThresholdHr({ age_years: 44 })!.confidence).toBe('estimated');
  });

  it('every rung agrees with itself: estimated ⇔ confidence "estimated"', () => {
    const cases = [
      { lthr_bpm: 168 },
      { lthr_declared_bpm: 168 },
      { max_hr_bpm: 190 },
      { age_years: 44 },
    ];
    for (const c of cases) {
      const a = resolveThresholdHr(c)!;
      expect(a.estimated).toBe(a.confidence === 'estimated');
    }
  });

  it('the resolved zone model carries the confidence to every surface', () => {
    expect(resolveHrZones({ age_years: 44 })!.confidence).toBe('estimated');
    expect(resolveHrZones({ lthr_declared_bpm: 168 })!.confidence).toBe('declared');
    expect(resolveHrZones({ lthr_bpm: 168 })!.confidence).toBe('measured');
  });
});

describe('the bands themselves', () => {
  const zones = resolveHrZones({ lthr_bpm: 170 })!;

  it('has five, easiest first', () => {
    expect(zones.bands.map((b) => b.zone)).toEqual([1, 2, 3, 4, 5]);
  });

  it('leaves Z1 open at the bottom — there is no floor to being easy', () => {
    expect(zones.bands[0]!.min_bpm).toBeNull();
  });

  it('straddles the threshold with Z4, like the pace model does', () => {
    const z4 = zones.bands.find((b) => b.zone === 4)!;
    expect(z4.min_bpm!).toBeLessThanOrEqual(170);
    expect(z4.max_bpm).toBeGreaterThanOrEqual(170);
  });

  it('never leaves a beat unclassifiable between two bands', () => {
    for (let bpm = 60; bpm <= 220; bpm++) {
      expect(zoneForBpm(bpm, zones)).not.toBeNull();
    }
  });

  it('refuses a nonsense reading rather than bucketing it', () => {
    expect(zoneForBpm(0, zones)).toBeNull();
    expect(zoneForBpm(Number.NaN, zones)).toBeNull();
  });
});

// DÓNDE ESTÁS DENTRO DE TU ZONA — el dato que «Z3» no da.
//
// A 152 y a 159 el reloj ponía «Z3» en los dos casos, y uno de los dos está a
// un latido de Z4. Corriendo, esa es la información que gobierna si aprietas o
// aflojas, y es lo que deja que el lienzo del reloj se llene del color de tu
// zona derivando hacia el de la siguiente (idea de Alex, 8-ago).
//
// MECANISMO, no método: las bandas las pone el coach y esto sólo dice en qué
// punto de la suya está el atleta. Espejado en `HRZoneProfile.posicion` (iOS).
describe('hrZonePosition — dónde dentro de la banda', () => {
  const zones = resolveHrZones({ lthr_declared_bpm: 170 })!;

  it('vale 0 al entrar por abajo y 1 a un latido de la siguiente', () => {
    const z3 = zones.bands.find((b) => b.zone === 3)!;
    expect(hrZonePosition(z3.min_bpm!, zones)!.fraction).toBeCloseTo(0, 3);
    expect(hrZonePosition(z3.max_bpm, zones)!.fraction).toBeCloseTo(1, 3);
  });

  it('distingue dos pulsos de la MISMA zona', () => {
    const z3 = zones.bands.find((b) => b.zone === 3)!;
    const bajo = hrZonePosition(z3.min_bpm! + 1, zones)!;
    const alto = hrZonePosition(z3.max_bpm - 1, zones)!;
    expect(bajo.zone).toBe(alto.zone);
    expect(bajo.fraction).toBeLessThan(alto.fraction);
  });

  it('Z1 se mide desde 0 porque no tiene suelo', () => {
    const reposo = hrZonePosition(55, zones)!;
    const suave = hrZonePosition(zones.bands[0]!.max_bpm - 2, zones)!;
    expect(reposo.zone).toBe(1);
    expect(reposo.previous).toBeNull();
    expect(reposo.fraction).toBeLessThan(suave.fraction);
  });

  it('la última zona no tiene siguiente y satura en 1', () => {
    const p = hrZonePosition(400, zones)!;
    expect(p.zone).toBe(5);
    expect(p.next).toBeNull();
    expect(p.fraction).toBe(1);
  });

  it('sin lectura no hay posición', () => {
    expect(hrZonePosition(0, zones)).toBeNull();
  });
});
