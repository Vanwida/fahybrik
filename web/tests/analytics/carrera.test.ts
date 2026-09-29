// ¿LLEGO A MI CARRERA? (shared/domain/analytics/carrera.ts): la disposición con
// la fórmula única y las entradas del motor, y la previsión HYROX tramo a tramo,
// sin veredicto.

import { describe, expect, test } from 'vitest';
import {
  disposicionPorDia,
  lecturasCarrera,
  previsionDeGoalGap,
  type EntradaCarrera,
  type PrevisionCarrera,
} from '@fahybrid/shared/domain/analytics/carrera';
import { diaVacio, type DiaCarga } from '@fahybrid/shared/domain/analytics/carga-tramo';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { diasDelPeriodo, resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import { DEFAULT_RACE_READINESS_METHOD, readRaceReadiness } from '@fahybrid/shared/domain/coach/race-readiness';
import { computeLoadSeries } from '@fahybrid/shared/domain/training-load/banister';
import { computeGoalGap, type SegmentDef } from '@fahybrid/shared/domain/goal-gap';
import type { MuestraDia } from '@fahybrid/shared/domain/analytics/basal';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const HOY = '2026-09-29';
const VENTANA = resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-06-01' });
const METODO = defaultCoachAnalyticsMethod();
const dia = (n: number) => isoDateString(addDays(parseIsoDate(HOY), n));

/** Una serie diaria contigua de `n` días hasta hoy: 1 h/día a 60 TSS, todo preciado. */
function diario(n: number, f: (i: number) => Partial<DiaCarga> = () => ({})): DiaCarga[] {
  const out: DiaCarga[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = diaVacio(dia(-i));
    Object.assign(d, { tss: 60, known_seconds: 3600, measured_seconds: 3600, sesiones: 1 }, f(i));
    out.push(d);
  }
  return out;
}

const vfc: MuestraDia[] = [];
for (let i = 60; i >= 0; i--) vfc.push({ dia: dia(-i), valor: i >= 15 ? 60 : 58 });

const asignaciones = Array.from({ length: 10 }, (_, i) => ({ date: dia(-i), scheduled: 1, completed: i % 5 === 0 ? 0 : 1 }));

describe('la disposición con las entradas del motor', () => {
  test('es readRaceReadiness con la frescura de las ventanas del coach, la adherencia de lo debido y la VFC de la basal única', () => {
    const d = diario(120);
    const [r] = disposicionPorDia({ dias: [HOY], diario: d, metodo: METODO, asignaciones, vfc, pesos: DEFAULT_RACE_READINESS_METHOD });
    const serie = computeLoadSeries(d, { ctl_tau: 42, atl_tau: 7 });
    // Los 7 días que acaban hoy: 7 debidas, 5 hechas (hoy y hace 5 fallaron).
    const esperado = readRaceReadiness({
      tsb: serie.at(-1)!.tsb,
      compliance_pct: 71,
      hrv_delta_ms: 58 - 60,
      active_days_7d: 7,
      load_coverage: { state: 'complete', pct: 1, known_seconds: 42 * 3600, unknown_seconds: 0, unknown_sessions: 0, allows_verdict: true, badge_es: null, note_es: null, action_es: null },
    });
    expect(r!.resultado).toEqual(esperado);
    expect(r!.resultado.reading).not.toBeNull();
    expect(r!.frio).toBe(false);
  });

  test('en arranque en frío la frescura no se sitúa: falta tiempo, y se dice cuánto', () => {
    const e: EntradaCarrera = {
      hoy: HOY,
      ventana: VENTANA,
      metodo: METODO,
      carrera: { id: 1, nombre: 'HYROX Barcelona', fecha: '2026-11-20', dias: 52, tipo: 'hyrox', formato: 'singles', objetivo_s: 4200 },
      disposicion: disposicionPorDia({ dias: [HOY], diario: diario(10), metodo: METODO, asignaciones, vfc, pesos: DEFAULT_RACE_READINESS_METHOD }),
      prevision: null,
      tendencia: [],
    };
    const l = lecturasCarrera(e).find((x) => x.id === 'carrera.disposicion')!;
    expect(l.estado).toBe('sin_dato');
    expect(l.cobertura.falta).toEqual({ por: 'historia', llevas: 10, hacen: 42 });
  });

  test('sin nada programado falta el plan (lo pone el coach); sin basal de VFC, el reloj', () => {
    const [sinPlan] = disposicionPorDia({ dias: [HOY], diario: diario(120), metodo: METODO, asignaciones: [], vfc, pesos: DEFAULT_RACE_READINESS_METHOD });
    expect(sinPlan!.resultado.gap?.missing).toEqual(['compliance']);
    const pocasNoches = vfc.slice(-10);
    const [sinVfc] = disposicionPorDia({ dias: [HOY], diario: diario(120), metodo: METODO, asignaciones, vfc: pocasNoches, pesos: DEFAULT_RACE_READINESS_METHOD });
    expect(sinVfc!.resultado.gap?.missing).toEqual(['hrv']);
  });
});

const SEGMENTOS: SegmentDef[] = [
  { slug: 'run', label_es: 'Carrera a pie', kind: 'run', station_index: null },
  { slug: 'skierg', label_es: 'SkiErg', kind: 'station', station_index: 2 },
  { slug: 'roxzone', label_es: 'Roxzone', kind: 'roxzone', station_index: null },
];

function prevision(own: boolean): PrevisionCarrera {
  return previsionDeGoalGap(
    computeGoalGap({
      goal_total_s: 3200,
      segments: SEGMENTOS,
      cohort: [],
      own_race: own
        ? { race_id: 9, date_iso: '2026-09-01', age_days: 28, run_total_s: 2400, station_s: { 2: 250 }, roxzone_s: 420, result_s: 3070, complete: true }
        : null,
      trained: [],
    }),
  );
}

function entrada(p: PrevisionCarrera | null, tendencia: EntradaCarrera['tendencia'] = []): EntradaCarrera {
  return {
    hoy: HOY,
    ventana: VENTANA,
    metodo: METODO,
    carrera: { id: 1, nombre: 'HYROX Barcelona', fecha: '2026-11-20', dias: 52, tipo: 'hyrox', formato: 'singles', objetivo_s: 3200 },
    disposicion: diasDelPeriodo(VENTANA).map((d) => ({ dia: d, resultado: readRaceReadiness({ tsb: 0, compliance_pct: 100, hrv_delta_ms: 0, active_days_7d: 5, load_coverage: { state: 'complete', pct: 1, known_seconds: 1, unknown_seconds: 0, unknown_sessions: 0, allows_verdict: true, badge_es: null, note_es: null, action_es: null } }), historia_dias: 100, frio: false, sesiones_sin_saber: 0 })),
    prevision: p,
    tendencia,
  };
}

const porId = (ls: Lectura[], id: string) => ls.find((l) => l.id === id);

describe('el bloque', () => {
  test('sin carrera objetivo, una sola lectura: la que la pide', () => {
    const ls = lecturasCarrera({ ...entrada(null), carrera: null });
    expect(ls.map((l) => l.id)).toEqual(['carrera.objetivo']);
    expect(ls[0]!.cobertura.falta).toEqual({ por: 'objetivo' });
  });

  test('la carrera, sus días, y la disposición con sus cuatro bandas que suman la cifra', () => {
    const ls = lecturasCarrera(entrada(null));
    expect(porId(ls, 'carrera.objetivo')).toMatchObject({ titulo_es: 'HYROX Barcelona', dato: { valor: 52, unidad: 'dias' } });
    const d = porId(ls, 'carrera.disposicion')!;
    expect(d.dato?.unidad).toBe('puntos');
    expect(d.reparto!.partes.reduce((a, p) => a + p.valor, 0)).toBe(d.dato!.valor);
    expect(d.serie?.puntos).toHaveLength(28);
    expect(d.veredicto).toBeNull();
  });

  test('previsión completa: número, rango, objetivo y hueco — sin palabra; y cada tramo con su presupuesto', () => {
    const ls = lecturasCarrera(entrada(prevision(true), [{ dia: dia(-3), previsto_s: 3100 }, { dia: dia(-60), previsto_s: 3300 }]));
    const p = porId(ls, 'carrera.prevision')!;
    expect(p.estado).toBe('medida');
    expect(p.dato?.valor).toBe(3070);
    expect(p.dato?.referencia).toMatchObject({ valor: 3200, delta: -130, de: 'objetivo' });
    expect(p.dato?.rango?.bajo).toBeLessThan(3070);
    expect(p.dato?.rango?.alto).toBeGreaterThan(3070);
    expect(p.veredicto).toBeNull();
    expect(p.serie?.puntos).toEqual([{ t: dia(-3), v: 3100 }]); // la de hace 60 días queda fuera de la ventana
    expect(p.reparto?.partes.map((x) => x.code)).toEqual(['run', 'skierg', 'roxzone']);
    expect(p.procedencia.explica_es).toMatch(/sin validar/);
    const run = porId(ls, 'carrera.tramo.run')!;
    expect(run).toMatchObject({ familia: 'correr', dato: { valor: 2400, unidad: 'segundos' }, veredicto: null });
    // El presupuesto: el objetivo repartido con las proporciones de su propia carrera (2400 de 3070).
    expect(run.dato?.referencia).toMatchObject({ valor: 2502, delta: 2400 - 2502, de: 'presupuesto_objetivo' });
    expect(porId(ls, 'carrera.tramo.skierg')?.familia).toBe('estaciones');
  });

  test('previsión incompleta: sin total (sería un tiempo de menos), y cada tramo sin dato pide su marca', () => {
    const ls = lecturasCarrera(entrada(prevision(false)));
    const p = porId(ls, 'carrera.prevision')!;
    expect(p.estado).toBe('sin_dato');
    expect(p.cobertura.falta).toEqual({ por: 'marcas', faltan: 3 });
    expect(porId(ls, 'carrera.tramo.skierg')?.cobertura.falta).toEqual({ por: 'marcas', faltan: 1 });
  });

  test('dobles sin pareja: la previsión la configura el coach, y no se inventan tramos', () => {
    const ls = lecturasCarrera(entrada({ formato: 'dobles', total_s: null, banda_s: null, observado_pct: null, tramos: [], sin_pareja: true, pareja: null }));
    expect(porId(ls, 'carrera.prevision')?.cobertura.falta).toEqual({ por: 'pareja' });
    expect(ls.some((l) => l.id.startsWith('carrera.tramo.'))).toBe(false);
  });
});
