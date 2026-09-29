// ¿Mejoro en el ergo? (shared/domain/analytics/progreso-ergo.ts): remo, SkiErg
// y BikeErg, cada máquina la suya — piezas estándar de Concept2, Motor (vatios
// al mismo pulso), y el ritmo por 500 m (1000 m en la bici).

import { describe, expect, test } from 'vitest';
import {
  PIEZAS_ERGO,
  progresoErgo,
  valorEnPieza,
  type EntradaErgo,
  type Maquina,
  type TramoErgo,
} from '@fahybrid/shared/domain/analytics/progreso-ergo';
import { riegelTime } from '@fahybrid/shared/domain/athlete/mark-projection';
import { anclasVacias, type AnclaResuelta } from '@fahybrid/shared/domain/analytics/anclas';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';

const HOY = '2026-09-29';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

let seq = 0;
function tramo(maquina: Maquina, overrides: Partial<TramoErgo> & Pick<TramoErgo, 'dia'>): TramoErgo {
  seq += 1;
  return {
    sesion_id: `s${seq}`,
    maquina,
    segundos: 0,
    metros: null,
    ritmo_s_500m: null,
    vatios: null,
    pulso: null,
    cadencia: null,
    trabajo: true,
    parciales: [],
    ...overrides,
  };
}

function entradaBase(maquina: Maquina, overrides: Partial<EntradaErgo> = {}): EntradaErgo {
  return {
    maquina,
    ventana,
    tramos: [],
    marcas: [],
    anclas: anclasVacias(),
    fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS,
    umbrales: defaultCoachRunningThresholds(),
    metodo: defaultCoachAnalyticsMethod(),
    sin_historia: false,
    ...overrides,
  };
}

const PIEZA_2000 = PIEZAS_ERGO.find((p) => p.clave === '2000')!;
const PIEZA_60S = PIEZAS_ERGO.find((p) => p.clave === '60s')!;

describe('valorEnPieza', () => {
  test('pieza de distancia (2000 m): dentro de ±10 % proyecta con Riegel; fuera, null', () => {
    expect(valorEnPieza(1900, 400, PIEZA_2000)).toBeCloseTo(riegelTime(400, 1900, 2000), 9);
    expect(valorEnPieza(1700, 400, PIEZA_2000)).toBeNull(); // 300 m de diferencia > 10 % de 2000
  });

  test('pieza de tiempo (60 s): dentro de ±10 % devuelve los metros proyectados (> 0); fuera, null', () => {
    const metros = valorEnPieza(300, 62, PIEZA_60S);
    expect(metros).not.toBeNull();
    expect(metros!).toBeGreaterThan(0);
    expect(valorEnPieza(300, 80, PIEZA_60S)).toBeNull(); // 20 s de diferencia > 10 % de 60
  });
});

describe('progresoErgo — de dónde sale una pieza', () => {
  test('cuatro tramos de 500 m en una sesión NO forman un "2000": en el ergo no hay total de sesión', () => {
    const tramos = [1, 2, 3, 4].map(() => tramo('row', { dia: '2026-09-05', sesion_id: 'misma-sesion', metros: 500, segundos: 100 }));
    const salida = progresoErgo(entradaBase('row', { tramos }));
    expect(salida.candidatos.some((c) => c.prueba === 'remo.2000')).toBe(false);
    expect(salida.candidatos.filter((c) => c.prueba === 'remo.500')).toHaveLength(4);
  });

  test('un parcial del monitor (PM5) SÍ produce una pieza, con clave "remo.<pieza>"', () => {
    const tramos = [tramo('row', { dia: '2026-09-05', metros: 8000, segundos: 1600, parciales: [{ segundos: 400, metros: 2000 }] })];
    const salida = progresoErgo(entradaBase('row', { tramos }));
    expect(salida.candidatos.some((c) => c.prueba === 'remo.2000')).toBe(true);
  });
});

describe('progresoErgo — la bici se lee por 1000 m', () => {
  test('la fila comparable (sin Motor, sin vatios) usa unidad s_1000m y el umbral pct del ergo', () => {
    const tramos = [
      tramo('bike', { dia: '2026-08-10', metros: 1000, segundos: 100 }), // ventana anterior
      tramo('bike', { dia: '2026-09-10', metros: 1000, segundos: 95 }), // ventana actual
    ];
    const salida = progresoErgo(entradaBase('bike', { tramos }));
    expect(salida.fila.dato!.unidad).toBe('s_1000m');
    expect(salida.fila.dato!.valor).toBe(95);
    expect(salida.fila.comparacion!.unidad).toBe('pct');
    expect(salida.fila.comparacion!.cambio_minimo).toBe(defaultCoachAnalyticsMethod().cambio_ergo_pct);
  });
});

describe('progresoErgo — el Motor (vatios al mismo pulso)', () => {
  const pulsoEstimado: AnclaResuelta = { valor: 170, ancla: 'estimada', fuente: 'from_max_hr', explica_es: 'x', desde_iso: null };
  // Misma referencia que en correr: zona 2 sobre 170 ppm → 145 ppm.

  test('remo sin vatios del monitor: se derivan del split (wattsDeSplit500)', () => {
    const e = entradaBase('row', {
      anclas: { ...anclasVacias(), pulso: pulsoEstimado },
      tramos: [
        tramo('row', { dia: '2026-09-05', metros: 1500, ritmo_s_500m: 100, pulso: 145, segundos: 300, vatios: null }),
        tramo('row', { dia: '2026-09-12', metros: 1500, ritmo_s_500m: 100, pulso: 145, segundos: 300, vatios: null }),
        tramo('row', { dia: '2026-09-19', metros: 1500, ritmo_s_500m: 100, pulso: 145, segundos: 300, vatios: null }),
      ],
    });
    const motor = porId(progresoErgo(e).detalle, 'remo.motor');
    // wattsDeSplit500(100) = 2,8 / (100/500)^3 = 350; el pulso del tramo es EXACTAMENTE la referencia.
    expect(motor.dato!.valor).toBe(350);
  });

  test('bici sin vatios NO produce observaciones de Motor: no hay conversión ritmo→vatios en bici', () => {
    const e = entradaBase('bike', {
      anclas: { ...anclasVacias(), pulso: pulsoEstimado },
      tramos: [tramo('bike', { dia: '2026-09-05', metros: 1500, ritmo_s_500m: 100, pulso: 145, segundos: 300, vatios: null })],
    });
    const motor = porId(progresoErgo(e).detalle, 'bici.motor');
    expect(motor.estado).toBe('sin_dato');
    expect(motor.cobertura.muestras).toBe(0);
  });
});
