// LA FAMILIA DEL PASO, SU HÉROE, SU TRABAJO Y SU REJILLA — funciones PURAS
// (I4, I5 y §4 del modelo del iPhone, docs/vivo-iphone/modelo.md; el Swift
// las espeja).
//
// La auditoría del 28-09 encontró que la máquina no mandaba su métrica: la
// BikeErg salía como remo, las calorías solo con objetivo en cal, la cadencia
// medida nunca se veía; y que el título del bloque salía en inglés
// («Intervals», «For Time») porque cada vista traducía por su cuenta. Aquí se
// decide UNA vez, por familia:
//   · el HÉROE con las reglas de familia encima de P3 (`heroeDeFamilia`);
//   · el TRABAJO (§10.6): lo que falta o la tarea, nunca en gris (`trabajoDe`);
//   · la REJILLA de 2–4 métricas propias, el pulso siempre (`metricasDelPaso`);
//   · el FORMATO en castellano de box (`formatoDe`, dato con defecto).
// Un pintor (muñeca o iPhone) llama a estas funciones y pinta lo que devuelven.

import { cargaDelPlan } from './anotar';
import { esFuerza, fmtKg, textoEsfuerzo, textoPct, textoTempo } from './fuerza';
import { heroeDelPaso, lineaPulso, type HeroeVista, type LineaVista } from './lamina';
import { NOMBRE_CLASE_DEFECTO, REGLAS_AVISO_DEFECTO, type Lecturas, type PasoBase, type ReglasAviso, type ZonasCoach } from './paso';
import {
  contextoDe,
  esCarrera,
  faltaDe,
  fmtDistancia,
  fmtDuracion,
  fmtObjetivo,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  fmtSplit,
  num,
  objetivoDe,
  principal,
  textoCargaImplemento,
  textoPasoCorto,
  unidadSplit,
  valorDeEje,
} from './reglas';
import { cargaTarea, repsPorRonda, textoTarea, wodDe } from './tarea';

// ---------------------------------------------------------------------------
// La familia
// ---------------------------------------------------------------------------

/**
 * Lo que haces, para elegir el pintor (I4): una pregunta por familia. No es
 * la clase del paso ni el formato del bloque: un SkiErg en una estación de
 * HYROX es `ski` (la máquina manda su métrica), y un Run dentro de un EMOM es
 * `cinta` o `correr` (la cara de correr, P10).
 */
export type Familia =
  | 'correr'
  | 'cinta'
  | 'remo'
  | 'ski'
  | 'bici'
  | 'fuerza'
  | 'emom'
  | 'amrap'
  | 'fortime'
  | 'pared'
  | 'estacion'
  | 'roxzone'
  | 'movilidad'
  | 'recupera'
  | 'descanso'
  | 'transicion';

const FAMILIA_MAQUINA = { remo: 'remo', ski: 'ski', bici: 'bici', cinta: 'cinta' } as const;

export function familiaDe(p: PasoBase): Familia {
  if (p.rol === 'recuperacion') return 'recupera';
  if (p.rol === 'descanso') return 'descanso';
  if (p.clase === 'roxzone') return 'roxzone';
  const w = p.wod?.formato;
  if (p.rol === 'transicion') return w === 'puntuacion' ? 'amrap' : 'transicion';
  if (w === 'emom') return p.wod?.formato === 'emom' && p.wod.tarea.corre ? 'cinta' : 'emom';
  if (w === 'amrap') return 'amrap';
  if (w === 'fortime') return 'fortime';
  if (w === 'pared') return 'pared';
  if (esFuerza(p) || p.clase === 'fuerza') return 'fuerza';
  if (p.clase === 'movilidad') return 'movilidad';
  // Una máquina que mide (el remo, el ski, la bici con monitor) manda su
  // métrica aunque sea una estación; sin monitor, la estación la dices tú.
  if (p.maquina && (p.medida.mide === 'ergo' || p.clase === 'ergo' || p.clase === 'test' || p.maquina.tipo === 'cinta')) return FAMILIA_MAQUINA[p.maquina.tipo];
  if (p.entorno === 'cinta' || p.medida.mide === 'cinta') return 'cinta';
  if (p.clase === 'estacion') return 'estacion';
  if (esCarrera(p)) return 'correr';
  return 'estacion';
}

/** ¿Es un test? La cabecera lo marca: un test no puede confundirse con un WOD en vivo. */
export const esTest = (p: PasoBase): boolean => p.clase === 'test';

/**
 * CÓMO SE LLAMA EL FORMATO EN LA PANTALLA — castellano de box, desde UN sitio.
 * Método del coach con defecto (HARD RULE Nº0): otro coach dice «Por tiempo»
 * en vez de «For Time» o «Tabata» en vez de «A reloj»; lo cambia aquí, no en
 * cada pantalla. La auditoría del 28-09 encontró «Intervals», «Steady»,
 * «Strength», «Warm-up» en el vivo: cada vista traducía por su cuenta.
 */
export const NOMBRE_FORMATO_DEFECTO = {
  emom: 'EMOM',
  amrap: 'AMRAP',
  fortime: 'For Time',
  pared: 'Tabata',
  circuito: 'Circuito',
  test: 'Test',
} as const;

/**
 * El formato del paso con su tamaño, para la cabecera y el brief: «EMOM 12′»,
 * «AMRAP 15′», «For Time · cap 20′», «Tabata 8 × 20″/10″», «Circuito»; si no
 * es un WOD, el nombre de su clase («Series», «Rodaje», «Serie» de fuerza…).
 */
export function formatoDe(p: PasoBase, nombres = NOMBRE_FORMATO_DEFECTO): string {
  const w = wodDe(p);
  switch (w?.formato) {
    case 'emom':
      return `${nombres.emom} ${fmtDuracion(w.ventanas * w.ventanaS)}`;
    case 'amrap':
    case 'puntuacion':
      return `${nombres.amrap} ${fmtDuracion(w.duracionS)}`;
    case 'fortime':
      return w.capS != null ? `${nombres.fortime} · cap ${fmtDuracion(w.capS)}` : nombres.fortime;
    case 'pared':
      return `${nombres.pared} ${w.rondas} × ${fmtDuracion(w.trabajoS)}/${fmtDuracion(w.descansoS)}`;
    default:
      break;
  }
  if (esTest(p)) return nombres.test;
  if (p.clase === 'estacion' || p.clase === 'roxzone' || (p.clase === 'carrera' && p.posicion?.ronda)) return nombres.circuito;
  if (p.clase === 'series') return 'Series';
  if (p.clase === 'fuerza') return 'Fuerza';
  return NOMBRE_CLASE_DEFECTO[p.clase];
}

/** Ergo y cinta admiten horizontal (soportes de remo y consolas de cinta, §3 del modelo). */
export function admiteHorizontal(f: Familia): boolean {
  return f === 'remo' || f === 'ski' || f === 'bici' || f === 'cinta';
}

// ---------------------------------------------------------------------------
// La posición en palabras (I5.1) y lo que viene («Luego ·», «Viene:»)
// ---------------------------------------------------------------------------

/**
 * LA POSICIÓN DE LA CABECERA, por partes y por prioridad (la cabecera quita
 * por el final si no cabe). Es `contextoDe` con lo que cada familia cuenta
 * distinto: el EMOM cuenta minutos, el AMRAP rondas que llevas, un descanso
 * dice cuánto dura y la Roxzone se nombra.
 */
export function posicionDe(p: PasoBase, x: ExtraFamilia = {}): string[] {
  const w = wodDe(p);
  const s = p.posicion?.serie;
  if (w?.formato === 'emom' && s) return [`${w.ventanaS === 60 ? 'Minuto' : 'Ventana'} ${s.n}/${s.de}`];
  if (w?.formato === 'amrap' && w.tareas.length > 1) return [x.rondas != null ? `Ronda ${x.rondas + 1}` : 'AMRAP'];
  if (w?.formato === 'puntuacion') return ['Puntuación'];
  if (p.clase === 'roxzone') return [...contextoDe(p), 'Roxzone'];
  if (p.rol === 'descanso' || p.rol === 'recuperacion') return [...contextoDe(p), fmtPrescrito(p.medida)].filter(Boolean);
  return contextoDe(p);
}

const MODO_RECUPERA = { trote: 'trote', andar: 'caminando', parado: 'parado' } as const;

/**
 * Lo que viene, en corto (para «Luego ·» y «Viene:»). Si abre una tanda o una
 * ronda nueva, lo dice con su tamaño: «Tanda 3/3 · 6 × 1′»; una recuperación
 * dice cómo se recupera: «Recupera 90″ trote»; una serie de fuerza, su dosis
 * con la carga que propone el plan: «A1 · Back Squat · 8 × 125 kg»; la
 * Roxzone y la campana del AMRAP, su nombre; si no, el paso: «1000 m a 3:45–3:55».
 */
export function textoViene(p: PasoBase): string {
  const pos = p.posicion;
  if (p.rol === 'recuperacion') return `Recupera ${textoPasoCorto(p)} ${MODO_RECUPERA[p.modoRecupera ?? 'trote']}`;
  if (p.clase === 'roxzone') return 'Roxzone';
  if (p.wod?.formato === 'puntuacion') return 'Puntuación';
  if (esFuerza(p) && p.rol === 'trabajo' && p.medida.tipo === 'reps') {
    const quien = [pos?.slot, p.nombre].filter(Boolean).join(' · ');
    const kg = p.fuerza.carga.tipo === 'corporal' ? null : cargaDelPlan(p.fuerza);
    const reps = p.medida.prescrito ?? '—';
    return `${quien} · ${kg != null ? `${reps} × ${fmtKg(kg)}` : `${reps} reps`}`;
  }
  const corto = textoPasoCorto(p);
  if (pos?.tanda && pos.serie?.n === 1) return `Tanda ${pos.tanda.n}/${pos.tanda.de} · ${pos.serie.de} × ${corto}`;
  if (pos?.ronda && (pos.estacion?.n ?? 1) === 1) return `Ronda ${pos.ronda.n}/${pos.ronda.de} · ${corto}`;
  // Sin objetivo, lo prescrito solo dice poco («1′»): se dice cuál es.
  if (pos?.serie && !principal(p)) return `${p.wod?.formato === 'emom' ? 'Minuto' : NOMBRE_CLASE_DEFECTO[p.clase]} ${pos.serie.n}/${pos.serie.de} · ${corto}`;
  return corto;
}

/** Lo que viene, y lo de después si lo que viene es recuperar: «Recupera 90″ trote» · «1000 m a 3:45–3:55». */
export interface LuegoVista {
  que: string;
  despues: string | null;
}

/**
 * «Luego ·» del paso `i`: el siguiente paso con su objetivo y, si es una
 * recuperación, un descanso o una transición, también el trabajo que viene
 * detrás (I5: «Luego · Recupera 90″ trote · después 1000 m a 3:45–3:55»).
 * `null` si es el último paso.
 */
export function luegoDe(pasos: ReadonlyArray<PasoBase>, i: number): LuegoVista | null {
  const sig = pasos[i + 1];
  if (!sig) return null;
  const tras = pasos[i + 2];
  const despues = sig.rol !== 'trabajo' && tras && tras.rol === 'trabajo' ? textoViene(tras) : null;
  return { que: textoViene(sig), despues };
}

// ---------------------------------------------------------------------------
// Lo que el paso no sabe solo: el estado que la familia lleva encima
// ---------------------------------------------------------------------------

/**
 * Lo que el héroe, el trabajo y la rejilla necesitan además del paso y las
 * lecturas, y que vive en el motor o en la familia. Todo opcional: sin él,
 * la métrica que lo pide no sale (no se inventa).
 */
export interface ExtraFamilia {
  /** Metros medidos de ESTE paso (GPS, cinta o máquina); null si nadie los midió. */
  metrosPaso?: number | null;
  /** El crono total de un circuito o un For Time (la puntuación); null en el calentamiento. */
  total?: number | null;
  /** Rondas del AMRAP que el atleta ha contado. */
  rondas?: number | null;
  /** La carga que está en la barra (declarada en la serie anterior, P11); sin ella, la del plan. */
  cargaKg?: number | null;
  /** La última serie anotada del mismo ejercicio («8 × 125 kg · RIR 3»). */
  ultimaSerie?: string | null;
  /** Reps hechas en la ronda del reloj de pared (si alguien las cuenta). */
  repsRonda?: number | null;
  /** Reps de este minuto en un EMOM medido por sensor. */
  repsMinuto?: number | null;
  /** El descanso que sigue a la serie, en s (para «descanso 2′» en fuerza). */
  descansoS?: number | null;
  /** El nombre de lo que viene (la estación a la que entra la Roxzone). */
  siguienteNombre?: string | null;
}

// ---------------------------------------------------------------------------
// El héroe de la familia (I4)
// ---------------------------------------------------------------------------

/** La carga en la barra: la declarada (cascada) o la que propone el plan. */
function kgEnBarra(p: PasoBase, x: ExtraFamilia): number | null {
  if (!esFuerza(p)) return null;
  return x.cargaKg ?? cargaDelPlan(p.fuerza);
}

/**
 * EL HÉROE CON LAS REGLAS DE FAMILIA ENCIMA DE P3. Correr y ergo salen de
 * `heroeDelPaso` (el objetivo manda; sin objetivo, lo que falta); las familias
 * cuya pregunta no es «¿voy al objetivo?» ponen la suya:
 *   Fuerza              ¿qué levanto y cuánto? → «8 × 125» kg, con el esfuerzo encima
 *   For Time / chipper  ¿cuánto llevo?      → el crono total (la puntuación)
 *   AMRAP               ¿cuántas rondas?    → las rondas contadas
 *   Reloj de pared      ¿trabajo o descanso? → lo que queda, con su palabra
 *   Estación sin medida ¿cuánto llevo?      → el crono de la estación, «lo dices tú»
 */
export function heroeDeFamilia(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null, x: ExtraFamilia = {}): HeroeVista {
  const f = familiaDe(p);
  const w = wodDe(p);
  if (f === 'fortime' && x.total != null) return { clase: 'crono', texto: fmtReloj(x.total), etiqueta: 'total' };
  if (f === 'amrap' && w?.formato === 'amrap' && w.tareas.length > 1 && x.rondas != null) {
    return { clase: 'crono', texto: String(x.rondas), unidad: x.rondas === 1 ? 'ronda' : 'rondas' };
  }
  if (f === 'pared') {
    const falta = faltaDe(p, l);
    return { clase: 'falta', texto: fmtReloj(Math.ceil(falta ?? l.t)), etiqueta: p.rol === 'trabajo' ? 'trabajo' : 'descanso' };
  }
  if (f === 'fuerza' && esFuerza(p) && p.rol === 'trabajo' && p.medida.tipo === 'reps') {
    const fi = p.fuerza;
    const reps = String(p.medida.prescrito ?? '—');
    const kg = fi.carga.tipo === 'corporal' ? null : kgEnBarra(p, x);
    const esfuerzo = fi.esfuerzo ? textoEsfuerzo(fi.esfuerzo) : null;
    const pct = textoPct(fi.carga);
    const etiqueta = [pct, esfuerzo].filter(Boolean).join(' · ') || (fi.carga.tipo === 'tuya' ? 'carga tuya' : fi.carga.tipo === 'corporal' ? 'peso corporal' : undefined);
    // Las reps las cuenta el sensor: el héroe es lo que llevas de ellas.
    if (p.medida.mide === 'sensor' && l.hecho != null) return { clase: 'falta', texto: String(l.hecho), unidad: `de ${reps}`, etiqueta: kg != null ? fmtKg(kg) : etiqueta };
    if (kg != null) return { clase: 'falta', texto: `${reps} × ${num(kg)}`, unidad: 'kg', etiqueta };
    return { clase: 'falta', texto: reps, unidad: 'reps', etiqueta };
  }
  const base = heroeDelPaso(p, l, zonas);
  // La Roxzone: a qué entras, o que sigue sola al correr (P10).
  if (f === 'roxzone') {
    const sig = x.siguienteNombre ?? null;
    return { ...base, etiqueta: p.roxzone === 'entrada' ? `Roxzone${sig ? ` · entras a ${sig}` : ''}` : 'Roxzone · sigue sola al correr' };
  }
  // Lo que nadie mide (trineo, wall balls): el crono, y se dice quién lo cierra.
  if (base.clase === 'crono' && (f === 'estacion' || f === 'remo' || f === 'ski' || f === 'bici') && p.medida.mide === 'atleta') {
    return { ...base, etiqueta: 'lo dices tú' };
  }
  return base;
}

// ---------------------------------------------------------------------------
// El trabajo (§10.6)
// ---------------------------------------------------------------------------

export interface TrabajoVista {
  etiqueta: string;
  valor: string;
  unidad?: string;
  /** Un valor que no es cifra (la tarea del EMOM): en texto, sin numeral. */
  texto?: boolean;
}

const enTexto = (etiqueta: string, valor: string): TrabajoVista => ({ etiqueta, valor, texto: true });

/** Lo que falta del paso en la unidad de su medida, dicho para la fila del trabajo. */
function faltaVista(p: PasoBase, l: Lecturas): TrabajoVista | null {
  const falta = faltaDe(p, l);
  if (falta == null) return null;
  switch (p.medida.tipo) {
    case 'distancia': {
      const d = fmtDistancia(falta);
      return { etiqueta: 'quedan', valor: d.valor, unidad: d.unidad };
    }
    case 'reps':
      return { etiqueta: 'quedan', valor: String(Math.ceil(falta)), unidad: 'reps' };
    case 'cal':
      return { etiqueta: 'quedan', valor: String(Math.ceil(falta)), unidad: 'cal' };
    default:
      return { etiqueta: 'quedan', valor: fmtReloj(Math.ceil(falta)) };
  }
}

/** La dosis de una estación con su carga: «50 m · 152 kg», «25 reps · 9 kg». */
function dosisEstacion(p: PasoBase): string | null {
  const pr = fmtPrescrito(p.medida) || null;
  return [pr, textoCargaImplemento(p.carga)].filter(Boolean).join(' · ') || null;
}

/**
 * LA FILA DEL TRABAJO (I5.4): lo que falta del paso y la dosis, nunca en
 * gris. Si el héroe ya es lo que falta o lo que llevas, la fila diría lo
 * mismo y no sale. Por familia:
 *   correr, ergo   lo que falta (m, tiempo o cal)
 *   fuerza         el tempo si lo hay, o lo que falta si el sensor cuenta
 *   EMOM, For Time la tarea / estación con su dosis y su carga
 *   AMRAP          lo que queda de la ventana
 *   estación       la dosis y la carga («50 m · 152 kg»)
 */
export function trabajoDe(p: PasoBase, l: Lecturas, heroe: HeroeVista['clase']): TrabajoVista | null {
  const f = familiaDe(p);
  const w = wodDe(p);
  switch (f) {
    case 'fuerza':
      if (esFuerza(p) && p.medida.mide === 'sensor') return faltaVista(p, l);
      return p.tempo ? enTexto('tempo', textoTempo(p.tempo)) : null;
    case 'emom':
      return w?.formato === 'emom' ? enTexto('tarea', textoTarea(w.tarea, w.ventanaS)) : null;
    case 'amrap': {
      const falta = faltaDe(p, l);
      return falta != null ? { etiqueta: 'quedan', valor: fmtReloj(Math.ceil(falta)) } : null;
    }
    case 'fortime':
      return w?.formato === 'fortime' && w.tarea ? enTexto('estación', [textoTarea(w.tarea), cargaTarea(w.tarea)].filter(Boolean).join(' · ')) : null;
    case 'estacion':
    case 'roxzone': {
      const d = dosisEstacion(p);
      return d ? enTexto('dosis', d) : null;
    }
    case 'pared':
    case 'descanso':
    case 'recupera':
    case 'transicion':
    case 'movilidad':
      return null;
    default:
      break;
  }
  // Correr y ergo: el héroe ya es lo que falta o lo que llevas → la fila diría lo mismo.
  if (heroe === 'falta' || heroe === 'crono') return null;
  return faltaVista(p, l);
}

// ---------------------------------------------------------------------------
// La rejilla de apoyo (§4)
// ---------------------------------------------------------------------------

export type ClaveMetrica =
  | 'pulso'
  | 'ritmo'
  | 'distancia'
  | 'cadencia'
  | 'inclinacion'
  | 'split'
  | 'vatios'
  | 'cal'
  | 'serie'
  | 'tempo'
  | 'descanso'
  | 'ultima'
  | 'tarea'
  | 'minuto'
  | 'repsRonda'
  | 'cap'
  | 'parcial'
  | 'total'
  | 'ronda'
  | 'objetivo'
  | 'reps';

/** Una celda de la rejilla: etiqueta a 15 pt, valor grande, unidad; el pulso con su zona. */
export interface Metrica {
  clave: ClaveMetrica;
  etiqueta: string;
  valor: string;
  unidad?: string;
  zona?: LineaVista['zona'];
  glifo?: 'pulso';
  tendencia?: LineaVista['tendencia'];
  aviso?: LineaVista['aviso'];
  /** Un valor que no es una cifra (el nombre de una tarea): se pinta en texto, no en el numeral. */
  texto?: boolean;
}

/** Cuántas celdas admite la rejilla (§4: 2–4). */
export const REJILLA = { min: 2, max: 4 } as const;

const entero = (v: number | null | undefined) => (v == null ? '—' : String(Math.round(v)));

/**
 * Un dato que alguien mide existe; uno que nadie mide no se pinta (CONTRATO-UI
 * §6.2 bis). Solo se enseña «—» cuando se MEDÍA y se ha perdido (viejo).
 */
const medido = (l: Lecturas, v: number | null | undefined, campo: NonNullable<Lecturas['viejos']>[number]) =>
  v != null || (l.viejos?.includes(campo) ?? false);

function pulso(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null, reglas: ReglasAviso): Metrica {
  const x = lineaPulso(p, l, zonas, reglas);
  return { clave: 'pulso', etiqueta: 'pulso', valor: x.valor, unidad: x.unidad, zona: x.zona, glifo: 'pulso', tendencia: x.tendencia, aviso: x.aviso };
}

function ritmo(l: Lecturas): Metrica {
  return { clave: 'ritmo', etiqueta: 'ritmo', valor: fmtRitmo(valorDeEje('ritmo', l)), unidad: '/km' };
}

function distancia(x: ExtraFamilia): Metrica | null {
  if (x.metrosPaso == null) return null;
  const d = fmtDistancia(x.metrosPaso);
  return { clave: 'distancia', etiqueta: 'distancia', valor: d.valor, unidad: d.unidad };
}

function cadencia(l: Lecturas, unidad: 'pasos' | 's/min' | 'rpm'): Metrica | null {
  if (!medido(l, l.cadencia, 'cadencia')) return null;
  return { clave: 'cadencia', etiqueta: 'cadencia', valor: entero(valorDeEje('cadencia', l)), unidad };
}

function split(p: PasoBase, l: Lecturas): Metrica {
  return { clave: 'split', etiqueta: 'ritmo', valor: fmtSplit(valorDeEje('split500', l), p.maquina), unidad: unidadSplit(p.maquina) };
}

function vatios(l: Lecturas): Metrica | null {
  if (!medido(l, l.vatios, 'vatios')) return null;
  return { clave: 'vatios', etiqueta: 'potencia', valor: entero(valorDeEje('potencia', l)), unidad: 'W' };
}

function cal(l: Lecturas): Metrica | null {
  if (!medido(l, l.cal, 'cal')) return null;
  const viejo = l.viejos?.includes('cal') ?? false;
  return { clave: 'cal', etiqueta: 'calorías', valor: viejo ? '—' : entero(l.cal), unidad: 'cal' };
}

function inclinacion(p: PasoBase): Metrica | null {
  const o = p.objetivos.find((x) => x.eje === 'inclinacion');
  return o ? { clave: 'inclinacion', etiqueta: 'inclinación', valor: num(o.min ?? o.max ?? 0), unidad: '%' } : null;
}

function totalDe(x: ExtraFamilia): Metrica | null {
  return x.total == null ? null : { clave: 'total', etiqueta: 'total', valor: fmtReloj(x.total) };
}

const texto = (clave: ClaveMetrica, etiqueta: string, valor: string): Metrica => ({ clave, etiqueta, valor, texto: true });

/**
 * LA REJILLA DE APOYO DEL PASO (§4): 2–4 métricas propias de la familia o de
 * la máquina, el pulso siempre (salvo que sea el héroe), sin repetir lo que
 * ya dicen el héroe y la fila del trabajo. Lo que nadie mide no sale; lo
 * perdido, «—».
 *
 * `heroe` es la clase del héroe que ya está en pantalla: la rejilla no lo
 * repite. Las celdas van por orden de importancia; el pintor corta a
 * `REJILLA.max` si la familia trae más.
 */
export function metricasDelPaso(
  p: PasoBase,
  l: Lecturas,
  heroe: HeroeVista['clase'],
  zonas: ZonasCoach | null,
  x: ExtraFamilia = {},
  reglas: ReglasAviso = REGLAS_AVISO_DEFECTO,
): Metrica[] {
  const f = familiaDe(p);
  const w = wodDe(p);
  const conPulso = heroe !== 'pulso';
  const m: Array<Metrica | null> = [];

  switch (f) {
    case 'correr':
      if (heroe !== 'ritmo') m.push(ritmo(l));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      m.push(distancia(x), cadencia(l, 'pasos'));
      break;
    case 'cinta':
      if (heroe !== 'ritmo') m.push(ritmo(l));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      m.push(inclinacion(p), distancia(x));
      break;
    case 'remo':
    case 'ski':
    case 'bici':
      // El pulso antes que los vatios: con el héroe en lo que falta (un test)
      // caben cuatro, y lo que cae es la potencia, nunca el pulso.
      if (heroe !== 'split' && p.medida.mide === 'ergo') m.push(split(p, l));
      m.push(cadencia(l, f === 'bici' ? 'rpm' : 's/min'));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      m.push(cal(l), vatios(l));
      break;
    case 'fuerza': {
      const s = p.posicion?.serie;
      if (s) m.push(texto('serie', esFuerza(p) && p.fuerza.aproximacion ? 'aproximación' : 'serie', `${s.n}/${s.de}`));
      if (x.descansoS != null) m.push(texto('descanso', 'descanso', fmtDuracion(x.descansoS)));
      if (x.ultimaSerie) m.push(texto('ultima', 'última', x.ultimaSerie));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'emom': {
      if (w?.formato === 'emom') {
        const s = p.posicion?.serie;
        if (s) m.push(texto('minuto', w.ventanaS === 60 ? 'minuto' : 'ventana', `${s.n}/${s.de}`));
        if (x.repsMinuto != null) m.push({ clave: 'reps', etiqueta: 'reps', valor: String(x.repsMinuto) });
        if (p.maquina && p.maquina.tipo !== 'cinta' && p.medida.mide !== 'atleta') m.push(split(p, l), cal(l));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'amrap': {
      if (w?.formato === 'amrap' || w?.formato === 'puntuacion') {
        const t = w.tareas[0];
        if (t) m.push(texto('tarea', w.tareas.length > 1 ? 'la ronda empieza por' : 'tarea', textoTarea(t)));
        if (w.tareas.length > 1) m.push({ clave: 'repsRonda', etiqueta: 'reps por ronda', valor: String(repsPorRonda(w.tareas)) });
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'fortime': {
      if (w?.formato === 'fortime') {
        if (w.capS != null) m.push({ clave: 'cap', etiqueta: 'cap', valor: fmtDuracion(w.capS) });
        m.push({ clave: 'parcial', etiqueta: 'esta estación', valor: fmtReloj(l.t) });
        if (p.maquina && p.medida.mide === 'ergo') m.push(split(p, l));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'pared': {
      const r = p.posicion?.ronda;
      if (r) m.push(texto('ronda', 'ronda', `${r.n}/${r.de}`));
      if (x.repsRonda != null) m.push({ clave: 'repsRonda', etiqueta: 'reps', valor: String(x.repsRonda) });
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'estacion':
    case 'roxzone': {
      const o = objetivoDe(p, 'principal');
      if (o) m.push(texto('objetivo', 'objetivo', fmtObjetivo(o, p.maquina)));
      m.push(totalDe(x));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'recupera':
    case 'descanso':
    case 'transicion':
    case 'movilidad':
    default:
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      if (f === 'recupera' && esCarrera(p)) m.push(ritmo(l));
      m.push(totalDe(x));
      break;
  }

  return m.filter((c): c is Metrica => c != null).slice(0, REJILLA.max);
}
