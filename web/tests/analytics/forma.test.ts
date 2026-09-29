// Forma, fatiga y frescura con proyección (shared/domain/analytics/forma.ts):
// las bandas del coach, la palabra que se retira, la comparación con el periodo
// anterior y la curva seguida con el plan hasta la carrera.

import { describe, expect, test } from 'vitest';
import {
  estadoFrescura,
  lecturasForma,
  proyectarHastaCarrera,
  referenciasFrescura,
  type EntradaForma,
} from '@fahybrid/shared/domain/analytics/forma';
import { diaVacio, type DiaCarga } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { diaPlanVacio, type DiaPlan } from '@fahybrid/shared/domain/analytics/carga-plan';
import { anclasVacias, type AnclaResuelta, type AnclasAtleta } from '@fahybrid/shared/domain/analytics/anclas';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana, diasDelPeriodo } from '@fahybrid/shared/domain/analytics/ventana';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { computeLoadSeries } from '@fahybrid/shared/domain/training-load/banister';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const INICIO = '2026-01-01';
const dia = (n: number) => isoDateString(addDays(parseIsoDate(INICIO), n));

const medida = (valor: number): AnclaResuelta => ({ valor, ancla: 'medida', fuente: 'test', explica_es: 'test', desde_iso: null });

function anclas(pulso: AnclaResuelta | null = medida(170)): AnclasAtleta {
  return { ...anclasVacias(), pulso };
}

/** Un día con una hora preciada a `tss`, contra un umbral medido. */
function diaMedido(n: number, tss: number, opts: { ancla?: 'medida' | 'estimada'; sin_saber?: number; con_pulso?: boolean } = {}): DiaCarga {
  const d = diaVacio(dia(n));
  d.tss = tss;
  d.sesiones = 1;
  d.known_seconds = 3600;
  d.measured_seconds = 3600;
  d.por_ancla[opts.ancla ?? 'medida'] = 3600;
  d.por_peldano.pulso = 3600;
  d.por_familia.correr = { tss, segundos: 3600, sin_saber_s: 0 };
  if (opts.sin_saber) {
    d.unknown_seconds = opts.sin_saber;
    d.unknown_sessions = 1;
    if (opts.con_pulso) d.sin_saber_con_pulso_s = opts.sin_saber;
  }
  return d;
}

function diario(dias: number, f: (n: number) => DiaCarga = (n) => diaMedido(n, 100)): DiaCarga[] {
  return Array.from({ length: dias }, (_, n) => f(n));
}

function entrada(overrides: Partial<EntradaForma> = {}): EntradaForma {
  const hoy = dia(59);
  return {
    diario: diario(60),
    plan_futuro: [],
    ventana: resolverVentana({ clave: '4s', hoy_local: hoy, primera_sesion_iso: INICIO }),
    metodo: defaultCoachAnalyticsMethod(),
    anclas: anclas(),
    dias_de_historia: 59,
    carrera: null,
    hoy,
    ...overrides,
  };
}

function porId(ls: readonly Lectura[], id: string): Lectura {
  const l = ls.find((x) => x.id === id);
  if (!l) throw new Error(`falta ${id}`);
  return l;
}

describe('las bandas', () => {
  test('cinco estados con los cortes del coach; las cuatro líneas en unidades reales', () => {
    const m = defaultCoachAnalyticsMethod();
    expect(estadoFrescura(-30, m)).toBe('sobrecarga');
    expect(estadoFrescura(-29, m)).toBe('optimo');
    expect(estadoFrescura(-11, m)).toBe('optimo');
    expect(estadoFrescura(-10, m)).toBe('mantener');
    expect(estadoFrescura(4, m)).toBe('mantener');
    expect(estadoFrescura(5, m)).toBe('fresco');
    expect(estadoFrescura(29, m)).toBe('fresco');
    expect(estadoFrescura(30, m)).toBe('recargando');
    expect(referenciasFrescura(m).map((r) => r.valor)).toEqual([-30, -11, 4, 29]);
  });
});

describe('las lecturas', () => {
  test('sesenta días a 100: forma ≈ 75,8, la frescura en óptimo, comparada con hace cuatro semanas', () => {
    const e = entrada();
    const ls = lecturasForma(e);
    const serie = computeLoadSeries(e.diario, { ctl_tau: 42, atl_tau: 7 });
    const ultimo = serie[serie.length - 1]!;

    const forma = porId(ls, 'carga.fondo');
    expect(forma.estado).toBe('medida');
    expect(forma.dato!.valor).toBeCloseTo(ultimo.ctl, 9);
    expect(forma.dato!.valor).toBeCloseTo(76.4, 0);
    expect(forma.serie!.puntos).toHaveLength(28);
    expect(forma.serie!.plan).toBeNull();
    expect(forma.procedencia).toMatchObject({ ancla: 'medida', medida: true });
    // Contra el último día del periodo anterior, en TSS, con el umbral del coach.
    const anterior = serie.find((p) => p.date === e.ventana.anterior!.hasta)!;
    expect(forma.comparacion).toMatchObject({ anterior: anterior.ctl, unidad: 'tss', cambio_minimo: 5, significativo: true });
    expect(forma.comparacion!.delta).toBeCloseTo(ultimo.ctl - anterior.ctl, 9);

    const frescura = porId(ls, 'carga.frescura');
    expect(frescura.dato!.valor).toBeCloseTo(ultimo.tsb, 9);
    expect(frescura.veredicto).toMatchObject({ code: 'optimo', frase_es: null });
    expect(frescura.serie!.referencias!.map((r) => r.code)).toEqual(['sobrecarga_hasta', 'optimo_hasta', 'mantener_hasta', 'fresco_hasta']);
    expect(frescura.cobertura.falta).toBeNull();

    const cobertura = porId(ls, 'carga.cobertura');
    expect(cobertura.dato!.valor).toBe(100);
    expect(cobertura.reparto!.partes.find((p) => p.code === 'medida')!.valor).toBe(28 * 3600);
  });

  test('la palabra se retira bajo el mínimo de cobertura del coach, y la falta dice qué pedir', () => {
    // Un tercio del tiempo sin saber, con pulso pero solo un umbral de la edad → falta el ancla.
    const conPulso = entrada({
      diario: diario(60, (n) => diaMedido(n, 100, { sin_saber: 1800, con_pulso: true })),
      anclas: anclas({ ...medida(156), ancla: 'poblacional' }),
    });
    const f1 = porId(lecturasForma(conPulso), 'carga.frescura');
    expect(f1.veredicto).toBeNull();
    expect(f1.dato).not.toBeNull();
    expect(f1.cobertura.falta).toEqual({ por: 'ancla' });

    // Sin pulso en el hueco → lo que falta es puntuar.
    const sinPulso = entrada({ diario: diario(60, (n) => diaMedido(n, 100, { sin_saber: 1800 })) });
    const f2 = porId(lecturasForma(sinPulso), 'carga.frescura');
    expect(f2.veredicto).toBeNull();
    expect(f2.cobertura.falta).toEqual({ por: 'esfuerzo', sesiones: 28 });
  });

  test('con historia corta la palabra espera y dice cuánto falta', () => {
    const e = entrada({ diario: diario(20), dias_de_historia: 19, ventana: resolverVentana({ clave: '7d', hoy_local: dia(19), primera_sesion_iso: INICIO }), hoy: dia(19) });
    const f = porId(lecturasForma(e), 'carga.frescura');
    expect(f.veredicto).toBeNull();
    expect(f.cobertura.falta).toEqual({ por: 'historia', llevas: 19, hacen: 42 });
  });

  test('la carga sobre un umbral estimado se dice: en la procedencia y en la palabra', () => {
    const e = entrada({ diario: diario(60, (n) => diaMedido(n, 100, { ancla: n % 2 === 0 ? 'estimada' : 'medida' })) });
    const f = porId(lecturasForma(e), 'carga.frescura');
    expect(f.procedencia.ancla).toBe('estimada');
    expect(f.veredicto!.frase_es).toMatch(/50 % de esta carga sale de un umbral estimado/);
  });

  test('sin un solo día de historia, las seis salen sin dato con el plazo', () => {
    const ls = lecturasForma(entrada({ diario: [], dias_de_historia: null }));
    expect(ls).toHaveLength(6);
    expect(ls.every((l) => l.estado === 'sin_dato')).toBe(true);
    expect(porId(ls, 'carga.fondo').cobertura.falta).toEqual({ por: 'historia', llevas: 0, hacen: 42 });
    expect(porId(ls, 'carga.proyeccion').cobertura.falta).toEqual({ por: 'objetivo' });
  });
});

describe('la proyección hasta la carrera', () => {
  function plan(desde: number, hasta: number, tss: number, sesionesDias: number[] = []): DiaPlan[] {
    return diasDelPeriodo({ desde: dia(desde), hasta: dia(hasta) }).map((d, i) => {
      const p = diaPlanVacio(d);
      if (sesionesDias.length === 0 || sesionesDias.includes(i)) {
        p.sesiones = 1;
        p.tss = tss;
        p.segundos = 3600;
      }
      return p;
    });
  }

  test('sin carrera → sin dato con la salida de elegirla', () => {
    const l = porId(lecturasForma(entrada()), 'carga.proyeccion');
    expect(l.estado).toBe('sin_dato');
    expect(l.cobertura.falta).toEqual({ por: 'objetivo' });
  });

  test('con carrera a 14 días y sin plan: la curva sigue sin carga, sin palabra, y lo dice', () => {
    const e = entrada({ carrera: { fecha: dia(73), nombre: 'HYROX' } });
    const l = porId(lecturasForma(e), 'carga.proyeccion');
    expect(l.estado).toBe('medida');
    expect(l.serie!.plan).toHaveLength(14);
    expect(l.serie!.puntos).toEqual([]);
    expect(l.veredicto).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'plan' });
    expect(l.procedencia.explica_es).toMatch(/No hay entrenos planificados/);
    // Catorce días sin carga: la fatiga cae mucho más que la forma → frescura alta.
    expect(l.dato!.valor).toBeGreaterThan(30);
  });

  test('con el plan conocido la palabra sale; con líneas sin saber es un suelo y se retira', () => {
    const conocido = entrada({ carrera: { fecha: dia(73), nombre: 'HYROX' }, plan_futuro: plan(60, 73, 100) });
    const l1 = porId(lecturasForma(conocido), 'carga.proyeccion');
    expect(l1.veredicto).not.toBeNull();
    expect(l1.cobertura.falta).toBeNull();
    // Igual que el diario: la forma sigue subiendo y la fatiga se mantiene.
    const p = proyectarHastaCarrera(conocido, computeLoadSeries(conocido.diario, { ctl_tau: 42, atl_tau: 7 }))!;
    expect(p.dias).toBe(14);
    expect(p.sesiones_plan).toBe(14);
    expect(l1.dato!.valor).toBeCloseTo(p.tsb_carrera, 9);

    const conHuecos = entrada({ carrera: { fecha: dia(73), nombre: 'HYROX' }, plan_futuro: plan(60, 73, 100).map((d, i) => (i === 3 ? { ...d, sin_saber: 2 } : d)) });
    const l2 = porId(lecturasForma(conHuecos), 'carga.proyeccion');
    expect(l2.veredicto).toBeNull();
    expect(l2.procedencia.explica_es).toMatch(/2 líneas del plan no dicen cuánto cuestan/);
  });

  test('una carrera pasada o a más de una temporada no se proyecta', () => {
    expect(porId(lecturasForma(entrada({ carrera: { fecha: dia(50), nombre: 'pasada' } })), 'carga.proyeccion').cobertura.falta).toEqual({ por: 'ocasion' });
    expect(porId(lecturasForma(entrada({ carrera: { fecha: dia(59 + 400), nombre: 'lejos' } })), 'carga.proyeccion').cobertura.falta).toEqual({ por: 'ocasion' });
  });

  test('la proyección viaja también como plan de las tres curvas', () => {
    const e = entrada({ carrera: { fecha: dia(66), nombre: 'HYROX' }, plan_futuro: plan(60, 66, 50) });
    const ls = lecturasForma(e);
    expect(porId(ls, 'carga.fondo').serie!.plan).toHaveLength(7);
    expect(porId(ls, 'carga.frescura').serie!.plan![6]!.t).toBe(dia(66));
  });
});
