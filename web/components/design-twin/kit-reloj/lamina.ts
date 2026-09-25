// LA LÁMINA DEL PASO — la regla P3 como UNA función pura (el Swift la espeja).
//
// P3 · El objetivo manda (Alex, 25-09). El número grande es lo que el coach
// pide controlar: ritmo si el paso va a ritmo; pulso y zona si va a zona; si
// va a RPE, lo que falta con la instrucción del RPE; sin objetivo, lo que
// falta. Debajo, lo que falta; el pulso siempre en la pantalla principal; el
// ritmo es el ACTUAL (suavizado ~10 s), no la media. El veredicto lleva
// dirección (▲ rápido / ▼ lento) en la banda y en palabra, no solo color.
//
// Descartado por Alex el mismo día: «lo que falta manda» (lo de FH-30, que se
// queda en recuperación y en pasos sin objetivo) y «cuatro datos iguales».

import {
  contextoDe,
  esCarrera,
  faltaDe,
  fmtDistancia,
  fmtObjetivo,
  fmtReloj,
  fmtRitmo,
  holguraDe,
  limitesZona,
  num,
  palabraRpe,
  palabraVeredicto,
  posicionZona,
  principal,
  rangoPpm,
  objetivoDe,
  tinteDelPaso,
  valorDeEje,
  veredictoDe,
  zonaDe,
} from './reglas';
import {
  REGLAS_AVISO_DEFECTO,
  type EjeObjetivo,
  type Lecturas,
  type Objetivo,
  type PasoBase,
  type ReglasAviso,
  type Veredicto,
  type ZonasCoach,
} from './paso';
import { colorZona, espectroZonas } from './tokens';

export type ClaseHeroe = 'ritmo' | 'pulso' | 'split' | 'potencia' | 'cadencia' | 'falta' | 'crono';

export interface HeroeVista {
  clase: ClaseHeroe;
  /** «—» cuando no hay lectura: jamás un cero inventado. */
  texto: string;
  unidad?: string;
  /** «quedan» / «llevas»: solo cuando el héroe es tiempo o distancia. */
  etiqueta?: string;
  /** La zona actual si el héroe es el pulso y hay zonas del coach. */
  zona?: { n: number; color: string };
}

export interface LineaVista {
  etiqueta?: string;
  valor: string;
  unidad?: string;
  /** Glifo delante: el corazón del pulso. */
  glifo?: 'pulso';
  /** Tendencia detrás: el pulso bajando en la recuperación. */
  tendencia?: 'baja' | 'sube';
  zona?: { n: number; color: string };
  /** Fuera de un techo (M1): «▲ alto». */
  aviso?: { marca: '▲' | '▼'; texto: string };
}

export interface BandaVista {
  eje: EjeObjetivo;
  /**
   * Todo en una escala 0..1 de INTENSIDAD: a la izquierda lo suave, a la
   * derecha lo fuerte. Un ritmo más rápido cae a la derecha.
   */
  desde: number;
  hasta: number;
  /** Dónde estás. `null` = sin lectura (no se inventa una posición). */
  marca: number | null;
  veredicto: Veredicto | null;
  /** «3:45–3:55» o «Z2 · a 6 de Z3». */
  rotulo: string;
  palabra: { marca: '▲' | '▼' | null; texto: string } | null;
  /** Solo en pasos a zona: el espectro del coach dibujado bajo la banda. */
  zonas?: { colores: string[]; objetivo: [number, number] };
}

export interface Lamina {
  /** Partes del contexto por prioridad; la línea quita por el final si no cabe. */
  contexto: string[];
  heroe: HeroeVista;
  banda: BandaVista | null;
  /** La instrucción que no es un número vivo: «RPE 7 · fuerte», «RIR 2». */
  instruccion: string | null;
  segundo: LineaVista | null;
  tercero: LineaVista | null;
  nota: string | null;
  /** Color de zona de fondo (solo pasos a zona, P6). */
  tinte: string | null;
}

// ---------------------------------------------------------------------------
// P3 · el héroe
// ---------------------------------------------------------------------------

/**
 * EL NÚMERO GRANDE DEL PASO (P3). Una función, un sitio: ninguna vista elige
 * su héroe. Lo que el coach pide controlar, si hay lectura; si no la hay, lo
 * que falta; si nadie sabe lo que falta, lo que llevas. Cada caída es honesta:
 * un ritmo sin GPS no se pinta «0:00», se cae a lo siguiente que sí se sabe.
 */
export function heroeDelPaso(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null): HeroeVista {
  const o = principal(p);
  if (p.rol === 'trabajo' && o) {
    const v = valorDeEje(o.eje, l);
    switch (o.eje) {
      case 'ritmo':
        if (v != null) return { clase: 'ritmo', texto: fmtRitmo(v), unidad: '/km' };
        break;
      case 'zona':
      case 'ppm':
        // El pulso lo mide la propia muñeca: sin lectura es «buscando», no otra cosa.
        return {
          clase: 'pulso',
          texto: v == null ? '—' : String(Math.round(v)),
          unidad: 'ppm',
          zona: v != null && zonas ? zonaVista(v, zonas) : undefined,
        };
      case 'split500':
        if (v != null) return { clase: 'split', texto: fmtRitmo(v), unidad: '/500' };
        break;
      case 'potencia':
        if (v != null) return { clase: 'potencia', texto: String(Math.round(v)), unidad: 'W' };
        break;
      case 'cadencia':
        if (v != null) return { clase: 'cadencia', texto: String(Math.round(v)), unidad: 'pasos' };
        break;
      default:
        // rpe, kg, %RM, RIR, inclinación: no son un número vivo → lo que falta.
        break;
    }
  }
  return heroeFalta(p, l);
}

function heroeFalta(p: PasoBase, l: Lecturas): HeroeVista {
  const f = faltaDe(p, l);
  if (f == null) return { clase: 'crono', texto: fmtReloj(l.t), etiqueta: 'llevas' };
  return { clase: 'falta', ...valorFalta(p, f), etiqueta: 'quedan' };
}

function valorFalta(p: PasoBase, f: number): { texto: string; unidad?: string } {
  switch (p.medida.tipo) {
    case 'distancia': {
      const d = fmtDistancia(f);
      return { texto: d.valor, unidad: d.unidad };
    }
    case 'reps':
      return { texto: String(Math.ceil(f)), unidad: 'reps' };
    case 'cal':
      return { texto: String(Math.ceil(f)), unidad: 'cal' };
    default:
      return { texto: fmtReloj(Math.ceil(f)) };
  }
}

function zonaVista(ppm: number, z: ZonasCoach): { n: number; color: string } {
  const n = zonaDe(ppm, z);
  return { n, color: colorZona(n, z.techos.length) };
}

// ---------------------------------------------------------------------------
// La banda del objetivo
// ---------------------------------------------------------------------------

const acotar = (x: number) => Math.min(1, Math.max(0, x));

/** La banda de un objetivo numérico sobre su escala de intensidad. */
export function bandaDe(
  o: Objetivo,
  valor: number | null,
  zonas: ZonasCoach | null,
  holgura = 0,
): BandaVista | null {
  const v = valor;
  // Un objetivo de valor único («@5:20») se juzga con la holgura del coach como
  // banda: sin ella, 5:21 ya sería «lento». El rótulo sigue diciendo «5:20».
  const unico = o.eje !== 'zona' && o.min != null && o.min === o.max && holgura > 0;
  const oj: Objetivo = unico ? { ...o, min: o.min! - holgura, max: o.max! + holgura } : o;
  const veredicto = v == null ? null : veredictoDe(oj, v, 0, zonas);
  const palabra = veredicto == null ? null : palabraVeredicto(o.eje, veredicto);

  if (o.eje === 'zona' && zonas) {
    const n = zonas.techos.length;
    const zMin = o.papel === 'techo' ? 1 : (o.min ?? 1);
    const zMax = o.max ?? n;
    let marca: number | null = null;
    if (v != null) {
      const k = zonaDe(v, zonas);
      const [lo, hi] = limitesZona(k, zonas);
      marca = acotar((k - 1 + acotar((v - lo) / Math.max(1, hi - lo))) / n);
    }
    return {
      eje: o.eje,
      desde: (zMin - 1) / n,
      hasta: zMax / n,
      marca,
      veredicto,
      rotulo: v == null ? fmtObjetivo(o) : posicionZona(v, o, zonas),
      palabra,
      zonas: { colores: espectroZonas(n), objetivo: [zMin, zMax] },
    };
  }

  // Escala lineal alrededor de la banda: la banda en el centro y un margen a
  // cada lado del tamaño de la banda (mínimo 10 unidades), para que la marca
  // tenga dónde caer antes de salirse.
  const [lo, hi] = oj.eje === 'ppm' ? rangoPpm(oj, zonas) : [oj.min, oj.max];
  if (lo == null && hi == null) return null;
  const a = lo ?? hi! - 20;
  const b = hi ?? lo! + 20;
  const margen = Math.max(10, b - a);
  const bajo = a - margen;
  const alto = b + margen;
  const inverso = o.eje === 'ritmo' || o.eje === 'split500';
  const pos = (x: number) => acotar(inverso ? (alto - x) / (alto - bajo) : (x - bajo) / (alto - bajo));
  const [p1, p2] = [pos(a), pos(b)].sort((x, y) => x - y);
  return {
    eje: o.eje,
    desde: lo == null ? 0 : p1!,
    hasta: hi == null ? 1 : p2!,
    marca: v == null ? null : pos(v),
    veredicto,
    rotulo: fmtObjetivo(o),
    palabra,
  };
}

// ---------------------------------------------------------------------------
// Las líneas de apoyo
// ---------------------------------------------------------------------------

/** La línea del pulso (con su zona y, si hay techo, «▲ alto»): va abajo en toda cara. */
export function lineaPulso(p: PasoBase, l: Lecturas, zonas: ZonasCoach | null): LineaVista {
  const v = valorDeEje('ppm', l);
  const techo = objetivoDe(p, 'techo');
  let aviso: LineaVista['aviso'];
  if (v != null && techo && (techo.eje === 'ppm' || techo.eje === 'zona')) {
    const ver = veredictoDe(techo, v, 0, zonas);
    if (ver === 'por-encima') aviso = { marca: '▲', texto: 'alto' };
  }
  return {
    glifo: 'pulso',
    valor: v == null ? '—' : String(Math.round(v)),
    unidad: 'ppm',
    zona: v != null && zonas ? zonaVista(v, zonas) : undefined,
    tendencia: l.ppmTendencia === 'baja' ? 'baja' : l.ppmTendencia === 'sube' ? 'sube' : undefined,
    aviso,
  };
}

function lineaRitmo(l: Lecturas): LineaVista {
  return { valor: fmtRitmo(valorDeEje('ritmo', l)), unidad: '/km' };
}

function lineaFalta(p: PasoBase, l: Lecturas): LineaVista {
  const f = faltaDe(p, l);
  if (f == null) return { etiqueta: 'quedan', valor: '—' };
  const v = valorFalta(p, f);
  return { etiqueta: 'quedan', valor: v.texto, unidad: v.unidad };
}

function notaDe(p: PasoBase, l: Lecturas): string | null {
  if (l.viejos && l.viejos.length > 0) return 'sin enlace · la muñeca sigue grabando';
  if (l.gps === 'buscando' && esCarrera(p)) return 'GPS · buscando';
  if (p.cue) return `Coach · ${p.cue}`;
  if (p.entorno === 'cinta') {
    const incl = objetivoDe(p, 'secundario');
    const pct = incl?.eje === 'inclinacion' ? ` · ${num(incl.min ?? 0)} %` : '';
    return `Cinta${pct}`;
  }
  if (p.entorno === 'pista') return 'Pista';
  return null;
}

// ---------------------------------------------------------------------------
// La lámina entera
// ---------------------------------------------------------------------------

/**
 * TODO lo que pinta un paso de trabajo, decidido aquí. La vista solo pinta.
 *
 *   héroe = lo que manda (P3)            banda = el objetivo con su marca
 *   segundo = lo que falta               tercero = la otra métrica (pulso o ritmo)
 *   instrucción = lo que no es un número vivo («RPE 7 · fuerte»)
 *   nota = honestidad o cue del coach    tinte = zona de fondo, solo a zona
 */
export function laminaDelPaso(
  p: PasoBase,
  l: Lecturas,
  zonas: ZonasCoach | null,
  reglas: ReglasAviso = REGLAS_AVISO_DEFECTO,
): Lamina {
  const heroe = heroeDelPaso(p, l, zonas);
  const o = principal(p);
  const esObjetivo = heroe.clase !== 'falta' && heroe.clase !== 'crono';

  let banda: BandaVista | null = null;
  let instruccion: string | null = null;
  if (o && p.rol === 'trabajo') {
    if (o.eje === 'rpe') instruccion = `${fmtObjetivo(o)} · ${palabraRpe(o)}`;
    else if (['kg', 'pctRM', 'rir', 'inclinacion'].includes(o.eje)) instruccion = fmtObjetivo(o);
    else banda = bandaDe(o, valorDeEje(o.eje, l), zonas, holguraDe(o.eje, reglas));
  }

  let segundo: LineaVista | null;
  let tercero: LineaVista | null;
  if (esObjetivo) {
    segundo = lineaFalta(p, l);
    tercero = heroe.clase === 'pulso' ? (esCarrera(p) ? lineaRitmo(l) : null) : lineaPulso(p, l, zonas);
  } else {
    // Sin objetivo vivo: lo que falta ya es el héroe. Si se corre, el ritmo
    // sube a segundo; el pulso, siempre en la principal.
    // Con banda (un paso a ritmo sin GPS todavía) el ritmo ya está dicho: la
    // banda sin marca. Repetirlo como «— /km» solo quita sitio al héroe.
    segundo = !instruccion && !banda && esCarrera(p) ? lineaRitmo(l) : null;
    tercero = lineaPulso(p, l, zonas);
  }

  return {
    contexto: contextoDe(p),
    heroe,
    banda,
    instruccion,
    segundo,
    tercero,
    nota: notaDe(p, l),
    tinte: tinteDelPaso(p, l, zonas),
  };
}
