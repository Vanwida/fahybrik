// LOS PLANES DEL CIRCUITO — las sesiones reales escritas como pasos del kit,
// sin una línea de texto libre salvo el nombre de catálogo de cada estación.
//
// Fuentes (las que marcó el encargo, leídas con get_session el 25-09):
//   493 · «Compromised» (atleta 64): Run 6′ @Z2 · 5 rondas de Run 1000 m @RPE 8
//         («a race pace») + una estación que rota, cada una con su r90″.
//   492 · «Fuerza B + Trineos», bloque «Trineos y carries»: Sled Push 5 × 25 m
//         @180 kg · Sled Pull 5 × 25 m @135 kg · Farmers 4 × 100 m @2 × 32 kg, r90″.
//   506 · «Chipper · Run + Bodyweight»: 4 × [Run 800 m @RPE 8 → AMRAP 4′ de un
//         movimiento] (Pull-up, Walking Lunge, Push-up, Air Squat).
//   HYROX · el orden, los nombres y las dosis salen de `stations.ts` (rulebook
//         26/27). Las CARGAS no están allí a propósito (sin fuente citable): aquí
//         son las que el coach guardó en la plantilla 441 (152 · 103 · 2 × 24 ·
//         20 · 6 kg, ver `datos-reales.ts`), es decir, dato del coach, no reglamento.
//
// Lo que es MÉTODO va como dato del circuito (HARD RULE Nº0): si hay Roxzone
// propia, el cap del For Time y la palabra del coach para su RPE.

import {
  HYROX_STATIONS,
  resolveHyroxStationByToken,
  type HyroxStationSlug,
} from '@fahybrid/shared/domain/hyrox/stations';
import {
  REGLAS_AVISO_DEFECTO,
  type Medida,
  type Objetivo,
  type PasoBase,
  type Posicion,
  type ZonasCoach,
  type PlanSesion,
} from '../../kit-reloj';

/** Umbral 170 ppm, las 5 zonas del coach (las mismas de «Muñeca · correr»). */
export const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };

// ---------------------------------------------------------------------------
// El circuito: el plan del kit + lo que el kit aún no sabe decir
// ---------------------------------------------------------------------------

/**
 * Cómo se nombra la posición. `rondas`: «Ronda 2/5 · Estación 3/3». `hyrox`:
 * 8 × [1 km + estación], que el atleta cuenta como «Run 3/8» y «Estación 3/8».
 * `chipper`: una lista que se recorre una vez, contada por tramos.
 */
export type Formato = 'rondas' | 'hyrox' | 'chipper';

/** La Roxzone tiene dos mitades: entrar a la estación y salir a correr. */
export type SentidoRoxzone = 'entrada' | 'salida';

/** Un paso del circuito: el del kit y, si es Roxzone, qué mitad (para el kit: `PasoBase.roxzone`). */
export interface PasoCircuito extends PasoBase {
  roxzone?: SentidoRoxzone;
}

export interface Circuito {
  plan: PlanSesion;
  formato: Formato;
  /** Primer paso del circuito: desde ahí corre el crono total (el calentamiento no puntúa). */
  inicio: number;
  /** For Time: el cap del coach, en s. `null` = sin cap. */
  cap: number | null;
  /** ¿Roxzone como paso propio? Dato del coach. */
  roxzone: boolean;
  /** Estimación de duración de cada paso, SOLO para repartir el aro. Nunca se pinta como tiempo. */
  dibujoS: number[];
}

export const sentidoRoxzone = (p: PasoBase): SentidoRoxzone | null => (p as PasoCircuito).roxzone ?? null;
export const esCarreraCircuito = (p: PasoBase) => p.clase === 'carrera';
/** Estación o AMRAP: lo que se hace parado en un sitio y se «entra a». */
export const esEstacion = (p: PasoBase) => p.clase === 'estacion' || p.clase === 'amrap';

// ---------------------------------------------------------------------------
// Constructores
// ---------------------------------------------------------------------------

let n = 0;
const id = (p: string) => `${p}-${++n}`;

const rpe = (v: number, palabra?: string): Objetivo => ({ eje: 'rpe', min: v, max: v, papel: 'principal', palabra });
const metros = (m: number, mide: Medida['mide']): Medida => ({ tipo: 'distancia', prescrito: m, mide });
const reps = (r: number): Medida => ({ tipo: 'reps', prescrito: r, mide: 'atleta' });
const segundos = (s: number): Medida => ({ tipo: 'tiempo', prescrito: s, mide: 'reloj' });

function carrera(m: number, posicion: Posicion, objetivos: Objetivo[], bloque: number): PasoBase {
  return {
    id: id('run'),
    clase: 'carrera',
    rol: 'trabajo',
    fase: 'principal',
    nombre: 'Run',
    medida: metros(m, 'gps'),
    objetivos,
    posicion,
    entorno: 'calle',
    cierre: 'medida',
    bloque,
  };
}

interface DefEstacion {
  nombre: string;
  medida: Medida;
  carga?: PasoBase['carga'];
  objetivos?: Objetivo[];
  maquina?: PasoBase['maquina'];
}

/** Una estación: la cierra la medida si algo la mide (el PM5), si no el atleta («lo dices tú»). */
function estacion(d: DefEstacion, posicion: Posicion, bloque: number): PasoBase {
  const medida = d.medida.mide === 'ergo' || d.medida.mide === 'sensor';
  return {
    id: id('est'),
    clase: 'estacion',
    rol: 'trabajo',
    fase: 'principal',
    nombre: d.nombre,
    medida: d.medida,
    objetivos: d.objetivos ?? [],
    carga: d.carga,
    maquina: d.maquina,
    posicion,
    cierre: medida ? 'medida' : 'atleta',
    bloque,
  };
}

function descanso(s: number, posicion: Posicion, bloque: number): PasoBase {
  return { id: id('desc'), clase: 'descanso', rol: 'descanso', fase: 'principal', medida: segundos(s), objetivos: [], posicion, cierre: 'medida', bloque };
}

/**
 * La Roxzone. Entrada: la cierra el atleta al empezar la estación (doble toque).
 * Salida: se cierra sola al detectar que vuelve a correr (`mide: 'sensor'`; la
 * detección es de la muñeca y está A VALIDAR EN APARATO).
 */
function roxzone(sentido: SentidoRoxzone, posicion: Posicion, bloque: number): PasoCircuito {
  return {
    id: id(`rox-${sentido}`),
    clase: 'roxzone',
    rol: 'transicion',
    fase: 'principal',
    medida: { tipo: 'abierta', prescrito: null, mide: sentido === 'salida' ? 'sensor' : 'reloj' },
    objetivos: [],
    posicion,
    roxzone: sentido,
    cierre: sentido === 'salida' ? 'medida' : 'atleta',
    bloque,
  };
}

// ---------------------------------------------------------------------------
// El aro: cuánto «pesa» cada paso al dibujarlo (estimación, no dato)
// ---------------------------------------------------------------------------

/** s/km con que se reparte el aro en los tramos de carrera. Solo dibuja. */
const RITMO_DIBUJO_S_KM = 275;

/**
 * Duración ORIENTATIVA de cada estación a su dosis de HYROX, para que el aro
 * tenga forma (los mismos pesos del aro de `datos-reloj.ts`). Se escala por la
 * dosis real: 25 m de trineo pesan la mitad que 50 m. No es un dato del atleta.
 */
const DIBUJO_ESTACION_S: Record<HyroxStationSlug, number> = {
  'ski-erg': 240,
  'hyrox-sled-push': 180,
  'hyrox-sled-pull': 210,
  'hyrox-burpee-broad-jump': 240,
  row: 240,
  'hyrox-farmer-carry': 150,
  'hyrox-sandbag-lunges': 240,
  'hyrox-wall-balls': 300,
};

export function dibujoDe(p: PasoBase): number {
  const pr = p.medida.prescrito ?? 0;
  if (p.medida.tipo === 'tiempo') return pr;
  if (p.clase === 'roxzone') return 30;
  if (p.clase === 'carrera' || p.clase === 'calentamiento') return (pr / 1000) * RITMO_DIBUJO_S_KM;
  const est = p.nombre ? resolveHyroxStationByToken(p.nombre) : null;
  if (!est) return 60;
  const dosis = est.measure.kind === 'distance' ? est.measure.meters : est.measure.kind === 'reps' ? est.measure.value : pr;
  return DIBUJO_ESTACION_S[est.slug] * (pr / Math.max(1, dosis));
}

function circuito(pasos: PasoBase[], c: Omit<Circuito, 'plan' | 'dibujoS'>): Circuito {
  return { ...c, plan: { pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO }, dibujoS: pasos.map(dibujoDe) };
}

// ---------------------------------------------------------------------------
// 493 · Compromised — Run 6′ @Z2 · 5 × [Run 1000 m @RPE 8 + estación que rota] r90″
// ---------------------------------------------------------------------------

/**
 * La nota del coach en cada carrera es «A race pace.»: es la PALABRA de su RPE
 * 8 (`Objetivo.palabra`), no un texto aparte. El r90″ va escrito en cada
 * estación; tras la de la ronda 5 no viene nada, así que ese descanso no se pone.
 */
export function sesion493(): Circuito {
  const cal: PasoBase = {
    id: id('cal'),
    clase: 'calentamiento',
    rol: 'trabajo',
    fase: 'calentamiento',
    nombre: 'Run',
    medida: segundos(360),
    objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', avisa: 'solo-arriba' }],
    entorno: 'calle',
    cierre: 'medida',
    bloque: 0,
  };
  const rota: DefEstacion[] = [
    { nombre: 'SkiErg', medida: metros(500, 'ergo'), objetivos: [rpe(8.5)], maquina: { tipo: 'ski' } },
    { nombre: 'Burpee Broad Jump', medida: metros(40, 'atleta') },
    { nombre: 'Rowing', medida: metros(500, 'ergo'), objetivos: [rpe(8.5)], maquina: { tipo: 'remo' } },
    { nombre: 'Wall Balls', medida: reps(25), carga: { kg: 9 } },
    { nombre: 'Sandbag Lunges', medida: metros(50, 'atleta'), carga: { kg: 30 } },
  ];
  const pasos: PasoBase[] = [cal];
  rota.forEach((d, k) => {
    const ronda = { n: k + 1, de: rota.length };
    pasos.push(carrera(1000, { ronda }, [rpe(8, 'ritmo de carrera')], 1));
    pasos.push(estacion(d, { ronda, estacion: { n: 1, de: 1 } }, 1));
    if (k < rota.length - 1) pasos.push(descanso(90, { ronda }, 1));
  });
  return circuito(pasos, { formato: 'rondas', inicio: 1, cap: null, roxzone: false });
}

// ---------------------------------------------------------------------------
// 492 · Trineos y carries — rondas con cuentas DISTINTAS por ítem (M4)
// ---------------------------------------------------------------------------

/**
 * Cada ítem lleva su propio N×: Sled Push 5, Sled Pull 5, Farmers 4. La ronda
 * r lleva los ítems que aún tienen serie, así que la 5 son dos estaciones, no
 * tres (hoy el pliegue coge rondas = máx y hace Farmers × 5). Cada ítem lleva
 * su r90″; tras la última estación de la sesión no se pone.
 */
export function sesion492(): Circuito {
  const items: Array<DefEstacion & { veces: number }> = [
    { nombre: 'Sled Push', medida: metros(25, 'atleta'), carga: { kg: 180 }, veces: 5 },
    { nombre: 'Sled Pull', medida: metros(25, 'atleta'), carga: { kg: 135 }, veces: 5 },
    { nombre: 'Farmers Carry', medida: metros(100, 'atleta'), carga: { kg: 32, implementos: 2 }, veces: 4 },
  ];
  const rondas = Math.max(...items.map((x) => x.veces));
  const pasos: PasoBase[] = [];
  for (let r = 1; r <= rondas; r++) {
    const deRonda = items.filter((x) => x.veces >= r);
    deRonda.forEach((d, k) => {
      const posicion = { ronda: { n: r, de: rondas }, estacion: { n: k + 1, de: deRonda.length } };
      pasos.push(estacion(d, posicion, 2));
      pasos.push(descanso(90, posicion, 2));
    });
  }
  pasos.pop();
  return circuito(pasos, { formato: 'rondas', inicio: 0, cap: null, roxzone: false });
}

// ---------------------------------------------------------------------------
// 506 · Chipper — 4 × [Run 800 m @RPE 8 → AMRAP 4′ de un movimiento]
// ---------------------------------------------------------------------------

export function sesion506(): Circuito {
  const movimientos = ['Pull-up', 'Walking Lunge', 'Push-up', 'Air Squat'];
  const pasos: PasoBase[] = [];
  movimientos.forEach((m, k) => {
    const ronda = { n: k + 1, de: movimientos.length };
    pasos.push(carrera(800, { ronda }, [rpe(8)], 0));
    pasos.push({
      id: id('amrap'),
      clase: 'amrap',
      rol: 'trabajo',
      fase: 'principal',
      nombre: m,
      medida: segundos(240),
      objetivos: [],
      posicion: { ronda, estacion: { n: 1, de: 1 } },
      cierre: 'medida',
      bloque: 0,
    });
  });
  return circuito(pasos, { formato: 'chipper', inicio: 0, cap: null, roxzone: false });
}

// ---------------------------------------------------------------------------
// HYROX · simulación completa: 8 × [1 km + estación], orden oficial
// ---------------------------------------------------------------------------

/** Las cargas que el coach guardó en la plantilla 441 (dato del coach, no reglamento). */
const CARGAS_441: Partial<Record<HyroxStationSlug, PasoBase['carga']>> = {
  'hyrox-sled-push': { kg: 152 },
  'hyrox-sled-pull': { kg: 103 },
  'hyrox-farmer-carry': { kg: 24, implementos: 2 },
  'hyrox-sandbag-lunges': { kg: 20 },
  'hyrox-wall-balls': { kg: 6 },
};

const MAQUINA: Partial<Record<HyroxStationSlug, NonNullable<PasoBase['maquina']>['tipo']>> = { 'ski-erg': 'ski', row: 'remo' };

export interface OpcionesHyrox {
  /** ¿Hay PM5 enlazado? Sin él, SkiErg y Row los dices tú. */
  pm5: boolean;
  roxzone: boolean;
  /** Cap del For Time en s; la plantilla 441 no lo trae. */
  cap: number | null;
}

export function simulacionHyrox(o: OpcionesHyrox): Circuito {
  const pasos: PasoBase[] = [];
  const de = HYROX_STATIONS.length;
  [...HYROX_STATIONS]
    .sort((a, b) => a.order - b.order)
    .forEach((s, k) => {
      const ronda = { n: s.order, de };
      pasos.push(carrera(1000, { ronda }, [], 0));
      if (o.roxzone) pasos.push(roxzone('entrada', { ronda, estacion: { n: s.order, de } }, 0));
      const maquina = MAQUINA[s.slug];
      const mide = maquina && o.pm5 ? 'ergo' : 'atleta';
      const medida: Medida = s.measure.kind === 'reps' ? reps(s.measure.value) : metros(s.measure.kind === 'distance' ? s.measure.meters : 0, mide);
      pasos.push(estacion({ nombre: s.label, medida, carga: CARGAS_441[s.slug], maquina: maquina ? { tipo: maquina } : undefined }, { ronda, estacion: { n: s.order, de } }, 0));
      if (o.roxzone && k < de - 1) pasos.push(roxzone('salida', { ronda }, 0));
    });
  return circuito(pasos, { formato: 'hyrox', inicio: 0, cap: o.cap, roxzone: o.roxzone });
}
