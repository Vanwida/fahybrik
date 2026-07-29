// For Time — el modelo del dominio, antes que la pantalla.
//
// En un For Time el trabajo es FIJO y el tiempo es la puntuación. De ahí sale
// todo lo demás, y sale como reglas, no como casos:
//
//  1. Un bloque For Time es una RUTA de tramos. Si la lista son estaciones, la
//     ESTACIÓN es el tramo.
//  2. Entre tramo y tramo no hay minuto que te saque: hay un SUCESO. Y el
//     suceso lo conoce el APARATO, no la app — por eso `quienMide()` es la
//     pieza central de este fichero y no un detalle de pintura.
//  3. La salida de un tramo es el CRUCE del objetivo (si alguien lo mide) o tu
//     toque (siempre). Un aparato parado no es una salida: por eso un tramo
//     que no mide nadie NO tiene motor, y sin motor no hay cruce automático.
//  4. Lo que se sella es lo MEDIDO, no el objetivo: 1.014 m se leen 1.014.
//
// El punto 4 no se fuerza a mano. Sale solo del margen de soltar: cruzas los
// 1.000 y sigues tirando ~3 s hasta que sueltas, y el monitor lee 1.014. El
// número del contrato aparece porque el modelo lo produce, no porque esté
// escrito en una constante.

import { HYROX, esDecimal, type ItemReal, type Modalidad } from '../../datos-reales';
import { fmtPace500, fmtPaceKm } from '../../sim';

/**
 * El doble avanza 4 s de entreno por segundo real.
 *
 * Sin esto, el cruce del remo (366 m por delante al abrir) tarda 80 s en
 * llegar y quien revisa la pantalla no llega a ver el suceso, que es justo lo
 * que hay que juzgar. La compresión es UNIFORME y todo — crono, metros,
 * parcial, ritmo, cap — deriva del MISMO segundo simulado, así que ninguna
 * cifra puede contradecir a otra.
 */
export const SIM_X = 4;

/** Lo que tardas en soltar después de cruzar. De aquí sale el 1.014. */
export const MARGEN_SUELTA_S = 3;

/**
 * El fogonazo del suceso, DERIVADO: está encendido durante el tick en el que
 * se selló el tramo y se apaga solo en el siguiente. Se calcula en vez de
 * guardarse porque un suceso no es un estado — es un instante del reloj, y
 * guardarlo obligaría a un efecto que dispara renders en cascada.
 *
 * `ventanaS` alarga el instante para lo que hay que poder LEER: el fogonazo
 * dura un tick, pero la banda que canta el tachado dura dos, porque un número
 * que aparece y desaparece en un segundo no es un aviso, es un parpadeo.
 */
export function recienSellado(scoreS: number, ultimoSelloS: number, ventanaS: number = SIM_X): boolean {
  const desde = scoreS - ultimoSelloS;
  return desde >= 0 && desde < ventanaS;
}

/** Lo que dura la banda del suceso: dos ticks, lo justo para leer el tachado. */
export const VENTANA_SUCESO_S = SIM_X * 2;

// ---------------------------------------------------------------------------
// Qué se mide, y quién lo sabe
// ---------------------------------------------------------------------------

export type Medida = 'distancia' | 'tiempo' | 'reps' | 'calorias' | 'ninguna';

/** Quién conoce el cruce de este tramo. El axioma, tipado. */
export type QuienMide = 'monitor' | 'reloj' | 'nadie';

export interface Objetivo {
  medida: Medida;
  /** Metros si es distancia · segundos si es tiempo · reps · calorías. */
  valor: number | null;
  /** Cómo lo escribe la prescripción, tal cual. Nulo = no trae dosis. */
  texto: string | null;
}

const RE_KM = /^([\d,]+)\s*km$/i;
const RE_M = /^([\d.]+)\s*m$/i;
const RE_TIEMPO = /^(\d+):(\d{2})$/;
const RE_REPS = /^(\d+)\s*reps?$/i;
const RE_CAL = /^(\d+)\s*cal$/i;

/** Lee la dosis de producción y devuelve QUÉ se mide. Sin texto libre. */
export function objetivoDe(item: ItemReal): Objetivo {
  const d = item.dosis;
  if (!d) return { medida: 'ninguna', valor: null, texto: null };

  const km = RE_KM.exec(d);
  if (km) return { medida: 'distancia', valor: Math.round(Number(km[1].replace(',', '.')) * 1000), texto: d };

  const m = RE_M.exec(d);
  if (m) return { medida: 'distancia', valor: Number(m[1].replace(/\./g, '')), texto: d };

  const t = RE_TIEMPO.exec(d);
  if (t) return { medida: 'tiempo', valor: Number(t[1]) * 60 + Number(t[2]), texto: d };

  const r = RE_REPS.exec(d);
  if (r) return { medida: 'reps', valor: Number(r[1]), texto: d };

  const c = RE_CAL.exec(d);
  if (c) return { medida: 'calorias', valor: Number(c[1]), texto: d };

  return { medida: 'ninguna', valor: null, texto: d };
}

/** Las modalidades que traen aparato con pantalla propia. */
const CON_MONITOR: ReadonlySet<Modalidad> = new Set<Modalidad>(['row', 'ski', 'bike']);

/**
 * El axioma completo, cerrado sobre el dominio: metros y calorías los sabe la
 * máquina (o el reloj, si corres), los segundos los sabe el reloj de la app, y
 * las repeticiones no las sabe nadie.
 */
export function quienMide(item: ItemReal): QuienMide {
  const { medida } = objetivoDe(item);
  if (medida === 'tiempo') return 'reloj';
  if (medida === 'reps') return 'nadie';
  if (medida === 'calorias') return CON_MONITOR.has(item.modalidad) ? 'monitor' : 'nadie';
  if (medida === 'distancia') {
    if (CON_MONITOR.has(item.modalidad)) return 'monitor';
    if (item.modalidad === 'run') return 'reloj';
    // Un trineo de 50 m o 200 m de granjero: los metros están en el suelo, no
    // en ningún aparato. Nadie los cuenta.
    return 'nadie';
  }
  return 'nadie';
}

/** Cómo se llama el aparato de cara al atleta. Nunca la marca ni el protocolo. */
export function quienLoSabe(item: ItemReal): string {
  switch (quienMide(item)) {
    case 'monitor':
      if (item.modalidad === 'row') return 'el remo';
      if (item.modalidad === 'ski') return 'el ski';
      return 'la bici';
    case 'reloj':
      return 'el reloj';
    default:
      return 'nadie';
  }
}

/** La regla de salida, escrita para leerse de un vistazo mientras sudas. */
export function reglaDeSalida(item: ItemReal): string {
  const quien = quienMide(item);
  const { medida, texto } = objetivoDe(item);
  if (quien === 'nadie' || !texto) return 'aquí cierras tú';
  if (medida === 'tiempo') return `sale sola a los ${texto}`;
  return `sale sola al cruzar ${texto}`;
}

// ---------------------------------------------------------------------------
// Formato — lo que aún no tiene canónico compartido (CONTRATO-UI §2.1)
// ---------------------------------------------------------------------------

/**
 * Miles a la española, sin `Intl` (el servidor y el navegador tienen que
 * escribir lo mismo o el hidratado se rompe): 1014 → «1.014».
 */
export function metrosEs(metros: number): string {
  const n = Math.max(0, Math.round(metros));
  return n < 1000 ? String(n) : `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}`;
}

/**
 * La medida se escribe en la unidad del OBJETIVO, no en la que le toque por
 * tamaño: un remo de 1.000 m se lee en metros aunque pase de mil, y un km
 * corriendo se lee en km. Así lo tachado se compara con lo pedido sin traducir.
 */
export function unidadDe(objetivoTexto: string): 'km' | 'm' {
  return /km$/i.test(objetivoTexto) ? 'km' : 'm';
}

/** Solo la cifra — la unidad la pinta el layout aparte (§2, `ritmoCifras`). */
export function cifraEnUnidadDe(objetivoTexto: string, metros: number): string {
  return unidadDe(objetivoTexto) === 'km' ? esDecimal(metros / 1000, 2) : metrosEs(metros);
}

export function medidaEnUnidadDe(objetivoTexto: string, metros: number): string {
  return `${cifraEnUnidadDe(objetivoTexto, metros)} ${unidadDe(objetivoTexto)}`;
}

export interface Lectura {
  valor: string;
  unidad: string;
}

/** El ritmo del tramo: /500m si hay monitor de remo, /km si corres. */
export function ritmoDe(item: ItemReal, metros: number, segundos: number): Lectura | null {
  if (metros <= 0 || segundos <= 0) return null;
  const mps = metros / segundos;
  return CON_MONITOR.has(item.modalidad)
    ? { valor: fmtPace500(500 / mps), unidad: '/500m' }
    : { valor: fmtPaceKm(1000 / mps), unidad: '/km' };
}

// ---------------------------------------------------------------------------
// El motor de un tramo medible
// ---------------------------------------------------------------------------

export interface MotorTramo {
  /** Metros cubiertos a un parcial dado. No se topa en el objetivo: lo pasa. */
  metrosEn: (parcialS: number) => number;
  /** Parcial en el que se cruza el objetivo. */
  cruceS: number;
  /** Parcial en el que se sella: el cruce más lo que tardas en soltar. */
  selloS: number;
}

function motorLineal(mps: number, objetivoM: number): MotorTramo {
  const cruceS = objetivoM / mps;
  return { metrosEn: (s) => Math.max(0, s) * mps, cruceS, selloS: cruceS + MARGEN_SUELTA_S };
}

/**
 * Velocidades del guion. La del remo NO es un número elegido: es la que hace
 * que a los 2:18 (donde abre la escena) el monitor marque 634 m, que es el
 * punto del que parte la propuesta. De ahí salen solos el 1:49/500 que se lee
 * en pantalla y el sello en 1.014 m · 3:41.
 */
const VELOCIDAD_MPS: Partial<Record<Modalidad, number>> = {
  row: 634 / 138,
  ski: 1000 / 236,
  run: 1000 / 293,
  bike: 1000 / 125,
};

/**
 * EL TRAMO DECIDE LA CARA.
 *
 * En horizontal solo se pinta cara de monitor cuando hay una MÁQUINA delante
 * (remo, ski, bici) **y** una medida que ella pueda mover. Las dos condiciones
 * hacen falta, y cada una tumba un caso distinto:
 *
 *  · un Run tiene distancia pero no tiene máquina — sus metros los pone el
 *    reloj, y un reloj no es un monitor que mirar a un metro de la cara;
 *  · una bici a 5:00 tiene máquina pero su cruce lo manda el tiempo, así que
 *    no hay metros que gobiernen la pantalla.
 *
 * En los dos casos la cara horizontal es la del FORMATO. Jamás una cara de
 * monitor sin máquina.
 */
export function caraDeMonitor(item: ItemReal): boolean {
  return CON_MONITOR.has(item.modalidad) && motorDe(item) !== null;
}

/**
 * La cadencia que canta la máquina. Se DERIVA del ritmo y de lo que avanza el
 * aparato por ciclo, que es la relación real (ritmo = cadencia × metros por
 * palada); así no puede contradecir a los metros de al lado.
 *
 * Nula donde no se puede derivar: sin ciclo conocido no se inventa un número.
 */
const METROS_POR_CICLO: Partial<Record<Modalidad, number>> = { row: 9.6, ski: 8.5 };

export function cadenciaDe(item: ItemReal): Lectura | null {
  const mps = VELOCIDAD_MPS[item.modalidad];
  const porCiclo = METROS_POR_CICLO[item.modalidad];
  if (!mps || !porCiclo) return null;
  return { valor: String(Math.round((mps / porCiclo) * 60)), unidad: '/min' };
}

/** Nulo cuando no lo mide nadie: sin medida no hay cruce, solo tu toque. */
export function motorDe(item: ItemReal): MotorTramo | null {
  const { medida, valor } = objetivoDe(item);
  if (quienMide(item) === 'nadie' || medida !== 'distancia' || !valor) return null;
  const mps = VELOCIDAD_MPS[item.modalidad];
  if (!mps) return null;
  return motorLineal(mps, valor);
}

// ---------------------------------------------------------------------------
// LA RUTA — las 16 estaciones de la simulación HYROX (plantilla 441)
// ---------------------------------------------------------------------------

export interface Cerrado {
  /** Segundos reales del tramo, medidos por el reloj de la app. */
  parcialS: number;
  /** Lo que leyó el aparato. Nulo cuando no lo mide nadie: eso es el dato. */
  medido: string | null;
}

export const ESTACIONES: ItemReal[] = HYROX.bloques[1].items;

/**
 * El cursor de la escena: estación 10 de 16, el remo, con 634 m a los 2:18.
 *
 * Los nueve parciales de arriba están FABRICADOS aquí, una sola vez, porque la
 * plantilla 441 no tiene ninguna ejecución medida en el corpus. Son los de un
 * atleta que va camino de 1:20. Cada uno lleva `medido` si y solo si algún
 * aparato podía leerlo: los trineos y los burpees van sin medida, y esa
 * ausencia es la información honesta de esas filas.
 */
export const CERRADAS_HYROX: readonly Cerrado[] = [
  { parcialS: 278, medido: '1,01 km' }, // Run 1
  { parcialS: 252, medido: '1.007 m' }, // SkiErg
  { parcialS: 281, medido: '1,00 km' }, // Run 2
  { parcialS: 178, medido: null }, // Sled Push
  { parcialS: 292, medido: '1,01 km' }, // Run 3
  { parcialS: 214, medido: null }, // Sled Pull
  { parcialS: 295, medido: '1,00 km' }, // Run 4
  { parcialS: 266, medido: null }, // Burpee Broad Jump
  { parcialS: 301, medido: '1,02 km' }, // Run 5
];

/** Segundos acumulados al empezar la estación 10 = 39:17. */
export const ACUMULADO_ANTES_S = CERRADAS_HYROX.reduce((n, c) => n + c.parcialS, 0);

/** Parcial que el remo ya llevaba al abrir la escena. */
export const PARCIAL_APERTURA_S = 138;

/** El crono de la puntuación al abrir: 41:35. */
export const SCORE_APERTURA_S = ACUMULADO_ANTES_S + PARCIAL_APERTURA_S;

/** FC del guion — sube despacio dentro del tramo y se queda arriba. */
export function fcEn(parcialS: number): number {
  return 158 + Math.round(8 * Math.min(1, Math.max(0, parcialS) / 240));
}

/** Cómo se lee el plan de una estación: la dosis manda, el nombre la sigue. */
export function planDe(item: ItemReal): string {
  return item.dosis ? `${item.dosis} ${item.nombre}` : item.nombre;
}

/**
 * Lo que se sella al cerrar: el tiempo REAL y lo que leyó el aparato en ese
 * instante. Si no lo medía nadie, `medido` se queda nulo y la fila enseña solo
 * su tiempo. Esa ausencia es el dato, no un hueco que tapar (§7).
 */
export function sellar(item: ItemReal, parcialS: number): Cerrado {
  const motor = motorDe(item);
  const { texto } = objetivoDe(item);
  const metros = motor && texto ? motor.metrosEn(parcialS) : null;
  return {
    parcialS: Math.max(1, Math.round(parcialS)),
    medido: metros != null && texto ? medidaEnUnidadDe(texto, metros) : null,
  };
}

/** Parcial en el que TÚ cortaste una estación, por índice. */
export type Cortes = Readonly<Record<number, number>>;

export interface Ruta {
  /** Estación en curso. Igual al total = ruta terminada. */
  activo: number;
  /** Crono del bloque en el que arrancó la estación en curso. */
  inicioS: number;
  cerradas: (Cerrado | null)[];
  /** Crono en el que se selló el último tramo (de ahí sale el fogonazo). */
  ultimoSelloS: number;
  /** Última estación cerrada DURANTE la escena. Nula al abrir. */
  ultimaDeLaEscena: number | null;
}

/**
 * La ruta en un instante — plegada desde la apertura, no guardada.
 *
 * Un tramo se cierra por lo que llegue antes: tu corte o el sello de su motor.
 * Sin motor y sin corte el límite es infinito, que es exactamente el axioma:
 * un aparato parado no saca a nadie de una estación. Lo único que hay que
 * guardar son los cortes, porque son lo único que el reloj no puede saber.
 */
export function rutaEn(scoreS: number, cortes: Cortes): Ruta {
  const cerradas: (Cerrado | null)[] = ESTACIONES.map((_, i) => CERRADAS_HYROX[i] ?? null);
  let activo = CERRADAS_HYROX.length;
  let inicioS = ACUMULADO_ANTES_S;
  let ultimoSelloS = ACUMULADO_ANTES_S;
  let ultimaDeLaEscena: number | null = null;

  while (activo < ESTACIONES.length) {
    const item = ESTACIONES[activo];
    const limite = cortes[activo] ?? motorDe(item)?.selloS ?? Number.POSITIVE_INFINITY;
    if (scoreS - inicioS < limite) break;
    const cerrada = sellar(item, limite);
    cerradas[activo] = cerrada;
    inicioS += cerrada.parcialS;
    ultimoSelloS = inicioS;
    ultimaDeLaEscena = activo;
    activo += 1;
  }
  return { activo, inicioS, cerradas, ultimoSelloS, ultimaDeLaEscena };
}

// ---------------------------------------------------------------------------
// EL BLOQUE A PULSO — 21-15-9 con cap
// ---------------------------------------------------------------------------

export interface Tanda {
  nombre: string;
  reps: number;
  /** La carga, cuando el movimiento la lleva. */
  carga: string | null;
}

/**
 * FABRICADO: este bloque no está en el corpus de producción. Se escribe aquí
 * completo (movimiento + repeticiones + carga) porque una prescripción de
 * fuerza sin carga no es una prescripción, y los nombres van en inglés por la
 * misma razón que los de `datos-reales`: así se guardan en `exercises.name`.
 */
export const TANDAS: readonly Tanda[] = [
  { nombre: 'Thruster', reps: 21, carga: '43 kg' },
  { nombre: 'Pull-up', reps: 21, carga: null },
  { nombre: 'Thruster', reps: 15, carga: '43 kg' },
  { nombre: 'Pull-up', reps: 15, carga: null },
  { nombre: 'Thruster', reps: 9, carga: '43 kg' },
  { nombre: 'Pull-up', reps: 9, carga: null },
];

export const CAP_S = 720;
export const TOTAL_REPS = TANDAS.reduce((n, t) => n + t.reps, 0);

/** El que va sobrado: tres tandas cerradas en 4:03, abre a 4:41. */
export const CERRADAS_PULSO: readonly number[] = [64, 98, 81];
export const SCORE_APERTURA_PULSO_S = 281;

/** El que se come el cap: cuatro tandas en 9:58, abre a 11:05 con 55 s vivos. */
export const CERRADAS_CAP: readonly number[] = [130, 206, 104, 158];
export const SCORE_APERTURA_CAP_S = 665;

/**
 * La proyección contra el cap, SOLO con lo medible: las tandas cerradas tienen
 * repeticiones conocidas (las cerró él) y tiempo real. Las que están en vuelo
 * no cuentan, porque nadie sabe cuántas llevas.
 *
 * Con una sola tanda cerrada no se proyecta: un punto no es un ritmo.
 */
export function proyeccionS(cerradas: readonly number[]): number | null {
  if (cerradas.length < 2) return null;
  const segundos = cerradas.reduce((a, b) => a + b, 0);
  const reps = TANDAS.slice(0, cerradas.length).reduce((a, t) => a + t.reps, 0);
  if (reps <= 0) return null;
  return Math.round((segundos / reps) * TOTAL_REPS);
}

/** Repeticiones cerradas de verdad — nunca las de la tanda en vuelo. */
export function repsCerradas(nTandas: number): number {
  return TANDAS.slice(0, nTandas).reduce((a, t) => a + t.reps, 0);
}
