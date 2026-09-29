// ¿QUÉ PASÓ EN ESA SESIÓN? (shared/domain/analytics/sesion.ts): la carga de cada
// tramo como entró en la suma, sus zonas, y la sesión frente a su planificada.

import { describe, expect, test } from 'vitest';
import { cargaDeTramo, lecturasSesion, zonasDeTramo } from '@fahybrid/shared/domain/analytics/sesion';
import { preciarSesion, type SesionHecha, type TramoHecho } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { anclasVacias, type AnclasAtleta } from '@fahybrid/shared/domain/analytics/anclas';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';
import type { PrecioPlanSesion } from '@fahybrid/shared/domain/analytics/carga-plan';

const anclas: AnclasAtleta = { ...anclasVacias(), pulso: { valor: 170, ancla: 'estimada', fuente: 'from_max_hr', explica_es: '', desde_iso: null } };
const E = { anclas, metodo: defaultCoachAnalyticsMethod(), fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS };

function tramo(over: Partial<TramoHecho>): TramoHecho {
  return { segundos: 600, modalidad: 'run', familia: 'correr', potencia_w: null, ritmo_s: null, pendiente_pct: null, pulso_medio: null, zonas: null, esfuerzo: null, ...over };
}

const SESION: SesionHecha = {
  id: '1',
  dia: '2026-06-10',
  segundos: 2700,
  rpe: 7,
  pulso_medio: 140,
  tramos: [
    tramo({ id: 'a', segundos: 1800, zonas: { por_zona: { 1: 0, 2: 1500, 3: 300, 4: 0, 5: 0 }, sin_pulso_s: 0, ancla: 'estimada' } }),
    tramo({ id: 'b', segundos: 600, modalidad: 'strength', familia: 'fuerza', esfuerzo: 8 }),
  ],
};

describe('la carga de cada tramo', () => {
  const precio = preciarSesion(SESION, E);

  test('es la que entró en la suma: por tramo, más el resto', () => {
    const suma = [...precio.tramos, precio.resto].reduce((a, p) => a + (p?.partes.reduce((x, y) => x + y.tss, 0) ?? 0), 0);
    expect(suma).toBeCloseTo(precio.tss!, 10);
    expect(precio.tramos).toHaveLength(2);
    expect(precio.resto?.segundos).toBe(300);
  });

  test('con su peldaño y su ancla', () => {
    expect(cargaDeTramo(precio.tramos[0]!)).toMatchObject({ peldano: 'pulso', ancla: 'estimada', segundos: 1800 });
    expect(cargaDeTramo(precio.tramos[1]!)).toMatchObject({ peldano: 'esfuerzo', ancla: null, segundos: 600 });
    expect(cargaDeTramo(null)).toBeNull();
  });

  test('las zonas del tramo con claves z1…z5', () => {
    expect(zonasDeTramo(SESION.tramos[0]!.zonas)).toEqual({ por_zona: { z1: 0, z2: 1500, z3: 300, z4: 0, z5: 0 }, sin_pulso_s: 0, ancla: 'estimada' });
  });
});

describe('la cabecera del detalle', () => {
  const precio = preciarSesion(SESION, E);
  const plan = (sin_saber: number): PrecioPlanSesion => ({
    id: '9',
    dia: '2026-06-10',
    items: [{ tss: 40, segundos: 2400, peldano: 'pulso', familia: 'correr', rol: 'principal' } as never],
    tss_conocido: 40,
    segundos_conocidos: 2400,
    items_sin_saber: sin_saber,
    principal_sin_saber: false,
    por_familia: {},
  });

  test('la carga frente a la planificada, y la duración frente a la escrita', () => {
    const [carga, duracion, zonas] = lecturasSesion({ sesion: SESION, precio, plan: plan(0) });
    expect(carga).toMatchObject({ id: 'sesion.carga', estado: 'medida', dato: { unidad: 'tss', referencia: { valor: 40, de: 'plan' } } });
    expect(carga!.dato!.referencia!.delta).toBeCloseTo(precio.tss! - 40, 10);
    expect(carga!.reparto!.partes.reduce((a, p) => a + (p.pct ?? 0), 0)).toBeCloseTo(100, 10);
    expect(duracion).toMatchObject({ dato: { valor: 2700, referencia: { valor: 2400, delta: 300 } } });
    expect(zonas).toMatchObject({ dato: { valor: 1800 }, procedencia: { ancla: 'estimada' } });
  });

  test('con una línea del plan sin saber, la planificada es un suelo y no se compara', () => {
    const [carga] = lecturasSesion({ sesion: SESION, precio, plan: plan(1) });
    expect(carga!.dato!.referencia).toBeNull();
  });

  test('sin nada que preciar, lo que falta es puntuar; sin pulso, el sensor', () => {
    const vacia: SesionHecha = { ...SESION, rpe: null, pulso_medio: null, tramos: [tramo({ segundos: 2700 })] };
    const [carga, , zonas] = lecturasSesion({ sesion: vacia, precio: preciarSesion(vacia, E), plan: null });
    expect(carga).toMatchObject({ estado: 'sin_dato', cobertura: { falta: { por: 'esfuerzo', sesiones: 1 } } });
    expect(zonas!.cobertura.falta).toEqual({ por: 'sensor' });
  });
});
