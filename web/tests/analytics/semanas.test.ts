// Semana a semana (shared/domain/analytics/semanas.ts): plan y hecho sobre el
// mismo eje, por familia, comparados con el periodo anterior.

import { describe, expect, test } from 'vitest';
import { lecturasSemanas, lunesDe, semanasDe } from '@fahybrid/shared/domain/analytics/semanas';
import { diaVacio, type DiaCarga } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { diaPlanVacio, type DiaPlan } from '@fahybrid/shared/domain/analytics/carga-plan';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { diasDelPeriodo, resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { Familia, Lectura } from '@fahybrid/shared/domain/analytics/lectura';

// Hoy es domingo 2026-06-28; la ventana de 4 semanas es 2026-06-01 (lunes) a 2026-06-28.
const HOY = '2026-06-28';
const ventana = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });

function hecho(date: string, familia: Familia, tss: number, segundos = 3600, sin_saber = 0): DiaCarga {
  const d = diaVacio(date);
  d.tss = tss;
  d.sesiones = 1;
  d.known_seconds = segundos;
  d.measured_seconds = segundos;
  d.unknown_seconds = sin_saber;
  d.por_ancla.medida = segundos;
  d.por_familia[familia] = { tss, segundos: segundos + sin_saber, sin_saber_s: sin_saber };
  return d;
}

function plan(date: string, familia: Familia, tss: number, segundos = 3600, sin_saber = 0): DiaPlan {
  const p = diaPlanVacio(date);
  p.sesiones = 1;
  p.tss = tss;
  p.segundos = segundos;
  p.sin_saber = sin_saber;
  p.por_familia[familia] = { tss, segundos, sin_saber };
  return p;
}

function serie(puntos: Map<string, DiaCarga>, desde: string, hasta: string): DiaCarga[] {
  return diasDelPeriodo({ desde, hasta }).map((d) => puntos.get(d) ?? diaVacio(d));
}

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}: ${ls.map((x) => x.id).join(', ')}`);
  return l;
}

describe('lunesDe', () => {
  test('el lunes de la semana de un día local', () => {
    expect(lunesDe('2026-06-28')).toBe('2026-06-22'); // domingo
    expect(lunesDe('2026-06-22')).toBe('2026-06-22'); // lunes
    expect(lunesDe('2026-06-24')).toBe('2026-06-22');
  });
});

describe('las lecturas', () => {
  const hechos = new Map<string, DiaCarga>([
    ['2026-06-01', hecho('2026-06-01', 'correr', 60)],
    ['2026-06-03', hecho('2026-06-03', 'fuerza', 40, 2700, 900)],
    ['2026-06-08', hecho('2026-06-08', 'correr', 80)],
    ['2026-06-22', hecho('2026-06-22', 'correr', 100)],
    // Periodo anterior (4 de mayo a 31 de mayo): 100 de carga.
    ['2026-05-11', hecho('2026-05-11', 'correr', 100)],
  ]);
  const diario = serie(hechos, ventana.anterior!.desde, ventana.hasta);
  const planes: DiaPlan[] = [
    plan('2026-06-01', 'correr', 60),
    plan('2026-06-03', 'fuerza', 0, 0, 1),
    plan('2026-06-08', 'correr', 70),
    plan('2026-06-15', 'correr', 70),
  ];

  test('carga por semana: hecho y plan sobre el mismo eje, con hueco donde no hay plan', () => {
    const ls = lecturasSemanas({ diario, plan: planes, ventana, metodo: defaultCoachAnalyticsMethod() });
    const carga = porId(ls, 'semanas.carga');
    expect(carga.dato!.valor).toBe(280);
    expect(carga.serie!.paso).toBe('semana');
    expect(carga.serie!.puntos).toEqual([
      { t: '2026-06-01', v: 100 },
      { t: '2026-06-08', v: 80 },
      { t: '2026-06-15', v: 0 },
      { t: '2026-06-22', v: 100 },
    ]);
    expect(carga.serie!.plan).toEqual([
      { t: '2026-06-01', v: 60 },
      { t: '2026-06-08', v: 70 },
      { t: '2026-06-15', v: 70 },
      { t: '2026-06-22', v: null },
    ]);
    // Contra el periodo anterior, en PORCENTAJE, con el umbral del coach (10 %).
    expect(carga.comparacion).toMatchObject({ anterior: 100, unidad: 'pct', cambio_minimo: 10, significativo: true });
    expect(carga.comparacion!.delta).toBeCloseTo(180, 9);
    expect(carga.reparto!.partes.map((p) => [p.code, p.valor])).toEqual([
      ['correr', 240],
      ['fuerza', 40],
    ]);
    expect(carga.procedencia.explica_es).toMatch(/no entra en la carga/);
  });

  test('horas, sesiones y una lectura por familia con dato', () => {
    const ls = lecturasSemanas({ diario, plan: planes, ventana, metodo: defaultCoachAnalyticsMethod() });
    const horas = porId(ls, 'semanas.horas');
    expect(horas.dato!.valor).toBeCloseTo(4, 9);
    expect(horas.serie!.plan![0]).toEqual({ t: '2026-06-01', v: 1 });
    const sesiones = porId(ls, 'semanas.sesiones');
    expect(sesiones.dato!.valor).toBe(4);
    expect(sesiones.serie!.plan![1]).toEqual({ t: '2026-06-08', v: 1 });
    expect(sesiones.comparacion).toMatchObject({ anterior: 1, delta: 3, unidad: 'sesiones', cambio_minimo: null, significativo: null });

    const correr = porId(ls, 'semanas.carga.correr');
    expect(correr.familia).toBe('correr');
    expect(correr.dato!.valor).toBe(240);
    expect(correr.serie!.plan![2]).toEqual({ t: '2026-06-15', v: 70 });
    const fuerza = porId(ls, 'semanas.carga.fuerza');
    expect(fuerza.serie!.plan![0]).toEqual({ t: '2026-06-01', v: 0 });
    expect(ls.find((l) => l.id === 'semanas.carga.remo')).toBeUndefined();
  });

  test('sin sesiones en la ventana: tres lecturas sin dato con el plazo', () => {
    const ls = lecturasSemanas({ diario: serie(new Map(), ventana.anterior!.desde, ventana.hasta), plan: [], ventana, metodo: defaultCoachAnalyticsMethod() });
    expect(ls.map((l) => l.id)).toEqual(['semanas.carga', 'semanas.horas', 'semanas.sesiones']);
    expect(ls.every((l) => l.estado === 'sin_dato')).toBe(true);
  });

  test('semanasDe: fuera de rango se ignora; una semana con plan y sin hecho existe', () => {
    const s = semanasDe(diario, planes, ventana.desde, ventana.hasta);
    expect(s.map((x) => x.lunes)).toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']);
    expect(s[2]).toMatchObject({ tss: 0, sesiones: 0, plan_tss: 70, plan_sesiones: 1 });
  });
});
