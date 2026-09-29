// EL JUICIO DE UN TRAMO — prescrito frente a hecho, en tres preguntas que no se
// funden en un número (docs/analiticas/modelo.md A8; Alex, 12-ago: «en banda de
// ritmo y aun así corto de tiempo»):
//
//   intensidad  ritmo o zona (correr y cinta), split, vatios o zona (ergo),
//               pulso, kilos dentro de rango, RIR ±1 y RPE (fuerza)
//   dosis       distancia, tiempo, repeticiones, calorías, series hechas frente a
//               prescritas, rondas (EMOM)
//   resultado   tiempo contra el tope (WOD, roxzone); la estación o el WOD, hechos
//
// Cada comprobación lleva su banda en la unidad del eje, la holgura del coach, lo
// hecho, el delta al borde y su veredicto con dirección — o su motivo cuando no
// se puede juzgar. El veredicto del tramo es el primero que se sale (intensidad,
// luego dosis, luego resultado); dentro si todo lo evaluable está dentro.
//
// LA RECUPERACIÓN va al revés: solo es fallo recuperar MÁS intenso de lo pedido
// o pasarse de tiempo (`run-compliance`, Alex 12-ago). Sin objetivo ni dosis no
// se juzga. En el TRABAJO la dosis solo falla por quedarse corto.
//
// Puro y sin base de datos.

import { compararCantidad } from '../adherence/run-compliance';
import { prescriptionDuration } from '../prescription/duration';
import type { Ancla } from './lectura';
import { wattsDeSplit500 } from './anclas';
import {
  holguraDe,
  juzgarEje,
  resolverBanda,
  UNIDAD_EJE,
  type ContextoBandas,
  type EjeCumplimiento,
  type EjeDosis,
  type EjeIntensidad,
  type MotivoSinDato,
  type ObjetivoTramo,
  type PreguntaCumplimiento,
  type VeredictoCumplimiento,
} from './cumplimiento-bandas';
import {
  FASE_DE_LINEA,
  topeDe,
  type Comprobacion,
  type Dosis,
  type Esfuerzo,
  type FilaSerie,
  type FilaTramo,
  type LineaPlan,
  type ObjetivoComprobacion,
  type SerieHecha,
  type TramoEjecutado,
} from './cumplimiento-esfuerzos';

// ---------------------------------------------------------------------------
// PIEZAS
// ---------------------------------------------------------------------------

const MAQUINAS_O_CORRER: ReadonlySet<string> = new Set(['run', 'row', 'ski', 'bike']);

function objetivoDeBanda(min: number | null, max: number | null, zona: ObjetivoComprobacion['zona'] = null, ancla: Ancla | null = null): ObjetivoComprobacion {
  return { min, max, zona, ancla };
}

function sinDato(eje: EjeCumplimiento, pregunta: PreguntaCumplimiento, motivo: MotivoSinDato, objetivo: ObjetivoComprobacion | null = null): Comprobacion {
  return { eje, pregunta, unidad: UNIDAD_EJE[eje], objetivo, hecho: null, holgura: null, delta: null, veredicto: 'sin_dato', motivo };
}

const HECHA: Comprobacion = { eje: 'hecha', pregunta: 'resultado', unidad: null, objetivo: null, hecho: 1, holgura: null, delta: null, veredicto: 'dentro', motivo: null };

function tolerancia(ctx: ContextoBandas): number {
  return ctx.metodo.holgura_dosis_pct / 100;
}

/** En estaciones y WOD, estar hecha ES lo que se prescribe. */
function llevaHecha(familias: readonly string[]): boolean {
  return familias.some((f) => f === 'estaciones' || f === 'wod');
}

/** El eje de intensidad que un objetivo pediría, aunque su banda no se pueda resolver. */
function ejeImplicito(o: ObjetivoTramo, modalidad: string | null): EjeIntensidad {
  switch (o.tipo) {
    case 'zona_ritmo':
    case 'ritmo':
      return modalidad === 'row' || modalidad === 'ski' || modalidad === 'bike' ? 'split' : 'ritmo';
    case 'zona_pulso':
    case 'pulso':
      return 'pulso';
    case 'vatios':
      return 'vatios';
    case 'rpe':
      return 'rpe';
    case 'rir':
      return 'rir';
    default:
      return 'carga';
  }
}

function util(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/** Lo que el tramo midió en un eje de intensidad. Ritmo y split se derivan de distancia y tiempo si hace falta. */
function valorDeTramo(eje: EjeIntensidad, t: TramoEjecutado): number | null {
  const m = util(t.metros);
  const s = util(t.segundos);
  switch (eje) {
    case 'ritmo':
      return util(t.ritmo_s_km) ?? (m && s ? s / (m / 1000) : null);
    case 'split':
      return util(t.split_s_500m) ?? (m && s ? s / (m / 500) : null);
    case 'vatios':
      // En un Concept2 split y vatios son la misma medida (W = 2,80/(s/m)³).
      return util(t.vatios) ?? wattsDeSplit500(valorDeTramo('split', t));
    case 'pulso':
      return util(t.pulso_medio);
    case 'carga':
      return util(t.kg);
    case 'rpe':
    case 'rir':
      return null;
  }
}

/**
 * La cuesta que retira el ritmo, con la precedencia de siempre: lo que el coach
 * pidió en el tramo, lo que declaró la cinta, lo medido. Sin ninguna no se retira
 * (la calle sin altitud se juzga, como en el veredicto de carrera del coach).
 */
function cuestaRetira(e: Esfuerzo, t: TramoEjecutado, ctx: ContextoBandas): boolean {
  const umbral = ctx.pendiente_retira_ritmo_pct;
  if (umbral == null || !(umbral > 0)) return false;
  const g = e.inclinacion_pct ?? t.inclinacion_pct ?? t.pendiente_pct;
  return g != null && Number.isFinite(g) && Math.abs(g) >= umbral;
}

// ---------------------------------------------------------------------------
// LAS COMPROBACIONES
// ---------------------------------------------------------------------------

/** Un valor contra la banda que resuelve un objetivo de intensidad. */
function comprobarBanda(
  objetivo: ObjetivoTramo,
  modalidad: string | null,
  hechoDe: (eje: EjeIntensidad) => number | null,
  ctx: ContextoBandas,
  opts: { recuperacion?: boolean; retira?: (eje: EjeIntensidad) => boolean } = {},
): Comprobacion | null {
  const r = resolverBanda(objetivo, modalidad, ctx);
  if (r == null) return null;
  if ('motivo' in r) return sinDato(ejeImplicito(objetivo, modalidad), 'intensidad', r.motivo);
  const b = r.banda;
  const obj = objetivoDeBanda(b.min, b.max, b.zona, b.ancla);
  if (opts.retira?.(b.eje)) return sinDato(b.eje, 'intensidad', 'pendiente', obj);
  const hecho = hechoDe(b.eje);
  if (hecho == null) {
    const anota = b.eje === 'carga' || b.eje === 'rpe' || b.eje === 'rir';
    return sinDato(b.eje, 'intensidad', anota ? 'sin_anotar' : 'sin_medida', obj);
  }
  const holgura = holguraDe(b.eje, ctx.metodo, b);
  const j = juzgarEje(b.eje, hecho, b.min, b.max, holgura);
  // En la recuperación solo es fallo ir MÁS intenso: por debajo es controlada.
  const veredicto = opts.recuperacion && j.veredicto === 'por_debajo' ? 'dentro' : j.veredicto;
  return { eje: b.eje, pregunta: 'intensidad', unidad: UNIDAD_EJE[b.eje], objetivo: obj, hecho, holgura, delta: j.delta, veredicto, motivo: null };
}

/** Una cantidad hecha frente a la prescrita: en el trabajo falla quedarse corto; en la recuperación, pasarse. */
export function comprobarCantidad(
  eje: EjeDosis,
  prescrito: { valor: number; max: number | null },
  hecho: number | null,
  papel: 'trabajo' | 'recuperacion',
  tol: number,
): Comprobacion {
  const objetivo = objetivoDeBanda(prescrito.valor, prescrito.max);
  if (hecho == null) return sinDato(eje, 'dosis', eje === 'reps' || eje === 'series' ? 'sin_anotar' : 'sin_medida', objetivo);
  const c = compararCantidad(prescrito.valor, hecho, tol);
  if (c === 'sin_dato') return sinDato(eje, 'dosis', 'sin_medida', objetivo);
  let veredicto: VeredictoCumplimiento = 'dentro';
  if (papel === 'trabajo' && c === 'corta') veredicto = 'por_debajo';
  else if (papel === 'recuperacion' && c === 'larga') veredicto = 'por_encima';
  let delta = 0;
  if (hecho < prescrito.valor) delta = hecho - prescrito.valor;
  else if (hecho > (prescrito.max ?? prescrito.valor)) delta = hecho - (prescrito.max ?? prescrito.valor);
  return { eje, pregunta: 'dosis', unidad: UNIDAD_EJE[eje], objetivo, hecho, holgura: tol * prescrito.valor, delta, veredicto, motivo: null };
}

function hechoDeDosis(eje: EjeDosis, t: TramoEjecutado): number | null {
  const v = eje === 'distancia' ? t.metros : eje === 'tiempo' ? t.segundos : eje === 'reps' ? t.reps : eje === 'calorias' ? t.calorias : null;
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

function comprobarTope(tope: number, segundos: number | null): Comprobacion {
  const objetivo = objetivoDeBanda(null, tope);
  if (util(segundos) == null) return sinDato('tiempo_tope', 'resultado', 'sin_medida', objetivo);
  const j = juzgarEje('tiempo_tope', segundos, null, tope, 0);
  return { eje: 'tiempo_tope', pregunta: 'resultado', unidad: 'segundos', objetivo, hecho: segundos, holgura: 0, delta: j.delta, veredicto: j.veredicto, motivo: null };
}

function comprobarRondas(t: TramoEjecutado, ctx: ContextoBandas): Comprobacion | null {
  if (t.rondas == null || t.rondas_prescritas == null || t.rondas_prescritas <= 0) return null;
  return comprobarCantidad('rondas', { valor: t.rondas_prescritas, max: null }, t.rondas, 'trabajo', tolerancia(ctx));
}

/**
 * El veredicto de un tramo:
 *   · el primero que se sale, por orden de pregunta (intensidad, dosis, resultado):
 *     un fallo es un fallo aunque falte otra cosa;
 *   · si nada se sale pero la INTENSIDAD pedida no se pudo juzgar (sin umbral, sin
 *     pulso, sin el RPE anotado), el tramo NO está «dentro»: está sin dato. La banda
 *     es la intensidad; una dosis cumplida no la confirma. En estaciones y WOD, lo
 *     prescrito es hacerlos (y su tiempo): ahí la intensidad no bloquea;
 *   · dentro si todo lo evaluable está dentro; sin dato si nada lo es.
 */
export function veredictoDeComprobaciones(
  cs: readonly Comprobacion[],
  intensidadObligatoria = true,
): { veredicto: VeredictoCumplimiento; motivo: MotivoSinDato | null } {
  const evaluables = cs.filter((c) => c.veredicto !== 'sin_dato');
  for (const p of ['intensidad', 'dosis', 'resultado'] as const) {
    const fuera = evaluables.find((c) => c.pregunta === p && c.veredicto !== 'dentro');
    if (fuera) return { veredicto: fuera.veredicto, motivo: null };
  }
  if (intensidadObligatoria) {
    const sinBanda = cs.find((c) => c.pregunta === 'intensidad' && c.veredicto === 'sin_dato');
    if (sinBanda) return { veredicto: 'sin_dato', motivo: sinBanda.motivo };
  }
  if (evaluables.length === 0) return { veredicto: 'sin_dato', motivo: cs[0]?.motivo ?? 'sin_objetivo' };
  return { veredicto: 'dentro', motivo: null };
}

function fila(
  t: TramoEjecutado,
  e: Esfuerzo | null,
  cs: Comprobacion[],
  opts: { plegado: boolean; familias: readonly string[]; series?: FilaSerie[] },
): FilaTramo {
  const comprobaciones = cs.length > 0 ? cs : [sinDato('hecha', 'resultado', 'sin_objetivo')];
  const v = veredictoDeComprobaciones(comprobaciones, !llevaHecha(opts.familias));
  return {
    segment_execution_id: t.id,
    posicion: t.posicion,
    pierna: t.pierna,
    papel: e?.papel ?? (t.papel_pierna === 'recovery' ? 'recuperacion' : 'trabajo'),
    fase: e?.fase ?? 'principal',
    ordinal: e?.ordinal ?? null,
    plegado: opts.plegado,
    veredicto: v.veredicto,
    motivo: v.motivo,
    comprobaciones,
    series: opts.series ?? [],
  };
}

// ---------------------------------------------------------------------------
// UN TRAMO FRENTE A UN ESFUERZO, O PLEGADO
// ---------------------------------------------------------------------------

/**
 * Un tramo contra UN esfuerzo prescrito. Null para una recuperación que no tiene
 * nada que juzgar (sin objetivo ni dosis): no hay contra qué, y no se inventa.
 * `tope`: el de la línea (un for time), cuando este tramo es la línea entera.
 */
export function juzgarUno(
  t: TramoEjecutado,
  e: Esfuerzo | null,
  linea: LineaPlan,
  ctx: ContextoBandas,
  opts: { tope?: number | null } = {},
): FilaTramo | null {
  const cs: Comprobacion[] = [];
  if (e) {
    const modalidad = MAQUINAS_O_CORRER.has(t.modalidad ?? '') ? t.modalidad : linea.modalidad;
    if (e.objetivo) {
      const i = comprobarBanda(e.objetivo, modalidad, (eje) => valorDeTramo(eje, t), ctx, {
        recuperacion: e.papel === 'recuperacion',
        retira: (eje) => eje === 'ritmo' && cuestaRetira(e, t, ctx),
      });
      if (i) cs.push(i);
    }
    if (e.dosis) cs.push(comprobarCantidad(e.dosis.eje, e.dosis, hechoDeDosis(e.dosis.eje, t), e.papel, tolerancia(ctx)));
    else if (e.objetivo?.tipo === 'calorias' && e.objetivo.min != null) {
      cs.push(comprobarCantidad('calorias', { valor: e.objetivo.min, max: e.objetivo.max }, hechoDeDosis('calorias', t), e.papel, tolerancia(ctx)));
    }
    if (e.objetivo?.tipo === 'tiempo_tope') cs.push(comprobarTope(e.objetivo.max, t.segundos));
    else if (opts.tope != null && e.papel === 'trabajo') cs.push(comprobarTope(opts.tope, t.segundos));
    if (e.papel === 'recuperacion' && cs.length === 0) return null;
  }
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha([linea.familia])) cs.push(HECHA);
  return fila(t, e, cs, { plegado: false, familias: [linea.familia] });
}

/** Un tramo que cubre TODOS los esfuerzos de su línea: se juzgan los totales. */
export function juzgarPlegado(t: TramoEjecutado, esfuerzos: readonly Esfuerzo[], linea: LineaPlan, ctx: ContextoBandas): FilaTramo {
  const trabajo = esfuerzos.filter((e) => e.papel === 'trabajo');
  const cs: Comprobacion[] = [];
  const primero = trabajo[0];
  // La intensidad, solo si todos los esfuerzos de trabajo piden la misma.
  if (primero?.objetivo && trabajo.every((e) => JSON.stringify(e.objetivo) === JSON.stringify(primero.objetivo))) {
    const modalidad = MAQUINAS_O_CORRER.has(t.modalidad ?? '') ? t.modalidad : linea.modalidad;
    const i = comprobarBanda(primero.objetivo, modalidad, (eje) => valorDeTramo(eje, t), ctx, {
      retira: (eje) => eje === 'ritmo' && cuestaRetira(primero, t, ctx),
    });
    if (i) cs.push(i);
  }
  // La dosis total, por el eje que comparten. El tiempo, con los descansos del
  // formato (un EMOM son rondas × minuto, no rondas × trabajo): es lo que dura el tramo.
  const eje = primero?.dosis?.eje ?? null;
  if (eje && trabajo.every((e) => e.dosis?.eje === eje)) {
    let total = trabajo.reduce((a, e) => a + (e.dosis?.valor ?? 0), 0);
    if (eje === 'tiempo' && linea.prescripcion) {
      const d = prescriptionDuration(linea.prescripcion);
      if (d.known) total = d.seconds;
    }
    cs.push(comprobarCantidad(eje, { valor: total, max: null }, hechoDeDosis(eje, t), 'trabajo', tolerancia(ctx)));
  }
  const tope = topeDe(linea.prescripcion);
  if (tope != null) cs.push(comprobarTope(tope, t.segundos));
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha([linea.familia])) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[linea.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return fila(t, e, cs, { plegado: true, familias: [linea.familia] });
}

// ---------------------------------------------------------------------------
// LA TABLA DE SERIES (fuerza, y todo lo que se grabó serie a serie)
// ---------------------------------------------------------------------------

/**
 * La carga de una serie: los kilos que la app resolvió al entrenar mandan (un %RM
 * ya convertido, con la marca que el atleta tenía ese día); si no, el objetivo de
 * carga escrito (kilos, %RM, relativo). Null si la serie no pide carga.
 */
function objetivoDeCarga(s: SerieHecha, e: Esfuerzo | null): ObjetivoTramo | null {
  if (s.kg_prescritos != null && s.kg_prescritos > 0) return { tipo: 'kg', min: s.kg_prescritos, max: s.kg_prescritos };
  const o = e?.objetivo;
  return o && (o.tipo === 'kg' || o.tipo === 'pct_rm' || o.tipo === 'relativo') ? o : null;
}

/** El esfuerzo que pide una serie (RIR o RPE), aparte de su carga: se juzgan los dos. */
function objetivoDeEsfuerzo(e: Esfuerzo | null): ObjetivoTramo | null {
  const o = e?.objetivo;
  return o && (o.tipo === 'rir' || o.tipo === 'rpe') ? o : null;
}

function juzgarSerie(s: SerieHecha, e: Esfuerzo | null, modalidad: string | null, ctx: ContextoBandas, intensidadObligatoria: boolean): FilaSerie {
  const cs: Comprobacion[] = [];
  const saltada = s.estado === 'skipped';
  if (!saltada) {
    const valor = (eje: EjeIntensidad): number | null => (eje === 'carga' ? util(s.kg) : eje === 'rir' ? (s.rir != null && s.rir >= 0 ? s.rir : null) : eje === 'rpe' ? util(s.rpe) : null);
    for (const objetivo of [objetivoDeCarga(s, e), objetivoDeEsfuerzo(e)]) {
      if (!objetivo) continue;
      const i = comprobarBanda(objetivo, modalidad, valor, ctx);
      if (i) cs.push(i);
    }
  }
  const reps: Dosis | null =
    s.reps_prescritas != null && s.reps_prescritas > 0 ? { eje: 'reps', valor: s.reps_prescritas, max: null } : e?.dosis?.eje === 'reps' ? e.dosis : null;
  if (reps) cs.push(comprobarCantidad('reps', reps, saltada ? (s.reps ?? 0) : s.reps, 'trabajo', tolerancia(ctx)));
  const v = veredictoDeComprobaciones(cs.length > 0 ? cs : [sinDato('reps', 'dosis', 'sin_objetivo')], intensidadObligatoria);
  return { indice: s.indice, veredicto: v.veredicto, comprobaciones: cs };
}

/** Una comprobación de tramo que resume la misma comprobación de cada serie. */
function resumir(eje: EjeCumplimiento, cs: readonly Comprobacion[]): Comprobacion | null {
  if (cs.length === 0) return null;
  const evaluables = cs.filter((c) => c.veredicto !== 'sin_dato');
  const suma = eje === 'reps';
  const valores = evaluables.map((c) => c.hecho).filter((v): v is number => v != null);
  const mins = cs.map((c) => c.objetivo?.min).filter((v): v is number => v != null);
  const maxs = cs.map((c) => c.objetivo?.max).filter((v): v is number => v != null);
  const objetivo: ObjetivoComprobacion = suma
    ? { min: mins.length ? mins.reduce((a, v) => a + v, 0) : null, max: maxs.length === cs.length ? maxs.reduce((a, v) => a + v, 0) : null, zona: null, ancla: null }
    : { min: mins.length ? Math.min(...mins) : null, max: maxs.length ? Math.max(...maxs) : null, zona: cs[0]!.objetivo?.zona ?? null, ancla: cs[0]!.objetivo?.ancla ?? null };
  if (evaluables.length === 0) return { ...cs[0]!, objetivo, hecho: null, delta: null };
  const fuera = evaluables.filter((c) => c.veredicto !== 'dentro');
  const encima = fuera.filter((c) => c.veredicto === 'por_encima');
  const debajo = fuera.filter((c) => c.veredicto === 'por_debajo');
  const veredicto: VeredictoCumplimiento = fuera.length === 0 ? 'dentro' : encima.length > debajo.length ? 'por_encima' : 'por_debajo';
  const peores = veredicto === 'por_encima' ? encima : debajo;
  const delta = veredicto === 'dentro' ? 0 : peores.reduce((a, c) => (Math.abs(c.delta ?? 0) > Math.abs(a) ? (c.delta ?? 0) : a), 0);
  const hecho = valores.length === 0 ? null : suma ? valores.reduce((a, v) => a + v, 0) : valores.reduce((a, v) => a + v, 0) / valores.length;
  return { eje, pregunta: cs[0]!.pregunta, unidad: cs[0]!.unidad, objetivo, hecho, holgura: cs[0]!.holgura, delta, veredicto, motivo: null };
}

/**
 * Un tramo grabado serie a serie. Las series prescritas son las de trabajo de la
 * línea (rondas × series), o las de todas las líneas del bloque cuando el tramo
 * es el bloque entero (una superserie grabada de una vez); en ese caso los
 * objetivos de cada serie salen solo de lo que la app guardó en la serie
 * (reps y kilos prescritos), porque no se sabe de qué ejercicio era cada una.
 */
export function juzgarSeries(
  t: TramoEjecutado,
  esfuerzos: readonly Esfuerzo[],
  linea: LineaPlan,
  ctx: ContextoBandas,
  opts: { prescritasBloque: number | null; familias?: readonly string[] } = { prescritasBloque: null },
): FilaTramo {
  const trabajo = esfuerzos.filter((e) => e.papel === 'trabajo');
  const series = [...t.series].sort((a, b) => a.indice - b.indice);
  const familias = opts.familias ?? [linea.familia];
  const filas = series.map((s, k) =>
    juzgarSerie(s, opts.prescritasBloque != null ? null : (trabajo[k] ?? null), linea.modalidad, ctx, !llevaHecha(familias)),
  );
  const porEje = (eje: EjeCumplimiento) => filas.flatMap((f) => f.comprobaciones.filter((c) => c.eje === eje));
  const cs: Comprobacion[] = [];
  for (const eje of ['carga', 'rir', 'rpe'] as const) {
    const r = resumir(eje, porEje(eje));
    if (r) cs.push(r);
  }
  const prescritas = opts.prescritasBloque ?? trabajo.length;
  if (prescritas > 0) {
    const hechas = series.filter((s) => s.estado !== 'skipped').length;
    cs.push(comprobarCantidad('series', { valor: prescritas, max: null }, hechas, 'trabajo', tolerancia(ctx)));
  }
  const reps = resumir('reps', porEje('reps'));
  if (reps) cs.push(reps);
  if (llevaHecha(familias)) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[linea.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return fila(t, e, cs, { plegado: opts.prescritasBloque != null, familias, series: filas });
}

/**
 * Un tramo que es el BLOQUE entero (rondas, for time, chipper, superserie… grabado
 * de una vez): el tiempo contra lo que el bloque escribe o su tope, las rondas si
 * las hay, las series si las grabó, y hecho en estaciones y WOD. La intensidad no:
 * cada línea pedía la suya y el tramo las mezcla.
 */
export function juzgarBloque(t: TramoEjecutado, lineas: readonly LineaPlan[], esfuerzos: ReadonlyMap<string, readonly Esfuerzo[]>, ctx: ContextoBandas): FilaTramo {
  const principal = lineas[0]!;
  const familias = lineas.map((l) => l.familia);
  if (t.series.length > 0) {
    const prescritas = lineas.reduce((a, l) => a + (esfuerzos.get(l.template_segment_id) ?? []).filter((e) => e.papel === 'trabajo').length, 0);
    return juzgarSeries(t, [], principal, ctx, { prescritasBloque: prescritas, familias });
  }
  const cs: Comprobacion[] = [];
  const duraciones = lineas.map((l) => (l.prescripcion ? prescriptionDuration(l.prescripcion) : null));
  if (duraciones.every((d) => d?.known)) {
    const total = duraciones.reduce((a, d) => a + (d && d.known ? d.seconds : 0), 0);
    if (total > 0) cs.push(comprobarCantidad('tiempo', { valor: total, max: null }, util(t.segundos), 'trabajo', tolerancia(ctx)));
  }
  const tope = lineas.map((l) => topeDe(l.prescripcion)).find((x): x is number => x != null) ?? null;
  if (tope != null) cs.push(comprobarTope(tope, t.segundos));
  const rondas = comprobarRondas(t, ctx);
  if (rondas) cs.push(rondas);
  if (llevaHecha(familias)) cs.push(HECHA);
  const e: Esfuerzo = { papel: 'trabajo', fase: FASE_DE_LINEA[principal.rol], dosis: null, objetivo: null, inclinacion_pct: null, ordinal: null };
  return fila(t, e, cs, { plegado: true, familias });
}
