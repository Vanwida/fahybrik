// ¿Mejoro en fuerza? (shared/domain/analytics/progreso-fuerza.ts): el 1RM
// estimado con la fórmula del coach, la tabla de mejores por reps, el peso
// corporal, el volumen por patrón y la fila principal.

import { describe, expect, test } from 'vitest';
import {
  esPesoCorporal,
  progresoFuerza,
  type EntradaFuerza,
  type SerieFuerza,
} from '@fahybrid/shared/domain/analytics/progreso-fuerza';
import { estimateOneRm } from '@fahybrid/shared/domain/strength/one-rm';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

function serie(overrides: Partial<SerieFuerza> & Pick<SerieFuerza, 'dia' | 'ejercicio_id' | 'ejercicio'>): SerieFuerza {
  return {
    sesion_id: 's1',
    patron: null,
    peso_corporal: false,
    reps: null,
    kg: null,
    estado: 'done',
    ...overrides,
  };
}

function entradaBase(overrides: Partial<EntradaFuerza> = {}): EntradaFuerza {
  return {
    ventana,
    series: [],
    formula: 'Epley',
    metodo: defaultCoachAnalyticsMethod(),
    sin_historia: false,
    ...overrides,
  };
}

describe('progresoFuerza — el 1RM estimado', () => {
  test('usa la fórmula del coach: Epley y Brzycki dan valores distintos para la misma serie', () => {
    const series = [serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', patron: 'squat', kg: 100, reps: 5 })];
    const epley = progresoFuerza(entradaBase({ series, formula: 'Epley' }));
    const brzycki = progresoFuerza(entradaBase({ series, formula: 'Brzycki' }));
    const ce = epley.candidatos.find((c) => c.prueba === 'fuerza.e1rm.sq1')!;
    const cb = brzycki.candidatos.find((c) => c.prueba === 'fuerza.e1rm.sq1')!;
    expect(ce.valor).toBe(estimateOneRm(100, 5, 'Epley'));
    expect(cb.valor).toBe(estimateOneRm(100, 5, 'Brzycki'));
    expect(ce.valor).not.toBe(cb.valor);
  });

  test('una serie por encima de fuerza_1rm_reps_max (10) se excluye del e1RM, pero sigue en la tabla de reps', () => {
    const series = [
      serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', patron: 'squat', kg: 100, reps: 5 }),
      serie({ dia: '2026-09-06', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', patron: 'squat', kg: 100, reps: 12 }),
    ];
    const salida = progresoFuerza(entradaBase({ series }));
    expect(salida.candidatos.filter((c) => c.prueba === 'fuerza.e1rm.sq1')).toHaveLength(1); // solo la de 5 reps

    const tabla = porId(salida.detalle, 'fuerza.rm.sq1');
    // Solo la serie de 12 reps llega a la columna "12" de la tabla (5 < 12).
    expect(tabla.reparto!.partes.find((p) => p.code === '12')?.valor).toBe(100);
  });
});

describe('progresoFuerza — la tabla de mejores por reps', () => {
  test('100 kg × 5 llena las columnas 1, 2, 3 y 5 (dominancia); no llega a la 8', () => {
    const series = [serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', kg: 100, reps: 5 })];
    const tabla = porId(progresoFuerza(entradaBase({ series })).detalle, 'fuerza.rm.sq1');
    expect(tabla.reparto!.partes.map((p) => p.code)).toEqual(['1', '2', '3', '5']);
    expect(tabla.reparto!.partes.every((p) => p.valor === 100)).toBe(true);
  });
});

describe('progresoFuerza — peso corporal', () => {
  test('un ejercicio a peso corporal nunca cargado progresa en reps; uno cargado sin kg no crea ninguna lectura', () => {
    const series = [
      serie({ dia: '2026-09-05', ejercicio_id: 'pu1', ejercicio: 'Dominadas', peso_corporal: true, reps: 10, kg: null }),
      serie({ dia: '2026-09-05', ejercicio_id: 'bp1', ejercicio: 'Press banca', peso_corporal: false, reps: 8, kg: null }),
    ];
    const salida = progresoFuerza(entradaBase({ series }));
    const repsLectura = porId(salida.detalle, 'fuerza.reps.pu1');
    expect(repsLectura.dato!.unidad).toBe('reps');
    expect(salida.detalle.some((l) => l.id.includes('bp1'))).toBe(false);
    expect(salida.candidatos.some((c) => c.prueba.includes('bp1'))).toBe(false);
  });
});

describe('progresoFuerza — series, tonelaje y reparto por patrón', () => {
  test('una serie saltada no cuenta nunca; el tonelaje es Σ kg×reps; el reparto usa las etiquetas en español', () => {
    const series = [
      serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', patron: 'squat', kg: 100, reps: 5, estado: 'done' }),
      serie({ dia: '2026-09-05', ejercicio_id: 'dl1', ejercicio: 'Peso muerto', patron: 'hinge', kg: 80, reps: 5, estado: 'done' }),
      serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', patron: 'squat', kg: 120, reps: 3, estado: 'skipped' }),
    ];
    const salida = progresoFuerza(entradaBase({ series }));

    const seriesLectura = porId(salida.detalle, 'fuerza.series');
    expect(seriesLectura.dato!.valor).toBe(2); // la saltada no cuenta

    const tonelaje = porId(salida.detalle, 'fuerza.tonelaje');
    expect(tonelaje.dato!.valor).toBe(100 * 5 + 80 * 5); // 900: la saltada no suma

    const partesTonelaje = tonelaje.reparto!.partes;
    expect(partesTonelaje.find((p) => p.code === 'squat')).toMatchObject({ etiqueta_es: 'Sentadilla', valor: 500 });
    expect(partesTonelaje.find((p) => p.code === 'hinge')).toMatchObject({ etiqueta_es: 'Bisagra de cadera', valor: 400 });
  });
});

describe('progresoFuerza — la fila principal', () => {
  test('elige el levantamiento con más series en la ventana, entre los comparables', () => {
    const series = [
      // ex_a: 1 serie en cada periodo.
      serie({ dia: '2026-08-10', ejercicio_id: 'ex_a', ejercicio: 'Press militar', kg: 100, reps: 1 }),
      serie({ dia: '2026-09-05', ejercicio_id: 'ex_a', ejercicio: 'Press militar', kg: 105, reps: 1 }),
      // ex_b: 1 en el periodo anterior, 2 en el actual → más series en la ventana.
      serie({ dia: '2026-08-10', ejercicio_id: 'ex_b', ejercicio: 'Sentadilla', kg: 100, reps: 1 }),
      serie({ dia: '2026-09-05', ejercicio_id: 'ex_b', ejercicio: 'Sentadilla', kg: 100, reps: 1 }),
      serie({ dia: '2026-09-06', ejercicio_id: 'ex_b', ejercicio: 'Sentadilla', kg: 103, reps: 1 }),
    ];
    const fila = progresoFuerza(entradaBase({ series })).fila;
    expect(fila.titulo_es).toContain('Sentadilla');
  });

  test('su umbral es pct de cambio_fuerza_pct (2,5): 100→102 kg es «igual» (2 %), 100→103 es «mejor»', () => {
    const conCurrent = (kgActual: number): EntradaFuerza =>
      entradaBase({
        series: [
          serie({ dia: '2026-08-10', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', kg: 100, reps: 1 }),
          serie({ dia: '2026-09-05', ejercicio_id: 'sq1', ejercicio: 'Sentadilla', kg: kgActual, reps: 1 }),
        ],
      });
    const igual = progresoFuerza(conCurrent(102)).fila;
    expect(igual.comparacion!.unidad).toBe('pct');
    expect(igual.comparacion!.cambio_minimo).toBe(2.5);
    expect(igual.veredicto).toMatchObject({ code: 'igual' });

    const mejor = progresoFuerza(conCurrent(103)).fila;
    expect(mejor.veredicto).toMatchObject({ code: 'mejor' });
  });
});

describe('esPesoCorporal', () => {
  test('peso corporal si el equipo lo sostiene sin carga añadida', () => {
    expect(esPesoCorporal(['bodyweight'])).toBe(true);
    expect(esPesoCorporal(['barbell'])).toBe(false);
    expect(esPesoCorporal(['pull_up_bar'])).toBe(true);
  });

  test('un implemento a peso corporal que TAMBIÉN admite lastre no cuenta como peso corporal puro', () => {
    expect(esPesoCorporal(['bodyweight', 'dip_belt'])).toBe(false); // p.ej. dominadas con lastre
  });
});
