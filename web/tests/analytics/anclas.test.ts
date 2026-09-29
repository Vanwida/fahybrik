// El resolvedor único de anclas (shared/domain/analytics/anclas.ts), probado
// peldaño a peldaño: medida > declarada > estimada > poblacional, por modalidad,
// y la equivalencia exacta split ↔ vatios de un Concept2.

import { describe, expect, test } from 'vitest';
import {
  anclaMasDebil,
  anclasVacias,
  resolverAnclas,
  split500DeWatts,
  wattsDeSplit500,
  type EntradaAnclas,
} from '@fahybrid/shared/domain/analytics/anclas';
import { trainingPacesForVdot, vdotFromEffort } from '@fahybrid/shared/domain/running/vdot';

function entrada(overrides: Partial<EntradaAnclas> = {}): EntradaAnclas {
  return {
    pulso: {
      lthr_bpm: null,
      lthr_declared_bpm: null,
      max_hr_bpm: null,
      age_years: null,
      lthr_desde_iso: null,
      lthr_declarado_desde_iso: null,
    },
    perfiles: [],
    declaraciones: [],
    marcas: [],
    ...overrides,
  };
}

describe('pulso — la escalera de FC con su peldaño', () => {
  test('sin nada → null', () => {
    expect(resolverAnclas(entrada()).pulso).toBeNull();
  });

  test('un test manda sobre todo lo demás → medida', () => {
    const a = resolverAnclas(
      entrada({
        pulso: { lthr_bpm: 170, lthr_declared_bpm: 160, max_hr_bpm: 195, age_years: 40, lthr_desde_iso: '2026-05-01T10:00:00Z', lthr_declarado_desde_iso: '2026-06-01T10:00:00Z' },
      }),
    ).pulso;
    expect(a).toMatchObject({ valor: 170, ancla: 'medida', fuente: 'lthr_measured', desde_iso: '2026-05-01T10:00:00Z' });
  });

  test('declarado → declarada; 0,88 × máxima medida → estimada; la edad → poblacional', () => {
    expect(resolverAnclas(entrada({ pulso: { lthr_bpm: null, lthr_declared_bpm: 165, max_hr_bpm: 195, age_years: 40, lthr_desde_iso: null, lthr_declarado_desde_iso: null } })).pulso).toMatchObject({ valor: 165, ancla: 'declarada' });
    const est = resolverAnclas(entrada({ pulso: { lthr_bpm: null, lthr_declared_bpm: null, max_hr_bpm: 200, age_years: 40, lthr_desde_iso: null, lthr_declarado_desde_iso: null } })).pulso;
    expect(est).toMatchObject({ ancla: 'estimada', fuente: 'from_max_hr' });
    expect(est!.valor).toBeCloseTo(176, 5);
    const pob = resolverAnclas(entrada({ pulso: { lthr_bpm: null, lthr_declared_bpm: null, max_hr_bpm: null, age_years: 44, lthr_desde_iso: null, lthr_declarado_desde_iso: null } })).pulso;
    expect(pob).toMatchObject({ ancla: 'poblacional', fuente: 'from_age' });
    // Tanaka: 208 − 0,7 × 44 = 177,2; × 0,88 = 155,9
    expect(pob!.valor).toBeCloseTo(155.94, 1);
  });
});

describe('ritmo — por modalidad', () => {
  test('el perfil de un test (sin revisión) → medida; en revisión, se salta', () => {
    const conTest = resolverAnclas(
      entrada({ perfiles: [{ modality: 'run', threshold_s: 245, source: 'coach_test', needs_review: false, recorded_at_iso: '2026-06-01T00:00:00Z' }] }),
    );
    expect(conTest.ritmo.run).toMatchObject({ valor: 245, ancla: 'medida', fuente: 'perfil_test' });
    const enRevision = resolverAnclas(
      entrada({ perfiles: [{ modality: 'run', threshold_s: 245, source: 'athlete_test', needs_review: true, recorded_at_iso: '2026-06-01T00:00:00Z' }] }),
    );
    expect(enRevision.ritmo.run).toBeNull();
  });

  test('la marca del test también es medida', () => {
    const a = resolverAnclas(entrada({ marcas: [{ exercise_slug: 'row_threshold_s_per_500m', value: 118, source: 'athlete_test', recorded_at_iso: '2026-06-01T00:00:00Z' }] }));
    expect(a.ritmo.row).toMatchObject({ valor: 118, ancla: 'medida', fuente: 'marca_test' });
  });

  test('declarada de un toque gana al alta si es más reciente; si no, manda el alta', () => {
    const base = {
      marcas: [{ exercise_slug: 'run_threshold_s_per_km', value: 260, source: 'onboarding', recorded_at_iso: '2026-05-01T00:00:00Z' }],
    };
    const toqueNuevo = resolverAnclas(
      entrada({ ...base, declaraciones: [{ kind: 'run_s_per_km', value: 250, declared_by: 'coach', declared_at_iso: '2026-07-01T00:00:00Z' }] }),
    );
    expect(toqueNuevo.ritmo.run).toMatchObject({ valor: 250, ancla: 'declarada', fuente: 'declarada_coach' });
    const toqueViejo = resolverAnclas(
      entrada({ ...base, declaraciones: [{ kind: 'run_s_per_km', value: 250, declared_by: 'athlete', declared_at_iso: '2026-04-01T00:00:00Z' }] }),
    );
    expect(toqueViejo.ritmo.run).toMatchObject({ valor: 260, ancla: 'declarada', fuente: 'onboarding' });
  });

  test('el perfil derivado del alta → estimada', () => {
    const a = resolverAnclas(entrada({ perfiles: [{ modality: 'ski', threshold_s: 130, source: 'onboarding_auto', needs_review: true, recorded_at_iso: '2026-05-01T00:00:00Z' }] }));
    expect(a.ritmo.ski).toMatchObject({ valor: 130, ancla: 'estimada', fuente: 'perfil_onboarding_auto' });
  });

  test('correr: sin perfil ni declaración, el umbral sale del VDOT de la marca más reciente → estimada', () => {
    const a = resolverAnclas(
      entrada({
        marcas: [
          { exercise_slug: 'run_5k', value: 1200, source: 'registered', recorded_at_iso: '2026-06-01T00:00:00Z' },
          { exercise_slug: 'run_10k', value: 2700, source: 'registered', recorded_at_iso: '2026-03-01T00:00:00Z' },
        ],
      }),
    );
    const esperado = trainingPacesForVdot(vdotFromEffort({ distance_meters: 5000, duration_seconds: 1200 }))!.threshold_s_per_km;
    expect(a.ritmo.run).toMatchObject({ valor: esperado, ancla: 'estimada', fuente: 'vdot_run_5k' });
    // Un 5K en 20:00 (4:00/km) da un umbral algo más lento que el ritmo del 5K.
    expect(esperado).toBeGreaterThan(240);
    expect(esperado).toBeLessThan(270);
  });

  test('remo y ski: el split medio del 2K / 1K → estimada; la bici no estima de ninguna marca', () => {
    const a = resolverAnclas(
      entrada({
        marcas: [
          { exercise_slug: 'row_2k', value: 480, source: 'athlete_test', recorded_at_iso: '2026-06-01T00:00:00Z' },
          { exercise_slug: 'ski_1k', value: 250, source: 'onboarding', recorded_at_iso: '2026-06-01T00:00:00Z' },
        ],
      }),
    );
    expect(a.ritmo.row).toMatchObject({ valor: 120, ancla: 'estimada' });
    expect(a.ritmo.ski).toMatchObject({ valor: 125, ancla: 'estimada' });
    expect(a.ritmo.bike).toBeNull();
  });
});

describe('potencia — vatios y split son la misma medida', () => {
  test('split 2:00 ↔ 202,5 W, y vuelta', () => {
    expect(wattsDeSplit500(120)).toBeCloseTo(202.55, 1);
    expect(split500DeWatts(wattsDeSplit500(120))).toBeCloseTo(120, 6);
    expect(wattsDeSplit500(0)).toBeNull();
    expect(split500DeWatts(null)).toBeNull();
  });

  test('remo y ski heredan el PELDAÑO del umbral de ritmo, convertido', () => {
    const a = resolverAnclas(entrada({ perfiles: [{ modality: 'row', threshold_s: 120, source: 'coach_test', needs_review: false, recorded_at_iso: '2026-06-01T00:00:00Z' }] }));
    expect(a.potencia.row).toMatchObject({ ancla: 'medida', fuente: 'perfil_test→watts' });
    expect(a.potencia.row!.valor).toBeCloseTo(202.55, 1);
    expect(a.potencia.ski).toBeNull();
  });

  test('bici: el FTP de un test → medida; declarado de un toque → declarada; sin nada, el split convertido', () => {
    const test = resolverAnclas(entrada({ marcas: [{ exercise_slug: 'ftp_watts', value: 250, source: 'coach_test', recorded_at_iso: '2026-06-01T00:00:00Z' }] }));
    expect(test.potencia.bike).toMatchObject({ valor: 250, ancla: 'medida' });
    const declarada = resolverAnclas(entrada({ declaraciones: [{ kind: 'bike_watts', value: 230, declared_by: 'athlete', declared_at_iso: '2026-06-01T00:00:00Z' }] }));
    expect(declarada.potencia.bike).toMatchObject({ valor: 230, ancla: 'declarada' });
    const desdeSplit = resolverAnclas(entrada({ declaraciones: [{ kind: 'bike_s_per_500m', value: 60, declared_by: 'athlete', declared_at_iso: '2026-06-01T00:00:00Z' }] }));
    expect(desdeSplit.potencia.bike).toMatchObject({ ancla: 'declarada' });
    expect(desdeSplit.potencia.bike!.valor).toBeCloseTo(wattsDeSplit500(60)!, 6);
  });
});

describe('utilidades', () => {
  test('anclaMasDebil: la poblacional pesa más; null no pesa', () => {
    expect(anclaMasDebil(['medida', null, 'estimada'])).toBe('estimada');
    expect(anclaMasDebil(['declarada', 'poblacional'])).toBe('poblacional');
    expect(anclaMasDebil([null, null])).toBeNull();
  });

  test('anclasVacias: nada resuelto', () => {
    const v = anclasVacias();
    expect(v.pulso).toBeNull();
    expect(Object.values(v.ritmo).every((x) => x === null)).toBe(true);
    expect(Object.values(v.potencia).every((x) => x === null)).toBe(true);
  });
});
