// LOS MEJORES ESFUERZOS DE CORRER — de 400 m a la media, fechados, con su
// contexto (docs/analiticas/modelo.md, «Detalles por familia», correr).
//
// DE DÓNDE SALE UN ESFUERZO (tres alcances y las marcas)
// ------------------------------------------------------
//   actividad  un tramo de trabajo o una sesión entera cuyo largo cae en la
//              banda del peldaño, llevado a la distancia exacta con Riegel
//              (`esfuerzoEnPeldano`, la regla de la curva de siempre).
//   dentro     el tramo más rápido de esa distancia DENTRO de una sesión, sobre
//              la serie continua de distancia del reloj o de la cinta
//              (`mejorTiempoDentro`). Exacto: sin proyección.
//   marca      un test medido o una carrera registrada (`athlete_benchmarks`).
//              Una marca registrada se enseña marcada: no la midió la app.
//
// LA CINTA NO COMPITE CON LA CALLE: cada contexto lleva su récord (la misma regla
// que la biblioteca de marcas, `isPersonalBest`). En la ventana, cada peldaño se
// lee en la calle si hay dato de calle, y si no, en la cinta — y el periodo
// anterior se compara en el MISMO contexto.
//
// Puro y sin base de datos.

import {
  esfuerzoEnPeldano,
  MARATON_M,
  MARCAS_BANDS,
  MEDIA_MARATON_M,
  MEJORES_METERS,
  mejorTiempoDentro,
  RECORDS_METERS,
  type EffortCandidate,
} from '../running/best-efforts';
import { riegelTime } from '../athlete/mark-projection';
import type { Procedencia } from './lectura';
import { enPeriodo, esMejor, type Fechada } from './progreso';
import type { CandidatoRecord } from './records';
import type { Periodo } from './ventana';

export type ContextoCarrera = 'calle' | 'cinta';

/** Un tramo de correr ya leído, en el día local del atleta. */
export interface TramoCorrer extends Fechada {
  sesion_id: string;
  segundos: number;
  metros: number | null;
  /** s/km; si falta, sale de metros y segundos. */
  ritmo_s_km: number | null;
  pulso: number | null;
  pendiente_pct: number | null;
  contexto: ContextoCarrera;
  /** Un intento: ni el marcador de un calentamiento ni la recuperación entre series. */
  trabajo: boolean;
  /** El tipo de sesión (formato normalizado del bloque). */
  tipo: string | null;
  /** Fresco o fatigado (`classifyEffort`), para el Motor. */
  esfuerzo: 'fresco' | 'fatigado' | null;
}

/** La serie continua de distancia acumulada de una sesión (`workout_traces`, señal `distance`). */
export interface TrazaDistancia {
  sesion_id: string;
  dia: string;
  contexto: ContextoCarrera;
  offsets_s: readonly number[];
  values_m: readonly number[];
}

/** Una marca de correr (`athlete_benchmarks`): test medido o carrera registrada. */
export interface MarcaCarrera extends Fechada {
  slug: string;
  segundos: number;
  contexto: ContextoCarrera;
  fuente: 'test' | 'registrada';
}

export type AlcanceEsfuerzo = 'actividad' | 'dentro' | 'marca_test' | 'marca_registrada';

/** Un esfuerzo ya llevado a un peldaño de la escalera. */
export interface EsfuerzoCorrer extends Fechada {
  metros: number;
  segundos: number;
  contexto: ContextoCarrera;
  alcance: AlcanceEsfuerzo;
}

/** Las marcas del catálogo que son un peldaño, con su distancia real. */
const MARCA_A_PELDANO: Readonly<Record<string, { peldano: number; metros: number }>> = {
  run_1k: { peldano: 1000, metros: 1000 },
  run_1mile: { peldano: 1600, metros: 1609.344 },
  run_5k: { peldano: 5000, metros: 5000 },
  run_10k: { peldano: 10000, metros: 10000 },
  run_half: { peldano: MEDIA_MARATON_M, metros: MEDIA_MARATON_M },
  run_marathon: { peldano: MARATON_M, metros: MARATON_M },
};

/** ¿Esta marca es un peldaño de la escalera? */
export function marcaEsPeldano(slug: string): boolean {
  return slug in MARCA_A_PELDANO;
}

function contextoMayoritario(tramos: readonly TramoCorrer[]): ContextoCarrera {
  let cinta = 0;
  let calle = 0;
  for (const t of tramos) {
    const m = t.metros ?? 0;
    if (t.contexto === 'cinta') cinta += m;
    else calle += m;
  }
  return cinta > calle ? 'cinta' : 'calle';
}

/**
 * Todos los esfuerzos del atleta en la escalera de los récords, con su fecha:
 * los tramos de trabajo y las sesiones enteras (por actividad), los mejores
 * tramos dentro de cada serie continua, y las marcas.
 */
export function esfuerzosCorrer(args: {
  tramos: readonly TramoCorrer[];
  trazas: readonly TrazaDistancia[];
  marcas: readonly MarcaCarrera[];
}): EsfuerzoCorrer[] {
  const out: EsfuerzoCorrer[] = [];
  const ofrecer = (c: EffortCandidate, dia: string, contexto: ContextoCarrera) => {
    for (const metros of RECORDS_METERS) {
      const s = esfuerzoEnPeldano(c, metros, MARCAS_BANDS[metros]!);
      if (s != null) out.push({ dia, metros, segundos: s, contexto, alcance: 'actividad' });
    }
  };

  // Por tramo: solo los intentos (una recuperación no es un intento).
  for (const t of args.tramos) {
    if (!t.trabajo || t.metros == null || t.metros <= 0 || t.segundos <= 0) continue;
    ofrecer({ distance_m: t.metros, duration_s: t.segundos, scope: 'segment' }, t.dia, t.contexto);
  }

  // Por sesión: TODO lo corrido, recuperaciones incluidas — «mi mejor 10 km» son
  // los kilómetros que hicieron las piernas (la misma regla que la curva).
  const porSesion = new Map<string, TramoCorrer[]>();
  for (const t of args.tramos) {
    const l = porSesion.get(t.sesion_id) ?? [];
    l.push(t);
    porSesion.set(t.sesion_id, l);
  }
  for (const tramos of porSesion.values()) {
    const conDistancia = tramos.filter((t) => t.metros != null && t.metros > 0 && t.segundos > 0);
    if (conDistancia.length === 0) continue;
    const metros = conDistancia.reduce((a, t) => a + (t.metros ?? 0), 0);
    const segundos = conDistancia.reduce((a, t) => a + t.segundos, 0);
    ofrecer({ distance_m: metros, duration_s: segundos, scope: 'execution' }, tramos[0]!.dia, contextoMayoritario(tramos));
  }

  // Dentro de la actividad: exacto, sobre la serie continua.
  for (const tr of args.trazas) {
    for (const metros of RECORDS_METERS) {
      const s = mejorTiempoDentro(tr.offsets_s, tr.values_m, metros);
      if (s != null) out.push({ dia: tr.dia, metros, segundos: s, contexto: tr.contexto, alcance: 'dentro' });
    }
  }

  // Las marcas que son un peldaño (la milla, llevada a 1600 m con Riegel).
  for (const m of args.marcas) {
    const p = MARCA_A_PELDANO[m.slug];
    if (!p || !Number.isFinite(m.segundos) || m.segundos <= 0) continue;
    const segundos = p.metros === p.peldano ? m.segundos : riegelTime(m.segundos, p.metros, p.peldano);
    out.push({ dia: m.dia, metros: p.peldano, segundos, contexto: m.contexto, alcance: m.fuente === 'test' ? 'marca_test' : 'marca_registrada' });
  }
  return out;
}

/** Cómo se llama un peldaño delante del atleta. */
export function nombrePeldano(metros: number): string {
  if (metros === MEDIA_MARATON_M) return 'Media maratón';
  if (metros === MARATON_M) return 'Maratón';
  if (metros >= 1000 && metros % 1000 === 0) return `${metros / 1000} km`;
  return `${metros} m`;
}

/** Clave estable de un peldaño (la media lleva su medio metro fuera). */
export function clavePeldano(metros: number): string {
  return String(Math.floor(metros));
}

export const PROCEDENCIA_ESFUERZO: Record<AlcanceEsfuerzo, Procedencia> = {
  actividad: {
    de: 'mejor_esfuerzo_actividad',
    explica_es: 'Un tramo o una sesión entera de ese largo, llevado a la distancia exacta (Riegel).',
    medida: true,
    ancla: null,
    proveedor: null,
  },
  dentro: {
    de: 'mejor_esfuerzo_dentro',
    explica_es: 'El tramo más rápido de esa distancia dentro de una sesión, sobre la serie continua del reloj o de la cinta.',
    medida: true,
    ancla: null,
    proveedor: null,
  },
  marca_test: { de: 'marca_test', explica_es: 'Medido en un test.', medida: true, ancla: null, proveedor: null },
  marca_registrada: { de: 'marca_registrada', explica_es: 'Una carrera que registraste tú: no la midió la app.', medida: false, ancla: null, proveedor: null },
};

/** Los candidatos a récord de correr: un récord por peldaño y contexto. */
export function candidatosRecordCorrer(esfuerzos: readonly EsfuerzoCorrer[]): CandidatoRecord[] {
  return esfuerzos.map((e) => ({
    prueba: e.contexto === 'cinta' ? `correr.${clavePeldano(e.metros)}.cinta` : `correr.${clavePeldano(e.metros)}`,
    familia: 'correr',
    titulo_es: e.contexto === 'cinta' ? `${nombrePeldano(e.metros)} · cinta` : nombrePeldano(e.metros),
    valor: e.segundos,
    unidad: 'segundos',
    sentido: 'menor',
    dia: e.dia,
    procedencia: PROCEDENCIA_ESFUERZO[e.alcance],
  }));
}

/**
 * El contexto en que se lee un peldaño en la ventana: la calle si hay dato de
 * calle en ella, si no la cinta. Null si no hay ningún esfuerzo del peldaño en
 * la ventana ni antes (no hay nada que leer).
 */
export function contextoDelPeldano(esfuerzos: readonly EsfuerzoCorrer[], metros: number, ventana: Pick<Periodo, 'desde' | 'hasta'>): ContextoCarrera | null {
  const delPeldano = esfuerzos.filter((e) => e.metros === metros);
  if (delPeldano.length === 0) return null;
  const enVentana = enPeriodo(delPeldano, ventana);
  if (enVentana.some((e) => e.contexto === 'calle')) return 'calle';
  if (enVentana.length > 0) return 'cinta';
  return delPeldano.some((e) => e.contexto === 'calle') ? 'calle' : 'cinta';
}

/** El mejor tiempo de una lista de esfuerzos. */
export function mejorTiempo(esfuerzos: readonly EsfuerzoCorrer[]): number | null {
  let mejor: number | null = null;
  for (const e of esfuerzos) if (mejor == null || esMejor(e.segundos, mejor, 'menor')) mejor = e.segundos;
  return mejor;
}

/** Los peldaños de los mejores de la ventana (de 400 m a la media). */
export const PELDANOS_VENTANA: readonly number[] = MEJORES_METERS;
