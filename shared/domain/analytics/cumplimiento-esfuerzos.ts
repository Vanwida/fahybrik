// LO QUE SE PRESCRIBIÓ Y LO QUE SE HIZO — los tipos del cumplimiento por tramo y
// los esfuerzos que prescribe cada línea del plan (docs/analiticas/modelo.md A8).
//
// Una LÍNEA del plan (`template_segments`) prescribe uno o varios ESFUERZOS: las
// repeticiones de una serie de carrera (con sus recuperaciones), las series de
// fuerza, los minutos de un EMOM, la ventana de un rodaje. Un TRAMO ejecutado
// (`segment_executions`) es lo que el atleta hizo de esa línea: una pierna, una
// tabla de series, o el bloque entero de una vez. Aquí viven las dos formas y la
// expansión de la línea en esfuerzos; el emparejamiento y el juicio, en
// `cumplimiento-tramo.ts` y `cumplimiento-lineas.ts`.
//
// Puro y sin base de datos.

import { legacyToStructure } from '../prescription/run-structure-convert';
import { flattenPhase, type PhaseRole, type Segment } from '../prescription/run-structure';
import { formatMeta } from '../prescription/format';
import { prescriptionTarget, setMeasure, setTarget, type Prescription } from '../prescription/types';
import type { PrescriptionRole } from '../prescription/completeness';
import type { Ancla, Familia, Unidad } from './lectura';
import {
  objetivoDeSegmento,
  objetivoDeTarget,
  type EjeCumplimiento,
  type EjeDosis,
  type MotivoSinDato,
  type ObjetivoTramo,
  type PreguntaCumplimiento,
  type VeredictoCumplimiento,
} from './cumplimiento-bandas';

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

/** Una línea del plan de la sesión, con la prescripción con la que se entrenó. */
export interface LineaPlan {
  template_segment_id: string;
  /** `block_position`: las líneas de un mismo bloque comparten número. */
  bloque: number;
  posicion: number;
  /** Formato canónico del bloque (`block_format`, o el de la plantilla). */
  formato: string | null;
  /** La del tramo al entrenar (`prescription_snapshot`) o, sin ella, la de la línea. */
  prescripcion: Prescription | null;
  /** La del ejercicio (0053) o, si no hay, la de la prescripción. */
  modalidad: string | null;
  familia: Familia;
  rol: PrescriptionRole;
  ejercicio: string | null;
}

export interface SerieHecha {
  indice: number;
  reps: number | null;
  reps_prescritas: number | null;
  kg: number | null;
  /** Los kilos que la app resolvió al entrenar (un %RM ya convertido). */
  kg_prescritos: number | null;
  rpe: number | null;
  rir: number | null;
  /** `done` | `scaled` | `skipped`. */
  estado: string;
}

export interface TramoEjecutado {
  id: string;
  template_segment_id: string | null;
  posicion: number;
  segundos: number | null;
  metros: number | null;
  ritmo_s_km: number | null;
  split_s_500m: number | null;
  vatios: number | null;
  pulso_medio: number | null;
  /** La que declaró la cinta. */
  inclinacion_pct: number | null;
  /** La medida (cinta o altitud, 0185). */
  pendiente_pct: number | null;
  reps: number | null;
  kg: number | null;
  calorias: number | null;
  /** Minutos cumplidos y prescritos de un EMOM (`emom_rounds_*`). */
  rondas: number | null;
  rondas_prescritas: number | null;
  /** `leg_index` (0146): el tramo de la estructura que fue, en carrera. */
  pierna: number | null;
  papel_pierna: string | null;
  /** `round_index`: > 0 cuenta los esfuerzos de un bloque por rondas, no de la línea. */
  ronda: number | null;
  /** Vocabulario de tramos: run | row | ski | bike | strength | other. */
  modalidad: string | null;
  series: readonly SerieHecha[];
}

// ---------------------------------------------------------------------------
// SALIDA
// ---------------------------------------------------------------------------

export interface ObjetivoComprobacion {
  min: number | null;
  max: number | null;
  zona: { desde: number; hasta: number } | null;
  ancla: Ancla | null;
}

/** Una pregunta sobre un tramo, en la unidad de su eje. */
export interface Comprobacion {
  eje: EjeCumplimiento;
  pregunta: PreguntaCumplimiento;
  unidad: Unidad | null;
  objetivo: ObjetivoComprobacion | null;
  hecho: number | null;
  /** La holgura aplicada, en la unidad del eje (null en lo que no la lleva). */
  holgura: number | null;
  /** Distancia al borde de la banda (sin holgura), con signo; 0 dentro. */
  delta: number | null;
  veredicto: VeredictoCumplimiento;
  motivo: MotivoSinDato | null;
}

export interface FilaSerie {
  indice: number;
  veredicto: VeredictoCumplimiento;
  comprobaciones: Comprobacion[];
}

export type FaseTramo = 'calentamiento' | 'principal' | 'vuelta';

export interface FilaTramo {
  segment_execution_id: string;
  posicion: number;
  pierna: number | null;
  papel: 'trabajo' | 'recuperacion';
  fase: FaseTramo;
  /** La n-ésima repetición de trabajo de su línea (1…), cuando se sabe. */
  ordinal: number | null;
  /** Un tramo que cubre varios esfuerzos prescritos (o un bloque entero). */
  plegado: boolean;
  veredicto: VeredictoCumplimiento;
  motivo: MotivoSinDato | null;
  comprobaciones: Comprobacion[];
  series: FilaSerie[];
}

/**
 *   ejecutada    tiene sus tramos
 *   cubierta     la cubre el tramo de un bloque grabado entero (rondas, for time…)
 *   sin_ejecutar la ejecución tiene tramos y ninguno es de esta línea
 *   sin_detalle  la ejecución no tiene tramos (una importación, «marcar como hecha»)
 */
export type EstadoLinea = 'ejecutada' | 'cubierta' | 'sin_ejecutar' | 'sin_detalle';

export interface FilaLinea {
  template_segment_id: string;
  bloque: number;
  posicion: number;
  ejercicio: string | null;
  familia: Familia;
  rol: PrescriptionRole;
  formato: string | null;
  estado: EstadoLinea;
  tramos: FilaTramo[];
}

// ---------------------------------------------------------------------------
// LOS ESFUERZOS PRESCRITOS DE UNA LÍNEA
// ---------------------------------------------------------------------------

export interface Dosis {
  eje: EjeDosis;
  valor: number;
  max: number | null;
}

export interface Esfuerzo {
  papel: 'trabajo' | 'recuperacion';
  fase: FaseTramo;
  dosis: Dosis | null;
  objetivo: ObjetivoTramo | null;
  /** La cuesta que el coach pidió en ese tramo (#61). */
  inclinacion_pct: number | null;
  ordinal: number | null;
}

const FASE_DE_ROL: Record<PhaseRole, FaseTramo> = { warmup: 'calentamiento', main: 'principal', cooldown: 'vuelta' };
export const FASE_DE_LINEA: Record<PrescriptionRole, FaseTramo> = { calentamiento: 'calentamiento', principal: 'principal', vuelta: 'vuelta' };

function dosisDeMedida(m: ReturnType<typeof setMeasure>): Dosis | null {
  if (!m) return null;
  switch (m.kind) {
    case 'distance':
      return m.meters > 0 ? { eje: 'distancia', valor: m.meters, max: m.max ?? null } : null;
    case 'duration':
      return m.seconds > 0 ? { eje: 'tiempo', valor: m.seconds, max: m.max ?? null } : null;
    case 'reps':
      return m.value > 0 ? { eje: 'reps', valor: m.value, max: m.max ?? null } : null;
    case 'calories':
      return m.value > 0 ? { eje: 'calorias', valor: m.value, max: m.max ?? null } : null;
    case 'reps_to_failure':
      return null;
  }
}

/** ¿El formato puntúa por TIEMPO? Entonces su `total_s` es un TOPE, no una ventana. */
export function puntuaTiempo(p: Prescription | null): boolean {
  return formatMeta(p?.scheme)?.score === 'time';
}

/** El tope de tiempo de una línea de un formato que puntúa tiempo (for time, chipper…). */
export function topeDe(p: Prescription | null): number | null {
  if (!p || p.total_s == null || p.total_s <= 0) return null;
  return puntuaTiempo(p) ? p.total_s : null;
}

/** La estructura de carrera de una línea de correr (la escrita o la sembrada del plano). */
export function estructuraDe(linea: LineaPlan) {
  if (linea.modalidad !== 'run' || !linea.prescripcion) return null;
  const s = linea.prescripcion.structure ?? legacyToStructure(linea.prescripcion);
  return s && s.length > 0 ? s : null;
}

function esfuerzoDeSegmento(seg: Segment, fase: FaseTramo, ordinal: number | null): Esfuerzo {
  return {
    papel: seg.kind === 'work' ? 'trabajo' : 'recuperacion',
    fase,
    dosis: seg.measure.type === 'distance' ? { eje: 'distancia', valor: seg.measure.m, max: null } : { eje: 'tiempo', valor: seg.measure.s, max: null },
    objetivo: objetivoDeSegmento(seg.target),
    inclinacion_pct: seg.incline_pct ?? null,
    ordinal,
  };
}

/**
 * Los esfuerzos que la línea prescribe, en orden. Correr: los tramos de su
 * estructura (el mismo espacio de índices que `leg_index`, recuperaciones
 * dentro). El resto: rondas × series de trabajo (las de aproximación no son
 * trabajo), o la ventana del bloque × rondas (un EMOM, unas series por tiempo),
 * o un único esfuerzo con la ventana y el objetivo del bloque.
 */
export function esfuerzosDeLinea(linea: LineaPlan): Esfuerzo[] {
  const p = linea.prescripcion;
  if (!p) return [];
  const estructura = estructuraDe(linea);
  if (estructura) {
    const out: Esfuerzo[] = [];
    let ordinal = 0;
    for (const fase of estructura) {
      // Una línea de calentamiento o de vuelta lo es entera, aunque su estructura
      // sembrada del plano solo tenga fase «main»; en la principal manda la fase.
      const faseTramo = linea.rol === 'principal' ? FASE_DE_ROL[fase.role] : FASE_DE_LINEA[linea.rol];
      for (const seg of flattenPhase(fase)) {
        if (seg.kind === 'work') ordinal += 1;
        out.push(esfuerzoDeSegmento(seg, faseTramo, seg.kind === 'work' ? ordinal : null));
      }
    }
    return out;
  }

  const fase = FASE_DE_LINEA[linea.rol];
  const objetivoBloque = prescriptionTarget(p);
  const rondas = p.rounds != null && p.rounds > 0 ? p.rounds : 1;
  const sets = (p.sets ?? []).filter((s) => !s.is_approach);
  const out: Esfuerzo[] = [];
  if (sets.length > 0) {
    for (let r = 0; r < rondas; r++) {
      for (const s of sets) {
        out.push({
          papel: 'trabajo',
          fase,
          dosis: dosisDeMedida(setMeasure(s)),
          objetivo: objetivoDeTarget(setTarget(s) ?? objetivoBloque, linea.modalidad),
          inclinacion_pct: null,
          ordinal: out.length + 1,
        });
      }
    }
    return out;
  }
  if (p.work_s != null && p.work_s > 0) {
    for (let r = 0; r < rondas; r++) {
      out.push({ papel: 'trabajo', fase, dosis: { eje: 'tiempo', valor: p.work_s, max: null }, objetivo: objetivoDeTarget(objetivoBloque, linea.modalidad), inclinacion_pct: null, ordinal: r + 1 });
    }
    return out;
  }
  const ventana = p.total_s != null && p.total_s > 0 && !puntuaTiempo(p) ? p.total_s : null;
  return [
    {
      papel: 'trabajo',
      fase,
      dosis: ventana != null ? { eje: 'tiempo', valor: ventana, max: null } : null,
      objetivo: objetivoDeTarget(objetivoBloque, linea.modalidad),
      inclinacion_pct: null,
      ordinal: 1,
    },
  ];
}
