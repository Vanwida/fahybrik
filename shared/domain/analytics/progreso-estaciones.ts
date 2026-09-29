// ¿MEJORO EN ESTACIONES Y EN LOS WOD? — dos filas y un detalle
// (docs/analiticas/modelo.md, «Detalles por familia», estaciones y WOD).
//
// UNA ESTACIÓN SE COMPARA CONSIGO MISMA: el mismo ejercicio, la misma DOSIS
// (metros o reps) y la misma CARGA. Un sled push de 25 m con 150 kg y uno de 50 m
// con 100 kg son dos pruebas distintas, y compararlas sería comparar dos cosas.
// Solo cuenta un tramo que guarda su dosis medida y su tiempo, y en un formato
// donde el tiempo es el resultado: en un EMOM, un tabata, un death by o un AMRAP
// el reloj lo pone el formato, no el atleta. Sin kilos apuntados, la prueba es
// «sin carga» — nunca se inventa la del plan.
//
// UN WOD DE REFERENCIA ES UNO QUE SE REPITE: la misma plantilla hecha al menos
// dos veces, o una simulación HYROX (una simulación se compara con las suyas por
// naturaleza). Un metcon suelto hecho una vez no tiene contra qué mejorar. La
// puntuación es un tiempo (menos es mejor) o rondas + reps (más es mejor): las
// reps sueltas cuentan como fracción de ronda cuando se saben las reps de una
// ronda (la regla del vivo: una tarea por distancia cuenta 1, las calorías como
// reps); si no se saben, solo se comparan puntuaciones en rondas enteras.
//
// Puro y sin base de datos.

import type { Measure } from '../prescription/types';
import { lecturaSinDato, type Lectura, type Procedencia, type Unidad } from './lectura';
import type { CoachAnalyticsMethod } from './metodo';
import {
  enPeriodo,
  faltaDeFamiliaVacia,
  lecturaProgreso,
  medidasDe,
  mejorDe,
  MINIMO_MEJOR,
  referenciaRecord,
  serieDeIntentos,
  type Fechada,
  type FilaProgreso,
  type SalidaFamilia,
  type Sentido,
} from './progreso';
import { recordsPorPrueba, type CandidatoRecord } from './records';
import type { VentanaResuelta } from './ventana';

/** Un tramo de una estación HYROX, en el día local del atleta. */
export interface TramoEstacion extends Fechada {
  sesion_id: string;
  /** `exercises.slug`. */
  slug: string;
  nombre: string;
  segundos: number;
  metros: number | null;
  reps: number | null;
  kg: number | null;
  /** El formato del bloque, normalizado. */
  formato: string | null;
  trabajo: boolean;
}

/** Una sesión puntuada, con la plantilla de la que sale. */
export interface PuntuacionWod extends Fechada {
  sesion_id: string;
  /** La plantilla raíz (la instancia apunta a su original). */
  wod_id: string;
  nombre: string;
  formato: string | null;
  tiempo_s: number | null;
  rondas: number | null;
  reps: number | null;
  /** Reps de una ronda, si la plantilla lo dice. */
  reps_por_ronda: number | null;
}

/** Formatos en los que el tiempo lo pone el reloj, no el atleta. Mecanismo. */
const TIEMPO_FIJO: ReadonlySet<string> = new Set(['emom', 'tabata', 'death_by', 'amrap']);

export const FORMATO_SIMULACION = 'hyrox_sim';

interface IntentoEstacion extends Fechada {
  prueba: string;
  titulo: string;
  segundos: number;
}

function redondeoCarga(kg: number): number {
  return Math.round(kg * 2) / 2;
}

/** La prueba de un tramo de estación, o null si no guarda dosis y tiempo en un formato cronometrado. */
export function pruebaEstacion(t: TramoEstacion): { prueba: string; titulo: string } | null {
  if (!t.trabajo || !(t.segundos > 0)) return null;
  if (t.formato != null && TIEMPO_FIJO.has(t.formato)) return null;
  const porMetros = t.metros != null && t.metros > 0;
  const porReps = !porMetros && t.reps != null && t.reps > 0;
  if (!porMetros && !porReps) return null;
  const dosis = porMetros ? `${Math.round(t.metros!)}m` : `${t.reps}r`;
  const dosisEs = porMetros ? `${Math.round(t.metros!)} m` : `${t.reps} reps`;
  const carga = t.kg != null && t.kg > 0 ? redondeoCarga(t.kg) : null;
  return {
    prueba: `estaciones.${t.slug}.${dosis}.${carga != null ? `${carga}kg` : 'sin-carga'}`,
    titulo: [t.nombre, dosisEs, carga != null ? `${String(carga).replace('.', ',')} kg` : null].filter(Boolean).join(' · '),
  };
}

interface IntentoWod extends Fechada {
  wod_id: string;
  nombre: string;
  formato: string | null;
  valor: number;
  unidad: Unidad;
  sentido: Sentido;
}

/**
 * Las reps de UNA ronda de AMRAP, con la regla del vivo (DECISIONS 2026-09-28):
 * una tarea por reps o por calorías cuenta lo que pide; una por distancia o por
 * tiempo cuenta 1 en la ronda a medias. Null si alguna tarea no dice cuántas
 * (un «máximo»), o si no hay tareas: entonces la fracción de ronda no se sabe.
 */
export function repsPorRonda(tareas: ReadonlyArray<Measure | null>): number | null {
  if (tareas.length === 0) return null;
  let total = 0;
  for (const m of tareas) {
    if (m == null) return null;
    switch (m.kind) {
      case 'reps':
      case 'calories':
        if (!(m.value > 0)) return null;
        total += m.value;
        break;
      case 'distance':
      case 'duration':
        total += 1;
        break;
      default:
        return null;
    }
  }
  return total > 0 ? total : null;
}

/** La puntuación de un intento como número comparable, o null si no se puede comparar honestamente. */
export function puntuacionEscalar(p: PuntuacionWod): { valor: number; unidad: Unidad; sentido: Sentido } | null {
  if (p.tiempo_s != null && p.tiempo_s > 0) return { valor: p.tiempo_s, unidad: 'segundos', sentido: 'menor' };
  if (p.rondas == null || p.rondas < 0) return null;
  const sueltas = p.reps ?? 0;
  if (sueltas > 0) {
    if (p.reps_por_ronda == null || p.reps_por_ronda <= 0) return null;
    return { valor: Math.round((p.rondas + sueltas / p.reps_por_ronda) * 100) / 100, unidad: 'rondas', sentido: 'mayor' };
  }
  return p.rondas > 0 ? { valor: p.rondas, unidad: 'rondas', sentido: 'mayor' } : null;
}

export interface EntradaEstaciones {
  ventana: VentanaResuelta;
  tramos: readonly TramoEstacion[];
  puntuaciones: readonly PuntuacionWod[];
  metodo: CoachAnalyticsMethod;
  sin_historia: boolean;
}

export interface SalidaEstaciones {
  estaciones: SalidaFamilia;
  wod: SalidaFamilia;
}

/** La elegida para la fila: comparable, si no con número, si no la de dato más reciente. */
function elegir(filas: readonly FilaProgreso[]): FilaProgreso | null {
  const comparable = (f: FilaProgreso) =>
    f.medidas.actual != null && f.medidas.anterior != null && f.medidas.actual.muestras >= f.minimo && f.medidas.anterior.muestras >= f.minimo;
  const recientes = [...filas].sort((a, b) => (b.medidas.ultima?.ultimo ?? '').localeCompare(a.medidas.ultima?.ultimo ?? ''));
  return filas.find(comparable) ?? filas.find((f) => f.medidas.actual != null) ?? recientes.find((f) => f.medidas.ultima != null) ?? null;
}

/** Ordena pruebas por intentos en la ventana (y en la anterior), para que la principal vaya primero. */
function porUso<T extends Fechada>(grupos: Map<string, T[]>, ventana: VentanaResuelta): Array<[string, T[]]> {
  const n = (xs: readonly T[], p: { desde: string; hasta: string } | null) => (p ? enPeriodo(xs, p).length : 0);
  return [...grupos.entries()].sort(([ka, a], [kb, b]) => n(b, ventana) - n(a, ventana) || n(b, ventana.anterior) - n(a, ventana.anterior) || ka.localeCompare(kb));
}

export function progresoEstaciones(e: EntradaEstaciones): SalidaEstaciones {
  return { estaciones: estaciones(e), wod: wods(e) };
}

function estaciones(e: EntradaEstaciones): SalidaFamilia {
  const { ventana } = e;
  const vacia = faltaDeFamiliaVacia(e.sin_historia, ventana);
  const proc: Procedencia = {
    de: 'estacion_dosis_carga',
    explica_es: 'Tu mejor tiempo en la misma estación, a la misma dosis y con la misma carga. Toda la historia en la serie; la ventana decide qué se compara.',
    medida: true,
    ancla: null,
    proveedor: null,
  };
  const intentos: IntentoEstacion[] = [];
  for (const t of e.tramos) {
    const p = pruebaEstacion(t);
    if (p) intentos.push({ dia: t.dia, prueba: p.prueba, titulo: p.titulo, segundos: t.segundos });
  }
  const candidatos: CandidatoRecord[] = intentos.map((i) => ({
    prueba: i.prueba,
    familia: 'estaciones',
    titulo_es: i.titulo,
    valor: i.segundos,
    unidad: 'segundos',
    sentido: 'menor',
    dia: i.dia,
    procedencia: proc,
  }));
  const records = recordsPorPrueba(candidatos);
  const grupos = new Map<string, IntentoEstacion[]>();
  for (const i of intentos) grupos.set(i.prueba, [...(grupos.get(i.prueba) ?? []), i]);
  const mejor = (xs: readonly IntentoEstacion[]) => mejorDe(xs.map((x) => x.segundos), 'menor');

  const filas: FilaProgreso[] = porUso(grupos, ventana).map(([prueba, xs]) => {
    const medidas = medidasDe(xs, ventana, mejor);
    return {
      id: prueba,
      grupo: 'progreso',
      familia: 'estaciones',
      titulo_es: xs[0]!.titulo,
      unidad: 'segundos',
      sentido: 'menor',
      umbral: { unidad: 'pct', cambio_minimo: e.metodo.cambio_estaciones_pct },
      medidas,
      minimo: MINIMO_MEJOR,
      ventana,
      serie: serieDeIntentos(xs, 'segundos', mejor),
      referencia: referenciaRecord(medidas, records.get(prueba)?.record.valor ?? null),
      procedencia: proc,
      falta_sin_dato: vacia,
    };
  });

  const elegida = elegir(filas);
  const fila = elegida
    ? lecturaProgreso({ ...elegida, id: 'progreso.estaciones', titulo_es: `Estaciones · ${elegida.titulo_es}` })
    : lecturaSinDato({ id: 'progreso.estaciones', grupo: 'progreso', familia: 'estaciones', titulo_es: 'Estaciones', falta: vacia, cobertura: { dias_ventana: ventana.dias }, procedencia: proc });
  return { fila, detalle: [fila, ...filas.map(lecturaProgreso)], candidatos };
}

function wods(e: EntradaEstaciones): SalidaFamilia {
  const { ventana } = e;
  const vacia = faltaDeFamiliaVacia(e.sin_historia, ventana);
  const intentos: IntentoWod[] = [];
  for (const p of e.puntuaciones) {
    const s = puntuacionEscalar(p);
    if (s) intentos.push({ dia: p.dia, wod_id: p.wod_id, nombre: p.nombre, formato: p.formato, ...s });
  }
  // De referencia: se repite, o es una simulación. Y de cada WOD, la puntuación
  // del tipo de su último intento (un for time con cap puede puntuarse en reps).
  const grupos = new Map<string, IntentoWod[]>();
  for (const i of intentos) grupos.set(i.wod_id, [...(grupos.get(i.wod_id) ?? []), i]);
  for (const [id, xs] of [...grupos]) {
    const ultimo = [...xs].sort((a, b) => b.dia.localeCompare(a.dia))[0]!;
    const mismos = xs.filter((x) => x.unidad === ultimo.unidad);
    const esReferencia = mismos.length >= 2 || xs.some((x) => x.formato === FORMATO_SIMULACION);
    if (esReferencia) grupos.set(id, mismos);
    else grupos.delete(id);
  }

  const procDe = (x: IntentoWod): Procedencia => ({
    de: x.formato === FORMATO_SIMULACION ? 'simulacion_hyrox' : 'wod_referencia',
    explica_es:
      x.formato === FORMATO_SIMULACION
        ? 'Tus simulaciones de esta plantilla: el tiempo completo. Toda la historia en la serie.'
        : 'Un WOD que repites: la misma plantilla, puntuada cada vez. Toda la historia en la serie.',
    medida: true,
    ancla: null,
    proveedor: null,
  });
  const candidatos: CandidatoRecord[] = [...grupos.values()].flat().map((x) => ({
    prueba: `wod.${x.wod_id}`,
    familia: 'wod',
    titulo_es: x.nombre,
    valor: x.valor,
    unidad: x.unidad,
    sentido: x.sentido,
    dia: x.dia,
    procedencia: procDe(x),
  }));
  const records = recordsPorPrueba(candidatos);

  const filas: FilaProgreso[] = porUso(grupos, ventana).map(([id, xs]) => {
    const x0 = xs[0]!;
    const mejor = (ys: readonly IntentoWod[]) => mejorDe(ys.map((y) => y.valor), x0.sentido);
    const medidas = medidasDe(xs, ventana, mejor);
    return {
      id: `wod.${id}`,
      grupo: 'progreso',
      familia: 'wod',
      titulo_es: x0.nombre,
      unidad: x0.unidad,
      sentido: x0.sentido,
      umbral: { unidad: 'pct', cambio_minimo: e.metodo.cambio_wod_pct },
      medidas,
      minimo: MINIMO_MEJOR,
      ventana,
      serie: serieDeIntentos(xs, x0.unidad, mejor),
      referencia: referenciaRecord(medidas, records.get(`wod.${id}`)?.record.valor ?? null),
      procedencia: procDe(x0),
      falta_sin_dato: vacia,
    };
  });

  const elegida = elegir(filas);
  const fila = elegida
    ? lecturaProgreso({ ...elegida, id: 'progreso.wod', titulo_es: `WOD · ${elegida.titulo_es}` })
    : lecturaSinDato({
        id: 'progreso.wod',
        grupo: 'progreso',
        familia: 'wod',
        titulo_es: 'WOD',
        falta: vacia,
        cobertura: { dias_ventana: ventana.dias },
        procedencia: { de: 'wod_referencia', explica_es: 'Tus WOD de referencia (los que repites) y tus simulaciones.', medida: true, ancla: null, proveedor: null },
      });
  return { fila, detalle: [fila, ...filas.map(lecturaProgreso)], candidatos };
}
