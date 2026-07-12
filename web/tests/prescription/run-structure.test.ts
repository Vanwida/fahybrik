// #61 — the structured running-workout grammar, stress-tested against the 12
// CANONICAL cases from Pablo's real plan. Each case must:
//   (1) validate against runStructureSchema with ZERO free text,
//   (2) round-trip through the full Prescription schema (the wire), and
//   (3) resolve every zone/pace/rpe segment target to a concrete athlete Target.
// If any canonical case cannot be expressed cleanly, the MODEL is wrong — these
// tests are the guard that it stays right.

import { describe, expect, test } from 'vitest';
import {
  legacyToStructure,
  parsePrescription,
  prescriptionFromStructure,
  safeParseRunStructure,
  structureToLegacy,
  flattenSegments,
  type Prescription,
  type RunStructure,
  type Segment,
  type SegmentTarget,
} from '@fahybrid/shared/domain/prescription';
import {
  resolveSegmentTarget,
  type AthleteBenchmarks,
} from '@fahybrid/shared/domain/methodology';

// ── Tiny builders (keep the cases readable) ──────────────────────────────────
const dist = (m: number) => ({ type: 'distance' as const, m });
const dur = (s: number) => ({ type: 'duration' as const, s });
const work = (measure: Segment['measure'], target: SegmentTarget | null = null, extra: Partial<Segment> = {}): Segment => ({
  kind: 'work',
  measure,
  target,
  ...extra,
});
const rec = (measure: Segment['measure'], mode: Segment['recovery_mode'], target: SegmentTarget | null = null): Segment => ({
  kind: 'recovery',
  measure,
  target,
  recovery_mode: mode,
});
const paceZone = (zone: number): SegmentTarget => ({ type: 'pace_zone', zone });
const rpe = (value: number): SegmentTarget => ({ type: 'rpe', value });

// ── The 12 canonical cases ───────────────────────────────────────────────────
const CANONICAL: { name: string; structure: RunStructure; resolvableTargets: number }[] = [
  {
    name: '6×1000 con 200m trote Z1',
    structure: [
      { role: 'main', elements: [{ times: 6, elements: [work(dist(1000), paceZone(3)), rec(dist(200), 'trote', paceZone(1))] }] },
    ],
    resolvableTargets: 12, // 6 work + 6 recovery zones
  },
  {
    name: '3×(4×400 rec 1′ parado) rec 3′ entre bloques',
    structure: [
      {
        role: 'main',
        elements: [
          {
            times: 3,
            elements: [
              { times: 4, elements: [work(dist(400), rpe(9)), rec(dur(60), 'parado')] },
              rec(dur(180), 'parado'),
            ],
          },
        ],
      },
    ],
    resolvableTargets: 12, // the 12 × 400 work bouts carry RPE
  },
  {
    name: 'progresivo 4k Z2 + 4k Z3 + 2k Z4',
    structure: [
      { role: 'main', elements: [work(dist(4000), paceZone(2)), work(dist(4000), paceZone(3)), work(dist(2000), paceZone(4))] },
    ],
    resolvableTargets: 3,
  },
  {
    name: 'tempo 20′ pace_zone umbral (Z4)',
    structure: [{ role: 'main', elements: [work(dur(1200), paceZone(4))] }],
    resolvableTargets: 1,
  },
  {
    name: 'fartlek 10×(2′ RPE8 / 1′ RPE3)',
    structure: [
      { role: 'main', elements: [{ times: 10, elements: [work(dur(120), rpe(8)), rec(dur(60), 'trote', rpe(3))] }] },
    ],
    resolvableTargets: 20,
  },
  {
    name: 'cuestas 8×200m al 8% rec bajada caminando',
    structure: [
      {
        role: 'main',
        elements: [{ times: 8, elements: [work(dist(200), rpe(9), { incline_pct: 8 }), rec(dist(200), 'caminar')] }],
      },
    ],
    resolvableTargets: 8,
  },
  {
    name: 'calent 15′ Z1 + principal + vuelta 10′ Z1',
    structure: [
      { role: 'warmup', elements: [work(dur(900), paceZone(1))] },
      { role: 'main', elements: [work(dur(1200), paceZone(4))] },
      { role: 'cooldown', elements: [work(dur(600), paceZone(1))] },
    ],
    resolvableTargets: 3,
  },
  {
    name: '5×3′ a banda 4:15-4:25',
    structure: [
      { role: 'main', elements: [{ times: 5, elements: [work(dur(180), { type: 'pace', min_s: 255, max_s: 265 })] }] },
    ],
    resolvableTargets: 5,
  },
  {
    name: 'rodaje 45′ Z2',
    structure: [{ role: 'main', elements: [work(dur(2700), paceZone(2))] }],
    resolvableTargets: 1,
  },
  {
    name: 'pirámide 400-800-1200-800-400',
    structure: [
      {
        role: 'main',
        elements: [
          work(dist(400), paceZone(4)),
          rec(dur(90), 'parado'),
          work(dist(800), paceZone(4)),
          rec(dur(90), 'parado'),
          work(dist(1200), paceZone(3)),
          rec(dur(90), 'parado'),
          work(dist(800), paceZone(4)),
          rec(dur(90), 'parado'),
          work(dist(400), paceZone(4)),
        ],
      },
    ],
    resolvableTargets: 5,
  },
  {
    name: 'test 3′/9′/30′ (no debe romperse)',
    structure: [
      { role: 'main', elements: [work(dur(180), rpe(10)), work(dur(540), rpe(10)), work(dur(1800), rpe(10))] },
    ],
    resolvableTargets: 3,
  },
  {
    name: 'serie con cadencia 180',
    structure: [
      { role: 'main', elements: [{ times: 4, elements: [work(dist(1000), paceZone(3), { cadence_spm: 180 }), rec(dur(90), 'parado')] }] },
    ],
    resolvableTargets: 4,
  },
];

// A real athlete: 20:00 5k (4:00/km), LTHR 170 → every zone/pace/rpe resolves.
const ATHLETE: AthleteBenchmarks = { time_5k_seconds: 1200, lthr_bpm: 170, max_hr_bpm: 190, age_years: 30 };

describe('#61 · 12 canonical run cases enter the grammar with ZERO free text', () => {
  for (const c of CANONICAL) {
    test(`grammar accepts: ${c.name}`, () => {
      const parsed = safeParseRunStructure(c.structure);
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
      expect(parsed.success).toBe(true);
    });

    test(`wire (Prescription schema) accepts the flattened block: ${c.name}`, () => {
      const p = prescriptionFromStructure(c.structure);
      // Must carry BOTH the rich structure AND the legacy flatten (additive wire).
      expect(p.structure).toBeDefined();
      expect(p.scheme === 'steady' || p.scheme === 'intervals').toBe(true);
      const reparsed = parsePrescription(p); // throws if invalid
      expect(reparsed.structure).toBeDefined();
    });

    test(`every zone/pace/rpe target resolves for a benchmarked athlete: ${c.name}`, () => {
      const segs = flattenSegments(c.structure);
      let resolved = 0;
      for (const seg of segs) {
        if (!seg.target) continue;
        const r = resolveSegmentTarget(seg.target, ATHLETE);
        expect(r, `${c.name} · segment target ${JSON.stringify(seg.target)}`).not.toBeNull();
        resolved++;
      }
      expect(resolved).toBe(c.resolvableTargets);
    });
  }
});

describe('#61 · nesting depth is bounded at 2', () => {
  test('3×(4×400) enters', () => {
    const ok: RunStructure = [
      { role: 'main', elements: [{ times: 3, elements: [{ times: 4, elements: [work(dist(400), rpe(8))] }] }] },
    ];
    expect(safeParseRunStructure(ok).success).toBe(true);
  });
  test('a third nested Repeat is rejected', () => {
    const bad: RunStructure = [
      {
        role: 'main',
        elements: [{ times: 2, elements: [{ times: 2, elements: [{ times: 2, elements: [work(dist(100), null)] }] }] }],
      },
    ];
    expect(safeParseRunStructure(bad).success).toBe(false);
  });
});

describe('#61 · phase/role rules', () => {
  test('a structure needs exactly one main', () => {
    const noMain: RunStructure = [{ role: 'warmup', elements: [work(dur(600), paceZone(1))] }];
    expect(safeParseRunStructure(noMain).success).toBe(false);
  });
  test('phases must be ordered warmup → main → cooldown', () => {
    const wrong: RunStructure = [
      { role: 'cooldown', elements: [work(dur(600), paceZone(1))] },
      { role: 'main', elements: [work(dur(600), paceZone(4))] },
    ];
    expect(safeParseRunStructure(wrong).success).toBe(false);
  });
});

describe('#61 · recovery_mode rules', () => {
  test("'parado' requires a duration measure", () => {
    const bad: RunStructure = [
      { role: 'main', elements: [work(dist(400), null), { kind: 'recovery', measure: dist(200), target: null, recovery_mode: 'parado' }] },
    ];
    expect(safeParseRunStructure(bad).success).toBe(false);
  });
  test('recovery_mode only on recovery segments', () => {
    const bad: RunStructure = [
      { role: 'main', elements: [{ kind: 'work', measure: dur(120), target: null, recovery_mode: 'trote' }] },
    ];
    expect(safeParseRunStructure(bad).success).toBe(false);
  });
});

// ── Legacy → structure (the real-shape ingest, mirrored from DB samples) ──────
describe('#61 · legacyToStructure ingests real legacy run shapes', () => {
  const cases: { name: string; legacy: Prescription; expectWorks: number }[] = [
    {
      name: 'uniform duration series (5×6′ @ RPE8, rest 120)',
      legacy: parsePrescription({
        scheme: 'interval',
        modality: 'run',
        sets: Array.from({ length: 5 }, () => ({ rest_s: 120, target: { kind: 'rpe', value: 8 }, measure: { kind: 'duration', seconds: 360 } })),
      }),
      expectWorks: 5,
    },
    {
      name: 'descending pyramid with per-set rest (1200/1200/1000/800/800/400/400)',
      legacy: parsePrescription({
        scheme: 'interval',
        modality: 'run',
        sets: [1200, 1200, 1000, 800, 800, 400, 400].map((m, i) => ({ rest_s: [105, 105, 90, 60, 60, 45, 45][i], measure: { kind: 'distance', meters: m } })),
      }),
      expectWorks: 7,
    },
    {
      name: 'rounds+work_s intervals (rounds 5, work_s 30)',
      legacy: parsePrescription({ scheme: 'interval', modality: 'run', rounds: 5, work_s: 30 }),
      expectWorks: 5,
    },
    {
      name: 'representative single set + rounds (4×80m @ RPE7, block rest 60)',
      legacy: parsePrescription({ scheme: 'interval', modality: 'run', rounds: 4, rest_s: 60, sets: [{ target: { kind: 'rpe', value: 7 }, measure: { kind: 'distance', meters: 80 } }] }),
      expectWorks: 4,
    },
    {
      name: 'steady Z2 4200s (hr_zone → pace_zone)',
      legacy: parsePrescription({ scheme: 'steady', modality: 'run', sets: [{ target: { kind: 'hr_zone', value: 2 }, measure: { kind: 'duration', seconds: 4200 } }] }),
      expectWorks: 1,
    },
    {
      name: 'steady rpe band 8-9 (3600s)',
      legacy: parsePrescription({ scheme: 'steady', modality: 'run', target: { kind: 'rpe', min: 8, max: 9 }, total_s: 3600 }),
      expectWorks: 1,
    },
  ];

  for (const c of cases) {
    test(`ingests: ${c.name}`, () => {
      const s = legacyToStructure(c.legacy);
      expect(s, c.name).not.toBeNull();
      const works = flattenSegments(s!).filter((seg) => seg.kind === 'work');
      expect(works.length).toBe(c.expectWorks);
      // The seeded structure is itself valid.
      expect(safeParseRunStructure(s!).success).toBe(true);
    });
  }

  test('run hr_zone is reinterpreted as a pace_zone (system resolves run zones as pace)', () => {
    const s = legacyToStructure(parsePrescription({ scheme: 'steady', modality: 'run', target: { kind: 'hr_zone', value: 2 }, total_s: 600 }))!;
    const w = flattenSegments(s).find((seg) => seg.kind === 'work')!;
    expect(w.target).toEqual({ type: 'pace_zone', zone: 2 });
  });

  test('rpe band survives the round-trip legacy → structure → legacy', () => {
    const s = legacyToStructure(parsePrescription({ scheme: 'steady', modality: 'run', target: { kind: 'rpe', min: 8, max: 9 }, total_s: 3600 }))!;
    const back = structureToLegacy(s);
    expect(back.scheme).toBe('steady');
    expect(back.total_s).toBe(3600);
    expect(back.target).toEqual({ kind: 'rpe', min: 8, max: 9 });
  });

  test('a metcon-family run (for_time) is NOT forced into a structure', () => {
    expect(legacyToStructure(parsePrescription({ scheme: 'for_time', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 1000 } }] }))).toBeNull();
  });

  test('an underspecified interval (rounds+rest, no work measure) stays on the legacy form', () => {
    expect(legacyToStructure(parsePrescription({ scheme: 'interval', modality: 'run', rounds: 5, rest_s: 90, target: { kind: 'rpe', min: 8, max: 9 } }))).toBeNull();
  });
});

// ── Structure → legacy flatten (the wire-compat summary) ──────────────────────
describe('#61 · structureToLegacy flatten for the installed iOS app', () => {
  test('nested series → total rounds + first work + first rest', () => {
    const s: RunStructure = [
      {
        role: 'main',
        elements: [{ times: 3, elements: [{ times: 4, elements: [work(dist(400), paceZone(4)), rec(dur(60), 'parado')] }, rec(dur(180), 'parado')] }],
      },
    ];
    const flat = structureToLegacy(s);
    expect(flat.scheme).toBe('intervals');
    expect(flat.rounds).toBe(12); // 3×4 total work bouts
    // first work as a representative distance set, with the first rest attached so
    // the scalar summary surfaces it for the installed iOS app.
    expect(flat.sets).toEqual([{ measure: { kind: 'distance', meters: 400 }, rest_s: 60 }]);
    expect(flat.rest_s).toBe(60); // first duration recovery
    expect(flat.target).toEqual({ kind: 'hr_zone', value: 4 }); // pace_zone → legacy zone channel
  });

  test('single steady bout → scheme steady + total_s + target', () => {
    const flat = structureToLegacy([{ role: 'main', elements: [work(dur(2700), paceZone(2))] }]);
    expect(flat.scheme).toBe('steady');
    expect(flat.total_s).toBe(2700);
    expect(flat.target).toEqual({ kind: 'hr_zone', value: 2 });
  });
});
