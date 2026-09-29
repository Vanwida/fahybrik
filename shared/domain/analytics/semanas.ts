// SEMANA A SEMANA — ¿hace lo que toca? Carga y horas por familia, plan frente a
// hecho, sobre el mismo eje (docs/analiticas/modelo.md §3 pregunta 3, A7).
//
// Las semanas son las del ATLETA: lunes a domingo en su calendario. La ventana
// del panel se corta en días, así que la primera y la última semana pueden
// venir partidas — se dibujan igual (son lo que hubo) y el cliente lo sabe por
// las fechas. Un día sin sesión es un cero real; una semana sin plan es un hueco
// (`v: null`) en la serie de plan, no un cero: no había nada planificado, que es
// distinto de planificar descanso… y hoy el modelo no distingue las dos, así que
// «sin asignaciones» se dibuja como hueco.
//
// Puro y sin base de datos.

import { isoDateString, mondayOfWeek, parseIsoDate } from '../dates';
import type { DiaPlan } from './carga-plan';
import type { DiaCarga } from './carga-tramo';
import {
  comparacionDe,
  FAMILIA_ETIQUETA_ES,
  FAMILIAS,
  lecturaMedida,
  lecturaSinDato,
  pctCobertura,
  serieDe,
  type Familia,
  type Lectura,
  type Parte,
  type Procedencia,
  type PuntoSerie,
  type Unidad,
} from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import type { VentanaResuelta } from './ventana';

export interface EntradaSemanas {
  /** Los días de la ventana Y del periodo anterior (contiguos). */
  diario: readonly DiaCarga[];
  /** El plan de los mismos días. */
  plan: readonly DiaPlan[];
  ventana: VentanaResuelta;
  metodo: CoachAnalyticsMethod;
}

const GRUPO = 'semanas' as const;
const SEGUNDOS_POR_HORA = 3600;

/** El lunes (ISO) de la semana de un día local. */
export function lunesDe(dia: string): string {
  return isoDateString(mondayOfWeek(parseIsoDate(dia)));
}

interface Semana {
  lunes: string;
  tss: number;
  segundos: number;
  sesiones: number;
  sin_saber_s: number;
  plan_tss: number | null;
  plan_segundos: number | null;
  plan_sesiones: number;
  plan_sin_saber: number;
  por_familia: Partial<Record<Familia, { tss: number; segundos: number; plan_tss: number | null; plan_segundos: number | null }>>;
}

/** Agrupa días hechos y planificados por semana del atleta, en orden. */
export function semanasDe(diario: readonly DiaCarga[], plan: readonly DiaPlan[], desde: string, hasta: string): Semana[] {
  const porLunes = new Map<string, Semana>();
  const de = (lunes: string): Semana => {
    let s = porLunes.get(lunes);
    if (!s) {
      s = { lunes, tss: 0, segundos: 0, sesiones: 0, sin_saber_s: 0, plan_tss: null, plan_segundos: null, plan_sesiones: 0, plan_sin_saber: 0, por_familia: {} };
      porLunes.set(lunes, s);
    }
    return s;
  };
  const familiaDe = (s: Semana, f: Familia) => {
    const x = s.por_familia[f] ?? { tss: 0, segundos: 0, plan_tss: null, plan_segundos: null };
    s.por_familia[f] = x;
    return x;
  };
  for (const d of diario) {
    if (d.date < desde || d.date > hasta) continue;
    const s = de(lunesDe(d.date));
    s.tss += d.tss;
    s.segundos += d.known_seconds + d.unknown_seconds;
    s.sesiones += d.sesiones;
    s.sin_saber_s += d.unknown_seconds;
    for (const [f, v] of Object.entries(d.por_familia) as Array<[Familia, { tss: number; segundos: number }]>) {
      const x = familiaDe(s, f);
      x.tss += v.tss;
      x.segundos += v.segundos;
    }
  }
  for (const d of plan) {
    if (d.date < desde || d.date > hasta || d.sesiones === 0) continue;
    const s = de(lunesDe(d.date));
    s.plan_tss = (s.plan_tss ?? 0) + d.tss;
    s.plan_segundos = (s.plan_segundos ?? 0) + d.segundos;
    s.plan_sesiones += d.sesiones;
    s.plan_sin_saber += d.sin_saber;
    for (const [f, v] of Object.entries(d.por_familia) as Array<[Familia, { tss: number; segundos: number }]>) {
      const x = familiaDe(s, f);
      x.plan_tss = (x.plan_tss ?? 0) + v.tss;
      x.plan_segundos = (x.plan_segundos ?? 0) + v.segundos;
    }
  }
  return [...porLunes.values()].sort((a, b) => (a.lunes < b.lunes ? -1 : 1));
}

function procedencia(de: string, explica_es: string, medida: boolean): Procedencia {
  return { de, explica_es, medida, ancla: null, proveedor: null };
}

function sumaEn(diario: readonly DiaCarga[], desde: string, hasta: string, f: (d: DiaCarga) => number): number {
  return diario.filter((d) => d.date >= desde && d.date <= hasta).reduce((a, d) => a + f(d), 0);
}

function repartoPorFamilia(diario: readonly DiaCarga[], desde: string, hasta: string, campo: 'tss' | 'segundos', unidad: Unidad) {
  const totales: Partial<Record<Familia, number>> = {};
  for (const d of diario) {
    if (d.date < desde || d.date > hasta) continue;
    for (const [f, v] of Object.entries(d.por_familia) as Array<[Familia, { tss: number; segundos: number }]>) {
      totales[f] = (totales[f] ?? 0) + (campo === 'tss' ? v.tss : v.segundos / SEGUNDOS_POR_HORA);
    }
  }
  const total = Object.values(totales).reduce((a, b) => a + (b ?? 0), 0);
  const partes: Parte[] = FAMILIAS.filter((f) => (totales[f] ?? 0) > 0).map((f) => ({
    code: f,
    etiqueta_es: FAMILIA_ETIQUETA_ES[f],
    valor: totales[f]!,
    pct: total > 0 ? (totales[f]! / total) * 100 : null,
  }));
  return { unidad, total, partes };
}

/** Las lecturas del bloque: carga, horas y sesiones por semana, y la carga por familia. */
export function lecturasSemanas(e: EntradaSemanas): Lectura[] {
  const { ventana: v, metodo: m } = e;
  const semanas = semanasDe(e.diario, e.plan, v.desde, v.hasta);
  const dias = e.diario.filter((d) => d.date >= v.desde && d.date <= v.hasta);
  const dias_con_dato = dias.filter((d) => d.known_seconds + d.unknown_seconds > 0).length;
  const sesiones = dias.reduce((a, d) => a + d.sesiones, 0);
  const cobertura = { muestras: sesiones, dias_ventana: v.dias, dias_con_dato, pct: pctCobertura(dias_con_dato, v.dias) };
  const sinSaber = dias.reduce((a, d) => a + d.unknown_seconds, 0);
  const total = dias.reduce((a, d) => a + d.known_seconds + d.unknown_seconds, 0);
  const anterior = v.anterior;

  const comparar = (valor: number, campo: (d: DiaCarga) => number, unidad: Unidad, cambio: number | null) =>
    anterior
      ? comparacionDe({
          valor,
          anterior: sumaEn(e.diario, anterior.desde, anterior.hasta, campo),
          unidad,
          periodo: { desde: anterior.desde, hasta: anterior.hasta },
          cambio_minimo: cambio,
        })
      : null;

  const puntos = (f: (s: Semana) => number | null): PuntoSerie[] => semanas.map((s) => ({ t: s.lunes, v: f(s) }));
  const explicaSinSaber = sinSaber > 0 && total > 0 ? ` Un ${Math.round((sinSaber / total) * 100)} % del tiempo no entra en la carga (sin medir ni puntuar).` : '';

  if (sesiones === 0) {
    const falta = { por: 'historia', llevas: 0, hacen: v.dias } as const;
    return [
      lecturaSinDato({ id: 'semanas.carga', grupo: GRUPO, titulo_es: 'Carga por semana', falta, cobertura, procedencia: procedencia('suma_tss_semana', 'La carga de cada semana, lunes a domingo, frente a la planificada.', true) }),
      lecturaSinDato({ id: 'semanas.horas', grupo: GRUPO, titulo_es: 'Horas por semana', falta, cobertura, procedencia: procedencia('suma_horas_semana', 'Las horas entrenadas cada semana, frente a las planificadas.', true) }),
      lecturaSinDato({ id: 'semanas.sesiones', grupo: GRUPO, titulo_es: 'Entrenos por semana', falta, cobertura, procedencia: procedencia('sesiones_semana', 'Los entrenos hechos cada semana, frente a los planificados.', true) }),
    ];
  }

  const tssTotal = dias.reduce((a, d) => a + d.tss, 0);
  const horasTotal = total / SEGUNDOS_POR_HORA;

  const lecturas: Lectura[] = [
    lecturaMedida({
      id: 'semanas.carga',
      grupo: GRUPO,
      titulo_es: 'Carga por semana',
      dato: { valor: tssTotal, unidad: 'tss', referencia: null },
      comparacion: comparar(tssTotal, (d) => d.tss, 'pct', m.cambio_carga_pct),
      serie: serieDe({ unidad: 'tss', paso: 'semana', puntos: puntos((s) => s.tss), plan: puntos((s) => s.plan_tss) }),
      reparto: repartoPorFamilia(e.diario, v.desde, v.hasta, 'tss', 'tss'),
      cobertura,
      procedencia: procedencia('suma_tss_semana', `La carga de cada semana, lunes a domingo, frente a la planificada.${explicaSinSaber}`, true),
    }),
    lecturaMedida({
      id: 'semanas.horas',
      grupo: GRUPO,
      titulo_es: 'Horas por semana',
      dato: { valor: horasTotal, unidad: 'horas', referencia: null },
      comparacion: comparar(horasTotal, (d) => (d.known_seconds + d.unknown_seconds) / SEGUNDOS_POR_HORA, 'pct', m.cambio_horas_pct),
      serie: serieDe({
        unidad: 'horas',
        paso: 'semana',
        puntos: puntos((s) => s.segundos / SEGUNDOS_POR_HORA),
        plan: puntos((s) => (s.plan_segundos == null ? null : s.plan_segundos / SEGUNDOS_POR_HORA)),
      }),
      reparto: repartoPorFamilia(e.diario, v.desde, v.hasta, 'segundos', 'horas'),
      cobertura,
      procedencia: procedencia('suma_horas_semana', 'Las horas entrenadas cada semana, frente a las que el plan escribe.', true),
    }),
    lecturaMedida({
      id: 'semanas.sesiones',
      grupo: GRUPO,
      titulo_es: 'Entrenos por semana',
      dato: { valor: sesiones, unidad: 'sesiones', referencia: null },
      comparacion: comparar(sesiones, (d) => d.sesiones, 'sesiones', null),
      serie: serieDe({ unidad: 'sesiones', paso: 'semana', puntos: puntos((s) => s.sesiones), plan: puntos((s) => (s.plan_sesiones > 0 ? s.plan_sesiones : null)) }),
      cobertura,
      procedencia: procedencia('sesiones_semana', 'Los entrenos hechos cada semana, frente a los planificados.', true),
    }),
  ];

  // UNA POR FAMILIA con algo que decir (hecho o plan). Es lo que TrainingPeaks
  // no puede: la fuerza y las estaciones en la misma unidad que la carrera.
  for (const f of FAMILIAS) {
    const conDato = semanas.some((s) => (s.por_familia[f]?.tss ?? 0) > 0 || (s.por_familia[f]?.plan_tss ?? 0) > 0);
    if (!conDato) continue;
    const totalF = dias.reduce((a, d) => a + (d.por_familia[f]?.tss ?? 0), 0);
    const horasF = dias.reduce((a, d) => a + (d.por_familia[f]?.segundos ?? 0), 0) / SEGUNDOS_POR_HORA;
    lecturas.push(
      lecturaMedida({
        id: `semanas.carga.${f}`,
        grupo: GRUPO,
        familia: f,
        titulo_es: FAMILIA_ETIQUETA_ES[f],
        dato: { valor: totalF, unidad: 'tss', referencia: null },
        comparacion: comparar(totalF, (d) => d.por_familia[f]?.tss ?? 0, 'pct', m.cambio_carga_pct),
        serie: serieDe({
          unidad: 'tss',
          paso: 'semana',
          puntos: puntos((s) => s.por_familia[f]?.tss ?? 0),
          plan: puntos((s) => s.por_familia[f]?.plan_tss ?? null),
        }),
        reparto: {
          unidad: 'horas',
          total: horasF,
          partes: [{ code: f, etiqueta_es: FAMILIA_ETIQUETA_ES[f], valor: horasF, pct: horasTotal > 0 ? (horasF / horasTotal) * 100 : null }],
        },
        cobertura,
        procedencia: procedencia('suma_tss_semana_familia', `La carga de ${FAMILIA_ETIQUETA_ES[f].toLowerCase()} cada semana, frente a la planificada.`, true),
      }),
    );
  }

  return lecturas;
}
