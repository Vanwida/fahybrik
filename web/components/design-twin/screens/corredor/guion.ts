// EL CORREDOR — UNA sola interfaz, y las dos superficies la leen de aquí.
//
// Este fichero no es «los datos de una pantalla». Es la interfaz: la muñeca y
// el teléfono importan LAS MISMAS funciones y pintan LO MISMO con distinto
// presupuesto de sitio. Si mañana el sujeto cambia, cambia en las dos a la vez
// porque no hay dos sitios donde tocarlo. La auditoría de la card 105 encontró
// justo lo contrario — el espejo lee `currentTramo` y el standalone lo ignora,
// así que la misma sesión se ve de dos maneras en el mismo brazo.
//
// ═══════════════════════════════════════════════════════════════════════════
//  LA REGLA. Una, y de ella salen todos los casos.
// ═══════════════════════════════════════════════════════════════════════════
//
//   EL SUJETO ES LO QUE FALTA DE LA PIEZA QUE TIENES DELANTE,
//   MEDIDO EN LA UNIDAD EN QUE ESA PIEZA SE MIDE.
//
//   · Run 800 m con el GPS fijado  → faltan 284 m.        (distancia)
//   · Tramo de 4:00 a Z2           → quedan 2:12.          (tiempo)
//   · Wall balls 60 · sled 50 m    → no falta NADA medible: el sujeto cae al
//     reloj de la estación y la dosis del coach pasa al segundo nivel.
//   · GPS sin fijar                → tampoco falta nada medible: MISMA caída.
//
// No son tres pantallas ni tres variantes decoradas: es una regla con tres
// desenlaces honestos. Y el que decide no es el formato del bloque —es **quién
// mide la pieza**—, que es la misma variable que ya ordena `kit-watch/modelo`.
//
// Lo segundo es igual de corto: **el segundo nivel es contra qué objetivo
// escribió el coach.** En correr eso es el RITMO, que además es lo único que un
// corredor puede accionar mientras se mueve. En una estación ciega no hay
// objetivo que juzgar, así que el segundo nivel es la dosis.
//
// ═══════════════════════════════════════════════════════════════════════════
//  DOS DECISIONES QUE ARREGLAN LA RAÍZ, NO EL SÍNTOMA
// ═══════════════════════════════════════════════════════════════════════════
//
// (1) «SIN MEDIR» CONFUNDE DOS COSAS QUE NO SON LA MISMA, y por eso el iPhone
//     de hoy dice «sin medir» con el GPS fuerte y la traza pintándose en el
//     mapa. La causa exacta: `Formato.distanciaCubierta` lleva un `guard
//     meters > 0` y devuelve `nil`, y la celda de apoyo pinta su texto de
//     ausencia. O sea que **cero metros medidos se escribe igual que ninguna
//     medida**, y son cosas distintas:
//
//       · `midiendo` → hay fuente y llevas N metros. **El cero es un dato.**
//         El CONTRATO-UI §6.2 bis ya lo dice: un CONTADOR se pinta en cero.
//       · `buscando` → hay fuente y todavía no fija. Se dice, no se inventa.
//       · `nadie`    → nadie mide esta pieza (sled, wall balls). Entonces la
//         caja de distancia no existe: no hay hueco que declarar.
//
//     En esta interfaz eso se ve: con el GPS recién fijado y 0 m cubiertos, el
//     sujeto lee **800** metros que faltan. Nunca «sin medir».
//
// (2) EL RITMO TENÍA DOS DEFINICIONES, UNA POR SUPERFICIE. En el teléfono
//     `OutdoorRunHUDModel.livePaceSecPerKm` sale de la velocidad GPS suavizada
//     (instantáneo); en la muñeca `RunLegDisplay.legPaceSecPerKm` sale de
//     metros/tiempo del tramo (acumulado). Son números distintos de la misma
//     carrera: el mismo fallo que el §2 del contrato persigue, pero con las dos
//     pantallas en el mismo brazo.
//
//     Aquí hay UNA: **ritmo del tramo = metros del tramo / tiempo del tramo.**
//     Se elige ésa y no la instantánea porque en una estación con objetivo la
//     pregunta no es «a cuánto voy ahora» sino «¿voy a llegar a mi objetivo en
//     ESTA pieza?», y sólo la acumulada la contesta. Además no baila, que es lo
//     que hace ilegible un número instantáneo con el brazo en movimiento.
//     Suelo de 10 m antes de escribir nada, igual que hace hoy la muñeca: por
//     debajo el cociente es ruido.
//
// ═══════════════════════════════════════════════════════════════════════════
//  PROCEDENCIA DE LAS CIFRAS — qué es real y qué es prescripción
// ═══════════════════════════════════════════════════════════════════════════
//
//  · **La forma (chipper de 8 estaciones con carrera de 800 m y `time_cap` de
//    4:00) es una PRESCRIPCIÓN, no una ejecución.** `time_cap` existe como
//    objetivo desde el 26-jul y vive en `prescription_json`; el lado entreno
//    tiene CERO filas porque ningún coach lo ha usado todavía. Va marcado, no
//    disfrazado de dato.
//  · **Los ritmos y el pulso son de una ejecución real**: la 104 del atleta 67
//    (cinco repeticiones medidas de 950 a 1600 m, ritmo ~4:10/km, FC de 138 a
//    178). No se inventa un corredor.
//  · **No hay ancla de FC en ningún atleta** (`athletes.max_hr_bpm` NULL en
//    8 de 8, ni un `lthr_bpm`). Así que aquí no hay zona, no hay tinte y el
//    pulso va en ppm crudos con su nota. Es el caso mínimo, que es el caso de
//    diseño (§6.3) — y hoy es también el 100 % de la base.
//
// Ver `datos-reloj.ts`, que audita estos mismos hechos contra producción.

import { fmtClock, fmtPaceKm } from '../../sim';
import { esDecimal } from '../../datos-reales';
import { SIN_ANCLA } from '../../datos-reloj';
import {
  ANCHO_UTIL,
  NOTA,
  anchoVersales,
  paginaPulso,
  tonoUrgente,
  type Ancla,
  type PaginaReloj,
} from '../../kit-watch';

// ---------------------------------------------------------------------------
// La ruta — qué mide cada estación, que es lo que parte esta interfaz en dos
// ---------------------------------------------------------------------------

/**
 * Quién mide la pieza. **No es el formato del bloque**: dos estaciones del
 * mismo chipper con la misma unidad prescrita (metros) se comportan distinto
 * porque una la mide el GPS y la otra no la mide nadie.
 *
 * `null` = estación ciega. Y ciega no es «le falta un dato»: es que no existe
 * el sensor. Un sled push de 50 m no tiene quien cuente sus metros, igual que
 * nadie cuenta un wall ball.
 */
export type Mide = 'gps' | 'movil' | null;

export interface Estacion {
  nombre: string;
  /** La dosis TAL CUAL la escribe el coach. Nunca se recalcula ni se traduce. */
  dosis: string;
  mide: Mide;
  /** La medida prescrita, en su unidad. */
  medida:
    | { tipo: 'distancia'; metros: number }
    | { tipo: 'tiempo'; segundos: number }
    | { tipo: 'reps'; reps: number };
  /** `time_cap`: el techo que escribió el coach. Ausente = no lo hay. */
  capS?: number;
  /** El ritmo objetivo en s/km. Sólo donde el coach prescribe ritmo. */
  objetivoSkm?: number;
  /**
   * Duración estimada, para repartir la ruta en el aro y en la cinta de
   * progreso. Es una ESTIMACIÓN y por eso no se escribe nunca en pantalla.
   */
  peso: number;
}

/** 4:15/km — el ritmo que el coach escribe para los 800 de este chipper. */
export const OBJETIVO_SKM = 255;

/** El techo por estación de carrera: 4:00. Deja 36 s de margen sobre el objetivo. */
export const CAP_S = 240;

/**
 * Chipper de 8 estaciones. La forma es prescripción (ver la cabecera); lo que
 * NO es prescripción es la mezcla: cuatro tramos que el GPS mide y cuatro
 * estaciones que no mide nadie es exactamente el reparto del HYROX real de la
 * plantilla 441, y es lo que hace de este el peor caso para una muñeca.
 */
export const RUTA: readonly Estacion[] = [
  { nombre: 'Run', dosis: '800 m', mide: 'gps', medida: { tipo: 'distancia', metros: 800 }, capS: CAP_S, objetivoSkm: OBJETIVO_SKM, peso: 204 },
  { nombre: 'Wall Balls', dosis: '60 reps · 9 kg', mide: null, medida: { tipo: 'reps', reps: 60 }, peso: 150 },
  { nombre: 'Run', dosis: '800 m', mide: 'gps', medida: { tipo: 'distancia', metros: 800 }, capS: CAP_S, objetivoSkm: OBJETIVO_SKM, peso: 204 },
  { nombre: 'Farmers Carry', dosis: '200 m · 2×24 kg', mide: null, medida: { tipo: 'distancia', metros: 200 }, peso: 110 },
  { nombre: 'Run', dosis: '800 m', mide: 'gps', medida: { tipo: 'distancia', metros: 800 }, capS: CAP_S, objetivoSkm: OBJETIVO_SKM, peso: 204 },
  { nombre: 'Burpee Broad Jump', dosis: '80 m', mide: null, medida: { tipo: 'distancia', metros: 80 }, peso: 160 },
  { nombre: 'Run', dosis: '800 m', mide: 'gps', medida: { tipo: 'distancia', metros: 800 }, capS: CAP_S, objetivoSkm: OBJETIVO_SKM, peso: 204 },
  { nombre: 'Wall Balls', dosis: '60 reps · 9 kg', mide: null, medida: { tipo: 'reps', reps: 60 }, peso: 150 },
];

/** Sin ancla de FC: ni zona, ni tinte. Lo mismo en las dos superficies. */
export const ANCLA: Ancla = SIN_ANCLA;

// ---------------------------------------------------------------------------
// El estado — lo mismo que el motor publica, con los nombres del motor
// ---------------------------------------------------------------------------

/**
 * El perfil de velocidad con el que se reproduce un tramo de carrera. Existe
 * porque la fatiga es real: el mismo atleta corre el primer 800 a 4:03 y el
 * séptimo a 4:45, y una reproducción que ignore eso enseña un `cap` que nunca
 * aprieta — justo el hallazgo que la auditoría marca como invisible.
 */
export interface Piernas {
  /** m/s al entrar en la estación. */
  v0: number;
  /** m/s al agotarse el cap. */
  v1: number;
}

export const FRESCO: Piernas = { v0: 4.05, v1: 3.55 };
export const FUNDIDO: Piernas = { v0: 3.55, v1: 3.05 };

/** Lo que el GPS puede estar haciendo. Nunca hay un cuarto estado. */
export type Senal = 'fijado' | 'buscando';

export interface Estado {
  /** Índice de la estación en curso — `fixedRoundsDone` en el motor. */
  estacion: number;
  /** El crono del bloque desde la salida: `condElapsed`. ES la puntuación. */
  bloqueS: number;
  /** Segundos dentro de la estación: `tramoElapsedSeconds`. */
  enEstacionS: number;
  senal: Senal;
  /** `liveHRBpm`. `null` = no hay reloj puesto, y entonces la celda NO existe. */
  ppm: number | null;
  piernas: Piernas;
  /** Parciales de lo ya tachado: `fixedRoundSplits`. */
  parciales: readonly number[];
}

export interface Gestos {
  /** Cierra la estación — `markRoundDone()`. Copy correcto: estación, no ronda. */
  estacionHecha: () => void;
}

export function estacionDe(e: Estado): Estacion {
  return RUTA[Math.min(e.estacion, RUTA.length - 1)]!;
}

// ---------------------------------------------------------------------------
// La medida — tres estados, y ninguno se escribe como otro
// ---------------------------------------------------------------------------

export type EstadoMedida = 'midiendo' | 'buscando' | 'nadie';

/**
 * En qué estado está la medida de la pieza que tienes delante. Es la función
 * que mata el «sin medir»: separa «no hay fuente» de «la fuente marca cero».
 */
export function estadoMedida(e: Estado): EstadoMedida {
  const est = estacionDe(e);
  if (est.mide === null) return 'nadie';
  if (est.mide === 'gps' && e.senal === 'buscando') return 'buscando';
  return 'midiendo';
}

/**
 * Los metros cubiertos del tramo — `liveRunDistanceMeters` acotado al tramo.
 * `null` cuando no hay fuente; **0 es un valor legítimo**, no una ausencia.
 *
 * La integración del perfil de piernas es la reproducción del doble, no un
 * dato: en la app estos metros los pone el GPS.
 */
export function metrosHechos(e: Estado): number | null {
  if (estadoMedida(e) !== 'midiendo') return null;
  const est = estacionDe(e);
  if (est.medida.tipo !== 'distancia') return null;
  const T = est.capS ?? est.peso;
  const t = Math.max(0, e.enEstacionS);
  const { v0, v1 } = e.piernas;
  const m = v0 * t + ((v1 - v0) * t * t) / (2 * T);
  return Math.max(0, Math.min(est.medida.metros, m));
}

/** Los metros que FALTAN. `null` = esta pieza no los tiene (ciega, sin señal, o no va por distancia). */
export function metrosQueFaltan(e: Estado): number | null {
  const hechos = metrosHechos(e);
  if (hechos === null) return null;
  const est = estacionDe(e);
  if (est.medida.tipo !== 'distancia') return null;
  return Math.max(0, Math.ceil(est.medida.metros - hechos));
}

/** Los segundos que faltan de una pieza medida en TIEMPO. */
export function segundosQueFaltan(e: Estado): number | null {
  const est = estacionDe(e);
  if (est.medida.tipo !== 'tiempo') return null;
  return Math.max(0, est.medida.segundos - e.enEstacionS);
}

/** Suelo de 10 m antes de escribir un ritmo: por debajo el cociente es ruido. */
const SUELO_RITMO_M = 10;

/**
 * EL RITMO, una sola definición para las dos superficies: metros del tramo
 * entre tiempo del tramo. `null` cuando todavía no se puede decir — y entonces
 * NO se pinta un guion ni se rellena con la velocidad instantánea (§7).
 */
export function ritmoSkm(e: Estado): number | null {
  const m = metrosHechos(e);
  if (m === null || m < SUELO_RITMO_M || e.enEstacionS <= 0) return null;
  return e.enEstacionS / (m / 1000);
}

/** Lo que queda del `time_cap`. `null` = el coach no puso techo a esta estación. */
export function capQueda(e: Estado): number | null {
  const est = estacionDe(e);
  return est.capS == null ? null : Math.max(0, est.capS - e.enEstacionS);
}

/**
 * Los últimos 30 s del cap. No son un adorno: es la ventana en la que un
 * corredor todavía puede hacer algo con la información (apretar o soltar). El
 * naranja de marca aquí no es color de dato, es aviso (`kit-watch/paginas`).
 */
export const CAP_URGENTE_S = 30;

/** Fracción medida de la estación en curso, para el aro y la cinta de ruta. */
export function fraccionEstacion(e: Estado): number {
  const est = estacionDe(e);
  const hechos = metrosHechos(e);
  if (hechos !== null && est.medida.tipo === 'distancia') {
    return Math.min(1, hechos / est.medida.metros);
  }
  const faltanT = segundosQueFaltan(e);
  if (faltanT !== null && est.medida.tipo === 'tiempo') {
    return Math.min(1, 1 - faltanT / est.medida.segundos);
  }
  // Ciega o sin señal: **el aro se apaga justo donde el reloj deja de medir**.
  // No se rellena con el tiempo transcurrido, que sería fingir un progreso que
  // nadie ha medido.
  return 0;
}

// ---------------------------------------------------------------------------
// EL SUJETO — la regla, en código
// ---------------------------------------------------------------------------

export type Sujeto =
  /** Lo que falta, en metros. */
  | { clase: 'distancia'; metros: number }
  /** Lo que falta, en segundos (cuenta atrás). */
  | { clase: 'tiempo'; segundos: number }
  /**
   * LA DEGRADACIÓN HONESTA: no falta nada medible, así que manda el reloj de
   * la estación, que cuenta hacia arriba. Es lo único que la app sabe de esa
   * pieza, y decirlo es mejor que fabricar un contador de repeticiones.
   */
  | { clase: 'reloj'; segundos: number };

export function sujetoDe(e: Estado): Sujeto {
  const m = metrosQueFaltan(e);
  if (m !== null) return { clase: 'distancia', metros: m };
  const s = segundosQueFaltan(e);
  if (s !== null) return { clase: 'tiempo', segundos: s };
  return { clase: 'reloj', segundos: e.enEstacionS };
}

/** El sujeto, ya escrito: cifra y unidad aparte, que es como lo piden los dos lienzos. */
export function sujetoEscrito(e: Estado): { texto: string; unidad?: string } {
  const s = sujetoDe(e);
  if (s.clase === 'distancia') return { texto: String(s.metros), unidad: 'm' };
  return { texto: fmtClock(s.segundos) };
}

/** La etiqueta del sujeto. Distinta por clase, porque el sujeto significa otra cosa. */
export function etiquetaSujeto(e: Estado): string {
  const s = sujetoDe(e);
  return s.clase === 'reloj' ? 'En la estación' : 'Te quedan';
}

// ---------------------------------------------------------------------------
// El juicio del ritmo contra el objetivo del coach
// ---------------------------------------------------------------------------

/** Lo que un corredor puede sostener sin corregir. Fuera de esto sí hay que decírselo. */
export const TOLERANCIA_SKM = 4;

export type Juicio = 'dentro' | 'rapido' | 'lento' | 'sin-juicio';

export function juzgar(e: Estado): Juicio {
  const skm = ritmoSkm(e);
  const objetivo = estacionDe(e).objetivoSkm;
  if (skm === null || objetivo == null) return 'sin-juicio';
  if (skm < objetivo - TOLERANCIA_SKM) return 'rapido';
  if (skm > objetivo + TOLERANCIA_SKM) return 'lento';
  return 'dentro';
}

/** Dentro = ok. Fuera por cualquier lado se paga: pasarse también rompe el chipper. */
export function colorJuicio(j: Juicio): string {
  if (j === 'dentro') return 'var(--twin-ok)';
  if (j === 'sin-juicio') return 'var(--twin-fg)';
  return 'var(--twin-danger)';
}

export function palabraJuicio(j: Juicio): string | null {
  if (j === 'dentro') return 'En objetivo';
  if (j === 'rapido') return 'Te pasas';
  if (j === 'lento') return 'Aprieta';
  return null;
}

/** «+5» / «−3» s/km contra el objetivo. `null` si no hay contra qué comparar. */
export function deltaSkm(e: Estado): number | null {
  const skm = ritmoSkm(e);
  const objetivo = estacionDe(e).objetivoSkm;
  if (skm === null || objetivo == null) return null;
  return Math.round(skm - objetivo);
}

// ---------------------------------------------------------------------------
// Escritura — un formateador por concepto, y los dos lienzos usan éstos
// ---------------------------------------------------------------------------
//
// El reloj y el ritmo ya tienen canónico en el doble (`fmtClock`/`fmtPaceKm`).
// La distancia MEDIDA no lo tiene fuera de `kit-watch/formato`, que es del
// reloj; ésta escribe con coma como manda el §2 y sube al kit compartido en
// cuanto esta propuesta se apruebe.

/** Distancia medida: «1,24 km» / «284 m». En una medida los ceros son el dato. */
export function distanciaMedida(metros: number): string {
  return metros >= 1000 ? `${esDecimal(metros / 1000, 2)} km` : `${Math.round(metros)} m`;
}

/** El ritmo con su unidad, o `null` si todavía no se puede decir. */
export function ritmoEscrito(e: Estado): string | null {
  const skm = ritmoSkm(e);
  return skm === null ? null : fmtPaceKm(skm);
}

/** El objetivo escrito, para poder decir siempre contra qué se compara. */
export function objetivoEscrito(e: Estado): string | null {
  const objetivo = estacionDe(e).objetivoSkm;
  return objetivo == null ? null : `${fmtPaceKm(objetivo)}/km`;
}

/** «Estación 3/8» — el copy que la auditoría encontró escrito como «Ronda». */
export function posicion(e: Estado): string {
  return `${Math.min(e.estacion, RUTA.length - 1) + 1}/${RUTA.length}`;
}

/**
 * EL CONTEXTO DE LA MUÑECA, y aquí hay una decisión multi-coach.
 *
 * El nombre de la estación sale del catálogo del coach (`exercises.name`), así
 * que puede ser tan largo como él quiera — «Sandbag Reverse Lunge Overhead» es
 * un nombre perfectamente razonable y se sale de los 188 pt del reloj. El kit
 * tiene una red de seguridad que encoge la línea entera hasta el 82 %, pero eso
 * encoge también la posición, que es el dato.
 *
 * La regla: **se recorta el NOMBRE, jamás la posición.** En un chipper la
 * cuenta es lo que no puedes reconstruir mirando alrededor; el nombre lo tienes
 * literalmente delante. Y por eso la posición va primero: así siempre cabe,
 * escriba el coach lo que escriba.
 */
export function contextoMuneca(e: Estado): string {
  const pos = posicion(e);
  const nombre = estacionDe(e).nombre;
  const linea = `${pos} · ${nombre}`;
  if (anchoVersales(linea) <= ANCHO_UTIL) return linea;
  let corto = nombre;
  while (corto.length > 1 && anchoVersales(`${pos} · ${corto.trimEnd()}…`) > ANCHO_UTIL) {
    corto = corto.slice(0, -1);
  }
  return `${pos} · ${corto.trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Cerrar la estación — quién puede hacerlo, que es lo que decide la acción
// ---------------------------------------------------------------------------

/**
 * ¿El toque es la ÚNICA salida de esta estación?
 *
 * Es la misma pregunta que ya gobierna el motor («salida por la MEDIDA, no por
 * el movimiento») y la que decide el peso de la acción en las dos superficies:
 * en el teléfono el relleno naranja (`unicaSalida`), en la muñeca el modo
 * `ciego` frente a `ojeada`. Si el GPS puede cruzar los 800, el botón es un
 * atajo; si nadie mide, el botón es la salida.
 */
export function tocarEsLaUnicaSalida(e: Estado): boolean {
  return estadoMedida(e) !== 'midiendo';
}

/** El avance de la estación, ya cerrada, para el registro. */
export function cerrar(e: Estado): Estado {
  const ultima = e.estacion >= RUTA.length - 1;
  return {
    ...e,
    estacion: ultima ? e.estacion : e.estacion + 1,
    enEstacionS: 0,
    parciales: [...e.parciales, e.enEstacionS],
    // Cada estación de carrera se corre con las piernas de ese momento; el
    // chipper se paga al final, no al principio.
    piernas: ultima ? e.piernas : { v0: e.piernas.v0 - 0.08, v1: e.piernas.v1 - 0.08 },
  };
}

// ---------------------------------------------------------------------------
// La reproducción — también compartida, para que no puedan divergir
// ---------------------------------------------------------------------------
//
// El tiempo, el GPS que fija y la estación que se cierra sola al cruzar los
// metros son COMPORTAMIENTO, no pintura. Si cada superficie escribiera el
// suyo volverían a separarse por donde se separaron: el móvil cerrando por el
// hito y la muñeca esperando un toque, en la misma sesión.

export type Suceso =
  | { tipo: 'gps-fijado' }
  | { tipo: 'estacion-cerrada'; estacion: Estacion; posicion: string; auto: boolean; ultima: boolean };

/** Segundos hasta el primer fix. Lo bastante para VER la transición. */
export const FIJA_A_LOS_S = 11;

function cierre(e: Estado, auto: boolean): Suceso {
  return {
    tipo: 'estacion-cerrada',
    estacion: estacionDe(e),
    posicion: posicion(e),
    auto,
    ultima: e.estacion >= RUTA.length - 1,
  };
}

/** Un segundo de reproducción. Devuelve el estado nuevo y lo que ha pasado. */
export function avanzar(e: Estado): { estado: Estado; sucesos: Suceso[] } {
  const sucesos: Suceso[] = [];
  const fija = e.senal === 'buscando' && e.enEstacionS + 1 >= FIJA_A_LOS_S;
  if (fija) sucesos.push({ tipo: 'gps-fijado' });

  const siguiente: Estado = {
    ...e,
    bloqueS: e.bloqueS + 1,
    enEstacionS: e.enEstacionS + 1,
    senal: fija ? 'fijado' : e.senal,
  };

  // SALIDA POR LA MEDIDA, no por el movimiento: si el GPS cruza los metros de
  // la estación, la estación se cierra sola. Donde nadie mide esto no ocurre
  // nunca, y la única salida es el toque del atleta.
  if (metrosQueFaltan(siguiente) === 0) {
    sucesos.push(cierre(siguiente, true));
    return { estado: cerrar(siguiente), sucesos };
  }
  return { estado: siguiente, sucesos };
}

/** El atleta cierra la estación a mano. Vale en las dos superficies. */
export function cerrarPorToque(e: Estado): { estado: Estado; sucesos: Suceso[] } {
  return { estado: cerrar(e), sucesos: [cierre(e, false)] };
}

/** La línea de cronología. Una sola redacción para las dos superficies. */
export function mensajeSuceso(s: Suceso): string {
  if (s.tipo === 'gps-fijado') return 'GPS fijado · los metros cuentan desde cero';
  if (s.ultima) return `${s.estacion.nombre} · última estación cerrada`;
  return `${s.estacion.nombre} ${s.posicion} cerrada ${s.auto ? 'al cruzar los metros' : 'por ti'}`;
}

// ---------------------------------------------------------------------------
// LA MUÑECA — las mismas derivaciones, con el presupuesto de 188 pt
// ---------------------------------------------------------------------------
//
// El orden de descarte al pasar de 402 pt a 208 está DECLARADO, y es lo que
// hace que el reloj sea la misma interfaz y no una versión arbitraria:
//
//     sujeto → contexto → ritmo → pulso → ruta
//
// El sujeto y el contexto son los mismos textos que el teléfono. El ritmo
// sobrevive porque es el mando. La lista de estaciones no cabe en ningún sitio
// de la muñeca salvo el bisel, y ahí va.
//
// EL SITIO RESERVADO PARA PAUSA / TERMINAR: en la app viven en una página a la
// izquierda del área viva (`PauseFinishPage`), y ahí se quedan — la card 176 es
// quien las diseña. Esta vista no las pinta a propósito: pintarlas aquí sería
// decidir por esa card.

export function paginas(e: Estado, g: Gestos): PaginaReloj[] {
  const est = estacionDe(e);
  const medida = estadoMedida(e);
  const sujeto = sujetoEscrito(e);
  const cap = capQueda(e);
  const ritmo = ritmoEscrito(e);

  // El modo lo decide lo que el atleta PUEDE hacer, no el formato: corriendo
  // mira de reojo y no toca (`ojeada`); con el saco encima ni mira ni toca, y
  // la oferta de cerrar se pinta atenuada para cuando lo suelte (`ciego`).
  const modo = medida === 'midiendo' ? 'ojeada' : 'ciego';

  const tramo: PaginaReloj = {
    id: 'tramo',
    contexto: contextoMuneca(e),
    modo,
    sujeto: {
      ...sujeto,
      // El cap sólo se pinta cuando aprieta. Un naranja permanente sería
      // decoración; encendido en los últimos 30 s es información.
      tono: cap == null ? undefined : tonoUrgente(cap, CAP_URGENTE_S),
    },
    // Medida → el ritmo, que es el mando. Ciega → la dosis, que es lo que hay
    // que hacer. Nunca las dos: en la muñeca hay UN segundo nivel.
    segundo:
      ritmo !== null
        ? { valor: `${ritmo} /km`, tono: colorJuicio(juzgar(e)) }
        : { valor: est.dosis },
    accion: {
      etiqueta: medida === 'midiendo' ? 'Al llegar · toca' : 'Al acabar · toca',
      onToca: g.estacionHecha,
    },
    nota:
      medida === 'buscando'
        ? NOTA.sinSenal
        : medida === 'nadie'
          ? NOTA.loDicesTu
          : undefined,
  };

  // EL RELOJ. Dos hechos de la misma familia y en una sola página: el techo que
  // decide (sujeto) y la puntuación del bloque (segundo). Sin cap, el bloque
  // sube a sujeto y la página degrada sin cambiar de forma.
  const reloj: PaginaReloj =
    cap == null
      ? { id: 'reloj', contexto: 'Del bloque', modo: 'ojeada', sujeto: { texto: fmtClock(e.bloqueS) } }
      : {
          id: 'reloj',
          contexto: 'Queda de cap',
          modo: 'ojeada',
          sujeto: { texto: fmtClock(cap), tono: tonoUrgente(cap, CAP_URGENTE_S) },
          segundo: { valor: `${fmtClock(e.bloqueS)} de bloque` },
        };

  const pulso = paginaPulso({ bpm: e.ppm, ancla: ANCLA });

  return pulso ? [tramo, reloj, pulso] : [tramo, reloj];
}

// ---------------------------------------------------------------------------
// LOS CASOS REALES — el stress-test, y lo recorre la suite
// ---------------------------------------------------------------------------
//
// La regla se rompe contra los casos, no al revés: si uno no entra en el
// modelo, el modelo está mal. Éstos son los que la interfaz tiene que tragar
// sin una sola línea de texto libre.

const MUDO: Gestos = { estacionHecha: () => {} };

const BASE: Estado = {
  estacion: 2,
  bloqueS: 509,
  enEstacionS: 132,
  senal: 'fijado',
  ppm: 168,
  piernas: FRESCO,
  parciales: [209, 168],
};

export function estado(parcial: Partial<Estado> = {}): Estado {
  return { ...BASE, ...parcial };
}

function caso(nombre: string, e: Estado) {
  return { nombre, estado: e, paginas: paginas(e, MUDO) };
}

export const CASOS = [
  // 1 · EL CASO DE LA CARD: estación de carrera medible, a mitad, con cap.
  caso('estación de carrera · 800 m con cap 4:00', BASE),
  // 2 · El cap apretando de verdad, con las piernas ya fundidas.
  caso('cap encima · quedan 28 s', estado({ estacion: 6, bloqueS: 1_402, enEstacionS: 212, piernas: FUNDIDO, parciales: [209, 168, 221, 118, 236, 174] })),
  // 3 · Cero metros con el GPS ya fijado. **Aquí es donde hoy pone «sin medir».**
  caso('recién fijado · 0 m cubiertos', estado({ estacion: 0, bloqueS: 0, enEstacionS: 0, parciales: [] })),
  // 4 · El GPS todavía no fija: no hay metros ni ritmo, y no se inventan.
  caso('sin señal · el GPS aún no fija', estado({ estacion: 0, bloqueS: 7, enEstacionS: 7, senal: 'buscando', ppm: 138, parciales: [] })),
  // 5 · Estación ciega por repeticiones: nadie cuenta un wall ball.
  caso('estación ciega · 60 wall balls', estado({ estacion: 1, bloqueS: 283, enEstacionS: 74, ppm: 172, parciales: [209] })),
  // 6 · Estación ciega CON metros prescritos: la medida existe y el sensor no.
  caso('estación ciega · 200 m de farmers', estado({ estacion: 3, bloqueS: 742, enEstacionS: 51, ppm: 165, parciales: [209, 168, 221] })),
  // 7 · Sin reloj puesto: no hay pulso, así que esa página NO EXISTE.
  caso('sin pulso · el atleta no lleva reloj', estado({ ppm: null })),
  // 8 · La última estación del chipper, ciega y con el bloque pasado de 20 min.
  caso('última estación · el bloque pasado de 20 min', estado({ estacion: 7, bloqueS: 1_648, enEstacionS: 96, ppm: 174, parciales: [209, 168, 221, 118, 236, 174, 248] })),
] as const;
