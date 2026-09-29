// La carga PLANIFICADA desde la prescripción tipada (shared/domain/analytics/
// carga-plan.ts): cada clase de objetivo, cada formato con reloj escrito, y lo
// que honestamente no se sabe.

import { describe, expect, test } from 'vitest';
import {
  cargaPlanificadaDeItem,
  cargaPlanificadaDeSesion,
  intensidadObjetivo,
  serieDiariaPlan,
  type EntradaCargaPlan,
  type ItemPlan,
} from '@fahybrid/shared/domain/analytics/carga-plan';
import { tssDe } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { anclasVacias, wattsDeSplit500, type AnclaResuelta, type AnclasAtleta } from '@fahybrid/shared/domain/analytics/anclas';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import type { Prescription } from '@fahybrid/shared/domain/prescription';

const ancla = (valor: number, a: AnclaResuelta['ancla'] = 'medida'): AnclaResuelta => ({ valor, ancla: a, fuente: 'test', explica_es: 'test', desde_iso: null });

function anclas(): AnclasAtleta {
  const base = anclasVacias();
  return { pulso: ancla(170), ritmo: { ...base.ritmo, run: ancla(240), row: ancla(120) }, potencia: { ...base.potencia, row: ancla(wattsDeSplit500(120)!) } };
}

const e: EntradaCargaPlan = { anclas: anclas(), fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS };

function item(prescripcion: Prescription | null, modalidad: string | null = 'run'): ItemPlan {
  return { prescripcion, modalidad, familia: modalidad === 'strength' ? 'fuerza' : modalidad === 'row' ? 'remo' : 'correr', rol: 'principal' };
}

const Z2 = (0.82 + 0.88) / 2;
const Z4 = (0.95 + 1.02) / 2;

describe('la intensidad objetivo', () => {
  test('ritmo /km contra el umbral; rango al punto medio; /milla se convierte', () => {
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_km', value_s: 240 }, 'run', e)).toMatchObject({ if: 1, peldano: 'ritmo', ancla: 'medida' });
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_km', min_s: 220, max_s: 260 }, 'run', e)!.if).toBe(1);
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_mile', value_s: 240 * 1.609344 }, 'run', e)!.if).toBeCloseTo(1, 9);
  });

  test('split /500 m en un ergo va por potencia (cúbica) contra el umbral de ESA máquina', () => {
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_500m', value_s: 120 }, 'row', e)!.if).toBeCloseTo(1, 6);
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_500m', value_s: 105 }, 'row', e)!.if).toBeCloseTo(1.4927, 3);
    // El ski no tiene umbral en estas anclas: no se sabe.
    expect(intensidadObjetivo({ kind: 'pace', unit: 'per_500m', value_s: 120 }, 'ski', e)).toBeNull();
  });

  test('zona: la intensidad media de la banda del coach, sin depender de ningún umbral', () => {
    expect(intensidadObjetivo({ kind: 'hr_zone', value: 2 }, 'run', e)).toEqual({ if: Z2, peldano: 'zona', ancla: null });
    expect(intensidadObjetivo({ kind: 'hr_zone', min: 2, max: 4 }, 'run', e)!.if).toBeCloseTo((Z2 + Z4) / 2, 9);
    expect(intensidadObjetivo({ kind: 'hr_zone', value: 6 }, 'run', e)!.if).toBe(intensidadObjetivo({ kind: 'hr_zone', value: 5 }, 'run', e)!.if);
  });

  test('pulso, vatios, RPE y RIR', () => {
    expect(intensidadObjetivo({ kind: 'hr_bpm', value: 153 }, 'other', e)!.if).toBeCloseTo(0.9, 9);
    expect(intensidadObjetivo({ kind: 'watts', value: wattsDeSplit500(120)! }, 'row', e)!.if).toBeCloseTo(1, 6);
    expect(intensidadObjetivo({ kind: 'rpe', min: 6, max: 8 }, 'strength', e)).toMatchObject({ if: 0.85, peldano: 'esfuerzo', ancla: null });
    expect(intensidadObjetivo({ kind: 'rir', value: 2 }, 'strength', e)!.if).toBe(0.93);
  });

  test('%RM, kilos, peso corporal, calorías y tope de tiempo no dicen cómo de duro', () => {
    for (const t of [
      { kind: 'percent_rm', value: 80 },
      { kind: 'kg', value: 100 },
      { kind: 'bodyweight' },
      { kind: 'calories', value: 15 },
      { kind: 'time_cap', max_s: 60 },
    ] as const) {
      expect(intensidadObjetivo(t as never, 'strength', e)).toBeNull();
    }
  });
});

describe('la línea', () => {
  test('rodaje de 30 min al ritmo umbral → 50', () => {
    const r = cargaPlanificadaDeItem(item({ scheme: 'steady', total_s: 1800, target: { kind: 'pace', unit: 'per_km', value_s: 240 } }), e);
    expect(r).toMatchObject({ segundos: 1800, peldano: 'ritmo', ancla: 'medida', motivo: null });
    expect(r.tss).toBeCloseTo(50, 6);
  });

  test('una hora en Z2 → la intensidad media de la banda, sin ancla', () => {
    const r = cargaPlanificadaDeItem(item({ scheme: 'steady', total_s: 3600, target: { kind: 'hr_zone', value: 2 } }), e);
    expect(r.tss).toBeCloseTo(tssDe(3600, Z2), 6);
    expect(r).toMatchObject({ peldano: 'zona', ancla: null });
  });

  test('intervalos 5 × 4′ en Z4 con 2′: solo el TRABAJO lleva carga; el descanso cuenta como reloj y cero', () => {
    const r = cargaPlanificadaDeItem(item({ scheme: 'intervals', rounds: 5, work_s: 240, rest_s: 120, target: { kind: 'hr_zone', value: 4 } }), e);
    expect(r.segundos).toBe(5 * 240 + 4 * 120);
    expect(r.tss).toBeCloseTo(tssDe(5 * 240, Z4), 6);
  });

  test('series con reloj escrito, cada una a su intensidad, × rondas; la de aproximación no cuenta', () => {
    const r = cargaPlanificadaDeItem(
      item(
        {
          scheme: 'sets',
          rest_s: 60,
          sets: [
            { measure: { kind: 'duration', seconds: 60 }, target: { kind: 'rpe', value: 5 }, is_approach: true },
            { measure: { kind: 'duration', seconds: 60 }, target: { kind: 'rpe', value: 7 } },
            { measure: { kind: 'duration', seconds: 60 }, target: { kind: 'rpe', value: 9 } },
          ],
        },
        'strength',
      ),
      e,
    );
    expect(r.tss).toBeCloseTo(tssDe(60, 0.85) + tssDe(60, 1.0), 6);
    expect(r.motivo).toBeNull();
  });

  test('lo que no se sabe, con su motivo: for time (dura lo que tardes), %RM (sin intensidad), sin prescripción', () => {
    expect(cargaPlanificadaDeItem(item({ scheme: 'for_time', sets: [{ measure: { kind: 'reps', value: 21 }, target: { kind: 'rpe', value: 8 } }] }), e).motivo).toBe('sin_duracion');
    expect(cargaPlanificadaDeItem(item({ scheme: 'steady', total_s: 1200, target: { kind: 'percent_rm', value: 80 } }, 'strength'), e).motivo).toBe('sin_intensidad');
    expect(cargaPlanificadaDeItem(item({ scheme: 'sets', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'rir', value: 2 } }] }, 'strength'), e).motivo).toBe('sin_duracion');
    expect(cargaPlanificadaDeItem(item(null), e).motivo).toBe('sin_prescripcion');
  });

  test('una estructura de carrera: calentamiento por RPE, 4 × 1000 m al umbral con 2′ de trote sin objetivo, vuelta a la calma', () => {
    const p: Prescription = {
      scheme: 'intervals',
      structure: [
        { role: 'warmup', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 3 } }] },
        {
          role: 'main',
          elements: [
            {
              times: 4,
              elements: [
                { kind: 'work', measure: { type: 'distance', m: 1000 }, target: { type: 'pace', value_s: 240 } },
                { kind: 'recovery', measure: { type: 'duration', s: 120 }, target: null, recovery_mode: 'trote' },
              ],
            },
          ],
        },
        { role: 'cooldown', elements: [{ kind: 'work', measure: { type: 'duration', s: 600 }, target: { type: 'rpe', value: 3 } }] },
      ],
    };
    const r = cargaPlanificadaDeItem(item(p), e);
    expect(r.segundos).toBe(600 + 4 * 240 + 4 * 120 + 600);
    expect(r.tss).toBeCloseTo(2 * tssDe(600, 0.55) + 4 * tssDe(240, 1), 6);
    expect(r.ancla).toBe('medida');
  });

  test('una estructura por distancia en zona de ritmo cierra el reloj con el umbral del atleta', () => {
    const p: Prescription = {
      scheme: 'steady',
      structure: [{ role: 'main', elements: [{ kind: 'work', measure: { type: 'distance', m: 5000 }, target: { type: 'pace_zone', zone: 2 } }] }],
    };
    const r = cargaPlanificadaDeItem(item(p), e);
    // ritmo de Z2 = 240 / 0,85 = 282,35 s/km → 5 km = 1411,8 s
    expect(r.segundos).toBeCloseTo((5000 / 1000) * (240 / Z2), 3);
    expect(r.tss).toBeCloseTo(tssDe(r.segundos!, Z2), 6);
  });
});

describe('la sesión y el día', () => {
  test('la sesión suma lo que sabe y cuenta lo que no; un principal sin saber la deja en «al menos»', () => {
    const s = cargaPlanificadaDeSesion(
      {
        id: 'a',
        dia: '2026-06-01',
        items: [
          { ...item({ scheme: 'steady', total_s: 600, target: { kind: 'rpe', value: 3 } }), rol: 'calentamiento' },
          item({ scheme: 'steady', total_s: 1800, target: { kind: 'pace', unit: 'per_km', value_s: 240 } }),
          item({ scheme: 'for_time', sets: [{ measure: { kind: 'reps', value: 50 } }] }, 'strength'),
        ],
      },
      e,
    );
    expect(s.tss_conocido).toBeCloseTo(tssDe(600, 0.55) + 50, 6);
    expect(s.items_sin_saber).toBe(1);
    expect(s.principal_sin_saber).toBe(true);
    expect(s.por_familia.correr?.tss).toBeCloseTo(tssDe(600, 0.55) + 50, 6);
    expect(s.por_familia.fuerza?.sin_saber).toBe(1);
  });

  test('serieDiariaPlan: contigua, con ceros reales y el hueco contado', () => {
    const s1 = cargaPlanificadaDeSesion({ id: 'a', dia: '2026-06-01', items: [item({ scheme: 'steady', total_s: 3600, target: { kind: 'hr_zone', value: 2 } })] }, e);
    const s2 = cargaPlanificadaDeSesion({ id: 'b', dia: '2026-06-03', items: [item(null)] }, e);
    const dias = serieDiariaPlan([s1, s2], ['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(dias[0]).toMatchObject({ sesiones: 1, segundos: 3600, sin_saber: 0 });
    expect(dias[0]!.tss).toBeCloseTo(tssDe(3600, Z2), 6);
    expect(dias[1]).toMatchObject({ sesiones: 0, tss: 0 });
    expect(dias[2]).toMatchObject({ sesiones: 1, tss: 0, sin_saber: 1 });
  });
});
