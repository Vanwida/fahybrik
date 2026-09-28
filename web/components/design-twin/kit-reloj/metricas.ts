// EL HÉROE, EL TRABAJO Y LA REJILLA DEL PASO — funciones PURAS (I4, I5 y §4
// del modelo del iPhone, docs/vivo-iphone/modelo.md; el Swift las espeja).
// La familia y el formato están en `familia.ts`; la posición y «Luego», en
// `posicion.ts`.
//
// La auditoría del 28-09 encontró que la máquina no mandaba su métrica: la
// BikeErg salía como remo, las calorías solo con objetivo en cal, la cadencia
// medida nunca se veía; y que el título del bloque salía en inglés
// («Intervals», «For Time») porque cada vista traducía por su cuenta. Aquí se
// decide UNA vez, por familia:
//   · el HÉROE con las reglas de familia encima de P3 (`heroeDeFamilia`);
//   · el TRABAJO (§10.6): lo que falta o la tarea, nunca en gris (`trabajoDe`);
//   · la REJILLA de 2–4 métricas propias, el pulso siempre (`metricasDelPaso`);
// Un pintor (muñeca o iPhone) llama a estas funciones y pinta lo que devuelven.

import { cargaDelPlan } from './anotar';
import { heroeDeathBy } from './deathby';
import { familiaDe } from './familia';
import { esFuerza, fmtKg, kgDelPlan, textoEsfuerzo, textoKgPlan, textoPct, textoTempo } from './fuerza';
import { heroeDelPaso, lineaPulso, type HeroeVista, type LineaVista } from './lamina';
import { REGLAS_AVISO_DEFECTO, type Lecturas, type Parcial, type PasoBase, type ReglasAviso, type ZonasCoach } from './paso';
import {
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
  textoCargaImplemento,
  unidadSplit,
  valorDeEje,
} from './reglas';
import { cargaTarea, repsPorRonda, textoTarea, wodDe } from './tarea';

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
  /** Segundos de la ronda en curso de un circuito (lo hecho de esta ronda + este paso). */
  rondaS?: number | null;
  /** ¿El crono total ya está en la cabecera? Entonces la rejilla no lo repite (un dato, un sitio). */
  totalEnCabecera?: boolean;
  /** EMOM y death by: cuánto tardó la MISMA tarea la vez anterior (el segundo en que se marcó «hecho»). */
  ultimaVentana?: number | null;
  /** La puntuación del AMRAP: las reps sueltas de la ronda a medias (`null` = sin declarar, nunca 0). */
  repsSueltas?: number | null;
  /** El paso de trabajo anterior con su parcial (la ronda anterior de un tabata, la estación anterior). */
  anterior?: { paso: PasoBase; parcial: Parcial } | null;
}

// ---------------------------------------------------------------------------
// El héroe de la familia (I4)
// ---------------------------------------------------------------------------

/** La carga en la barra: la declarada (cascada) o la que propone el plan. */
function kgEnBarra(p: PasoBase, x: ExtraFamilia): number | null {
  if (!esFuerza(p)) return null;
  return x.cargaKg ?? cargaDelPlan(p.fuerza);
}

/** Las reps las cuenta el sensor y ya está contando: el héroe es lo que llevas, con los kilos encima. */
const cuentaElSensor = (p: PasoBase, l: Lecturas) => p.medida.mide === 'sensor' && l.hecho != null;

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
  // La campana: la puntuación es rondas + reps («5 + 18»), y lo no dicho es «—», nunca 0.
  if (f === 'amrap' && w?.formato === 'puntuacion') {
    const reps = x.repsSueltas == null ? '—' : String(x.repsSueltas);
    if (w.tareas.length > 1 && x.rondas != null) return { clase: 'crono', texto: `${x.rondas} + ${reps}`, etiqueta: 'rondas + reps' };
    return { clase: 'crono', texto: reps, unidad: 'reps', etiqueta: w.tareas[0]?.nombre ?? 'puntuación' };
  }
  // Death by: ¿cuántas reps este minuto? (deathby.ts)
  if (f === 'deathby') return heroeDeathBy(p) ?? heroeDelPaso(p, l, zonas);
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
    if (cuentaElSensor(p, l)) return { clase: 'falta', texto: String(l.hecho), unidad: `de ${reps}`, etiqueta: kg != null ? fmtKg(kg) : etiqueta };
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
    case 'deathby': {
      // El héroe son las reps del minuto; el trabajo, lo que queda de él.
      const falta = faltaDe(p, l);
      return falta != null ? { etiqueta: 'quedan', valor: fmtReloj(Math.ceil(falta)) } : null;
    }
    case 'fortime':
      // `textoTarea` ya lleva los kilos; lo que añade `cargaTarea` es solo «peso corporal».
      return w?.formato === 'fortime' && w.tarea ? enTexto('estación', [textoTarea(w.tarea), w.tarea.carga ? null : cargaTarea(w.tarea)].filter(Boolean).join(' · ')) : null;
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
  | 'carga'
  | 'esfuerzo'
  | 'rondaS'
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
  return x.total == null || x.totalEnCabecera ? null : { clave: 'total', etiqueta: 'total', valor: fmtReloj(x.total) };
}

function rondaDe(p: PasoBase, x: ExtraFamilia): Metrica | null {
  const r = p.posicion?.ronda;
  return r && x.rondaS != null ? { clave: 'rondaS', etiqueta: `ronda ${r.n}`, valor: fmtReloj(x.rondaS) } : null;
}

const texto = (clave: ClaveMetrica, etiqueta: string, valor: string): Metrica => ({ clave, etiqueta, valor, texto: true });

/** EMOM y death by: cuánto tardó la misma tarea la vez anterior («la vez anterior · 0:22»). */
function ultimaVentana(x: ExtraFamilia): Metrica | null {
  return x.ultimaVentana == null ? null : { clave: 'ultima', etiqueta: 'la vez anterior', valor: fmtReloj(x.ultimaVentana) };
}

/** Reloj de pared: el pulso medio de la ronda anterior, si el motor la cerró con pulso. */
function rondaAnterior(x: ExtraFamilia): Metrica | null {
  const a = x.anterior;
  const r = a?.paso.posicion?.ronda;
  if (!a || !r || a.parcial.ppm == null) return null;
  return { clave: 'ultima', etiqueta: `ronda ${r.n}`, valor: String(Math.round(a.parcial.ppm)), unidad: 'ppm medio' };
}

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
      m.push(distancia(x), rondaDe(p, x), cadencia(l, 'pasos'));
      break;
    case 'cinta':
      // Sin la cinta conectada nadie mide el ritmo: no se pinta (solo «—» si se medía y se perdió).
      if (heroe !== 'ritmo' && medido(l, l.ritmo, 'ritmo')) m.push(ritmo(l));
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
      // En un paso POR calorías el héroe ya las dice (las que faltan): la
      // rejilla no las repite (un dato, un sitio) y la potencia sube.
      m.push(p.medida.tipo === 'cal' ? null : cal(l), vatios(l));
      break;
    case 'fuerza': {
      // Lo que la serie pide y no cabe en el héroe: la carga que da el plan en
      // kilos, el esfuerzo, el tempo, el descanso prescrito, la última serie.
      // Un dato, un sitio: el héroe ya lleva el esfuerzo encima (salvo cuando
      // el sensor cuenta y encima van los kilos), y «carga del plan» solo sale
      // si dice algo que el héroe no dice (una banda, o unos kilos distintos
      // de los que hay en la barra).
      const s = p.posicion?.serie;
      if (s) m.push(texto('serie', esFuerza(p) && p.fuerza.aproximacion ? 'aproximación' : 'serie', `${s.n}/${s.de}`));
      if (esFuerza(p)) {
        const rango = kgDelPlan(p.fuerza.carga);
        const enBarra = kgEnBarra(p, x);
        const kg = textoKgPlan(p.fuerza.carga);
        if (kg && p.fuerza.carga.tipo === 'rm' && rango && (rango[0] !== rango[1] || rango[0] !== enBarra)) m.push(texto('carga', 'carga del plan', kg));
        const heroeLlevaEsfuerzo = p.medida.tipo === 'reps' && !cuentaElSensor(p, l);
        if (p.fuerza.esfuerzo && !p.fuerza.aproximacion && !heroeLlevaEsfuerzo) m.push(texto('esfuerzo', 'esfuerzo', textoEsfuerzo(p.fuerza.esfuerzo)));
      }
      if (p.tempo) m.push(texto('tempo', 'tempo', textoTempo(p.tempo)));
      // El pulso antes que la última serie y el descanso: con cuatro celdas
      // llenas, lo que cae nunca es el pulso.
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      if (x.ultimaSerie) m.push(texto('ultima', 'última serie', x.ultimaSerie));
      if (x.descansoS != null) m.push(texto('descanso', 'descanso', fmtDuracion(x.descansoS)));
      break;
    }
    case 'emom': {
      // La cabecera ya dice «Minuto 3/12»: la rejilla no lo repite (un dato,
      // un sitio). Con máquina, lo suyo: el /500, los metros de ESTE minuto,
      // el pulso y las calorías. Sin máquina, cuánto tardó la tarea la vez
      // anterior (si se marcó) y el pulso.
      const maquina = w?.formato === 'emom' && !!p.maquina && p.maquina.tipo !== 'cinta' && p.medida.mide !== 'atleta';
      if (w?.formato === 'emom') {
        if (x.repsMinuto != null) m.push({ clave: 'reps', etiqueta: 'reps', valor: String(x.repsMinuto) });
        if (maquina) m.push(split(p, l), distancia(x));
        else m.push(ultimaVentana(x));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      if (maquina) m.push(cal(l));
      break;
    }
    case 'deathby': {
      m.push(ultimaVentana(x));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'amrap': {
      if (w?.formato === 'amrap') {
        const t = w.tareas[0];
        if (t) m.push(texto('tarea', w.tareas.length > 1 ? 'la ronda empieza por' : 'tarea', textoTarea(t)));
        // Con el remo en la ronda, su /500 actual («—» si no estás remando) vale más que las reps por ronda.
        if (p.maquina && p.maquina.tipo !== 'cinta') m.push(split(p, l));
        else if (w.tareas.length > 1) m.push({ clave: 'repsRonda', etiqueta: 'reps por ronda', valor: String(repsPorRonda(w.tareas)) });
      }
      // La campana: las reps que hace una ronda entera (para contar la que quedó a medias) y el pulso.
      if (w?.formato === 'puntuacion' && w.tareas.length > 1) m.push({ clave: 'repsRonda', etiqueta: 'reps por ronda', valor: String(repsPorRonda(w.tareas)) });
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'fortime': {
      if (w?.formato === 'fortime') {
        // El cap se lee como lo que queda hasta él, no como un dato del plan (el número no miente).
        if (w.capS != null) {
          const hasta = x.total != null ? Math.max(0, w.capS - x.total) : null;
          m.push(hasta == null ? { clave: 'cap', etiqueta: 'cap', valor: fmtDuracion(w.capS) } : { clave: 'cap', etiqueta: hasta > 0 ? 'cap en' : 'cap pasado', valor: fmtReloj(hasta) });
        }
        m.push({ clave: 'parcial', etiqueta: 'esta estación', valor: fmtReloj(l.t) });
        if (p.maquina && p.medida.mide === 'ergo') m.push(split(p, l));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'pared': {
      // La cabecera ya dice «Ronda 4/8»: la rejilla enseña lo medido de la
      // ronda anterior (su pulso medio) y las reps si alguien las cuenta.
      if (x.repsRonda != null) m.push({ clave: 'repsRonda', etiqueta: 'reps', valor: String(x.repsRonda) });
      m.push(rondaAnterior(x));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'estacion':
    case 'roxzone': {
      const o = objetivoDe(p, 'principal');
      if (o) m.push(texto('objetivo', 'objetivo', fmtObjetivo(o, p.maquina)));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      m.push(rondaDe(p, x), totalDe(x));
      break;
    }
    case 'recupera':
    case 'descanso':
    case 'transicion':
    case 'movilidad':
    default:
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      // Trotando o caminando el GPS sigue midiendo: el ritmo si alguien lo mide, nunca por la clase.
      if (f === 'recupera' && medido(l, l.ritmo, 'ritmo')) m.push(ritmo(l));
      m.push(totalDe(x));
      break;
  }

  return m.filter((c): c is Metrica => c != null).slice(0, REJILLA.max);
}
