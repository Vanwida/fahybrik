// La FÍSICA del ergo y las curvas de cada máquina.
//
// Vive aparte de `data.ts` porque son dos cosas distintas: allí está QUÉ se
// prescribe y cómo se dice; aquí, qué canta el monitor segundo a segundo. Todo
// se deriva de una curva fija por máquina, así el monitor del doble no puede
// contradecirse consigo mismo ni cambiar entre reproducciones.
//
// DEUDA declarada: `vatiosDeRitmo` y `calPorHoraDeVatios` son las relaciones de
// Concept2 que `benchmark-erg/data.ts` ya implementa (allí redondeadas para
// pintar). Aquí se necesitan SIN redondear para integrar medias, así que viven
// otra vez. Las dos deberían subir a un `design-twin/ergo.ts` compartido en el
// lote que aterrice esta familia (CONTRATO-UI §0).

import { MEDIDA_UNIDAD, type Maquina, type Prescripcion } from './dominio';

// ---------------------------------------------------------------------------
// Física del ergo — las dos relaciones de Concept2, sin redondear
// ---------------------------------------------------------------------------

/** W = 2,80 / (segundos por metro)³. */
export function vatiosDeRitmo(ritmoS500: number): number {
  const porMetro = ritmoS500 / 500;
  return 2.8 / porMetro ** 3;
}

/** Calorías/hora del monitor a partir de los vatios. */
export function calPorHoraDeVatios(vatios: number): number {
  return vatios * 4 * 0.8604 + 300;
}

// ---------------------------------------------------------------------------
// Las curvas — remo y esquí por DISTANCIA, bici por TIEMPO
// ---------------------------------------------------------------------------

/** Tramo de una pieza de remo/esquí: manda hasta el metro `hastaM`. */
interface TramoDistancia {
  hastaM: number;
  /** s/500m sostenidos en el tramo. */
  ritmo: number;
  /** Paladas por minuto. */
  cadencia: number;
}

/**
 * Serie de 500 m a objetivo 1:52: salida fuerte, se asienta, y el último cuarto
 * se aprieta. Cierra en 1:51 de media — un segundo por debajo del objetivo.
 */
const CURVA_REMO: readonly TramoDistancia[] = [
  { hastaM: 20, ritmo: 104, cadencia: 33 },
  { hastaM: 90, ritmo: 110, cadencia: 31 },
  { hastaM: 270, ritmo: 112, cadencia: 29 },
  { hastaM: 425, ritmo: 113, cadencia: 28 },
  { hastaM: 500, ritmo: 108, cadencia: 32 },
];

/**
 * Los CUATRO parciales de 100 de la ejecución 173, calibrados para que la
 * integral por segundo devuelva los 165,7 W y las 38 paladas/min que guarda
 * `segment_executions`. Si tocas un ritmo, se rompe el agregado real.
 */
const CURVA_SKI: readonly TramoDistancia[] = [
  { hastaM: 100, ritmo: 124.75, cadencia: 40 },
  { hastaM: 200, ritmo: 128.25, cadencia: 39 },
  { hastaM: 300, ritmo: 131.0, cadencia: 37 },
  { hastaM: 400, ritmo: 129.4, cadencia: 36 },
];

/** Tramo de la bici: la unidad que gobierna aquí son los vatios, no el ritmo. */
interface TramoTiempo {
  hastaS: number;
  vatios: number;
  /** Pedaladas por minuto. */
  cadencia: number;
}

/** 20 cal: arranque, se estabiliza, y se abre al oler el final. */
const CURVA_BICI: readonly TramoTiempo[] = [
  { hastaS: 8, vatios: 340, cadencia: 78 },
  { hastaS: 30, vatios: 300, cadencia: 72 },
  { hastaS: 45, vatios: 285, cadencia: 70 },
  { hastaS: Number.POSITIVE_INFINITY, vatios: 310, cadencia: 75 },
];

/** Techo de la tabla por segundo. Ninguna serie de estas llega a los 200 s. */
const MAX_S = 300;

/** Lo que el monitor entrega en un segundo de la serie. */
export interface Muestra {
  /** Acumulado de la MEDIDA desde el ancla de esta serie. */
  medido: number;
  /** s/500m instantáneos. Nulo en la bici: no es su unidad. */
  ritmo: number | null;
  vatios: number;
  cadencia: number;
}

function tramoPorMetro(curva: readonly TramoDistancia[], metros: number): TramoDistancia {
  return curva.find((t) => metros < t.hastaM) ?? curva[curva.length - 1];
}

function tramoPorSegundo(curva: readonly TramoTiempo[], s: number): TramoTiempo {
  return curva.find((t) => s < t.hastaS) ?? curva[curva.length - 1];
}

function tablaDistancia(curva: readonly TramoDistancia[]): Muestra[] {
  const out: Muestra[] = [];
  let metros = 0;
  for (let s = 0; s <= MAX_S; s += 1) {
    const tr = tramoPorMetro(curva, metros);
    out.push({ medido: metros, ritmo: tr.ritmo, vatios: vatiosDeRitmo(tr.ritmo), cadencia: tr.cadencia });
    metros += 500 / tr.ritmo;
  }
  return out;
}

function tablaCalorias(curva: readonly TramoTiempo[]): Muestra[] {
  const out: Muestra[] = [];
  let cal = 0;
  for (let s = 0; s <= MAX_S; s += 1) {
    const tr = tramoPorSegundo(curva, s);
    out.push({ medido: cal, ritmo: null, vatios: tr.vatios, cadencia: tr.cadencia });
    cal += calPorHoraDeVatios(tr.vatios) / 3600;
  }
  return out;
}

const TABLA: Record<Maquina, Muestra[]> = {
  remo: tablaDistancia(CURVA_REMO),
  ski: tablaDistancia(CURVA_SKI),
  bici: tablaCalorias(CURVA_BICI),
};

/** La muestra del segundo `s` de la serie (el crono del tramo, no el de la sesión). */
export function muestra(maquina: Maquina, s: number): Muestra {
  const i = Math.max(0, Math.min(MAX_S, Math.floor(s)));
  return TABLA[maquina][i];
}

/**
 * Lo que el monitor CANTA como acumulado: entero en las dos medidas. Nadie
 * mide 8,4 calorías ni 385,2 metros, así que no se pintan.
 */
export function medidoEn(pres: Prescripcion, s: number): number {
  return Math.floor(muestra(pres.maquina, s).medido);
}

// ---------------------------------------------------------------------------
// El resumen de una serie cerrada — se integra, no se declara
// ---------------------------------------------------------------------------

export interface ResumenSerie {
  serie: number;
  duracionS: number;
  /** Lo que el monitor midió DE VERDAD. 504 m para un objetivo de 500: el
   *  parcial no se redondea al objetivo (DECISIONS, 28-jul). */
  medido: number;
  /** s/500m medios. Nulo en la bici. */
  ritmoMedio: number | null;
  vatiosMedios: number;
  cadenciaMedia: number;
  pulsoPico: number | null;
}

/**
 * `hastaS` es el segundo en el que la serie se CIERRA, y no siempre es el del
 * cruce: cuando la medida falla, cierra el toque, y entonces lo medido es lo
 * que el monitor cante en ESE segundo. Por eso el resumen se integra sobre el
 * cierre real en vez de darse por hecho.
 */
export function resumenDeSerie(
  pres: Prescripcion,
  serie: number,
  hastaS: number,
  pulsoPico: number | null,
): ResumenSerie {
  const fin = Math.max(1, Math.min(MAX_S, Math.round(hastaS)));
  let vatios = 0;
  let cadencia = 0;
  for (let s = 0; s < fin; s += 1) {
    const m = muestra(pres.maquina, s);
    vatios += m.vatios;
    cadencia += m.cadencia;
  }
  const medido = medidoEn(pres, fin);
  return {
    serie,
    duracionS: fin,
    medido,
    ritmoMedio: pres.medida === 'metros' && medido > 0 ? (500 * fin) / medido : null,
    vatiosMedios: Math.round(vatios / fin),
    cadenciaMedia: Math.round(cadencia / fin),
    pulsoPico,
  };
}

/**
 * Los parciales de 100 m de una pieza continua.
 *
 * El cruce se INTERPOLA entre las dos muestras de segundo: a un segundo de
 * resolución los cuatro parciales de la 173 se colapsan en 25/26/26/26 y la
 * pieza parece plana, cuando en realidad se abrió en el tercero. El monitor
 * tampoco redondea a segundos enteros. El tiempo se lee en el acumulado (lo
 * que enseña la memoria del monitor) y la forma, en el ritmo por 500.
 */
export interface Parcial {
  metros: number;
  /** Crono acumulado al cruzar ese redondo. */
  acumuladoS: number;
  /** Lo que costó ESE parcial. */
  duracionS: number;
  /** s/500m de ese parcial. */
  ritmo: number;
}

export function parcialesDe(pres: Prescripcion, cada = 100): Parcial[] {
  const out: Parcial[] = [];
  let previo = 0;
  for (let objetivo = cada; objetivo <= pres.cantidad; objetivo += cada) {
    for (let s = 1; s <= MAX_S; s += 1) {
      const alto = muestra(pres.maquina, s).medido;
      if (alto < objetivo) continue;
      const bajo = muestra(pres.maquina, s - 1).medido;
      const cruce = s - 1 + (objetivo - bajo) / (alto - bajo);
      out.push({
        metros: objetivo,
        acumuladoS: cruce,
        duracionS: cruce - previo,
        ritmo: (500 * (cruce - previo)) / cada,
      });
      previo = cruce;
      break;
    }
  }
  return out;
}

/** Cuántos parciales YA cantó el monitor en el segundo `s`. */
export function parcialesHasta(parciales: Parcial[], s: number): Parcial[] {
  return parciales.filter((p) => p.acumuladoS <= s);
}

// ---------------------------------------------------------------------------
// El pulso — y su ausencia
// ---------------------------------------------------------------------------

/** Sin reloj no hay pulso, y sin pulso no hay zona: no se pinta nada (§7). */
export interface PerfilPulso {
  base: number;
  tope: number;
  /** Segundos que tarda en llegar arriba. */
  subidaS: number;
}

export const PULSO: Record<Maquina, PerfilPulso | null> = {
  // Serie 2 de 5 a tope: se entra caliente de la serie 1.
  remo: { base: 158, tope: 176, subidaS: 100 },
  // Ejecución 173: el reloj no dio una sola lectura válida durante la pieza.
  ski: null,
  bici: { base: 150, tope: 172, subidaS: 45 },
};

export function pulsoEn(perfil: PerfilPulso, s: number): number {
  const subida = Math.min(1, Math.max(0, s) / perfil.subidaS) ** 0.8;
  return Math.round(perfil.base + (perfil.tope - perfil.base) * subida);
}

/** Caída del pulso en el descanso: rápida al principio, luego se aplana. */
const DESCANSO_SUELO_PPM = 126;
const DESCANSO_CONSTANTE_S = 38;

export function pulsoDescanso(pico: number, s: number): number {
  return Math.round(DESCANSO_SUELO_PPM + (pico - DESCANSO_SUELO_PPM) * Math.exp(-s / DESCANSO_CONSTANTE_S));
}

// ---------------------------------------------------------------------------
// El temblor del monitor — determinista
// ---------------------------------------------------------------------------

/**
 * Un monitor no canta una cifra plana: la refresca por palada y baila. El
 * temblor afecta SOLO a lo instantáneo (ritmo, vatios, cadencia); el acumulado
 * sale de la curva, igual que en la máquina real, donde el split del último
 * golpe y los metros totales son dos lecturas distintas.
 */
function ruido(semilla: number): number {
  const x = Math.sin(semilla * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function tembla(semilla: number, amplitud: number): number {
  return (ruido(semilla) - 0.5) * 2 * amplitud;
}

/** Lo que se PINTA en vivo, ya temblado y redondeado como lo canta el monitor. */
export interface LecturaViva {
  ritmo: number | null;
  vatios: number;
  cadencia: number;
}

export function lecturaViva(maquina: Maquina, s: number): LecturaViva {
  const m = muestra(maquina, s);
  const cadencia = Math.round(m.cadencia + tembla(s + 7, 1.4));
  if (m.ritmo == null) {
    const vatios = Math.round(m.vatios + tembla(s, 14));
    return { ritmo: null, vatios, cadencia };
  }
  const ritmo = m.ritmo + tembla(s, 1.6);
  return { ritmo, vatios: Math.round(vatiosDeRitmo(ritmo)), cadencia };
}

/**
 * Lo que el monitor lleva medido en TODA la pieza, no en la ventana de esta
 * serie. Espejo de `WorkoutSession.accumulatedErgLine`: se calla cuando diría lo
 * mismo que el sujeto (una pieza continua es su propia ventana y repetir el
 * número sería ruido).
 */
export function acumuladoTexto(
  pres: Prescripcion,
  serie: number,
  medidoEnVentana: number,
): string | null {
  const cerradas = Math.max(0, serie - 1);
  if (cerradas <= 0) return null;
  const total = cerradas * medidoDeSerieCompleta(pres) + medidoEnVentana;
  return `total ${total} ${MEDIDA_UNIDAD[pres.medida]}`;
}

/** El segundo en el que la medida CRUZA la cantidad de la serie. */
export function segundoDelCruce(pres: Prescripcion): number {
  for (let s = 0; s <= MAX_S; s += 1) {
    if (medidoEn(pres, s) >= pres.cantidad) return s;
  }
  return MAX_S;
}

/** Lo que mide una serie ya cerrada de esta prescripción, con su rebase real. */
export function medidoDeSerieCompleta(pres: Prescripcion): number {
  for (let s = 0; s <= MAX_S; s += 1) {
    if (medidoEn(pres, s) >= pres.cantidad) return medidoEn(pres, s);
  }
  return pres.cantidad;
}

/**
 * A qué hora acabaría la serie si sostienes ESTE ritmo. Nula sin ritmo vivo o
 * sin objetivo que proyectar: una proyección sin denominador es adivinar.
 */
export function proyeccionS(
  pres: Prescripcion,
  t: number,
  medido: number,
  ritmo: number | null,
): number | null {
  if (ritmo == null || ritmo <= 0 || pres.medida !== 'metros') return null;
  const restante = pres.cantidad - medido;
  if (restante <= 0) return null;
  return t + restante * (ritmo / 500);
}

/** Calorías acumuladas en la ventana, que el monitor cuenta siempre. */
export function caloriasEn(maquina: Maquina, t: number): number {
  let acc = 0;
  for (let s = 0; s < Math.floor(t); s += 1) {
    acc += calPorHoraDeVatios(muestra(maquina, s).vatios) / 3600;
  }
  return Math.round(acc);
}
