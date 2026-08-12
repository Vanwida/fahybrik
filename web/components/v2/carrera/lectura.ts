// DEL CABLE A LA LECTURA — el adaptador, y solo el adaptador.
//
// Aquí se traduce lo que sirve el panel (`CoachSessionDetail`: líneas prescritas,
// laps ejecutados, veredictos, traza) a los tramos que entiende `modelo.ts`, y se
// le pide la decisión. La PRECEDENCIA no vive aquí a propósito: vive en
// `modelo.ts`, sobre un tipo de entrada neutro, porque es la pieza que algún día
// colapsa con la del doble en `shared/domain/running/`.
//
// LO QUE NO SE RECALCULA: el veredicto por tramo y su agregado los emite el
// servidor (`buildRunCompliance`), con el MISMO motor que juzga la sesión en
// cualquier otra superficie. Este módulo los LEE. Dos motores para el mismo
// hecho es cómo coach y atleta acaban leyendo veredictos distintos de la misma
// serie.

import {
  flattenSegments,
  legacyToStructure,
  prescriptionToText,
  type Prescription,
  type Segment,
} from '@fahybrid/shared/domain/prescription';
import type {
  RecoveryComplianceVerdict,
  RecoveryDurationVerdict,
  RunComplianceVerdict,
  WorkDurationVerdict,
} from '@fahybrid/shared/domain/adherence';
import type { KmSplit } from '@fahybrid/shared/domain/running/km-splits';
import type { AssignmentDetailItem } from '@/lib/athlete/assignment-detail';
import { bandaDeRitmo } from './banda';
import { decidirLectura, type Papel, type Sujeto, type TramoLeido } from './modelo';

export type { Papel, Sesgo, Sujeto, TramoLeido } from './modelo';
export { MIN_TRAMOS_PARA_VEREDICTO, PENDIENTE_QUE_RETIRA_EL_RITMO_PCT } from './modelo';
import type { CoachSessionDetail } from '@/lib/dashboard/coach/athlete-session-adapter';
import type { SegmentActual } from '@/lib/dashboard/coach/session-actuals';

export interface Lectura {
  sujeto: Sujeto;
  /** El troceado que corresponde. NUNCA los dos: los kilómetros de un 6×800
   *  parten las series por la mitad, y las repeticiones de un rodaje no existen. */
  troceado: 'tramos' | 'kilometros' | 'ninguno';
  /** El eje en el que se lee cada tramo. En cuesta, el tiempo. */
  eje: 'ritmo' | 'tiempo';
  tramos: TramoLeido[];
  kilometros: KmSplit[];
  /** La línea del coach, tal y como la escribió, para las líneas de carrera. */
  prescrito: string | null;
  /** Nombre de la línea de carrera que da la lectura. */
  titulo: string | null;
  /** Las líneas prescritas que esta lectura ya cuenta tramo a tramo. Quien pinte
   *  el resto de la sesión las excluye: repetirlas abajo como chips sería contar
   *  la misma serie dos veces. */
  itemUids: string[];
  /** Hay archivo: la curva se puede dibujar. */
  hayCurva: boolean;
  /** Los tramos se pueden situar sobre la curva. Falso mientras el cable no
   *  traiga el ancla temporal; entonces la curva se dibuja sin sombras y lo
   *  dice, en vez de colocarlas donde no fueron. */
  tramosSituables: boolean;
}

// ---------------------------------------------------------------------------
// La lista plana de tramos prescritos — el espacio de índices de `leg_index`
// ---------------------------------------------------------------------------

/**
 * Repeticiones desplegadas, fases en orden, RECUPERACIONES INCLUIDAS: el mismo
 * espacio que produce `RunStructure.expandedLegs()` en iOS y contra el que la
 * migración 0146 grabó cada `leg_index`. Por eso se indexa, no se zipea.
 *
 * Mismas dos primitivas compartidas que usa `buildRunCompliance` en el servidor
 * (`web/lib/dashboard/coach/run-compliance.ts`), para que las dos lecturas del
 * mismo `leg_index` no puedan apuntar a tramos distintos.
 */
function tramosPrescritos(p: Prescription | null): Segment[] {
  if (!p) return [];
  const structure = p.structure && p.structure.length > 0 ? p.structure : legacyToStructure(p);
  if (!structure) return [];
  return flattenSegments(structure);
}

/** ¿Es esta línea una carrera? La intención manda; sin ella, lo que se registró. */
function esLineaDeCarrera(item: AssignmentDetailItem, actuals: SegmentActual[]): boolean {
  const m = item.prescription_json?.modality;
  if (m) return m === 'run';
  return actuals.some((a) => a.modality === 'run');
}

// ---------------------------------------------------------------------------
// El reparto
// ---------------------------------------------------------------------------

interface Anclas {
  /** Inicio de la ejecución en epoch ms; el cero de la traza. */
  ejecucionMs: number | null;
  /** Inicio de cada tramo por `position`, en epoch ms. */
  porPosition: Map<number, number>;
}

/**
 * Las anclas temporales, si el cable las trae. Hoy no las trae (ni
 * `execution.started_at` ni `SegmentActual.started_at` están en el tipo), así
 * que esto devuelve el mapa vacío y la curva se dibuja sin sombras. Se lee por
 * campo opcional a propósito: el día que el cargador los exponga, la curva se
 * completa sola sin tocar esta pieza.
 */
function anclasDe(detail: CoachSessionDetail): Anclas {
  const exec = detail.execution as (CoachSessionDetail['execution'] & { started_at?: string | null }) | null;
  const ms = (v: string | null | undefined): number | null => {
    if (!v) return null;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  };
  const porPosition = new Map<number, number>();
  for (const a of detail.segment_actuals) {
    const t = ms((a as SegmentActual & { started_at?: string | null }).started_at);
    if (t != null) porPosition.set(a.position, t);
  }
  return { ejecucionMs: ms(exec?.started_at), porPosition };
}

/**
 * QUIÉN GANA EL NÚMERO GRANDE. La precedencia no es una lista de casos: es el
 * orden en que la carrera pierde información. Mientras haya intención medible y
 * tramos que medir, el sujeto es si los clavó; cuando falta la intención queda
 * el contraste; cuando falta la estructura queda la media o el tiempo en zona; y
 * cuando falta el archivo quedan los totales, diciendo por qué.
 */
export function leerCarrera(detail: CoachSessionDetail): Lectura | null {
  const actualsPorItem = new Map<string, SegmentActual[]>();
  for (const a of detail.segment_actuals) {
    if (!a.item_uid) continue;
    const list = actualsPorItem.get(a.item_uid) ?? [];
    list.push(a);
    actualsPorItem.set(a.item_uid, list);
  }
  for (const list of actualsPorItem.values()) list.sort((x, y) => x.position - y.position);

  // Las líneas de carrera de la sesión, en el orden en que las escribió el coach.
  const lineas: AssignmentDetailItem[] = [];
  for (const block of detail.workout?.blocks ?? []) {
    for (const item of block.items) {
      if (esLineaDeCarrera(item, actualsPorItem.get(item.uid) ?? [])) lineas.push(item);
    }
  }
  if (lineas.length === 0) return null;

  const anclas = anclasDe(detail);
  const veredictos = new Map<string, RunComplianceVerdict>();
  const duraciones = new Map<string, WorkDurationVerdict | RecoveryDurationVerdict>();
  const veredictosRec = new Map<string, RecoveryComplianceVerdict>();
  // El ordinal de la repetición DENTRO de su serie y el eje que la juzgó los
  // emite el servidor: «la 3.ª de este 6×800» no es lo mismo que «el 7.º lap de
  // la sesión», y contar aquí volvería a numerar mal en cuanto una sesión tenga
  // dos líneas de carrera.
  const ordinales = new Map<string, number>();
  const ejes = new Map<string, 'pace' | 'hr' | 'rpe'>();
  for (const t of detail.run_compliance.tramos) {
    if (t.position == null) continue;
    const clave = `${t.item_uid}#${t.position}`;
    veredictos.set(clave, t.verdict);
    if (t.duration_verdict) duraciones.set(clave, t.duration_verdict);
    if (t.rep_ordinal != null) ordinales.set(clave, t.rep_ordinal);
    if (t.band_axis != null) ejes.set(clave, t.band_axis);
  }
  for (const t of detail.run_compliance.recovery_tramos) {
    if (t.position == null) continue;
    veredictosRec.set(`${t.item_uid}#${t.position}`, t.verdict);
    if (t.duration_verdict) duraciones.set(`${t.item_uid}#${t.position}`, t.duration_verdict);
  }

  // ── Los tramos, de todas las líneas de carrera, en orden de ejecución ───────
  const tramos: TramoLeido[] = [];
  let nTrabajo = 0;
  for (const item of lineas) {
    const prescritos = tramosPrescritos(item.prescription_json);
    for (const a of actualsPorItem.get(item.uid) ?? []) {
      const seg = a.leg_index != null ? prescritos[a.leg_index] : undefined;
      const papel: Papel = a.leg_role === 'recovery' || seg?.kind === 'recovery' ? 'recuperacion' : 'trabajo';
      if (papel === 'trabajo') nTrabajo += 1;
      const clave = `${item.uid}#${a.position}`;
      const inicioMs = anclas.porPosition.get(a.position);
      tramos.push({
        position: a.position,
        n: papel === 'trabajo' ? (ordinales.get(clave) ?? nTrabajo) : null,
        papel,
        fase: a.leg_phase ?? 'main',
        modo: papel === 'recuperacion' ? (seg?.recovery_mode ?? null) : null,
        distanciaM: a.distance_meters,
        duracionS: a.duration_seconds,
        ritmoSkm: ritmoDe(a),
        fcMediaPpm: a.avg_hr,
        pendientePct: a.incline_pct,
        inicioS:
          inicioMs != null && anclas.ejecucionMs != null
            ? Math.max(0, Math.round((inicioMs - anclas.ejecucionMs) / 1000))
            : null,
        veredicto: papel === 'recuperacion' ? (veredictosRec.get(clave) ?? null) : (veredictos.get(clave) ?? null),
        veredictoDuracion: duraciones.get(clave) ?? null,
        // La franja solo se dibuja si el servidor juzgó ESTE tramo por RITMO.
        // Sin esa guarda, una zona de pulso resolvería una banda de ritmo aquí y
        // se pintaría una franja contra la que nadie midió nada.
        banda: ejes.get(clave) === 'pace' ? bandaDeRitmo(seg, item) : null,
      });
    }
  }

  const cabecera = lineas[0]!;
  const kilometros = detail.execution?.trace.splits ?? [];
  const zonaPedida = zonaObjetivo(cabecera);
  const decision = decidirLectura(tramos, detail.run_compliance.summary, {
    hayCurva: detail.execution?.trace.available === true,
    nKilometros: kilometros.length,
    zonaPedida,
    segundosEnZona: zonaPedida != null ? segundosEnZona(detail.segment_actuals, zonaPedida) : null,
    veredictoUnico: veredictoUnico(detail.run_compliance.tramos),
  });

  return {
    ...decision,
    tramos,
    kilometros,
    prescrito: prescritoDe(cabecera),
    titulo: cabecera.exercise_name ?? null,
    itemUids: lineas.map((l) => l.uid),
    hayCurva: detail.execution?.trace.available === true,
    tramosSituables: tramos.length > 0 && tramos.every((t) => t.inicioS != null),
  };
}

// ---------------------------------------------------------------------------
// Piezas sueltas

// ---------------------------------------------------------------------------

/** El ritmo del tramo: el del aparato, y si no lo hay, el que dan distancia y
 *  tiempo. Es el mismo apaño que hace el servidor al juzgar (`sampleFromActual`),
 *  para que la fila y su veredicto no salgan de dos ritmos distintos. */
function ritmoDe(a: SegmentActual): number | null {
  if (a.avg_pace_s_per_km != null && Number.isFinite(a.avg_pace_s_per_km)) return a.avg_pace_s_per_km;
  if (a.distance_meters != null && a.distance_meters > 0 && a.duration_seconds != null && a.duration_seconds > 0) {
    return a.duration_seconds / (a.distance_meters / 1000);
  }
  return null;
}

function veredictoUnico(tramos: CoachSessionDetail['run_compliance']['tramos']): RunComplianceVerdict | null {
  const evaluables = tramos.filter((t) => t.verdict !== 'sin_dato');
  return evaluables.length === 1 ? evaluables[0]!.verdict : null;
}

/** La zona de pulso pedida, cuando el objetivo de la línea ES una zona. Solo
 *  `hr_zone`: una zona de RITMO se juzga como banda de ritmo y su lectura es la
 *  media, no el tiempo dentro de una banda de pulso que nadie pidió. */
function zonaObjetivo(item: AssignmentDetailItem): number | null {
  const segs = tramosPrescritos(item.prescription_json);
  const conObjetivo = segs.find((s) => s.kind === 'work' && s.target?.type === 'hr_zone');
  const t = conObjetivo?.target;
  return t?.type === 'hr_zone' ? t.zone : null;
}

/** Segundos medidos en una zona, sumados sobre los tramos que los trajeron.
 *  Null si ningún tramo midió pulso: sin medida no hay cero, hay ausencia. */
function segundosEnZona(actuals: readonly SegmentActual[], zona: number): number | null {
  let total: number | null = null;
  for (const a of actuals) {
    const z = a.zone_seconds;
    if (!z) continue;
    const v = (z as unknown as Record<string, number | null | undefined>)[`z${zona}`];
    if (typeof v === 'number' && Number.isFinite(v)) total = (total ?? 0) + v;
  }
  return total;
}

/** La línea del coach tal y como la escribió, con la MISMA función que ya usa el
 *  cajón. Sin texto, la fila no se pinta: nunca un guion de relleno. */
function prescritoDe(item: AssignmentDetailItem): string | null {
  if (!item.prescription_json) return null;
  const t = prescriptionToText(item.prescription_json);
  return t && t.trim() ? t : null;
}
