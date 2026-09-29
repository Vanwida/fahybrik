// ¿Mejoro en estaciones y en los WOD? (shared/domain/analytics/progreso-estaciones.ts):
// una estación se compara consigo misma (mismo ejercicio, dosis y carga); un
// WOD de referencia es uno que se repite, o una simulación HYROX.

import { describe, expect, test } from 'vitest';
import {
  FORMATO_SIMULACION,
  progresoEstaciones,
  pruebaEstacion,
  puntuacionEscalar,
  type EntradaEstaciones,
  type PuntuacionWod,
  type TramoEstacion,
} from '@fahybrid/shared/domain/analytics/progreso-estaciones';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function porId(ls: readonly Lectura[], id: string): Lectura | undefined {
  return ls.find((x) => x.id === id);
}

let seq = 0;
function tramoEstacion(overrides: Partial<TramoEstacion> & Pick<TramoEstacion, 'dia'>): TramoEstacion {
  seq += 1;
  return {
    sesion_id: `s${seq}`,
    slug: 'hyrox-sled-push',
    nombre: 'Sled push',
    segundos: 0,
    metros: null,
    reps: null,
    kg: null,
    formato: 'for_time',
    trabajo: true,
    ...overrides,
  };
}

function puntuacion(overrides: Partial<PuntuacionWod> & Pick<PuntuacionWod, 'dia' | 'wod_id'>): PuntuacionWod {
  return {
    sesion_id: overrides.dia,
    nombre: 'x',
    formato: 'amrap',
    tiempo_s: null,
    rondas: 5,
    reps: 0,
    reps_por_ronda: null,
    ...overrides,
  };
}

function entradaBase(overrides: Partial<EntradaEstaciones> = {}): EntradaEstaciones {
  return {
    ventana,
    tramos: [],
    puntuaciones: [],
    metodo: defaultCoachAnalyticsMethod(),
    sin_historia: false,
    ...overrides,
  };
}

describe('pruebaEstacion', () => {
  test('sled push 50 m a 152 kg, for_time → la clave lleva la dosis y la carga', () => {
    const t = tramoEstacion({ dia: '2026-09-05', segundos: 120, metros: 50, kg: 152 });
    expect(pruebaEstacion(t)).toEqual({ prueba: 'estaciones.hyrox-sled-push.50m.152kg', titulo: 'Sled push · 50 m · 152 kg' });
  });

  test('sin kg apuntados → "sin-carga": nunca se inventa la del plan', () => {
    const t = tramoEstacion({ dia: '2026-09-05', segundos: 120, metros: 50, kg: null });
    expect(pruebaEstacion(t)!.prueba).toBe('estaciones.hyrox-sled-push.50m.sin-carga');
  });

  test('formato EMOM: el reloj lo pone el formato, no el atleta → null', () => {
    const t = tramoEstacion({ dia: '2026-09-05', segundos: 120, metros: 50, kg: 152, formato: 'emom' });
    expect(pruebaEstacion(t)).toBeNull();
  });

  test('sin dosis (ni metros ni reps) → null', () => {
    const t = tramoEstacion({ dia: '2026-09-05', segundos: 120, metros: null, reps: null });
    expect(pruebaEstacion(t)).toBeNull();
  });

  test('segundos = 0 → null', () => {
    const t = tramoEstacion({ dia: '2026-09-05', segundos: 0, metros: 50 });
    expect(pruebaEstacion(t)).toBeNull();
  });
});

describe('puntuacionEscalar', () => {
  test('tiempo → segundos / menor', () => {
    const p = puntuacion({ dia: '2026-09-05', wod_id: 'w', formato: 'for_time', tiempo_s: 600, rondas: null });
    expect(puntuacionEscalar(p)).toEqual({ valor: 600, unidad: 'segundos', sentido: 'menor' });
  });

  test('5 rondas, 0 reps sueltas → 5 rondas / mayor', () => {
    const p = puntuacion({ dia: '2026-09-05', wod_id: 'w', rondas: 5, reps: 0 });
    expect(puntuacionEscalar(p)).toEqual({ valor: 5, unidad: 'rondas', sentido: 'mayor' });
  });

  test('5 rondas + 10 reps sueltas, con reps_por_ronda 20 → 5,5', () => {
    const p = puntuacion({ dia: '2026-09-05', wod_id: 'w', rondas: 5, reps: 10, reps_por_ronda: 20 });
    expect(puntuacionEscalar(p)!.valor).toBe(5.5);
  });

  test('5 rondas + 10 reps sueltas, SIN reps_por_ronda → null: no se sabe la fracción de ronda', () => {
    const p = puntuacion({ dia: '2026-09-05', wod_id: 'w', rondas: 5, reps: 10, reps_por_ronda: null });
    expect(puntuacionEscalar(p)).toBeNull();
  });
});

describe('progresoEstaciones — WOD de referencia: se repite, o es una simulación', () => {
  test('un solo intento en AMRAP no es de referencia: no aparece ni en el detalle ni en los candidatos', () => {
    const { wod } = progresoEstaciones(entradaBase({ puntuaciones: [puntuacion({ dia: '2026-09-05', wod_id: 'w1', rondas: 5 })] }));
    expect(porId(wod.detalle, 'wod.w1')).toBeUndefined();
    expect(wod.candidatos.some((c) => c.prueba === 'wod.w1')).toBe(false);
  });

  test('dos intentos en AMRAP SÍ son de referencia', () => {
    const { wod } = progresoEstaciones(
      entradaBase({
        puntuaciones: [puntuacion({ dia: '2026-08-10', wod_id: 'w2', rondas: 5 }), puntuacion({ dia: '2026-09-10', wod_id: 'w2', rondas: 6 })],
      }),
    );
    expect(porId(wod.detalle, 'wod.w2')).toBeDefined();
    expect(wod.candidatos.filter((c) => c.prueba === 'wod.w2')).toHaveLength(2);
  });

  test('un solo intento en formato hyrox_sim SÍ es de referencia (se compara con sus propias simulaciones)', () => {
    const { wod } = progresoEstaciones(
      entradaBase({
        puntuaciones: [puntuacion({ dia: '2026-09-05', wod_id: 'w3', formato: FORMATO_SIMULACION, tiempo_s: 1800, rondas: null, reps: null })],
      }),
    );
    expect(porId(wod.detalle, 'wod.w3')).toBeDefined();
    expect(wod.candidatos.some((c) => c.prueba === 'wod.w3')).toBe(true);
  });
});

describe('progresoEstaciones — las filas y su umbral', () => {
  test('progreso.estaciones y progreso.wod existen, con el umbral pct del método', () => {
    const metodo = defaultCoachAnalyticsMethod();
    const salida = progresoEstaciones(
      entradaBase({
        metodo,
        tramos: [
          tramoEstacion({ dia: '2026-08-10', segundos: 120, metros: 50, kg: 100 }),
          tramoEstacion({ dia: '2026-09-10', segundos: 110, metros: 50, kg: 100 }),
        ],
        puntuaciones: [puntuacion({ dia: '2026-08-10', wod_id: 'w', rondas: 5 }), puntuacion({ dia: '2026-09-10', wod_id: 'w', rondas: 6 })],
      }),
    );

    expect(salida.estaciones.fila.id).toBe('progreso.estaciones');
    expect(salida.estaciones.fila.comparacion!.unidad).toBe('pct');
    expect(salida.estaciones.fila.comparacion!.cambio_minimo).toBe(metodo.cambio_estaciones_pct);

    expect(salida.wod.fila.id).toBe('progreso.wod');
    expect(salida.wod.fila.comparacion!.unidad).toBe('pct');
    expect(salida.wod.fila.comparacion!.cambio_minimo).toBe(metodo.cambio_wod_pct);
  });
});
