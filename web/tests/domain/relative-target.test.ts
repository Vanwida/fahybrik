/**
 * OBJETIVOS RELATIVOS A LAS MARCAS DEL ATLETA — card 130.
 *
 * Las líneas de este fichero son LITERALES de un macrociclo HYROX real de 12
 * semanas (84 días, 1.238 líneas). No son ejemplos inventados: son la fuente
 * contra la que se rompió el modelo antes de construirlo.
 *
 * Lo que se prueba, en este orden:
 *   1. que el tipo ACEPTA lo que el entrenador escribe de verdad,
 *   2. que RECHAZA lo que sería ambiguo (y por qué),
 *   3. que el resolutor da el número de ESE atleta, y `null` cuando le falta la
 *      marca — que es la respuesta honesta y no un cero.
 */
import { describe, expect, test } from 'vitest';
import { prescriptionSchema, targetSchema, type Target } from '@fahybrid/shared/domain/prescription/types';
import {
  anchorsFromBenchmarks,
  relativePhrase,
  resolvePrescriptionReferences,
  resolveRelativeTarget,
  type AthleteAnchors,
  type RelativeTarget,
} from '@fahybrid/shared/domain/prescription/resolve-relative';
import type { HyroxStationLoad, HyroxStationSlug } from '@fahybrid/shared/domain/hyrox/stations';
import type { AthleteBenchmarks } from '@fahybrid/shared/domain/methodology/zones';

const ok = (t: unknown) => targetSchema.safeParse(t).success;
const rel = (t: unknown): RelativeTarget => targetSchema.parse(t) as RelativeTarget;

// ---------------------------------------------------------------------------
// 1. Lo que el entrenador escribe de verdad, entra.
// ---------------------------------------------------------------------------
describe('el tipo acepta las formas reales del ciclo', () => {
  test('«1.000 m Run a ritmo HYROX» — una referencia de ritmo, sin más', () => {
    expect(ok({ kind: 'relative', ref: { of: 'race_pace', modality: 'run' } })).toBe(true);
  });

  test('«50 m Sled push a peso de competición» — la referencia sola', () => {
    expect(ok({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } })).toBe(true);
  });

  test('«15 m con 5-10 kg por encima del peso de competición» — delta con banda', () => {
    expect(
      ok({
        kind: 'relative',
        ref: { of: 'competition_load', station: 'hyrox-sled-push' },
        delta_kg: 5,
        delta_kg_max: 10,
      }),
    ).toBe(true);
  });

  test('«4 x 20 m con carga ligera, alrededor del 50 % del peso corporal»', () => {
    expect(ok({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 })).toBe(true);
  });

  test('«carga media» una vez traducida por el diccionario del coach → 60 % del peso de competición', () => {
    expect(
      ok({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' }, percent: 60 }),
    ).toBe(true);
  });

  test('un trineo sobrecargado por encima del 100 % sigue siendo una prescripción real', () => {
    expect(
      ok({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-pull' }, percent: 150 }),
    ).toBe(true);
  });

  test('ritmo de umbral por modalidad — el ancla de todas las zonas', () => {
    expect(ok({ kind: 'relative', ref: { of: 'threshold_pace', modality: 'row' } })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Lo que se rechaza, y el porqué de cada rechazo.
// ---------------------------------------------------------------------------
describe('el tipo rechaza lo ambiguo', () => {
  test('un porcentaje sobre un RITMO: «al 90 % del ritmo» no se sabe si es más rápido o más lento', () => {
    expect(ok({ kind: 'relative', ref: { of: 'race_pace', modality: 'run' }, percent: 90 })).toBe(false);
  });

  test('un delta en kilos sobre un ritmo no significa nada', () => {
    expect(ok({ kind: 'relative', ref: { of: 'threshold_pace', modality: 'run' }, delta_kg: 5 })).toBe(false);
  });

  test('peso corporal SIN porcentaje: para eso ya existe {kind:"bodyweight"}, y dice otra cosa', () => {
    expect(ok({ kind: 'relative', ref: { of: 'bodyweight' } })).toBe(false);
    expect(ok({ kind: 'bodyweight' })).toBe(true);
  });

  test('porcentaje Y delta a la vez: el resultado dependería del orden en que los leas', () => {
    expect(
      ok({
        kind: 'relative',
        ref: { of: 'competition_load', station: 'hyrox-wall-balls' },
        percent: 50,
        delta_kg: 5,
      }),
    ).toBe(false);
  });

  test('un techo sin suelo no dice nada — la convención del modelo es que el campo base ES el suelo', () => {
    expect(
      ok({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-wall-balls' }, percent_max: 80 }),
    ).toBe(false);
  });

  test('una banda del revés es una errata, no una banda', () => {
    expect(
      ok({
        kind: 'relative',
        ref: { of: 'competition_load', station: 'hyrox-sled-push' },
        delta_kg: 10,
        delta_kg_max: 5,
      }),
    ).toBe(false);
  });

  test('una estación que no existe no cuela', () => {
    expect(ok({ kind: 'relative', ref: { of: 'competition_load', station: 'trineo-inventado' } })).toBe(false);
  });

  test('un campo de más invalida la línea entera, como en todo el modelo', () => {
    expect(
      ok({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50, kg: 40 } as unknown),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. El resolutor: el número de ESTE atleta, o la verdad.
// ---------------------------------------------------------------------------
const SIN_MARCAS: AthleteBenchmarks = {};

// Un atleta con test de 5 km y objetivo de carrera puestos.
const CON_MARCAS: AthleteBenchmarks = {
  time_5k_seconds: 22 * 60, // 22:00 → 4:24/km
  hyrox_goal_run_total_seconds: 40 * 60, // 8 km en 40' → 5:00/km
  time_threshold_row_s_per_500m: 115,
};

// Los kilos de competición son DATO DEL COACH: aquí se inyecta su tabla, que es
// exactamente como llegarán en producción. El catálogo por defecto contesta
// `null` a propósito mientras no tenga fuente fiable.
const TABLA_DEL_COACH = (slug: HyroxStationSlug): HyroxStationLoad | null => {
  if (slug === 'hyrox-sled-push') return { kind: 'sled', kg: 152 };
  if (slug === 'hyrox-farmer-carry') return { kind: 'per_implement', kg: 24, implements: 2 };
  if (slug === 'ski-erg') return { kind: 'damper', setting: 5 };
  return null;
};

// Las anclas del atleta se construyen con el MISMO adaptador que usa el código
// real, no a mano: si el adaptador se rompe, estas pruebas se enteran.
const ctx = (over: Partial<Parameters<typeof anchorsFromBenchmarks>[1]> & { benchmarks?: typeof CON_MARCAS } = {}): AthleteAnchors => {
  const { benchmarks = CON_MARCAS, ...extra } = over;
  return anchorsFromBenchmarks(benchmarks, {
    bodyweightKg: 80,
    division: 'open',
    gender: 'men',
    stationLoad: TABLA_DEL_COACH,
    ...extra,
  });
};

describe('resolver contra las marcas del atleta', () => {
  test('«a ritmo HYROX» sale del objetivo de carrera: 40 minutos para 8 km son 5:00/km', () => {
    const r = resolveRelativeTarget(rel({ kind: 'relative', ref: { of: 'race_pace', modality: 'run' } }), ctx());
    expect(r?.target).toEqual({ kind: 'pace', unit: 'per_km', value_s: 300 });
    expect(r?.estimated).toBe(false);
  });

  test('«a peso de competición» en el trineo son los kilos que dice la tabla del coach', () => {
    const r = resolveRelativeTarget(
      rel({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } }),
      ctx(),
    );
    expect(r?.target).toEqual({ kind: 'kg', value: 152 });
    expect(r?.phrase).toBe('a peso de competición');
  });

  test('«5-10 kg por encima del peso de competición» es una banda sobre esos kilos', () => {
    const r = resolveRelativeTarget(
      rel({
        kind: 'relative',
        ref: { of: 'competition_load', station: 'hyrox-sled-push' },
        delta_kg: 5,
        delta_kg_max: 10,
      }),
      ctx(),
    );
    expect(r?.target).toEqual({ kind: 'kg', min: 157, max: 162 });
  });

  test('las farmers son DOS pesas de 24 kg, no una de 48 — el conteo de implementos sobrevive', () => {
    const r = resolveRelativeTarget(
      rel({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-farmer-carry' } }),
      ctx(),
    );
    expect(r?.target).toEqual({ kind: 'kg', value: 24, implement_count: 2 });
  });

  test('«al 50 % del peso corporal» con 80 kg son 40', () => {
    const r = resolveRelativeTarget(rel({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 }), ctx());
    expect(r?.target).toEqual({ kind: 'kg', value: 40 });
    expect(r?.phrase).toBe('al 50 % del peso corporal');
  });

  test('el umbral de remo sale de su test medido, en segundos por 500 m', () => {
    const r = resolveRelativeTarget(
      rel({ kind: 'relative', ref: { of: 'threshold_pace', modality: 'row' } }),
      ctx(),
    );
    expect(r?.target).toEqual({ kind: 'pace', unit: 'per_500m', value_s: 115 });
  });
});

describe('cuando falta la marca, la respuesta es la verdad y no un cero', () => {
  test('sin ningún test, «a ritmo HYROX» no da número', () => {
    const r = resolveRelativeTarget(
      rel({ kind: 'relative', ref: { of: 'race_pace', modality: 'run' } }),
      ctx({ benchmarks: SIN_MARCAS }),
    );
    expect(r).toBeNull();
  });

  test('sin división o sin género no hay peso de competición: el mismo trineo pesa distinto en Open y en Pro', () => {
    expect(
      resolveRelativeTarget(
        rel({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } }),
        ctx({ division: null }),
      ),
    ).toBeNull();
  });

  test('sin peso del atleta no hay fracción de peso corporal', () => {
    expect(
      resolveRelativeTarget(
        rel({ kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 }),
        ctx({ bodyweightKg: null }),
      ),
    ).toBeNull();
  });

  test('el damper de un ergómetro no es una carga: no se devuelven kilos fingidos', () => {
    expect(
      resolveRelativeTarget(
        rel({ kind: 'relative', ref: { of: 'competition_load', station: 'ski-erg' } }),
        ctx(),
      ),
    ).toBeNull();
  });

  test('sin la tabla del coach, el catálogo contesta «no lo sé» — y eso es lo correcto', () => {
    // El comportamiento por defecto HOY: las cargas se retiraron del catálogo
    // por venir de una fuente no fiable. Un peso inventado es un atleta
    // entrenando mal.
    expect(
      resolveRelativeTarget(
        rel({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } }),
        ctx({ stationLoad: undefined }),
      ),
    ).toBeNull();
  });

  test('el ritmo de carrera de remo y ski todavía no tiene ancla: se puede decir, aún no traducir', () => {
    expect(
      resolveRelativeTarget(rel({ kind: 'relative', ref: { of: 'race_pace', modality: 'row' } }), ctx()),
    ).toBeNull();
  });
});

describe('la frase que lee el atleta', () => {
  test('sin número, la frase sigue explicando el porqué', () => {
    expect(relativePhrase(rel({ kind: 'relative', ref: { of: 'race_pace', modality: 'run' } }))).toBe(
      'a ritmo de carrera',
    );
  });

  test('un delta se lee como lo escribió el entrenador', () => {
    expect(
      relativePhrase(
        rel({
          kind: 'relative',
          ref: { of: 'competition_load', station: 'hyrox-sled-push' },
          delta_kg: 5,
          delta_kg_max: 10,
        }),
      ),
    ).toBe('5-10 kg por encima del peso de competición');
  });

  test('un delta hacia abajo se lee «por debajo», no con un menos delante', () => {
    expect(
      relativePhrase(
        rel({ kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-wall-balls' }, delta_kg: -3 }),
      ),
    ).toBe('3 kg por debajo del peso de competición');
  });
});

// ---------------------------------------------------------------------------
// 4. Lo de siempre sigue funcionando. Esto es aditivo, no una reforma.
// ---------------------------------------------------------------------------
describe('nada de lo que ya existía se ha movido', () => {
  test('el porcentaje del máximo sigue siendo su propio objetivo y no se toca', () => {
    const t: Target = { kind: 'percent_rm', min: 65, max: 70 };
    expect(targetSchema.parse(t)).toEqual(t);
  });

  test('un ritmo absoluto sigue entrando igual', () => {
    const t: Target = { kind: 'pace', unit: 'per_km', value_s: 270 };
    expect(targetSchema.parse(t)).toEqual(t);
  });

  test('el techo de pulsaciones sigue entrando igual', () => {
    const t: Target = { kind: 'hr_bpm', max: 142 };
    expect(targetSchema.parse(t)).toEqual(t);
  });
});

// ---------------------------------------------------------------------------
// 5. La prescripción entera: lo que de verdad viaja al móvil.
// ---------------------------------------------------------------------------
describe('resolver la prescripción entera antes de mandarla', () => {
  const pres = (over: Record<string, unknown> = {}) =>
    ({ scheme: 'sets', ...over }) as unknown as Parameters<typeof resolvePrescriptionReferences>[0];

  test('sin ningún objetivo relativo devuelve el MISMO objeto: el día no paga nada', () => {
    const p = pres({ target: { kind: 'rpe', value: 7 } });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(r.prescription).toBe(p);
    expect(r.references).toEqual([]);
  });

  test('el objetivo del bloque se cambia por el número, y la frase viaja aparte', () => {
    const p = pres({
      target: { kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } },
    });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(r.prescription.target).toEqual({ kind: 'kg', value: 152 });
    expect(r.references).toEqual([
      { phrase: 'a peso de competición', target: { kind: 'kg', value: 152 }, source: 'competition_load:hyrox-sled-push', estimated: false },
    ]);
  });

  test('también el de cada serie, que es donde vive en un plan de verdad', () => {
    const p = pres({
      sets: [
        { measure: { kind: 'distance', meters: 1000 }, target: { kind: 'relative', ref: { of: 'race_pace', modality: 'run' } } },
        { measure: { kind: 'reps', value: 25 }, target: { kind: 'rpe', value: 8 } },
      ],
    });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(r.prescription.sets?.[0]?.target).toEqual({ kind: 'pace', unit: 'per_km', value_s: 300 });
    // La serie que no era relativa no se toca.
    expect(r.prescription.sets?.[1]?.target).toEqual({ kind: 'rpe', value: 8 });
    expect(r.references).toHaveLength(1);
  });

  // LA REGLA QUE PROTEGE A LA APP YA INSTALADA: un objetivo que el móvil no
  // conoce lo convierte en «nada» y pintaría la línea SIN objetivo, sin avisar.
  // Por eso al cable nunca sale un relativo — o sale su número, o no sale nada.
  test('al cable NUNCA viaja un objetivo relativo', () => {
    const p = pres({
      target: { kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-sled-push' } },
      sets: [{ measure: { kind: 'reps', value: 10 }, target: { kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 } }],
    });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(r.prescription.target?.kind).not.toBe('relative');
    expect(r.prescription.sets?.[0]?.target?.kind).not.toBe('relative');
  });

  test('cuando no resuelve, la línea se queda SIN objetivo y la frase explica por qué', () => {
    const p = pres({
      target: { kind: 'relative', ref: { of: 'competition_load', station: 'hyrox-wall-balls' } },
    });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(r.prescription.target).toBeUndefined();
    expect(r.references[0]).toMatchObject({ phrase: 'a peso de competición', target: null });
  });

  test('una serie sin resolver pierde el objetivo pero conserva su medida', () => {
    const p = pres({
      sets: [{ measure: { kind: 'distance', meters: 1000 }, target: { kind: 'relative', ref: { of: 'race_pace', modality: 'run' } } }],
    });
    const r = resolvePrescriptionReferences(p, ctx({ benchmarks: SIN_MARCAS }));
    expect(r.prescription.sets?.[0]?.target).toBeUndefined();
    expect(r.prescription.sets?.[0]?.measure).toEqual({ kind: 'distance', meters: 1000 });
    expect(r.references[0]?.target).toBeNull();
  });

  test('lo que sale sigue siendo una prescripción válida para el esquema', () => {
    const p = pres({
      target: { kind: 'relative', ref: { of: 'bodyweight' }, percent: 50 },
      sets: [{ measure: { kind: 'reps', value: 10 } }],
    });
    const r = resolvePrescriptionReferences(p, ctx());
    expect(() => prescriptionSchema.parse(r.prescription)).not.toThrow();
  });
});
