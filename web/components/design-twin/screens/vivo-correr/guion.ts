// Correr — el dominio de la pantalla, en un sitio y determinista.
//
// El axioma del motor (docs/DECISIONS.md, 28-jul «El TRAMO es la unidad del
// entreno en vivo»): manda el TRAMO, y en un tramo de distancia manda el HITO —
// cruzar los metros te saca, no un botón. Aquí eso se cumple POR CONSTRUCCIÓN:
// el estado de la pantalla es una función pura del segundo que llevas mirando,
// `simular(guion, t, intervencion)`, que reproduce la sesión paso a paso desde
// su arranque. No hay refs que acumulen ni estado que dependa del historial de
// renders, así que el mismo segundo pinta siempre lo mismo (el doble remonta
// por escenario y tiene que reproducirse idéntico).
//
// Lo que NO decide este fichero: cómo se ve. Solo qué es verdad en el segundo t.

import { UMBRAL } from '../../datos-reales';
import { hrZone } from '../../sim';

export type Zona = 1 | 2 | 3 | 4 | 5;

// ---------------------------------------------------------------------------
// La estructura: tramos
// ---------------------------------------------------------------------------

/**
 * Cómo se cierra un tramo. Es la única clasificación que necesita la pantalla:
 *  - `distancia` → lo cierra el HITO (cruzar los metros)
 *  - `tiempo`    → lo cierra el reloj (un rodaje continuo)
 *  - `descanso`  → lo cierra el reloj, pero el sujeto es otro (la cuenta atrás)
 */
export type TipoTramo = 'distancia' | 'tiempo' | 'descanso';

export interface Tramo {
  tipo: TipoTramo;
  /** Metros a cubrir (`distancia`). */
  metros?: number;
  /** Segundos que dura (`tiempo` | `descanso`). */
  segundos?: number;
  /** Ritmo objetivo en s/km. Ausente = el objetivo de este tramo no es el ritmo. */
  objetivoSkm?: number;
  /** Zona objetivo. Ausente = el objetivo de este tramo no es la zona. */
  objetivoZona?: Zona;
  /** Cómo se llama de cara al atleta. */
  etiqueta: string;
}

/** Ritmos objetivo del atleta de ejemplo, en s/km. Un solo sitio. */
export const RITMO = {
  /** 5:30 /km — el suave de Z2. */
  rodaje: 330,
  /** 3:50 /km = 1:32 el 400. */
  serie400: 230,
  /** 4:48 /km = 12,5 km/h, que es lo que se teclea en la consola. */
  cinta1000: 288,
} as const;

/** La cinta del ejemplo: familia BH/i.Concept, la que se anuncia «T01_…». */
export const CINTA = {
  nombre: 'T01_0421',
  /** 3600 / 288 = 12,5. Si cambia `RITMO.cinta1000`, cambia aquí. */
  objetivoKmh: 3600 / RITMO.cinta1000,
  inclinacionPct: 1.5,
  /** Segundo del doble en que la máquina deja de compartir la velocidad. */
  silencioT: 20,
} as const;

/** Ventana ± para juzgar un ritmo contra su objetivo, en s/km. */
export const TOLERANCIA_SKM = 8;

/** Los dos tramos de trabajo del ejemplo. Un sitio: los usan la estructura y el copy. */
export const METROS_SERIE = 400;
export const METROS_CINTA = 1000;

function series(reps: number, metros: number, descansoS: number, objetivoSkm: number, etiqueta: string): Tramo[] {
  const t: Tramo[] = [];
  for (let i = 0; i < reps; i += 1) {
    t.push({ tipo: 'distancia', metros, objetivoSkm, etiqueta });
    if (i < reps - 1) t.push({ tipo: 'descanso', segundos: descansoS, etiqueta: 'Descanso' });
  }
  return t;
}

const SESION_RODAJE: readonly Tramo[] = [
  { tipo: 'tiempo', segundos: 2400, objetivoZona: 2, etiqueta: 'Rodaje' },
];
const SESION_SERIES: readonly Tramo[] = series(8, METROS_SERIE, 90, RITMO.serie400, 'Serie');
const SESION_CINTA: readonly Tramo[] = series(5, METROS_CINTA, 120, RITMO.cinta1000, 'Serie');

/** Qué serie es y de cuántas (los tramos de descanso miran a la SIGUIENTE). */
export function serieDe(sesion: readonly Tramo[], idx: number): { numero: number; total: number } {
  const total = Math.ceil(sesion.length / 2);
  const esDescanso = sesion[idx]?.tipo === 'descanso';
  return { numero: Math.floor(idx / 2) + (esDescanso ? 2 : 1), total };
}

// ---------------------------------------------------------------------------
// El guion: dónde arranca y qué señales hay en cada segundo
// ---------------------------------------------------------------------------

/**
 * Dónde empieza a mirar el atleta. Tres escenarios de cuatro arrancan a
 * mitad de sesión a propósito: un autolap de un rodaje llega a los 5 minutos y
 * el doble no se mira 5 minutos. El reloj que se escribe en la cronología es
 * el de la SESIÓN, no el del doble, para que lo que se lee ahí case con lo que
 * se ve en pantalla.
 */
export interface Arranque {
  tramo: number;
  enTramoS: number;
  enTramoM: number;
  sesionS: number;
  sesionM: number;
  /** Segundo de sesión en que se cerró el último km (para el parcial del autolap). */
  ultimoKmS: number;
  /** Series ya hechas, en segundos. Es lo que enseña el «última». */
  parcialesPrevios: readonly number[];
}

export interface Contexto {
  /** Segundo del DOBLE (lo que llevas mirando). */
  tDoble: number;
  /** Segundo de la SESIÓN. */
  tSesion: number;
  /** Segundo dentro del tramo vivo. */
  tTramo: number;
  /** Metros que llevas del tramo vivo. */
  mTramo: number;
  tramo: Tramo;
  idx: number;
}

export interface Guion {
  sesion: readonly Tramo[];
  arranque: Arranque;
  /** Metros por segundo. `null` = no hay medida (sin señal, máquina callada). */
  velocidad: (c: Contexto) => number | null;
  /** Pulso en ppm. `null` = no hay reloj que lo dé, y entonces no se pinta. */
  pulso: (c: Contexto) => number | null;
  /** Solo el rodaje parte por kilómetros: en series el parcial ES la serie. */
  autolapKm: boolean;
}

/** Lo que el atleta declara a mano cuando la máquina no lo comparte (§7). */
export interface Intervencion {
  /** Segundo del doble desde el que vale. */
  desdeT: number;
  kmh: number;
}

/**
 * Cerrar un tramo a mano. No es otra transición: es EL hito, disparado por el
 * botón en vez de por los metros (así lo dice el motor de la app). Va con su
 * segundo para que la simulación siga siendo una función de sus entradas.
 */
export interface Atajo {
  t: number;
  idx: number;
}

/** Todo lo que el atleta ha tocado. Sin esto la sesión es solo el guion. */
export interface Toques {
  declarada: Intervencion | null;
  atajos: readonly Atajo[];
}

export const SIN_TOCAR: Toques = { declarada: null, atajos: [] };

// --- ondulaciones fijas (nada de Math.random: el doble se reproduce) --------

const ONDA_PULSO = [0, 1, 1, 0, -1, -1, 0, 1, 0, -1];
const RITMO_RODAJE = [329, 331, 330, 328, 332, 330, 329, 331, 333, 330, 328, 329];
/** Ritmo de una serie de 400 por décimas del tramo: sale caliente y se asienta. */
const RITMO_SERIE = [236, 228, 224, 221, 220, 221, 223, 226, 229, 231];

function onda(t: number): number {
  return ONDA_PULSO[t % ONDA_PULSO.length];
}

function ritmoSerie(tramo: Tramo, mTramo: number): number {
  const f = Math.min(0.999, mTramo / (tramo.metros ?? 1));
  return RITMO_SERIE[Math.floor(f * RITMO_SERIE.length)];
}

// ---------------------------------------------------------------------------
// Los cuatro guiones
// ---------------------------------------------------------------------------

/**
 * Rodaje continuo. Arranca en el minuto 16, a 30 m de cerrar el km 3, para que
 * el autolap salte a los ~10 s de mirar. Los tres números del arranque son
 * coherentes entre ellos: de 660 s (km 2) a 978 s hay 318 s para 970 m, que es
 * el 5:28 que va a escribir el parcial.
 *
 * El pulso sube sin que cambie el ritmo (la deriva de cualquier rodaje largo):
 * a los 22 s de mirar se va a Z3 y a los ~75 vuelve a Z2. Eso es lo que hace
 * que la pantalla tenga que decirlo sin dramatizar.
 */
const RODAJE: Guion = {
  sesion: SESION_RODAJE,
  arranque: { tramo: 0, enTramoS: 978, enTramoM: 2970, sesionS: 978, sesionM: 2970, ultimoKmS: 660, parcialesPrevios: [] },
  velocidad: (c) => 1000 / RITMO_RODAJE[c.tSesion % RITMO_RODAJE.length],
  pulso: (c) => {
    const s = c.tSesion;
    let base = 139;
    if (s >= 1000 && s < 1030) base = 139 + ((s - 1000) / 30) * 8;
    else if (s >= 1030 && s < 1055) base = 147;
    else if (s >= 1055 && s < 1075) base = 147 - ((s - 1055) / 20) * 7;
    else if (s >= 1075) base = 140;
    return Math.round(base) + onda(s);
  },
  autolapKm: true,
};

/**
 * 8×400 con 90 s. Arranca a mitad de la tercera serie (210 m hechos): quedan
 * ~190 m, o sea que el HITO cae a los ~43 s y detrás entra el descanso entero.
 * Se ven las dos transiciones sin esperar.
 */
const SERIES: Guion = {
  sesion: SESION_SERIES,
  arranque: {
    tramo: 4,
    enTramoS: 47,
    enTramoM: 210,
    // 92 + 90 + 92 + 90 + 47. Las dos primeras series, a su objetivo.
    sesionS: 411,
    // 400 + 400 + 210 de trabajo y 153 m de trote en cada descanso.
    sesionM: 1316,
    ultimoKmS: 0,
    parcialesPrevios: [92, 91],
  },
  velocidad: (c) => (c.tramo.tipo === 'descanso' ? 1.6 : 1000 / ritmoSerie(c.tramo, c.mTramo)),
  pulso: (c) => {
    if (c.tramo.tipo === 'descanso') {
      const f = Math.min(1, c.tTramo / (c.tramo.segundos ?? 90));
      return Math.round(165 - 25 * f) + onda(c.tSesion);
    }
    const f = Math.min(1, c.mTramo / (c.tramo.metros ?? 400));
    return Math.round(146 + 19 * f) + onda(c.tSesion);
  },
  autolapKm: false,
};

/**
 * 5×1000 en cinta. Arranca a 156 m de cerrar el segundo mil, y a los 20 s la
 * máquina deja de compartir la velocidad: ahí la pantalla tiene que dejar de
 * contar metros y ofrecer declararla con UN toque, no inventarse el dato.
 */
const CINTA_GUION: Guion = {
  sesion: SESION_CINTA,
  arranque: {
    tramo: 2,
    enTramoS: 243,
    enTramoM: 844,
    sesionS: 651,
    sesionM: 1844,
    ultimoKmS: 0,
    parcialesPrevios: [289],
  },
  velocidad: (c) => {
    if (c.tDoble >= CINTA.silencioT) return null;
    if (c.tramo.tipo === 'descanso') return null;
    return CINTA.objetivoKmh / 3.6;
  },
  pulso: (c) => {
    if (c.tramo.tipo === 'descanso') {
      const f = Math.min(1, c.tTramo / (c.tramo.segundos ?? 120));
      return Math.round(162 - 26 * f) + onda(c.tSesion);
    }
    const f = Math.min(1, c.tTramo / (c.tramo.segundos ?? 288));
    return Math.round(148 + 14 * f) + onda(c.tSesion);
  },
  autolapKm: false,
};

/**
 * Antes de empezar, sin señal. No hay velocidad porque no se ha arrancado, y
 * el pulso no existe hasta que el reloj entra (a los 3 s; la señal, a los 6).
 * Un pulso de 92 de pie es lo que hay: Z1.
 */
const BUSCANDO: Guion = {
  sesion: SESION_SERIES,
  arranque: { tramo: 0, enTramoS: 0, enTramoM: 0, sesionS: 0, sesionM: 0, ultimoKmS: 0, parcialesPrevios: [] },
  velocidad: () => null,
  pulso: (c) => (c.tDoble < 3 ? null : 92 + onda(c.tDoble)),
  autolapKm: false,
};

export const GUIONES = {
  rodaje: RODAJE,
  'series-calle': SERIES,
  cinta: CINTA_GUION,
  'gps-buscando': BUSCANDO,
} as const;

export type IdEscenario = keyof typeof GUIONES;

export function guionDe(escenario: string): Guion {
  return GUIONES[escenario as IdEscenario] ?? RODAJE;
}

// ---------------------------------------------------------------------------
// La simulación
// ---------------------------------------------------------------------------

/**
 * El reloj de la SESIÓN en el segundo `t` del doble: un segundo es un segundo,
 * también en pausa (la pausa no adelanta `t`). Es el que se escribe en la
 * cronología, para que «7:34 · serie 3 hecha» case con lo que se ve.
 */
export function relojSesion(g: Guion, t: number): number {
  return g.arranque.sesionS + t;
}

export type Evento =
  | { tipo: 'km'; km: number; parcialS: number }
  | { tipo: 'cierra'; idx: number; tramo: Tramo; tTramo: number };

export interface EventoEnT {
  /** Segundo del doble en que ocurrió. */
  t: number;
  ev: Evento;
}

export interface Foto {
  idx: number;
  tramo: Tramo;
  tTramo: number;
  mTramo: number;
  tSesion: number;
  mSesion: number;
  /** s/km. `null` = no hay medida, y entonces NO se pinta un ritmo (§7). */
  ritmoSkm: number | null;
  /** m/s medidos ahora mismo. */
  velocidadMs: number | null;
  /** La velocidad de ahora sale de lo que declaró el atleta, no de la máquina. */
  estimada: boolean;
  /** Metros que se han contado con una velocidad declarada. */
  mEstimados: number;
  ppm: number | null;
  zona: Zona | null;
  /** Series cerradas, en segundos. */
  parciales: readonly number[];
  terminado: boolean;
}

export interface Resultado {
  foto: Foto;
  eventos: readonly EventoEnT[];
}

/** La velocidad del segundo, con la declaración del atleta como respaldo. */
function velocidadDe(g: Guion, c: Contexto, i: Intervencion | null): { ms: number | null; estimada: boolean } {
  const medida = g.velocidad(c);
  if (medida !== null) return { ms: medida, estimada: false };
  // Declarar solo vale para el trabajo: «voy a 12,5» habla de la serie, no del
  // descanso, y arrastrarlo al descanso sería contar metros que nadie dijo.
  if (i && c.tDoble >= i.desdeT && c.tramo.tipo === 'distancia') return { ms: i.kmh / 3.6, estimada: true };
  return { ms: null, estimada: false };
}

export function simular(g: Guion, t: number, toques: Toques): Resultado {
  const intervencion = toques.declarada;
  const a = g.arranque;
  let idx = a.tramo;
  let tTramo = a.enTramoS;
  let mTramo = a.enTramoM;
  let tSesion = a.sesionS;
  let mSesion = a.sesionM;
  let ultimoKmS = a.ultimoKmS;
  let kmHechos = Math.floor(a.sesionM / 1000);
  let mEstimados = 0;
  const parciales: number[] = [...a.parcialesPrevios];
  const eventos: EventoEnT[] = [];

  for (let paso = 1; paso <= t && idx < g.sesion.length; paso += 1) {
    const tramo = g.sesion[idx];
    const { ms, estimada } = velocidadDe(g, { tDoble: paso, tSesion, tTramo, mTramo, tramo, idx }, intervencion);
    const avance = ms ?? 0;

    tTramo += 1;
    tSesion += 1;
    mTramo += avance;
    mSesion += avance;
    if (estimada) mEstimados += avance;

    if (g.autolapKm && Math.floor(mSesion / 1000) > kmHechos) {
      kmHechos += 1;
      eventos.push({ t: paso, ev: { tipo: 'km', km: kmHechos, parcialS: tSesion - ultimoKmS } });
      ultimoKmS = tSesion;
    }

    const aMano = toques.atajos.some((x) => x.t === paso && x.idx === idx);
    const cerrado =
      aMano || (tramo.tipo === 'distancia' ? mTramo >= (tramo.metros ?? 0) : tTramo >= (tramo.segundos ?? 0));
    if (cerrado) {
      eventos.push({ t: paso, ev: { tipo: 'cierra', idx, tramo, tTramo } });
      if (tramo.tipo === 'distancia') parciales.push(tTramo);
      idx += 1;
      tTramo = 0;
      mTramo = 0;
    }
  }

  const terminado = idx >= g.sesion.length;
  const tramo = g.sesion[Math.min(idx, g.sesion.length - 1)];
  const ctx: Contexto = { tDoble: t, tSesion, tTramo, mTramo, tramo, idx };
  const viva = terminado ? { ms: null, estimada: false } : velocidadDe(g, ctx, intervencion);
  const ppm = terminado ? null : g.pulso(ctx);

  return {
    foto: {
      idx,
      tramo,
      tTramo,
      mTramo,
      tSesion,
      mSesion,
      ritmoSkm: viva.ms !== null && viva.ms > 0 ? 1000 / viva.ms : null,
      velocidadMs: viva.ms,
      estimada: viva.estimada,
      mEstimados,
      ppm,
      zona: ppm === null ? null : hrZone(ppm, UMBRAL.ppm),
      parciales,
      terminado,
    },
    eventos,
  };
}

export { UMBRAL };
