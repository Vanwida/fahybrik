// EL CUMPLIMIENTO DE UNA SESIÓN — hecho frente a plan, con el color del coach
// (docs/analiticas/modelo.md A7 y §3 fila 3).
//
// QUÉ SESIONES CUENTAN, Y CUÁNDO UNA SIN HACER ES «NO HECHA»
// ---------------------------------------------------------
// La regla es LA de la adherencia (`shared/domain/coach/adherence.ts`, DECISIONS
// 2026-09-23), no una segunda: una sesión del plan es DEBIDA cuando su día LOCAL
// del atleta ya pasó, o es hoy y ya está hecha; hecha = completada o a medias, o
// con una ejecución registrada. Una debida sin hacer es NO HECHA desde que
// termina su día en el huso del atleta. El estado `scheduled` de la tabla se
// queda como está — nadie hizo nada con ella, y la ejecución tardía la marca
// hecha — y todo lector deriva «no hecha» con esta misma regla. No es debida:
// la de hoy aún sin hacer (pendiente), un día de pausa o de descanso por lesión
// (excluida), una semana en borrador que no hizo (no la podía ver: ni sale), y
// nada de lo LIBRE ni de fuera del plan (0270): eso cuenta en la carga, no aquí.
//
// CONTRA QUÉ SE COMPARA (método del coach, `cumplimiento_sesion_bases`)
// ---------------------------------------------------------------------
// La primera base, en el orden del coach (defecto carga › duración › distancia,
// la escalera de TrainingPeaks), que las DOS partes saben:
//   carga      la planificada (`carga-plan.ts`, la misma de la serie de plan) si
//              su trabajo PRINCIPAL se sabe, frente a la hecha si su cobertura
//              llega al mínimo del veredicto del coach;
//   duración   el reloj que el plan escribe (`sessionDuration`, el PRINCIPAL
//              escrito) frente a la duración de la ejecución;
//   distancia  los metros que el plan escribe al correr y en las máquinas (el
//              principal entero en distancia) frente a los hechos.
// Si lo accesorio (calentamiento, vuelta) no se sabe, el plan es un SUELO y la
// fila lo dice (`plan_minimo`). Sin ninguna base, la sesión está HECHA SIN MEDIDA:
// cuenta como hecha, no tiene color, y su detalle tramo a tramo sigue ahí.
//
// COLOR (bandas del coach; defecto de mercado): verde 80-120 %, ámbar 50-79 % o
// 121-150 %, rojo fuera o no hecha, gris sin plan.
//
// Puro y sin base de datos.

import { computeAdherence, isSessionDone, type AdherenceAssignmentStatus, type AdherenceSession } from '../coach/adherence';
import { addDays, diffDays, isoDateString, mondayOfWeek, parseIsoDate } from '../dates';
import { flattenSegments } from '../prescription/run-structure';
import { legacyToStructure } from '../prescription/run-structure-convert';
import { prescriptionDuration, sessionDuration } from '../prescription/duration';
import { setMeasure, type Prescription } from '../prescription/types';
import type { Ancla, Unidad } from './lectura';
import { anclaMasDebil } from './anclas';
import type { PrecioPlanSesion, SesionPlan } from './carga-plan';
import type { PrecioSesion } from './carga-tramo';
import { BASES_SESION, type BaseSesion, type CoachAnalyticsMethod } from './metodo';
import type { ContextoBandas } from './cumplimiento-bandas';
import type { FilaLinea, LineaPlan, TramoEjecutado } from './cumplimiento-esfuerzos';
import { cumplimientoDeLineas } from './cumplimiento-lineas';

// ---------------------------------------------------------------------------
// ENTRADA
// ---------------------------------------------------------------------------

/** Una sesión del PLAN del coach (origen `coach`), con su ejecución si la hubo. */
export interface SesionCumplimiento {
  assignment_id: string;
  /** Día programado (`scheduled_for`), el del calendario del atleta. */
  dia: string;
  titulo: string | null;
  estado_plan: AdherenceAssignmentStatus;
  /** Un día de pausa o de descanso por lesión: nunca es debida. */
  excluida: boolean;
  /** false = su semana es un borrador del coach. */
  visible: boolean;
  ejecucion: {
    id: string;
    /** Día LOCAL del atleta en que la hizo. */
    dia: string;
    segundos: number | null;
    metros: number | null;
  } | null;
  lineas: LineaPlan[];
  tramos: TramoEjecutado[];
}

// ---------------------------------------------------------------------------
// SALIDA
// ---------------------------------------------------------------------------

/**
 *   cumplida          hecha dentro de la banda verde
 *   desviada          hecha en la ámbar
 *   fuera             hecha fuera de la ámbar
 *   no_hecha          debida y sin hacer (su día ya terminó, o la saltó)
 *   hecha_sin_medida  hecha, pero ninguna base se sabe por las dos partes
 *   pendiente         es de hoy y aún no está hecha
 *   excluida          cae en una pausa o en un descanso por lesión
 */
export type EstadoSesion = 'cumplida' | 'desviada' | 'fuera' | 'no_hecha' | 'hecha_sin_medida' | 'pendiente' | 'excluida';
export type ColorSesion = 'verde' | 'ambar' | 'rojo' | 'gris';

/** Por qué una base no sirve para comparar ESTA sesión. */
export type MotivoBase = 'plan_sin_saber' | 'hecho_sin_saber' | 'sin_ejecucion' | 'sin_plan';

export interface MedidaBase {
  base: BaseSesion;
  unidad: Unidad;
  plan: number | null;
  hecho: number | null;
  /** El plan es un suelo: algo accesorio (calentamiento, vuelta) no se sabe. */
  plan_minimo: boolean;
  comparable: boolean;
  motivo: MotivoBase | null;
}

/**
 * Los tramos de TRABAJO de la sesión, por veredicto. Las recuperaciones van
 * aparte y nunca se funden con el trabajo en un porcentaje (Alex, 12-ago: «6 de 6
 * en el trabajo, 2 de 6 en la recuperación» son dos preguntas).
 */
export interface ResumenTramos {
  /** `sin_detalle`: no hay tramos enlazados al plan; `sin_ejecucion`: no hubo ejecución. */
  detalle: 'tramos' | 'sin_detalle' | 'sin_ejecucion';
  total: number;
  /** Con veredicto, más las líneas que no se ejecutaron (cuentan fuera). */
  evaluables: number;
  dentro: number;
  por_encima: number;
  por_debajo: number;
  sin_dato: number;
  sin_ejecutar: number;
  /** Las recuperaciones con algo que juzgar: controladas (dentro) o no (se pasó, o más intensa). */
  recuperaciones: { total: number; evaluables: number; dentro: number; fuera: number };
}

export interface FilaSesion {
  assignment_id: string;
  execution_id: string | null;
  dia: string;
  dia_hecha: string | null;
  /** Lunes de la semana del día programado. */
  semana: string;
  titulo: string | null;
  estado: EstadoSesion;
  /** null en pendiente, excluida y hecha sin medida. */
  color: ColorSesion | null;
  debida: boolean;
  hecha: boolean;
  /** La saltó el atleta (`skipped`) o se marcó perdida (`missed`). */
  saltada: boolean;
  base: BaseSesion | null;
  unidad: Unidad | null;
  plan: number | null;
  hecho: number | null;
  pct: number | null;
  plan_minimo: boolean;
  /**
   * El peldaño más débil de los umbrales que sostienen el porcentaje (solo la
   * carga depende de ellos: la hecha y la planificada se preciaron contra el
   * umbral del atleta). Null en duración y distancia.
   */
  ancla: Ancla | null;
  /**
   * Las tres bases, primero las del coach en su orden y al final las que él no
   * usa: se ve por qué ganó una, y la carga de la sesión está siempre (la suma
   * de la semana la necesita aunque el coach compare por duración).
   */
  bases: MedidaBase[];
  tramos: ResumenTramos;
  lineas: FilaLinea[];
  /** Tramos de la ejecución sin enlace a una línea de este plan. */
  tramos_ajenos: number;
}

// ---------------------------------------------------------------------------
// LO PLANIFICADO
// ---------------------------------------------------------------------------

const MODALIDADES_DISTANCIA: ReadonlySet<string> = new Set(['run', 'row', 'ski', 'bike']);

/**
 * Los metros que escribe una línea de correr o de máquina, y si los escribe
 * TODOS. Una recuperación de pie son cero metros de verdad; un trote o un tramo
 * por tiempo no dicen cuántos: la distancia de la línea queda incompleta.
 */
export function distanciaPrescrita(p: Prescription, modalidad: string | null): { metros: number; completa: boolean } | null {
  if (!MODALIDADES_DISTANCIA.has(modalidad ?? '')) return null;
  const estructura = modalidad === 'run' ? (p.structure ?? legacyToStructure(p)) : null;
  if (estructura && estructura.length > 0) {
    let metros = 0;
    let completa = true;
    for (const seg of flattenSegments(estructura)) {
      if (seg.measure.type === 'distance') metros += seg.measure.m;
      else if (!(seg.kind === 'recovery' && seg.recovery_mode === 'parado')) completa = false;
    }
    return { metros, completa };
  }
  const sets = (p.sets ?? []).filter((s) => !s.is_approach);
  if (sets.length === 0) return { metros: 0, completa: false };
  const rondas = p.rounds != null && p.rounds > 0 ? p.rounds : 1;
  let metros = 0;
  let completa = true;
  for (const s of sets) {
    const m = setMeasure(s);
    if (m?.kind === 'distance') metros += m.meters;
    else completa = false;
  }
  return { metros: metros * rondas, completa };
}

function medidaCarga(plan: PrecioPlanSesion | null, hecho: PrecioSesion | null, sesion: SesionCumplimiento, m: CoachAnalyticsMethod): MedidaBase {
  const base: MedidaBase = { base: 'carga', unidad: 'tss', plan: null, hecho: null, plan_minimo: false, comparable: false, motivo: null };
  if (!plan || plan.items.length === 0) return { ...base, motivo: 'sin_plan' };
  const planSabido = !plan.principal_sin_saber && plan.tss_conocido > 0;
  const out: MedidaBase = { ...base, plan: planSabido ? plan.tss_conocido : null, plan_minimo: plan.items_sin_saber > 0 };
  if (!planSabido) return { ...out, motivo: 'plan_sin_saber' };
  if (!sesion.ejecucion || !hecho) return { ...out, motivo: 'sin_ejecucion' };
  const cobertura = hecho.segundos > 0 ? ((hecho.segundos - hecho.sin_saber_s) / hecho.segundos) * 100 : 0;
  if (hecho.tss == null || cobertura < m.cobertura_veredicto_min_pct) return { ...out, hecho: hecho.tss, motivo: 'hecho_sin_saber' };
  return { ...out, hecho: hecho.tss, comparable: true };
}

function medidaDuracion(plan: SesionPlan | null, sesion: SesionCumplimiento): MedidaBase {
  const base: MedidaBase = { base: 'duracion', unidad: 'segundos', plan: null, hecho: null, plan_minimo: false, comparable: false, motivo: null };
  if (!plan || plan.items.length === 0) return { ...base, motivo: 'sin_plan' };
  const d = sessionDuration(plan.items.map((i) => ({ prescription: i.prescripcion, role: i.rol })));
  const hecho = sesion.ejecucion?.segundos != null && sesion.ejecucion.segundos > 0 ? sesion.ejecucion.segundos : null;
  if (!d.known) return { ...base, hecho, motivo: 'plan_sin_saber' };
  // En segundos exactos: `sessionDuration` decide si se sabe (el principal escrito),
  // pero redondea a minutos, y en una sesión corta eso es un 10 % de error.
  const segundos = plan.items.reduce((a, i) => {
    const di = i.prescripcion ? prescriptionDuration(i.prescripcion) : null;
    return a + (di && di.known ? di.seconds : 0);
  }, 0);
  const out: MedidaBase = { ...base, plan: segundos, plan_minimo: d.basis === 'floor', hecho };
  if (!sesion.ejecucion) return { ...out, motivo: 'sin_ejecucion' };
  if (hecho == null) return { ...out, motivo: 'hecho_sin_saber' };
  return { ...out, comparable: true };
}

function medidaDistancia(plan: SesionPlan | null, sesion: SesionCumplimiento): MedidaBase {
  const base: MedidaBase = { base: 'distancia', unidad: 'metros', plan: null, hecho: null, plan_minimo: false, comparable: false, motivo: null };
  if (!plan || plan.items.length === 0) return { ...base, motivo: 'sin_plan' };
  let metros = 0;
  let principalCompleta = true;
  let accesorioIncompleto = false;
  let alguna = false;
  for (const it of plan.items) {
    const d = it.prescripcion ? distanciaPrescrita(it.prescripcion, it.modalidad) : null;
    if (!d) continue;
    alguna = true;
    metros += d.metros;
    if (!d.completa) {
      if (it.rol === 'principal') principalCompleta = false;
      else accesorioIncompleto = true;
    }
  }
  const tramosMetros = sesion.tramos
    .filter((t) => MODALIDADES_DISTANCIA.has(t.modalidad ?? '') && t.metros != null && t.metros > 0)
    .reduce((a, t) => a + (t.metros as number), 0);
  const hecho = sesion.ejecucion?.metros != null && sesion.ejecucion.metros > 0 ? sesion.ejecucion.metros : tramosMetros > 0 ? tramosMetros : null;
  if (!alguna || !principalCompleta || metros <= 0) return { ...base, hecho, motivo: 'plan_sin_saber' };
  const out: MedidaBase = { ...base, plan: metros, plan_minimo: accesorioIncompleto, hecho };
  if (!sesion.ejecucion) return { ...out, motivo: 'sin_ejecucion' };
  if (hecho == null) return { ...out, motivo: 'hecho_sin_saber' };
  return { ...out, comparable: true };
}

/** El color de un porcentaje con las bandas del coach. */
export function colorDePct(pct: number, m: CoachAnalyticsMethod): { color: ColorSesion; estado: EstadoSesion } {
  if (pct >= m.cumplimiento_verde_min_pct && pct <= m.cumplimiento_verde_max_pct) return { color: 'verde', estado: 'cumplida' };
  if (pct >= m.cumplimiento_ambar_min_pct && pct <= m.cumplimiento_ambar_max_pct) return { color: 'ambar', estado: 'desviada' };
  return { color: 'rojo', estado: 'fuera' };
}

// ---------------------------------------------------------------------------
// LA SESIÓN
// ---------------------------------------------------------------------------

/** La sesión con la forma que lee la regla ÚNICA de adherencia. */
export function comoAdherencia(s: Pick<SesionCumplimiento, 'dia' | 'estado_plan' | 'ejecucion' | 'excluida' | 'visible'>): AdherenceSession {
  return { scheduled_for: s.dia, status: s.estado_plan, executed: s.ejecucion != null, origin: 'coach', excluded: s.excluida, visible: s.visible };
}

/**
 * ¿Debida, según la regla de la adherencia a fecha de `hoy`? ¿Y hecha? Hecha es
 * hecha aunque no fuera debida (un día de pausa en que entrenó igualmente): la
 * adherencia solo cuenta las debidas, pero la fila no dice «no hecha» de algo hecho.
 */
export function debidaYHecha(s: SesionCumplimiento, hoy: string): { debida: boolean; hecha: boolean } {
  const dias = Math.max(1, diffDays(parseIsoDate(hoy), parseIsoDate(s.dia)) + 1);
  const r = computeAdherence([comoAdherencia(s)], hoy, dias);
  return { debida: r.due === 1, hecha: isSessionDone({ status: s.estado_plan, executed: s.ejecucion != null }) };
}

function resumenTramos(lineas: readonly FilaLinea[], conEjecucion: boolean): ResumenTramos {
  const r: ResumenTramos = {
    detalle: 'tramos',
    total: 0,
    evaluables: 0,
    dentro: 0,
    por_encima: 0,
    por_debajo: 0,
    sin_dato: 0,
    sin_ejecutar: 0,
    recuperaciones: { total: 0, evaluables: 0, dentro: 0, fuera: 0 },
  };
  if (!conEjecucion) return { ...r, detalle: 'sin_ejecucion' };
  if (lineas.every((l) => l.estado === 'sin_detalle')) return { ...r, detalle: 'sin_detalle' };
  for (const l of lineas) {
    if (l.estado === 'sin_ejecutar') {
      r.sin_ejecutar += 1;
      continue;
    }
    for (const t of l.tramos) {
      if (t.papel === 'recuperacion') {
        r.recuperaciones.total += 1;
        if (t.veredicto === 'sin_dato') continue;
        r.recuperaciones.evaluables += 1;
        if (t.veredicto === 'dentro') r.recuperaciones.dentro += 1;
        else r.recuperaciones.fuera += 1;
        continue;
      }
      r.total += 1;
      r[t.veredicto] += 1;
    }
  }
  r.evaluables = r.dentro + r.por_encima + r.por_debajo + r.sin_ejecutar;
  return r;
}

export interface EntradaSesion {
  hoy: string;
  metodo: CoachAnalyticsMethod;
  ctx: ContextoBandas;
  /** La carga planificada de la sesión, la misma de la serie de plan. */
  plan: SesionPlan | null;
  precio_plan: PrecioPlanSesion | null;
  /** La carga hecha de su ejecución, la misma de la curva de forma. */
  precio_hecho: PrecioSesion | null;
}

/** El cumplimiento de UNA sesión del plan. Null si no se enseña (semana en borrador sin hacer). */
export function cumplimientoDeSesion(s: SesionCumplimiento, e: EntradaSesion): FilaSesion | null {
  const { debida, hecha } = debidaYHecha(s, e.hoy);
  if (!s.visible && !hecha) return null;

  const lineas = s.ejecucion ? cumplimientoDeLineas(s.lineas, s.tramos, e.ctx) : { lineas: [], ajenos: 0 };
  const delCoach = e.metodo.cumplimiento_sesion_bases;
  const orden = [...delCoach, ...BASES_SESION.filter((b) => !delCoach.includes(b))];
  const bases: MedidaBase[] = orden.map((b) =>
    b === 'carga' ? medidaCarga(e.precio_plan, e.precio_hecho, s, e.metodo) : b === 'duracion' ? medidaDuracion(e.plan, s) : medidaDistancia(e.plan, s),
  );
  const saltada = s.estado_plan === 'skipped' || s.estado_plan === 'missed';
  const fila: FilaSesion = {
    assignment_id: s.assignment_id,
    execution_id: s.ejecucion?.id ?? null,
    dia: s.dia,
    dia_hecha: s.ejecucion?.dia ?? null,
    semana: isoDateString(mondayOfWeek(parseIsoDate(s.dia))),
    titulo: s.titulo,
    estado: 'pendiente',
    color: null,
    debida,
    hecha,
    saltada,
    base: null,
    unidad: null,
    plan: null,
    hecho: null,
    pct: null,
    plan_minimo: false,
    ancla: null,
    bases,
    tramos: resumenTramos(lineas.lineas, s.ejecucion != null),
    lineas: lineas.lineas,
    tramos_ajenos: lineas.ajenos,
  };

  if (s.excluida && !hecha) return { ...fila, estado: 'excluida' };
  if (!hecha) return debida ? { ...fila, estado: 'no_hecha', color: 'rojo' } : fila;

  const gana = bases.find((b) => delCoach.includes(b.base) && b.comparable && b.plan != null && b.plan > 0 && b.hecho != null);
  if (!gana) return { ...fila, estado: 'hecha_sin_medida' };
  const pct = ((gana.hecho as number) / (gana.plan as number)) * 100;
  // Sobre un plan que es un SUELO (algo accesorio sin escribir), pasarse no se
  // puede afirmar: por encima del mínimo de la verde, está cumplida.
  const { color, estado } = gana.plan_minimo && pct >= e.metodo.cumplimiento_verde_min_pct ? { color: 'verde' as const, estado: 'cumplida' as const } : colorDePct(pct, e.metodo);
  const ancla =
    gana.base === 'carga'
      ? anclaMasDebil([...(e.precio_hecho?.partes ?? []).map((p) => p.ancla), ...(e.precio_plan?.items ?? []).map((i) => i.ancla)])
      : null;
  return { ...fila, estado, color, base: gana.base, unidad: gana.unidad, plan: gana.plan, hecho: gana.hecho, pct, plan_minimo: gana.plan_minimo, ancla };
}

/** Los lunes (ISO) de las semanas que toca un periodo, en orden. */
export function lunesDelPeriodo(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let l = mondayOfWeek(parseIsoDate(desde));
  const fin = parseIsoDate(hasta);
  while (l.getTime() <= fin.getTime()) {
    out.push(isoDateString(l));
    l = addDays(l, 7);
  }
  return out;
}
