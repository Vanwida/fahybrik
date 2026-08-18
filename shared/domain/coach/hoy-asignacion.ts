// HOY · qué le falta a un atleta, y por qué no puedo dárselo con un clic.
//
// El fallo que cierra este módulo (recorrido Preview 18-ago, Marc y Guillem):
// la tira de asignación de Hoy contaba UNA sola cosa — el estado de la RECETA
// del coach ("No hay secuencia para N3·5d") — y la hacía hablar por el atleta.
// Marc había recorrido un microciclo de biblioteca que terminó el 26 de julio;
// lo que le falta es SU SIGUIENTE BLOQUE, no la receta del nivel. Guillem nunca
// tuvo ninguno. Los dos salían con el mismo texto y el mismo botón.
//
// Son DOS EJES INDEPENDIENTES:
//
//   A · PROGRAMA DEL ATLETA — un hecho sobre él, computable siempre, que no
//       depende de lo que el coach haya montado: nunca tuvo bloque / lo terminó /
//       tiene uno en curso. Es el TITULAR de la tarjeta.
//
//   B · RECETA DEL NIVEL — lo que el coach tiene montado para su celda
//       (nivel × días). Solo explica POR QUÉ no hay propuesta de un clic, y su
//       arreglo sirve a TODOS los atletas de esa celda, no a este.
//
// De ahí las dos salidas separadas: el camino del ATLETA (elegir un bloque de
// biblioteca para él, que existe y funciona sin secuencia — Marc es la prueba) y
// el camino del MÉTODO (montar la secuencia de la celda). Nunca uno solo, y
// nunca el del método haciéndose pasar por el del atleta.
//
// MECANISMO, no método: aquí no se decide qué bloque toca ni cada cuánto. Solo
// se nombra el hueco y se ofrecen las dos puertas. Nada se asigna solo.

import { longDateEs } from '../dates';

// ── Eje A · el programa del atleta ───────────────────────────────────────────

export type EstadoProgramaAtleta =
  /** Cero recibos de microciclo: nunca ha tenido plan. */
  | { kind: 'nunca_asignado' }
  /** Su último bloque terminó antes de hoy y no hay siguiente. */
  | {
      kind: 'bloque_terminado';
      /** Nombre del microciclo que terminó; null si la plantilla ya no existe. */
      nombre: string | null;
      /** Último día del bloque (ISO). */
      fin: string;
      /** Días de calendario desde `fin` hasta hoy. Siempre >= 1. */
      hueco_dias: number;
    }
  /** Tiene un bloque vigente hoy: NO le falta nada, no es caso de Hoy. */
  | { kind: 'bloque_en_curso'; fin: string };

/** El recibo de microciclo más reciente del atleta (el de `start_date` mayor). */
export interface ReciboBloque {
  /** Último día del bloque (ISO YYYY-MM-DD). */
  end_date: string;
  /** Nombre de la plantilla de microciclo; null si ya no existe. */
  month_name: string | null;
}

/**
 * Clasifica el eje A a partir del último recibo. `hoy` es ISO local de la caja
 * (quien llama lo resuelve con `isoDateString(startOfDayInBox(...))`) para que la
 * frontera "terminó ayer" no dependa de la zona del servidor.
 *
 * Sin recibo → nunca tuvo. Con recibo cuyo `end_date` es hoy o futuro → en curso
 * (un atleta a mitad de bloque NO puede aparecer pidiendo asignación: ese era el
 * segundo fallo de la tira, que solo miraba la inscripción en secuencia).
 */
export function estadoProgramaAtleta(
  recibo: ReciboBloque | null,
  hoy: string,
): EstadoProgramaAtleta {
  if (!recibo) return { kind: 'nunca_asignado' };
  if (recibo.end_date >= hoy) return { kind: 'bloque_en_curso', fin: recibo.end_date };
  return {
    kind: 'bloque_terminado',
    nombre: recibo.month_name,
    fin: recibo.end_date,
    hueco_dias: diasEntre(recibo.end_date, hoy),
  };
}

/** Días de calendario entre dos ISO (`desde` < `hasta`). UTC: ambos son fechas. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** ¿Este atleta tiene un hueco que Hoy deba enseñar? */
export function tieneHueco(programa: EstadoProgramaAtleta): boolean {
  return programa.kind !== 'bloque_en_curso';
}

// ── Eje B · la receta del nivel ──────────────────────────────────────────────
//
// Espeja `ResolveFailureReason` del resolver de secuencias (única fuente de la
// resolución) y separa lo que es del MÉTODO de lo que es dato del ATLETA.

export type EstadoRecetaNivel =
  /** Hay secuencia con microciclos: cabe propuesta de un clic. */
  | { kind: 'lista' }
  /** No hay secuencia para (nivel × días). */
  | { kind: 'sin_receta'; celda: string }
  /** La secuencia existe pero está vacía. */
  | { kind: 'receta_vacia'; celda: string }
  /** No consta cuántos días entrena: dato del atleta, no del método. */
  | { kind: 'faltan_dias' }
  /** Entrena fuera de la banda que cubren las secuencias. */
  | { kind: 'dias_fuera_de_banda'; dias: number; min: number; max: number };

/** ¿El arreglo de este estado es del MÉTODO (sirve a toda la celda) o del ATLETA? */
export function ejeDelArreglo(receta: EstadoRecetaNivel): 'metodo' | 'atleta' | null {
  switch (receta.kind) {
    case 'sin_receta':
    case 'receta_vacia':
      return 'metodo';
    case 'faltan_dias':
    case 'dias_fuera_de_banda':
      return 'atleta';
    case 'lista':
      return null;
  }
}

/**
 * Traduce el "why not" del resolver al eje B. Es traducción, no una segunda
 * resolución: el resolver sigue siendo la única fuente de si una celda resuelve.
 * `not_classified` no debería llegar (Hoy filtra clasificados) y cae a sin receta.
 */
export type FalloReceta =
  | 'no_training_days'
  | 'days_out_of_band'
  | 'empty_sequence'
  | 'no_sequence_for_cell'
  | 'not_classified';

export function recetaDesdeFallo(params: {
  reason: FalloReceta | string;
  celda: string;
  dias: number | null;
  min: number;
  max: number;
}): EstadoRecetaNivel {
  switch (params.reason) {
    case 'no_training_days':
      return { kind: 'faltan_dias' };
    case 'days_out_of_band':
      return {
        kind: 'dias_fuera_de_banda',
        dias: params.dias ?? 0,
        min: params.min,
        max: params.max,
      };
    case 'empty_sequence':
      return { kind: 'receta_vacia', celda: params.celda };
    case 'no_sequence_for_cell':
    case 'not_classified':
    default:
      return { kind: 'sin_receta', celda: params.celda };
  }
}

/** Receta que sí resuelve: cabe propuesta de un clic. */
export const RECETA_LISTA: EstadoRecetaNivel = { kind: 'lista' };

export type AccionAsignacion = 'reponer_bloque' | 'editar_dias' | 'crear_receta';

export type PuertaAsignacion = {
  eje: 'atleta' | 'metodo';
  accion: AccionAsignacion;
  etiqueta: string;
};

/**
 * Las puertas de la tarjeta. El atleta con hueco SIEMPRE puede reponer un
 * bloque de biblioteca (Marc es la prueba: se asignó sin secuencia). La receta
 * vacía abre OTRA puerta, la del método. Nunca una sola que hable por las dos.
 */
export function puertasAsignacion(params: {
  programa: EstadoProgramaAtleta;
  receta: EstadoRecetaNivel;
}): PuertaAsignacion[] {
  const { programa, receta } = params;
  const puertas: PuertaAsignacion[] = [];
  if (!tieneHueco(programa)) return puertas;

  if (receta.kind === 'faltan_dias' || receta.kind === 'dias_fuera_de_banda') {
    puertas.push({ eje: 'atleta', accion: 'editar_dias', etiqueta: 'Editar días' });
  }
  puertas.push({ eje: 'atleta', accion: 'reponer_bloque', etiqueta: 'Reponer bloque' });
  if (ejeDelArreglo(receta) === 'metodo') {
    puertas.push({ eje: 'metodo', accion: 'crear_receta', etiqueta: 'Crear receta' });
  }
  return puertas;
}

// ── Presentación ─────────────────────────────────────────────────────────────

export interface TextoAsignacion {
  /** Titular: SIEMPRE el hecho del atleta (eje A). */
  titular: string;
  /** Segunda línea del eje A cuando aporta (el tamaño del hueco). Puede ser null. */
  hueco: string | null;
  /** Por qué no hay propuesta de un clic (eje B). null cuando la receta está lista. */
  motivo: string | null;
}

/**
 * El texto de la tarjeta. El titular jamás habla de secuencias: habla del atleta.
 * El motivo jamás habla del atleta: habla de lo que falta por montar.
 */
export function textoAsignacion(params: {
  programa: EstadoProgramaAtleta;
  receta: EstadoRecetaNivel;
}): TextoAsignacion {
  const { programa, receta } = params;
  return {
    titular: titularPrograma(programa),
    hueco: huecoPrograma(programa),
    motivo: motivoReceta(receta),
  };
}

function titularPrograma(programa: EstadoProgramaAtleta): string {
  switch (programa.kind) {
    case 'nunca_asignado':
      return 'Todavía no tiene ningún bloque.';
    case 'bloque_terminado':
      return programa.nombre
        ? `Terminó «${programa.nombre}» el ${longDateEs(programa.fin)}.`
        : `Su último bloque terminó el ${longDateEs(programa.fin)}.`;
    case 'bloque_en_curso':
      // Defensivo: quien llama filtra por `tieneHueco` antes de pintar.
      return `Tiene bloque hasta el ${longDateEs(programa.fin)}.`;
  }
}

function huecoPrograma(programa: EstadoProgramaAtleta): string | null {
  if (programa.kind !== 'bloque_terminado') return null;
  const d = programa.hueco_dias;
  if (d < 7) return d === 1 ? 'Lleva 1 día sin bloque.' : `Lleva ${d} días sin bloque.`;
  const semanas = Math.floor(d / 7);
  return semanas === 1 ? 'Lleva 1 semana sin bloque.' : `Lleva ${semanas} semanas sin bloque.`;
}

function motivoReceta(receta: EstadoRecetaNivel): string | null {
  switch (receta.kind) {
    case 'lista':
      return null;
    case 'sin_receta':
      return `Tu periodización de ${receta.celda} no tiene secuencia, así que no hay siguiente que proponerte.`;
    case 'receta_vacia':
      return `La secuencia de ${receta.celda} no tiene microciclos dentro.`;
    case 'faltan_dias':
      return 'No consta cuántos días entrena a la semana.';
    case 'dias_fuera_de_banda':
      return `Entrena ${receta.dias} días; las secuencias cubren de ${receta.min} a ${receta.max}.`;
  }
}
