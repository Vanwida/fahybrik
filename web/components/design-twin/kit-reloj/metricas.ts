// LA FAMILIA DEL PASO Y SU REJILLA DE APOYO — funciones PURAS (I4 y §4 del
// modelo del iPhone, docs/vivo-iphone/modelo.md; el Swift las espeja).
//
// La auditoría del 28-09 encontró que la máquina no mandaba su métrica: la
// BikeErg salía como remo, las calorías solo con objetivo en cal, la cadencia
// medida nunca se veía. Aquí se decide UNA vez, por familia, qué 2–4 métricas
// acompañan al héroe (el pulso siempre, salvo que sea el héroe) y qué héroe
// lleva cada familia cuando la pregunta no es «¿voy al objetivo?» (For Time:
// el crono total; AMRAP: las rondas; reloj de pared: la fase). Un pintor
// (muñeca o iPhone) llama a estas dos funciones y pinta lo que le devuelven.

import { heroeDelPaso, lineaPulso, type HeroeVista, type LineaVista } from './lamina';
import { NOMBRE_CLASE_DEFECTO, REGLAS_AVISO_DEFECTO, type Lecturas, type PasoBase, type ReglasAviso, type ZonasCoach } from './paso';
import { esFuerza, textoCarga, textoEsfuerzo, textoTempo } from './fuerza';
import {
  esCarrera,
  faltaDe,
  fmtDistancia,
  fmtDuracion,
  fmtObjetivo,
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
  return NOMBRE_CLASE_DEFECTO[p.clase];
}

/** Ergo y cinta admiten horizontal (soportes de remo y consolas de cinta, §3 del modelo). */
export function admiteHorizontal(f: Familia): boolean {
  return f === 'remo' || f === 'ski' || f === 'bici' || f === 'cinta';
}

// ---------------------------------------------------------------------------
// Lo que el paso no sabe solo: el estado que la familia lleva encima
// ---------------------------------------------------------------------------

/**
 * Lo que la rejilla y el héroe necesitan además del paso y las lecturas, y
 * que vive en el motor o en la familia: el crono total del circuito, las
 * rondas contadas del AMRAP, la última serie anotada… Todo opcional: sin él,
 * la métrica que lo pide no sale (no se inventa).
 */
export interface ExtraFamilia {
  /** Metros medidos de ESTE paso (GPS, cinta o máquina); null si nadie los midió. */
  metrosPaso?: number | null;
  /** El crono total de un circuito o un For Time (la puntuación); null en el calentamiento. */
  total?: number | null;
  /** Rondas del AMRAP que el atleta ha contado. */
  rondas?: number | null;
  /** La última serie anotada del mismo ejercicio («8 × 125 kg · RIR 3»). */
  ultimaSerie?: string | null;
  /** Reps hechas en la ronda del reloj de pared (si alguien las cuenta). */
  repsRonda?: number | null;
  /** Reps de este minuto en un EMOM medido por sensor. */
  repsMinuto?: number | null;
  /** El descanso que sigue a la serie, en s (para «descanso 2′» en fuerza). */
  descansoS?: number | null;
}

// ---------------------------------------------------------------------------
// El héroe de la familia (I4)
// ---------------------------------------------------------------------------

/**
 * EL HÉROE CON LAS REGLAS DE FAMILIA ENCIMA DE P3. Correr, ergo y fuerza
 * salen de `heroeDelPaso` (el objetivo manda; sin objetivo, lo que falta);
 * las familias cuya pregunta no es «¿voy al objetivo?» ponen la suya:
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
  const base = heroeDelPaso(p, l, zonas);
  // Lo que nadie mide (trineo, wall balls, Roxzone): el crono, y se dice quién lo cierra.
  if (base.clase === 'crono' && (f === 'estacion' || f === 'roxzone' || f === 'fuerza') && p.medida.mide === 'atleta') {
    return { ...base, etiqueta: 'lo dices tú' };
  }
  return base;
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
  | 'queda'
  | 'repsRonda'
  | 'cap'
  | 'estacion'
  | 'parcial'
  | 'total'
  | 'ronda'
  | 'dosis'
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

/**
 * Un dato que alguien mide existe; uno que nadie mide no se pinta (CONTRATO-UI
 * §6.2 bis). Solo se enseña «—» cuando se MEDÍA y se ha perdido (viejo).
 */
const medido = (l: Lecturas, v: number | null | undefined, campo: NonNullable<Lecturas['viejos']>[number]) =>
  v != null || (l.viejos?.includes(campo) ?? false);

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
 * ya dicen el héroe y la fila del trabajo (lo que falta). Lo que nadie mide
 * sale como «—», nunca se inventa.
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
      if (heroe !== 'split') m.push(split(p, l));
      m.push(cadencia(l, f === 'bici' ? 'rpm' : 's/min'), vatios(l), cal(l));
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    case 'fuerza': {
      if (esFuerza(p)) {
        const s = p.posicion?.serie;
        if (s) m.push(texto('serie', p.fuerza.aproximacion ? 'aproximación' : 'serie', `${s.n}/${s.de}`));
        if (p.tempo) m.push(texto('tempo', 'tempo', textoTempo(p.tempo)));
        if (x.descansoS != null) m.push(texto('descanso', 'descanso', fmtDuracion(x.descansoS)));
        if (x.ultimaSerie) m.push(texto('ultima', 'última', x.ultimaSerie));
      } else if (p.posicion?.serie) {
        m.push(texto('serie', 'serie', `${p.posicion.serie.n}/${p.posicion.serie.de}`));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'emom': {
      if (w?.formato === 'emom') {
        m.push(texto('tarea', 'tarea', textoTarea(w.tarea, w.ventanaS)));
        const s = p.posicion?.serie;
        if (s) m.push(texto('minuto', w.ventanaS === 60 ? 'minuto' : 'ventana', `${s.n}/${s.de}`));
        if (x.repsMinuto != null) m.push({ clave: 'reps', etiqueta: 'reps', valor: String(x.repsMinuto) });
        if (p.maquina && p.maquina.tipo !== 'cinta') m.push(split(p, l));
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'amrap': {
      if (w?.formato === 'amrap' || w?.formato === 'puntuacion') {
        const falta = faltaDe(p, l);
        if (falta != null) m.push({ clave: 'queda', etiqueta: 'quedan', valor: fmtReloj(Math.ceil(falta)) });
        const t = w.tareas[0];
        if (t) m.push(texto('tarea', w.tareas.length > 1 ? 'primera tarea' : 'tarea', textoTarea(t)));
        if (w.tareas.length > 1) m.push({ clave: 'repsRonda', etiqueta: 'reps por ronda', valor: String(repsPorRonda(w.tareas)) });
      }
      if (conPulso) m.push(pulso(p, l, zonas, reglas));
      break;
    }
    case 'fortime': {
      if (w?.formato === 'fortime') {
        if (w.capS != null) m.push({ clave: 'cap', etiqueta: 'cap', valor: fmtDuracion(w.capS) });
        if (w.tarea) m.push(texto('estacion', 'estación', [textoTarea(w.tarea), cargaTarea(w.tarea)].filter(Boolean).join(' · ')));
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
      const dosis = [p.medida.prescrito != null ? (p.medida.tipo === 'reps' ? `${p.medida.prescrito} reps` : p.medida.tipo === 'distancia' ? `${p.medida.prescrito} m` : fmtDuracion(p.medida.prescrito)) : null, textoCargaImplemento(p.carga)]
        .filter(Boolean)
        .join(' · ');
      if (dosis) m.push(texto('dosis', 'dosis', dosis));
      const o = objetivoDe(p, 'principal');
      if (o) m.push(texto('dosis', 'objetivo', fmtObjetivo(o, p.maquina)));
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

/** El texto de la fila del trabajo (I5.4): lo que falta del paso y su dosis, o lo que llevas si nadie lo mide. */
export function trabajoDe(p: PasoBase, l: Lecturas, heroe: HeroeVista['clase']): { etiqueta: string; valor: string; unidad?: string } | null {
  const f = familiaDe(p);
  if (f === 'emom' || f === 'amrap' || f === 'pared' || f === 'descanso' || f === 'recupera' || f === 'transicion') return null;
  if (esFuerza(p)) {
    const carga = textoCarga(p.fuerza, null);
    const esfuerzo = p.fuerza.esfuerzo ? textoEsfuerzo(p.fuerza.esfuerzo) : null;
    const dosis = p.medida.tipo === 'tiempo' ? fmtDuracion(p.medida.prescrito ?? 0) : `${p.medida.prescrito ?? '—'}`;
    return { etiqueta: 'dosis', valor: [carga ? `${dosis} × ${carga}` : `${dosis} reps`, esfuerzo].filter(Boolean).join(' · ') };
  }
  // El héroe ya es lo que falta o lo que llevas: la fila del trabajo diría lo mismo.
  if (heroe === 'falta' || heroe === 'crono') return null;
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
