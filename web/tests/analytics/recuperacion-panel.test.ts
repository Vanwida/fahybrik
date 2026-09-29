// ¿ASIMILO? (shared/domain/analytics/recuperacion-panel.ts): variabilidad, pulso
// en reposo y sueño contra UNA basal, y el readiness con las bandas del coach.

import { describe, expect, test } from 'vitest';
import { lecturasRecuperacionPanel, veredictoReadiness, type EntradaRecuperacionPanel } from '@fahybrid/shared/domain/analytics/recuperacion-panel';
import { lecturasEstado } from '@fahybrid/shared/domain/analytics/estado';
import { hechosDe } from '@fahybrid/shared/domain/analytics/hechos';
import { defaultCoachAnalyticsMethod } from '@fahybrid/shared/domain/analytics/metodo';
import { resolverVentana } from '@fahybrid/shared/domain/analytics/ventana';
import type { MuestraDia } from '@fahybrid/shared/domain/analytics/basal';
import type { Lectura } from '@fahybrid/shared/domain/analytics/lectura';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

const HOY = '2026-09-29';
const BANDAS = { ok_min: 67, cautela_min: 45, max_edad_dias: 2 };

function dia(offset: number): string {
  return isoDateString(addDays(parseIsoDate(HOY), offset));
}

/** Una muestra por día en [desde, hasta] (desplazamientos desde hoy), con el valor que diga `f`. */
function diario(desde: number, hasta: number, f: (d: number) => number): MuestraDia[] {
  const out: MuestraDia[] = [];
  for (let d = desde; d <= hasta; d++) out.push({ dia: dia(d), valor: f(d) });
  return out;
}

function entrada(over: Partial<EntradaRecuperacionPanel> = {}): EntradaRecuperacionPanel {
  return {
    hoy: HOY,
    ventana: resolverVentana({ clave: '4s', hoy_local: HOY, primera_sesion_iso: '2026-01-01' }),
    metodo: defaultCoachAnalyticsMethod(),
    vfc: [],
    pulso_reposo: [],
    sueno: [],
    proveedor: { vfc: null, pulso_reposo: null, sueno: null },
    readiness: { hoy: null, serie: [], bandas: BANDAS },
    ...over,
  };
}

const porId = (ls: Lectura[], id: string) => ls.find((l) => l.id === id)!;

describe('la variabilidad frente a su basal', () => {
  // Basal (hoy−60 … hoy−15) a 60 ms; lo de antes de la ventana anterior a 58; la última semana a 54.
  const vfc = [...diario(-60, -8, (d) => (d <= -15 ? 60 : 58)), ...diario(-6, 0, () => 54)];

  test('reciente, basal, delta y la palabra con el cambio del coach (5 %): −10 % es «por debajo»', () => {
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc, proveedor: { vfc: 'healthkit', pulso_reposo: null, sueno: null } })), 'recuperacion.variabilidad');
    expect(l.estado).toBe('medida');
    expect(l.dato).toMatchObject({ valor: 54, unidad: 'ms', referencia: { valor: 60, delta: -6 } });
    expect(l.veredicto).toMatchObject({ code: 'por_debajo', tono: 'atencion' });
    expect(l.serie?.referencias?.[0]).toMatchObject({ code: 'basal', valor: 60 });
    expect(l.procedencia).toMatchObject({ de: 'basal_vfc', proveedor: 'healthkit', ancla: null });
    // Comparación: lo reciente al cierre del periodo anterior (hoy−28), en % (la unidad del cambio del coach).
    expect(l.comparacion).toMatchObject({ anterior: 60, unidad: 'pct', cambio_minimo: 5, significativo: true });
    expect(l.comparacion?.delta).toBeCloseTo(-10, 10);
  });

  test('con un cambio mínimo del coach de 15 %, el mismo −10 % está «en tu normal»', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), cambio_variabilidad_pct: 15 };
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc, metodo })), 'recuperacion.variabilidad');
    expect(l.veredicto).toMatchObject({ code: 'en_tu_normal', tono: 'bien' });
  });

  test('la ventana basal del coach manda: con 28 → 0 la basal incluye la semana baja', () => {
    const metodo = { ...defaultCoachAnalyticsMethod(), basal_dias: 28, basal_excluir_dias: 0, hrv_min_nights_baseline: 7 };
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc, metodo })), 'recuperacion.variabilidad');
    // hoy−28 … hoy−1: 14 días a 60, 7 a 58 y 6 a 54 → 1570 / 27 = 58,1.
    expect(l.dato?.referencia?.valor).toBe(58);
    expect(l.veredicto?.code).toBe('por_debajo');
  });

  test('sin noches recientes nadie está midiendo: falta el reloj, no tiempo', () => {
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc: diario(-60, -10, () => 60) })), 'recuperacion.variabilidad');
    expect(l.estado).toBe('sin_dato');
    expect(l.dato).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'dispositivo' });
  });

  test('con noches recientes pero una basal corta, falta tiempo, y se dice cuánto', () => {
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc: [...diario(-19, -15, () => 60), ...diario(-6, 0, () => 55)] })), 'recuperacion.variabilidad');
    expect(l.estado).toBe('sin_dato');
    expect(l.cobertura.falta).toEqual({ por: 'historia', llevas: 5, hacen: 14 });
  });

  test('«todo» no tiene periodo anterior: no se compara', () => {
    const ventana = resolverVentana({ clave: 'todo', hoy_local: HOY, primera_sesion_iso: '2026-01-01' });
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc, ventana })), 'recuperacion.variabilidad');
    expect(l.comparacion).toBeNull();
    expect(l.estado).toBe('medida');
  });

  test('la serie tiene un punto por día de la ventana, con hueco donde no hubo lectura', () => {
    const l = porId(lecturasRecuperacionPanel(entrada({ vfc })), 'recuperacion.variabilidad');
    expect(l.serie?.puntos).toHaveLength(28);
    expect(l.serie?.puntos.find((p) => p.t === dia(-7))?.v).toBeNull();
    expect(l.serie?.puntos.at(-1)).toEqual({ t: HOY, v: 54 });
    expect(l.cobertura).toMatchObject({ dias_ventana: 28, dias_con_dato: 27 });
  });
});

describe('el pulso en reposo y el sueño, con el MISMO mecanismo', () => {
  test('pulso en reposo 4 latidos por encima (umbral 3): «más alto», y eso es mala señal', () => {
    const pulso_reposo = [...diario(-60, -15, () => 50), ...diario(-6, 0, () => 54)];
    const l = porId(lecturasRecuperacionPanel(entrada({ pulso_reposo })), 'recuperacion.pulso_reposo');
    expect(l.dato).toMatchObject({ valor: 54, unidad: 'bpm', referencia: { valor: 50, delta: 4 } });
    expect(l.veredicto).toMatchObject({ code: 'por_encima', tono: 'atencion' });
  });

  test('sueño 0,3 h por debajo (umbral 0,5 h): en tu normal; la línea de la noche completa viaja', () => {
    const sueno = [...diario(-60, -15, () => 7.2), ...diario(-6, 0, () => 6.9)];
    const l = porId(lecturasRecuperacionPanel(entrada({ sueno })), 'recuperacion.sueno');
    expect(l.dato).toMatchObject({ valor: 6.9, unidad: 'horas', referencia: { valor: 7.2, delta: -0.3 } });
    expect(l.veredicto?.code).toBe('en_tu_normal');
    expect(l.serie?.referencias?.map((r) => r.code)).toEqual(['basal', 'objetivo']);
    expect(l.serie?.referencias?.[1]?.valor).toBe(8);
  });
});

describe('el readiness con las bandas del coach (P14)', () => {
  test('hoy 70 con bandas 67/45: «bien», y las dos líneas de corte en la serie', () => {
    const e = entrada({
      readiness: { hoy: { puntos: 70, dia: HOY, delta_7d: 4 }, serie: [{ dia: dia(-30), puntos: 60 }, { dia: dia(-3), puntos: 50 }], bandas: BANDAS },
    });
    const l = porId(lecturasRecuperacionPanel(e), 'recuperacion.readiness');
    expect(l.dato).toMatchObject({ valor: 70, unidad: 'puntos', referencia: { valor: 66, delta: 4, de: 'hace_7d' } });
    expect(l.veredicto).toMatchObject({ code: 'bien', tono: 'bien' });
    expect(l.serie?.referencias?.map((r) => r.valor)).toEqual([45, 67]);
    expect(l.serie?.puntos.find((p) => p.t === dia(-3))?.v).toBe(50);
    expect(l.comparacion).toMatchObject({ anterior: 60, delta: 10, unidad: 'puntos' });
  });

  test('las bandas son del coach: con 75/50, el mismo 70 es «con cautela»', () => {
    expect(veredictoReadiness(70, { ok_min: 75, cautela_min: 50, max_edad_dias: 2 })).toMatchObject({ code: 'cautela', tono: 'atencion' });
    expect(veredictoReadiness(40, BANDAS)).toMatchObject({ code: 'bajo', tono: 'aviso' });
  });

  test('una lectura de hace cinco días se enseña fechada pero sin palabra', () => {
    const e = entrada({ readiness: { hoy: { puntos: 70, dia: dia(-5), delta_7d: null }, serie: [], bandas: BANDAS } });
    const l = porId(lecturasRecuperacionPanel(e), 'recuperacion.readiness');
    expect(l.estado).toBe('medida');
    expect(l.veredicto).toBeNull();
    expect(l.cobertura.falta).toEqual({ por: 'dispositivo' });
    expect(l.procedencia.medida).toBe(false);
  });

  test('sin readiness: sin dato, y lo que falta es la señal', () => {
    const l = porId(lecturasRecuperacionPanel(entrada()), 'recuperacion.readiness');
    expect(l.estado).toBe('sin_dato');
    expect(l.cobertura.falta).toEqual({ por: 'dispositivo' });
  });

  test('la cabecera usa la MISMA palabra, y sin bandas solo el número', () => {
    const con = lecturasEstado({ readiness: { score: 50, recorded_for: HOY, delta_7d: null }, hoy: HOY, forma: [], bandas_readiness: BANDAS });
    expect(con[0]!.veredicto).toMatchObject({ code: 'cautela' });
    const sin = lecturasEstado({ readiness: { score: 50, recorded_for: HOY, delta_7d: null }, hoy: HOY, forma: [] });
    expect(sin[0]!.veredicto).toBeNull();
  });
});

describe('los hechos leen la palabra cuando la hay', () => {
  test('un sueño una décima por debajo de su basal no es «duermes menos»', () => {
    const sueno = [...diario(-60, -15, () => 7.2), ...diario(-6, 0, () => 7.1)];
    const lecturas = lecturasRecuperacionPanel(entrada({ sueno }));
    const fondo: Lectura = {
      id: 'carga.fondo',
      grupo: 'forma',
      familia: null,
      titulo_es: 'Forma',
      estado: 'medida',
      dato: { valor: 60, unidad: 'tss', referencia: null },
      comparacion: null,
      serie: { unidad: 'tss', paso: 'dia', puntos: Array.from({ length: 30 }, (_, i) => ({ t: dia(i - 29), v: 30 + i })), plan: null, referencias: null },
      reparto: null,
      veredicto: null,
      cobertura: { muestras: 30, dias_ventana: 30, dias_con_dato: 30, pct: 100, falta: null },
      procedencia: { de: 'banister_ctl', explica_es: '', medida: true, ancla: null, proveedor: null },
    };
    const hechos = hechosDe([fondo, ...lecturas], defaultCoachAnalyticsMethod());
    expect(hechos.map((h) => h.id)).toEqual(['carga.sube_rapido']);
  });
});
