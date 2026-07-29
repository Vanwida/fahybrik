// El minuto manda — el modelo de un EMOM en vivo.
//
// EL AXIOMA (docs/DECISIONS.md, 2026-07-27 «Un EMOM es un ciclo de TRABAJO +
// CAMBIO»): un ciclo es trabajo + transición, repetido N veces, y MANDA EL
// RELOJ. Acaba el minuto, acaba la ronda: no hay nada que detectar. Lo que te
// sobra del minuto ES tu descanso.
//
// Lo único que cambia entre los tres casos es si la transición es explícita:
//
//   EMOM llano   trabajo 60, cambio 0   → el ciclo es el minuto; nada avisa de
//                                         cuándo parar, porque no hay un parar.
//   Interval     trabajo 45, cambio 15  → el ciclo sigue siendo 60, pero ahora
//                                         SÍ hay un final del trabajo y el
//                                         reloj tiene que avisarlo.
//   Tabata       trabajo 20, cambio 10, 8 rondas → los mismos campos con otros
//                                         números. Es un preajuste, no un
//                                         formato aparte (y se guarda `emom`).
//
// Es la forma del servidor (`shared/domain/prescription/types.ts`: `work_s` /
// `rest_s` / `rounds`) y la que adoptó `EmomPlan` en iOS. Aquí no se inventa
// una cuarta.
//
// Y la SEGUNDA regla, la que decide qué se puede pintar: **quién puede contar
// la tarea del minuto**. No es una lista de casos por movimiento, es una
// función de la medida y de lo que hay conectado (CONTRATO-UI §7 + la regla de
// salida del 28-jul):
//
//   calorías o metros → los sabe la máquina… si la máquina está conectada.
//   segundos          → los sabe el reloj de la app, sin emparejar nada.
//   repeticiones      → no las sabe NADIE. Ahí se toca, y no se simula un
//                       contador.
//
// Ojo a la diferencia con la ruta de HYROX: allí cruzar el objetivo SACA del
// tramo. Aquí no. Un EMOM no auto-avanza (DECISIONS, 28-jul): cruzar el
// objetivo no cierra la ronda, convierte el resto del minuto en tu descanso.

import { UMBRAL, type Modalidad } from '../../datos-reales';

// ---------------------------------------------------------------------------
// El modelo
// ---------------------------------------------------------------------------

/** Quién puede contar la tarea de este minuto. */
export type QuienCuenta = 'maquina' | 'reloj' | 'nadie';

/** Las dos fases del ciclo. `cambio` solo existe si la transición es explícita. */
export type Fase = 'trabajo' | 'cambio';

/**
 * El ambiente del minuto — el color que baña la pantalla. UN sujeto (el
 * minuto) con cuatro lecturas, no cuatro pantallas.
 */
export type Ambiente =
  /** Queda trabajo por hacer. El estado por defecto: neutro. */
  | 'faena'
  /** Cumpliste la tarea y el minuto sigue corriendo. El resto es tuyo. */
  | 'tuyos'
  /** La fase se acaba y hay algo detrás: el siguiente minuto, o el «para». */
  | 'aviso'
  /** La transición explícita del interval. El opuesto visual del trabajo. */
  | 'cambio';

export type Unidad = 'cal' | 'reps' | 'm';

export interface Tarea {
  /** Como lo dice el atleta: «la bici», «el esquí», «burpees». */
  nombre: string;
  cantidad: number;
  unidad: Unidad;
  modalidad: Modalidad;
}

/** Lo que hay conectado. Sin esto no se puede decidir qué se pinta (§7). */
export interface Conexiones {
  /** El monitor de la máquina, nombrado como lo llama el atleta. Nulo = nada. */
  monitor: string | null;
  /** Reloj en la muñeca. Sin él no hay pulso, y punto. */
  reloj: boolean;
}

export interface Guion {
  /** La ventana de trabajo del ciclo (`work_s`). */
  trabajoS: number;
  /** La transición explícita que cierra el ciclo (`rest_s`). 0 = EMOM llano. */
  cambioS: number;
  rondas: number;
  /**
   * La rotación, expandida minuto a minuto por el índice de ronda. Una tarea =
   * EMOM uniforme; dos o más = alterna. VACÍA = cronómetro pelado, que es una
   * sesión válida y no pinta ninguna tarea fantasma de guiones.
   */
  rotacion: readonly Tarea[];
  conexiones: Conexiones;
  /** Por dónde entra la reproducción: ronda (0-based) y segundo del ciclo. */
  arranque: { ronda: number; segundo: number };
  /**
   * En qué segundo del minuto cruzas el objetivo, ronda a ronda. Es una
   * SIMULACIÓN del stream del monitor (sube porque te vas cansando), no una
   * medida; solo se usa cuando hay monitor conectado.
   */
  cruces?: readonly number[];
  /** Rondas que ya venían selladas al entrar (solo cuando no cuenta nadie). */
  sellosPrevios?: Readonly<Record<number, number>>;
  /** Una línea de contexto para la franja. */
  nota?: string;
  procedencia: string;
}

// ---------------------------------------------------------------------------
// Las constantes del reloj
// ---------------------------------------------------------------------------

/**
 * Cuánto antes se anuncia el minuto siguiente en un EMOM llano. Diez segundos
 * es lo que tardas en soltar el asa, levantarte y plantarte en la otra
 * máquina: anunciarlo a tres no sirve de nada si hay que cambiar de sitio.
 *
 * PROPUESTA, no espejo: hoy la app solo tiñe (y pita) los últimos 3 s.
 */
export const AVISO_LLANO_S = 10;

/**
 * El aviso de corte: los últimos segundos de una fase que TIENE final
 * explícito («para») o principio («empieza»). Son los mismos 3 s en los que el
 * motor ya pita (`WorkoutSession.emomUrgentThreshold`), para que lo que se ve
 * y lo que se oye caigan a la vez.
 */
export const AVISO_CORTE_S = 3;

/** El umbral que ancla las zonas. Estimado, y viaja marcado como tal. */
export const UMBRAL_PPM = UMBRAL.ppm;

/** El pulso simulado del caso con reloj: sube mientras aprietas, baja al parar. */
export const FC = { base: 146, techo: 160 } as const;

// ---------------------------------------------------------------------------
// Las funciones puras — la regla, no una rama por escenario
// ---------------------------------------------------------------------------

/** El ciclo completo: trabajo + transición. El «cada 1:00» que lee el atleta. */
export function ciclo(g: Guion): number {
  return g.trabajoS + g.cambioS;
}

/**
 * Cuánto dura el bloque entero. La ÚLTIMA ventana de trabajo cierra el bloque:
 * un reloj de box no te hace aguantar de pie un cambio hacia ninguna parte
 * (espejo de `rollEMOMPhase`, WorkoutSession.swift).
 */
export function duracionTotal(g: Guion): number {
  return ciclo(g) * g.rondas - g.cambioS;
}

export interface Instante {
  /** 0-based. La ronda que se enseña es esta + 1. */
  ronda: number;
  fase: Fase;
  /** Segundos que quedan de la fase. */
  restante: number;
  /** Segundos ya gastados de la fase. */
  transcurrido: number;
  duracionFase: number;
  terminado: boolean;
}

/** Dónde estás en el segundo `tAbs` del bloque. Todo lo demás se deriva de aquí. */
export function instante(g: Guion, tAbs: number): Instante {
  const c = ciclo(g);
  const ultima = g.rondas - 1;
  if (tAbs >= duracionTotal(g)) {
    return {
      ronda: ultima,
      fase: 'trabajo',
      restante: 0,
      transcurrido: g.trabajoS,
      duracionFase: g.trabajoS,
      terminado: true,
    };
  }
  const ronda = Math.floor(tAbs / c);
  const s = tAbs % c;
  if (s < g.trabajoS) {
    return {
      ronda,
      fase: 'trabajo',
      restante: g.trabajoS - s,
      transcurrido: s,
      duracionFase: g.trabajoS,
      terminado: false,
    };
  }
  return {
    ronda,
    fase: 'cambio',
    restante: c - s,
    transcurrido: s - g.trabajoS,
    duracionFase: g.cambioS,
    terminado: false,
  };
}

/** La tarea de una ronda. Nula cuando el EMOM arrancó sin declarar movimientos. */
export function tareaDe(g: Guion, ronda: number): Tarea | null {
  if (g.rotacion.length === 0) return null;
  return g.rotacion[ronda % g.rotacion.length];
}

/** ¿Alterna de verdad? Solo entonces vale la pena anunciar lo que viene. */
export function alterna(g: Guion): boolean {
  return g.rotacion.length > 1;
}

/**
 * LA regla del §7 aplicada al minuto. Fíjate en que no pregunta por el
 * movimiento («el ski sale cuando…»): pregunta por la MEDIDA y por lo que hay
 * enchufado. Un EMOM mixto (un minuto de bici, otro de burpees) sale solo.
 */
export function quienCuenta(tarea: Tarea | null, con: Conexiones): QuienCuenta {
  if (!tarea) return 'reloj';
  if (tarea.unidad === 'reps') return 'nadie';
  return con.monitor ? 'maquina' : 'nadie';
}

/** El ambiente. Precedencia: cambio > aviso > tuyos > faena. */
export function ambiente(g: Guion, inst: Instante, hecha: boolean): Ambiente {
  if (inst.fase === 'cambio') return 'cambio';
  const umbral = g.cambioS > 0 ? AVISO_CORTE_S : AVISO_LLANO_S;
  // En la última ronda de un EMOM llano no hay nada que anunciar: se acaba.
  const hayDespues = g.cambioS > 0 || inst.ronda + 1 < g.rondas;
  if (hayDespues && inst.restante > 0 && inst.restante <= umbral) return 'aviso';
  if (hecha) return 'tuyos';
  return 'faena';
}

/**
 * El color del ambiente. Tres significados, tres colores, y se aprenden en una
 * sesión: gris es faena, verde es tiempo que no es trabajo (te sobre a ti o te
 * lo dé el reloj) y naranja es «esto se acaba».
 */
export const COLOR_AMBIENTE: Record<Ambiente, string> = {
  faena: 'var(--twin-neutral)',
  tuyos: 'var(--twin-ok)',
  aviso: 'var(--twin-accent)',
  cambio: 'var(--twin-ok)',
};

/**
 * Lo que va leyendo el monitor este minuto: el delta del contador acumulado
 * desde que empezó la ronda. Lineal, que es lo que hace un ergómetro a
 * esfuerzo sostenido. Se congela al cruzar porque ahí dejas de darle.
 */
export function contadorMaquina(tarea: Tarea, transcurrido: number, cruceS: number): number {
  if (cruceS <= 0) return tarea.cantidad;
  return Math.min(tarea.cantidad, Math.floor((tarea.cantidad * transcurrido) / cruceS));
}

/** El pulso del minuto. Sube mientras trabajas y baja en cuanto paras. */
export function pulsoPpm(transcurrido: number, hecha: boolean, cruceS: number): number {
  const tope = Math.max(1, cruceS);
  const subida = Math.min(1, transcurrido / tope);
  const pico = FC.base + Math.round((FC.techo - FC.base) * subida);
  if (!hecha) return pico;
  return Math.max(FC.base - 6, pico - Math.round((transcurrido - cruceS) * 0.8));
}

/** «12 cal», «10 reps». La grafía del repo, sin inventar una segunda. */
export function dosis(t: Tarea): string {
  return `${t.cantidad} ${t.unidad}`;
}

/** «10 cal en el esquí» / «10 reps de burpees» — el anuncio de lo que viene. */
export function frase(t: Tarea): string {
  return t.unidad === 'reps' ? `${dosis(t)} de ${t.nombre}` : `${dosis(t)} en ${t.nombre}`;
}

/** La línea de formato de la franja: «EMOM 12 · cada 1:00» / «45/15 · cada 1:00». */
export function lineaFormato(g: Guion, relojTexto: (s: number) => string): string {
  const cadencia = `cada ${relojTexto(ciclo(g))}`;
  if (g.cambioS > 0) return `${g.trabajoS}/${g.cambioS} · ${g.rondas} rondas · ${cadencia}`;
  return `EMOM ${g.rondas} · ${cadencia}`;
}

// ---------------------------------------------------------------------------
// Los tres guiones
// ---------------------------------------------------------------------------

/**
 * (a) El caso rico: alterna esquí y bici, los dos monitores puestos, y el
 * contador sube solo. Es el EMOM de producción que el equipo trajo a esta
 * pantalla (ejecución 177, EMOM 12 alternando esquí y bici).
 *
 * PROCEDENCIA HONESTA: la ejecución la comprobó quien encargó la pantalla
 * contra la base; aquí NO se ha vuelto a verificar (esta sesión no tiene
 * acceso a Neon). Los segundos de cruce y el pulso son simulación declarada,
 * no medidas: la app no guarda a qué segundo del minuto cumpliste.
 *
 * ROTACIÓN: empieza en esquí, así la ronda 4 cae en la bici y la 5 en el
 * esquí, que es la historia que se quiere ver.
 */
export const ALTERNO_MAQUINAS: Guion = {
  trabajoS: 60,
  cambioS: 0,
  rondas: 12,
  rotacion: [
    { nombre: 'el esquí', cantidad: 10, unidad: 'cal', modalidad: 'ski' },
    { nombre: 'la bici', cantidad: 12, unidad: 'cal', modalidad: 'bike' },
  ],
  conexiones: { monitor: 'los dos monitores', reloj: true },
  arranque: { ronda: 3, segundo: 30 },
  // Se va yendo hacia atrás minuto a minuto: eso es la fatiga, y es lo que
  // hace que el descanso que te sobra se encoja sin que nadie te lo diga.
  cruces: [38, 40, 37, 41, 39, 42, 40, 44, 41, 45, 43, 47],
  procedencia: 'ejecución 177 · EMOM 12 alternando esquí y bici',
};

/**
 * (b) El caso honesto: nadie puede contar burpees. El minuto drena igual,
 * porque el reloj gobierna SIEMPRE; el toque es opcional y solo sella TU
 * tiempo de trabajo. Si el minuto se acaba sin toque, la ronda pasa y no se
 * inventa nada: ni un contador, ni un «fallada», ni un cero.
 *
 * Entra con dos rondas selladas y una que pasó sin marcar, que es lo que de
 * verdad ocurre cuando estás en el suelo.
 */
export const A_PULSO: Guion = {
  trabajoS: 60,
  cambioS: 0,
  rondas: 10,
  rotacion: [{ nombre: 'burpees', cantidad: 10, unidad: 'reps', modalidad: 'functional' }],
  conexiones: { monitor: null, reloj: false },
  arranque: { ronda: 3, segundo: 8 },
  sellosPrevios: { 0: 34, 1: 39 },
  procedencia: 'EMOM 10 · 10 burpees al minuto',
};

/**
 * (c) El interval de box: 45 de trabajo y 15 de cambio. Aquí el aviso de PARAR
 * pesa tanto como el de empezar, así que trabajo y cambio son dos estados
 * visuales opuestos y no dos matices del mismo.
 *
 * Y va sin movimientos declarados a propósito: un formato ya es un reloj
 * (DECISIONS, 27-jul), así que esto es una sesión completa y válida. Lo que se
 * hizo se dice al acabar, sin prisa.
 */
export const INTERVAL_45_15: Guion = {
  trabajoS: 45,
  cambioS: 15,
  rondas: 10,
  rotacion: [],
  conexiones: { monitor: null, reloj: false },
  arranque: { ronda: 5, segundo: 31 },
  nota: 'Tabata es este mismo reloj con otros números: 20/10 y 8 rondas.',
  procedencia: 'interval 45/15 · 10 rondas',
};

export const GUIONES: Readonly<Record<string, Guion>> = {
  'alterno-maquinas': ALTERNO_MAQUINAS,
  'a-pulso': A_PULSO,
  'interval-45-15': INTERVAL_45_15,
};
