import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  computeDoblesGap,
  splitStationPrediction,
  type CohortRace,
  type DoblesGapInput,
  type PredictionTier,
  type RaceFractionSource,
  type SegmentDef,
  type SoloPrediction,
  type StationCarrier,
} from '@fahybrid/shared/domain/dobles-gap';

// Pure engine tests for the DOUBLES gap — no DB. They pin the combination rules
// (runs/roxzone governed by the slower athlete, station split weighting, the
// budget fraction fallback order, exact normalization to the goal, and the honest
// gates) independently of the web loader.

const STATION_INDICES = [2, 4, 6, 8, 10, 12, 14, 16];

function makeSegments(): SegmentDef[] {
  return [
    { slug: 'run', label_es: 'Carrera a pie', kind: 'run', station_index: null },
    ...STATION_INDICES.map((i) => ({
      slug: `st-${i}`,
      label_es: `Estación ${i}`,
      kind: 'station' as const,
      station_index: i,
    })),
    { slug: 'roxzone', label_es: 'Roxzone', kind: 'roxzone', station_index: null },
  ];
}

function solo(predicted_s: number | null, tier: PredictionTier): SoloPrediction {
  return { predicted_s, tier };
}

/** A constant per-segment solo list (run, 8 stations, roxzone), all observado. */
function observedSolos(run: number, station: number, rox: number): SoloPrediction[] {
  return [
    solo(run, 'observado'),
    ...STATION_INDICES.map(() => solo(station, 'observado')),
    solo(rox, 'observado'),
  ];
}

function baseInput(over: Partial<DoblesGapInput> = {}): DoblesGapInput {
  const segments = makeSegments();
  return {
    goal_total_s: 3900,
    segments,
    self_solos: observedSolos(200, 60, 40),
    partner_solos: observedSolos(220, 80, 50),
    carriers: new Map<number, StationCarrier>(),
    cohort_doubles: [],
    own_doubles: null,
    faster_singles: null,
    ...over,
  };
}

function bySlug(res: ReturnType<typeof computeDoblesGap>, slug: string) {
  const s = res.segments.find((x) => x.slug === slug);
  if (!s) throw new Error(`segment ${slug} not found`);
  return s;
}

/** A complete race fraction source with a distinctive run-heavy shape. */
function fractionSource(run: number, station: number, rox: number): RaceFractionSource {
  const station_s: Record<number, number> = {};
  for (const i of STATION_INDICES) station_s[i] = station;
  return { run_total_s: run, station_s, roxzone_s: rox };
}

function cohortRace(run: number, station: number, rox: number): CohortRace {
  const src = fractionSource(run, station, rox);
  const total = run + station * STATION_INDICES.length + rox;
  return { ...src, result_s: total };
}

describe('computeDoblesGap — pair prediction by carrier', () => {
  it('runs and roxzone go together: the SLOWER athlete governs (max)', () => {
    const res = computeDoblesGap(baseInput());
    const run = bySlug(res, 'run');
    expect(run.carrier).toBe('together');
    expect(run.self_share).toBeNull();
    expect(run.pair_predicted_s).toBe(220); // max(200, 220)
    expect(run.self_solo_s).toBe(200);
    expect(run.partner_solo_s).toBe(220);
    const rox = bySlug(res, 'roxzone');
    expect(rox.carrier).toBe('together');
    expect(rox.pair_predicted_s).toBe(50); // max(40, 50)
  });

  it('a split station weights share·self + (1−share)·partner', () => {
    const carriers = new Map<number, StationCarrier>([[2, { carrier: 'split', self_share: 0.7 }]]);
    const res = computeDoblesGap(baseInput({ carriers }));
    const st = bySlug(res, 'st-2');
    expect(st.carrier).toBe('split');
    expect(st.self_share).toBe(0.7);
    // round(0.7*60 + 0.3*80) = round(42 + 24) = 66
    expect(st.pair_predicted_s).toBe(66);
    expect(st.self_solo_s).toBe(60);
    expect(st.partner_solo_s).toBe(80);
  });

  it('carrier self → self solo (share 1); carrier partner → partner solo (share 0)', () => {
    const carriers = new Map<number, StationCarrier>([
      [2, { carrier: 'self', self_share: 1 }],
      [4, { carrier: 'partner', self_share: 0 }],
    ]);
    const res = computeDoblesGap(baseInput({ carriers }));
    const s2 = bySlug(res, 'st-2');
    expect(s2.carrier).toBe('self');
    expect(s2.self_share).toBe(1);
    expect(s2.pair_predicted_s).toBe(60);
    const s4 = bySlug(res, 'st-4');
    expect(s4.carrier).toBe('partner');
    expect(s4.self_share).toBe(0);
    expect(s4.pair_predicted_s).toBe(80);
  });

  it('a station absent from the reparto defaults to a 50/50 split', () => {
    const res = computeDoblesGap(baseInput()); // empty carriers
    const st = bySlug(res, 'st-6');
    expect(st.carrier).toBe('split');
    expect(st.self_share).toBe(0.5);
    expect(st.pair_predicted_s).toBe(70); // round(0.5*60 + 0.5*80)
  });

  it('a required side with no data makes the segment sin_datos, held at budget', () => {
    // Partner has no run prediction → the together run is sin_datos.
    const partner = observedSolos(220, 80, 50);
    partner[0] = solo(null, 'sin_datos');
    const res = computeDoblesGap(baseInput({ partner_solos: partner }));
    const run = bySlug(res, 'run');
    expect(run.tier).toBe('sin_datos');
    expect(run.pair_predicted_s).toBe(run.budget_s); // held at budget
    expect(run.self_solo_s).toBe(200);
    expect(run.partner_solo_s).toBeNull();
  });
});

describe('computeDoblesGap — budget fraction fallback order', () => {
  it('uses the DOUBLES cohort when ≥ 5 races are present', () => {
    const cohort = Array.from({ length: 5 }, () => cohortRace(1600, 250, 300));
    const res = computeDoblesGap(baseInput({ cohort_doubles: cohort }));
    expect(res.budget_source).toBe('cohorte_dobles');
  });

  it('falls to the own doubles race when the cohort is too small', () => {
    const cohort = Array.from({ length: 4 }, () => cohortRace(1600, 250, 300));
    const res = computeDoblesGap(baseInput({ cohort_doubles: cohort, own_doubles: fractionSource(1600, 250, 300) }));
    expect(res.budget_source).toBe('tu_dobles');
  });

  it('falls to the faster athlete singles reference when no doubles history', () => {
    const res = computeDoblesGap(baseInput({ faster_singles: fractionSource(1600, 250, 300) }));
    expect(res.budget_source).toBe('singles_referencia');
  });

  it('falls to the pair own predicted proportions when no race history at all', () => {
    const res = computeDoblesGap(baseInput());
    expect(res.budget_source).toBe('prediccion');
  });

  it('falls to an even split when there is neither history nor a prediction', () => {
    const segments = makeSegments();
    const allEmpty = segments.map(() => solo(null, 'sin_datos'));
    const res = computeDoblesGap(
      baseInput({ self_solos: allEmpty, partner_solos: allEmpty }),
    );
    // no_data availability, but a goal is still decomposed evenly for scale.
    expect(res.budget_source).toBe('reparto_uniforme');
  });
});

describe('computeDoblesGap — normalization, goal, and availability', () => {
  it('budgets sum EXACTLY to the goal (largest-remainder)', () => {
    const res = computeDoblesGap(baseInput({ goal_total_s: 3900 }));
    const sum = res.segments.reduce((a, s) => a + s.budget_s, 0);
    expect(sum).toBe(3900);
    for (const s of res.segments) expect(Number.isInteger(s.budget_s)).toBe(true);
  });

  it('goal null → budget_s equals the pair prediction (scale only), goal_s null', () => {
    const res = computeDoblesGap(baseInput({ goal_total_s: null }));
    expect(res.goal_s).toBeNull();
    for (const s of res.segments) expect(s.budget_s).toBe(s.pair_predicted_s);
    const sum = res.segments.reduce((a, s) => a + s.pair_predicted_s, 0);
    expect(res.predicted_total_s).toBe(sum);
  });

  it('availability ok when every segment is observado', () => {
    const res = computeDoblesGap(baseInput());
    expect(res.availability).toBe('ok');
  });

  it('availability partial when some segment is estimado', () => {
    const self = observedSolos(200, 60, 40);
    self[1] = solo(65, 'estimado');
    const res = computeDoblesGap(baseInput({ self_solos: self }));
    expect(res.availability).toBe('partial');
  });

  it('availability no_data (and null total) when neither athlete has any prediction', () => {
    const segments = makeSegments();
    const allEmpty = segments.map(() => solo(null, 'sin_datos'));
    const res = computeDoblesGap(baseInput({ self_solos: allEmpty, partner_solos: allEmpty }));
    expect(res.availability).toBe('no_data');
    expect(res.predicted_total_s).toBeNull();
  });
});

// El servidor manda: la app pinta delta_s y gap_s, no los rehace. Aquí se fija
// que salen del motor y que cuadran con lo que ya se emite.
describe('computeDoblesGap — las lecturas derivadas las da el motor', () => {
  it('delta_s de cada tramo = pair_predicted_s − budget_s', () => {
    const res = computeDoblesGap(baseInput({ goal_total_s: 3900 }));
    expect(res.segments).toHaveLength(10);
    for (const s of res.segments) expect(s.delta_s).toBe(s.pair_predicted_s - s.budget_s);
  });

  it('gap_s = predicted_total_s − goal_s', () => {
    const res = computeDoblesGap(baseInput({ goal_total_s: 3900 }));
    expect(res.gap_s).toBe(res.predicted_total_s! - 3900);
  });

  it('sin objetivo no hay gap, aunque haya predicho', () => {
    const res = computeDoblesGap(baseInput({ goal_total_s: null }));
    expect(res.predicted_total_s).not.toBeNull();
    expect(res.gap_s).toBeNull();
  });

  it('sin predicho tampoco hay gap', () => {
    const segments = makeSegments();
    const allEmpty = segments.map(() => solo(null, 'sin_datos'));
    const res = computeDoblesGap(baseInput({ self_solos: allEmpty, partner_solos: allEmpty }));
    expect(res.predicted_total_s).toBeNull();
    expect(res.gap_s).toBeNull();
  });
});

// La regla del reparto vive AQUÍ y la app la refleja para poder previsualizar el
// slider sin ida y vuelta al servidor. Los dos lados se clavan contra la MISMA
// tabla de casos (station-split-cases.json); si alguno se mueve, cae un test en
// uno de los dos lenguajes. El espejo Swift: DoblesRepartoMathTests.
describe('splitStationPrediction — la tabla que comparten servidor y app', () => {
  const cases = JSON.parse(
    readFileSync(new URL('../../../shared/domain/dobles-gap/station-split-cases.json', import.meta.url), 'utf8'),
  ) as Array<{ name: string; share: number; self_s: number; partner_s: number; expected_s: number }>;

  it('la tabla no está vacía (un fichero ilegible no puede pasar por verde)', () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  for (const c of cases) {
    it(`${c.name}: share ${c.share} · ${c.self_s}/${c.partner_s} → ${c.expected_s}`, () => {
      expect(splitStationPrediction(c.share, c.self_s, c.partner_s)).toBe(c.expected_s);
    });
  }

  it('el motor usa esa misma regla para un tramo con reparto', () => {
    for (const c of cases) {
      // Sólo los shares válidos: el motor los recibe ya acotados por el schema.
      if (c.share < 0 || c.share > 1) continue;
      const segments = makeSegments();
      const self = segments.map(() => solo(c.self_s, 'observado'));
      const partner = segments.map(() => solo(c.partner_s, 'observado'));
      const carriers = new Map<number, StationCarrier>([[2, { carrier: 'split', self_share: c.share }]]);
      const res = computeDoblesGap(
        baseInput({ goal_total_s: null, self_solos: self, partner_solos: partner, carriers }),
      );
      expect(bySlug(res, 'st-2').pair_predicted_s).toBe(c.expected_s);
    }
  });
});
