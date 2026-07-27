// Pure unit tests for the training × race CROSS engine (no DB).
// Exercises every domain rule: erg ÷2 normalization, the fresh/fatigued cut,
// the observado → estimado → sin_datos cascade, dropped-unclassified efforts,
// run-lap mean, functional seconds, the transfer-delta sign, and the gates.

import { describe, expect, it } from 'vitest';
import {
  classifyEffort,
  computeRaceTransfer,
  FRESH_PRIOR_WORK_MAX_S,
  type ObservedEffort,
  type RaceTransferInput,
  type StationTransferInput,
} from '@fahybrid/shared/domain/race-transfer';

function effort(partial: Partial<ObservedEffort> & Pick<ObservedEffort, 'value_s'>): ObservedEffort {
  return { context_format: 'steady', prior_work_s: 0, position: 0, ...partial };
}

function station(partial: Partial<StationTransferInput> & Pick<StationTransferInput, 'kind'>): StationTransferInput {
  return {
    index: 2,
    slug: 'x',
    label: 'X',
    race_index: 2,
    observed: [],
    threshold_s: null,
    ...partial,
  };
}

function input(partial: Partial<RaceTransferInput>): RaceTransferInput {
  return { race: null, only_doubles: false, stations: [], ...partial };
}

const RACE: NonNullable<RaceTransferInput['race']> = {
  id: 747,
  name: 'HYROX Valencia',
  date: '2026-03-14',
  run_splits: [300, 292, 296, 302, 298, 306, 284, 282], // mean = 295
  station_splits: [
    { index: 2, seconds: 295 }, // ski (÷2 → 147.5)
    { index: 10, seconds: 300 }, // row (÷2 → 150)
    { index: 16, seconds: 345 }, // wall balls (functional seconds)
  ],
};

describe('classifyEffort', () => {
  it('a HYROX simulation is always fatigado, even with zero prior work', () => {
    expect(classifyEffort(effort({ value_s: 100, context_format: 'hyrox_sim', prior_work_s: 0, position: 0 }))).toBe('fatigado');
  });

  it('prior work at/above the cut is fatigado; below is fresco', () => {
    expect(classifyEffort(effort({ value_s: 100, context_format: 'steady', prior_work_s: FRESH_PRIOR_WORK_MAX_S }))).toBe('fatigado');
    expect(classifyEffort(effort({ value_s: 100, context_format: 'steady', prior_work_s: FRESH_PRIOR_WORK_MAX_S - 1 }))).toBe('fresco');
  });

  it('null prior work is fresco ONLY at position 0; unclassifiable mid-session', () => {
    expect(classifyEffort(effort({ value_s: 100, context_format: 'intervals', prior_work_s: null, position: 0 }))).toBe('fresco');
    expect(classifyEffort(effort({ value_s: 100, context_format: 'intervals', prior_work_s: null, position: 1 }))).toBeNull();
  });

  it('a non-fresh context (e.g. amrap) with low prior work is unclassifiable', () => {
    expect(classifyEffort(effort({ value_s: 100, context_format: 'amrap', prior_work_s: 10, position: 0 }))).toBeNull();
  });
});

describe('computeRaceTransfer — unit normalization', () => {
  it('erg race split (1000 m) is halved to per-500m before comparing', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [station({ kind: 'ski', index: 2, race_index: 2, slug: 'ski-erg', label: 'SkiErg 1km', threshold_s: 132 })],
      }),
    );
    const ski = res.stations[0]!;
    expect(ski.unit).toBe('per_500m');
    expect(ski.race_seconds).toBe(147.5); // 295 / 2
    expect(ski.trained.tier).toBe('estimado'); // no efforts → threshold
    expect(ski.trained.value_s).toBe(132);
    // (147.5 − 132) / 132 = 0.1174 → +12 %
    expect(ski.transfer_delta_pct).toBe(12);
  });

  it('the run compares the LAP MEAN in per-km', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [station({ kind: 'run', index: 0, race_index: null, slug: 'run', label: 'Carrera a pie', threshold_s: 255 })],
      }),
    );
    const run = res.stations[0]!;
    expect(run.unit).toBe('per_km');
    expect(run.race_seconds).toBe(295); // mean of the 8 laps
    expect(run.trained.tier).toBe('estimado');
    expect(run.transfer_delta_pct).toBe(16); // (295−255)/255 = 15.7 → +16
  });

  it('a functional station compares raw seconds (no division)', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'functional',
            index: 16,
            race_index: 16,
            slug: 'hyrox-wall-balls',
            label: 'Wall ball 100',
            observed: [effort({ value_s: 300, context_format: 'sets', prior_work_s: 0, position: 0 })],
          }),
        ],
      }),
    );
    const wb = res.stations[0]!;
    expect(wb.unit).toBe('seconds');
    expect(wb.race_seconds).toBe(345);
    expect(wb.trained.tier).toBe('observado');
    expect(wb.trained.value_s).toBe(300);
    expect(wb.transfer_delta_pct).toBe(15); // (345−300)/300 = 15 %
  });
});

describe('computeRaceTransfer — evidence tiers', () => {
  it('paced: the threshold is the headline; observed efforts surface as BEST-effort context', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'run',
            index: 0,
            race_index: null,
            slug: 'run',
            label: 'Carrera a pie',
            threshold_s: 255,
            observed: [
              effort({ value_s: 270, context_format: 'steady', prior_work_s: 0, position: 0 }), // fresco
              effort({ value_s: 280, context_format: 'steady', prior_work_s: 100, position: 1 }), // fresco
              effort({ value_s: 240, context_format: 'hyrox_sim', prior_work_s: 900, position: 3 }), // fatigado
            ],
          }),
        ],
      }),
    );
    const run = res.stations[0]!;
    expect(run.trained.tier).toBe('estimado'); // the calibrated threshold wins the headline
    expect(run.trained.value_s).toBe(255);
    expect(run.trained.contexto?.fresco_s).toBe(270); // BEST fresh (min 270,280), NOT the mean 275
    expect(run.trained.contexto?.fatigado_s).toBe(240);
    expect(run.trained.n_efforts).toBe(3); // efforts still counted, as context
    expect(run.transfer_delta_pct).toBe(16); // (295−255)/255
  });

  it('paced WITHOUT a threshold uses the BEST fresh effort, never the mean', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'run',
            index: 0,
            race_index: null,
            slug: 'run',
            label: 'Carrera a pie',
            threshold_s: null,
            observed: [
              effort({ value_s: 330, context_format: 'steady', prior_work_s: 0, position: 0 }), // easy Z2 fresco
              effort({ value_s: 250, context_format: 'intervals', prior_work_s: 50, position: 1 }), // fast rep fresco
            ],
          }),
        ],
      }),
    );
    const run = res.stations[0]!;
    expect(run.trained.tier).toBe('observado');
    expect(run.trained.value_s).toBe(250); // best (min), not the mean 290
    expect(run.trained.contexto?.fresco_s).toBe(250);
    expect(run.transfer_delta_pct).toBe(18); // (295−250)/250
  });

  it('paced with ONLY fatigued efforts and no threshold → gate (no capacity anchor)', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'ski',
            index: 2,
            race_index: 2,
            slug: 'ski-erg',
            label: 'SkiErg 1km',
            threshold_s: null,
            observed: [effort({ value_s: 140, context_format: 'hyrox_sim', prior_work_s: 900, position: 4 })],
          }),
        ],
      }),
    );
    const ski = res.stations[0]!;
    expect(ski.trained.tier).toBe('sin_datos');
    expect(ski.trained.value_s).toBeNull();
    expect(ski.trained.n_efforts).toBe(0);
    expect(ski.transfer_delta_pct).toBeNull();
  });

  it('efforts that cannot be classified fall through to estimado (never observado)', () => {
    // Single effort with null prior work mid-session → unclassifiable → dropped.
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'row',
            index: 10,
            race_index: 10,
            slug: 'row',
            label: 'Row 1km',
            threshold_s: 112,
            observed: [effort({ value_s: 119.88, context_format: 'intervals', prior_work_s: null, position: 1 })],
          }),
        ],
      }),
    );
    const row = res.stations[0]!;
    expect(row.trained.tier).toBe('estimado');
    expect(row.trained.value_s).toBe(112);
    expect(row.race_seconds).toBe(150); // 300 / 2
    expect(row.transfer_delta_pct).toBe(34); // (150−112)/112 = 33.9 → +34
  });

  it('a functional station with no efforts is sin_datos (no threshold fallback)', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [station({ kind: 'functional', index: 16, race_index: 16, slug: 'hyrox-wall-balls', label: 'Wall ball 100', threshold_s: null })],
      }),
    );
    const wb = res.stations[0]!;
    expect(wb.trained.tier).toBe('sin_datos');
    expect(wb.trained.value_s).toBeNull();
    expect(wb.trained.unit).toBeNull();
    expect(wb.transfer_delta_pct).toBeNull(); // no trained side → no delta (never a fake 0)
  });

  it('fatigado-only observed still yields observado with fatigado as the reference', () => {
    const res = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            kind: 'functional',
            index: 16,
            race_index: 16,
            slug: 'hyrox-wall-balls',
            label: 'Wall ball 100',
            observed: [effort({ value_s: 360, context_format: 'hyrox_sim', prior_work_s: 1200, position: 5 })],
          }),
        ],
      }),
    );
    const wb = res.stations[0]!;
    expect(wb.trained.tier).toBe('observado');
    expect(wb.trained.contexto?.fresco_s).toBeNull();
    expect(wb.trained.contexto?.fatigado_s).toBe(360);
    expect(wb.trained.value_s).toBe(360);
  });
});

// ── La marca medida encabeza la jerarquía ─────────────────────────────────────
describe('computeRaceTransfer — measured marks top the trained hierarchy', () => {
  /**
   * THE BUG THIS PINS. «Probarme» wrote to `athlete_benchmarks` from the day
   * #Marcas shipped and no prediction path read a row of it — an athlete could
   * time-trial a 1000 m and watch their projection not move. `measured` is that
   * cable. It has to beat BOTH the calibrated threshold and logged training,
   * because it is the athlete deliberately finding out what they can hold.
   */
  it('a measured mark outranks the zone threshold AND the training efforts', () => {
    const base = {
      kind: 'ski' as const,
      index: 2,
      race_index: 2,
      slug: 'ski-erg',
      label: 'SkiErg 1km',
      threshold_s: 132,
      observed: [effort({ value_s: 128 })],
    };
    const withoutMark = computeRaceTransfer(input({ race: RACE, stations: [station(base)] })).stations[0]!;
    expect(withoutMark.trained.value_s).toBe(132);
    expect(withoutMark.trained.source).toBe('umbral');

    const withMark = computeRaceTransfer(
      input({
        race: RACE,
        stations: [
          station({
            ...base,
            measured: { value_s: 120, source: 'marca', age_days: 7, weakened: false, from_slug: 'ski_1k' },
          }),
        ],
      }),
    ).stations[0]!;
    expect(withMark.trained.value_s).toBe(120);
    expect(withMark.trained.source).toBe('marca');
    expect(withMark.trained.from_slug).toBe('ski_1k');
    expect(withMark.trained.age_days).toBe(7);
    // A mark is a real measurement of a DIFFERENT effort than the race segment,
    // so it stays 'estimado' — calling it observado would overclaim.
    expect(withMark.trained.tier).toBe('estimado');
    // And the cross delta now reads against the mark, not the threshold.
    expect(withMark.race_seconds).toBe(147.5);
    expect(withMark.transfer_delta_pct).toBe(23); // (147.5−120)/120 = 22.9
  });

  it('the watch VO₂max fills in when there is no mark, tagged as itself', () => {
    const res = computeRaceTransfer(
      input({
        stations: [
          station({
            kind: 'run',
            index: 0,
            race_index: null,
            slug: 'run',
            label: 'Carrera a pie',
            measured: { value_s: 300, source: 'vo2max', age_days: 2, weakened: false, from_slug: null },
          }),
        ],
      }),
    );
    expect(res.stations[0]!.trained).toMatchObject({ value_s: 300, source: 'vo2max', tier: 'estimado' });
  });

  it('training efforts still declare themselves when nothing was measured', () => {
    const res = computeRaceTransfer(
      input({
        stations: [
          station({ kind: 'functional', index: 16, race_index: 16, slug: 'hyrox-wall-balls', label: 'Wall ball 100', observed: [effort({ value_s: 300 })] }),
        ],
      }),
    );
    expect(res.stations[0]!.trained).toMatchObject({ source: 'ejecuciones', tier: 'observado' });
  });
});

describe('computeRaceTransfer — gates & delta sign', () => {
  it('no race → no_singles_race, trained side still populated, race/delta null', () => {
    const res = computeRaceTransfer(
      input({
        race: null,
        only_doubles: false,
        stations: [station({ kind: 'ski', index: 2, race_index: 2, slug: 'ski-erg', label: 'SkiErg 1km', threshold_s: 132 })],
      }),
    );
    expect(res.availability).toBe('no_singles_race');
    expect(res.race_id).toBeNull();
    expect(res.stations[0]!.race_seconds).toBeNull();
    expect(res.stations[0]!.transfer_delta_pct).toBeNull();
    expect(res.stations[0]!.trained.tier).toBe('estimado'); // trained side survives
  });

  it('only doubles → only_doubles gate', () => {
    const res = computeRaceTransfer(input({ race: null, only_doubles: true, stations: [] }));
    expect(res.availability).toBe('only_doubles');
  });

  it('a race FASTER than the trained level yields a negative delta', () => {
    const res = computeRaceTransfer(
      input({
        race: { id: 1, name: 'r', date: null, run_splits: [], station_splits: [{ index: 2, seconds: 240 }] },
        stations: [station({ kind: 'ski', index: 2, race_index: 2, slug: 'ski-erg', label: 'SkiErg 1km', threshold_s: 132 })],
      }),
    );
    // race 240/2 = 120 per_500m vs trained 132 → (120−132)/132 = −9 %
    expect(res.stations[0]!.transfer_delta_pct).toBe(-9);
  });

  it('a missing station split → race_seconds null even with a race present', () => {
    const res = computeRaceTransfer(
      input({
        race: { id: 1, name: 'r', date: null, run_splits: [], station_splits: [] },
        stations: [station({ kind: 'functional', index: 16, race_index: 16, slug: 'w', label: 'W', observed: [effort({ value_s: 300, context_format: 'sets' })] })],
      }),
    );
    expect(res.availability).toBe('ok');
    expect(res.stations[0]!.race_seconds).toBeNull();
    expect(res.stations[0]!.transfer_delta_pct).toBeNull();
    expect(res.stations[0]!.trained.tier).toBe('observado');
  });
});
