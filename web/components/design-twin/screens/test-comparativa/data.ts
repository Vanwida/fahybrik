// EL RESULTADO DE UN TEST, CONTRA OTRO. El modelo de la comparación.
//
// Un test no es «un número que se guarda»: es el RESOLVEDOR del plan. El atleta
// lo hace a tope, y de ahí sale el umbral con el que se escriben sus ritmos las
// semanas siguientes. Así que compararlo con el de hace tres meses no es una
// curiosidad — es la única forma de que vea que el trabajo sirvió.
//
// TRES COSAS Y EN ESTE ORDEN (y hoy la app solo enseña la primera):
//   1. el NÚMERO — cuánto cambió;
//   2. lo que ese número GOBIERNA — el umbral y, con él, las seis zonas: lo que
//      va a leer mañana en su plan;
//   3. CÓMO se produjo — tramo a tramo y a qué pulso. Aquí vive la mejora que
//      hoy es invisible: el MISMO tiempo con 9 ppm menos es una mejora enorme y
//      la app de hoy la pinta como «−0,4 s», es decir, como nada.
//
// REGLAS DE DOMINIO QUE ESTE MODELO IMPONE
// ────────────────────────────────────────
// · Solo se comparan intentos del MISMO protocolo. Un 2 km y un 2 × 2′ no son
//   comparables aunque los dos sean remo y los dos calibren remo: la referencia
//   se elige dentro del test, nunca entre tests.
// · La dirección de «mejor» la pone la UNIDAD, no la pantalla: segundos → menos;
//   metros → más. Misma regla que `BenchmarkDelta.swift` y que el servidor.
// · Un test de N tramos necesita una AGREGACIÓN declarada (media | mejor | único)
//   para tener un número. Sin ella, «2 × 2′» no tiene resultado — y hoy no
//   existe en ningún sitio del sistema.
// · Lo que no se midió NO se pinta. Un intento viejo sin pulso deja el hueco
//   dicho, no un cero.
//
// LOS NÚMEROS. La progresión de los escenarios está SIMULADA: en producción
// nadie acumula todavía tres meses de tests (la app se estrena ahora), así que
// no hay una serie real que leer. Son valores de atleta HYROX competente,
// coherentes entre sí y con el mismo sujeto en los tres escenarios de ergo.

import type { Modalidad } from '../../kit-composicion/chrome';

/** Qué unidad mide el resultado y, con ella, hacia dónde está lo mejor. */
export type Unidad = 'segundos' | 'metros';

/** Cómo N tramos se convierten en UN número comparable. */
export type Agregacion = 'unico' | 'media' | 'mejor';

export interface Tramo {
  etiqueta: string;
  valor: number;
  /** FC media del tramo. null = no se midió (sin reloj). */
  fc: number | null;
}

export interface Intento {
  id: string;
  /** Cómo se nombra la fecha en la columna («6 MAY»). */
  fecha: string;
  /** Su antigüedad en lenguaje de gimnasio («hace 12 semanas»). */
  cuando: string;
  /** El número agregado, en la unidad del test. */
  valor: number;
  tramos: Tramo[];
  fcMedia: number | null;
  fcMax: number | null;
  /** El umbral que este intento dejó, s/500m o s/km. null = no calibró. */
  umbral: number | null;
}

/**
 * Una banda de zona del COACH: desplazamientos fijos sobre el umbral, espejo de
 * `methodology_zones` (zone-model.ts: fast = umbral + low · slow = umbral + high,
 * null = abierta). Nombre, color y cortes son MÉTODO — dato editable del coach,
 * jamás una constante del producto (HARD RULE Nº0). Los valores de abajo son el
 * seed por defecto; al cablear esto de verdad se leen los suyos.
 */
export interface ZonaDef {
  codigo: string;
  nombre: string;
  color: string;
  /** Borde RÁPIDO de la banda: segundos desde el umbral (negativo = más rápido). */
  low: number;
  /** Borde LENTO. null = abierta (Z1 llega hasta el infinito). */
  high: number | null;
}

export interface TestComparado {
  id: string;
  nombre: string;
  modalidad: Modalidad;
  /** El trabajo, tal y como lo escribió el coach. */
  protocolo: string;
  unidad: Unidad;
  agregacion: Agregacion;
  /** Qué ancla mueve este test. null = solo se guarda. */
  calibra: string | null;
  /** Unidad del umbral, para escribirlo. */
  umbralUnidad: 'por500m' | 'porKm';
  /** El valor del test llevado a ritmo comparable (s/500m o s/km). */
  ritmo: (valor: number) => number;
  /** Las bandas del coach para la unidad de este test. */
  zonas: ZonaDef[];
  /** Intentos ordenados de viejo a nuevo. El último es el de hoy. */
  intentos: Intento[];
}

/** La banda absoluta de una zona para un umbral dado, en segundos por unidad. */
export function banda(umbral: number, z: ZonaDef): { fast: number; slow: number | null } {
  return { fast: umbral + z.low, slow: z.high === null ? null : umbral + z.high };
}

// Seed por defecto de las seis zonas de ritmo (dato del coach; ver ZonaDef).
// Los cortes van en segundos DESDE el umbral: la Z4 nace en él, por eso el test
// que lo mueve las mueve todas exactamente lo mismo.
export const ZONAS_500M: ZonaDef[] = [
  { codigo: 'Z1', nombre: 'Recuperación', color: '#34C759', low: 22, high: null },
  { codigo: 'Z2', nombre: 'Aeróbico ligero', color: '#3B82F6', low: 14, high: 21 },
  { codigo: 'Z3', nombre: 'Aeróbico intenso', color: '#EAB308', low: 8, high: 13 },
  { codigo: 'Z4', nombre: 'Umbral', color: '#F59E0B', low: 0, high: 7 },
  { codigo: 'Z5', nombre: 'VO₂ máx', color: '#EF4444', low: -3, high: -1 },
  { codigo: 'Z6', nombre: 'Sprint', color: '#B91C1C', low: -8, high: -4 },
];

export const ZONAS_KM: ZonaDef[] = [
  { codigo: 'Z1', nombre: 'Recuperación', color: '#34C759', low: 60, high: null },
  { codigo: 'Z2', nombre: 'Aeróbico ligero', color: '#3B82F6', low: 35, high: 59 },
  { codigo: 'Z3', nombre: 'Aeróbico intenso', color: '#EAB308', low: 18, high: 34 },
  { codigo: 'Z4', nombre: 'Umbral', color: '#F59E0B', low: 0, high: 17 },
  { codigo: 'Z5', nombre: 'VO₂ máx', color: '#EF4444', low: -12, high: -1 },
  { codigo: 'Z6', nombre: 'Sprint', color: '#B91C1C', low: -25, high: -13 },
];

// ── Direcciones y deltas ─────────────────────────────────────────────────────

/** Segundos: menos es mejor. Metros y todo lo que se cuenta: más. */
export function menosEsMejor(unidad: Unidad): boolean {
  return unidad === 'segundos';
}

/** ¿El delta es una mejora? Cero NUNCA celebra. */
export function esMejora(unidad: Unidad, delta: number): boolean {
  if (delta === 0) return false;
  return menosEsMejor(unidad) ? delta < 0 : delta > 0;
}

/** Un delta se considera ruido cuando no mueve el umbral ni medio segundo. */
export function esEmpate(test: TestComparado, a: Intento, b: Intento): boolean {
  return Math.abs(test.ritmo(b.valor) - test.ritmo(a.valor)) < 0.5;
}

// ── Las referencias contra las que se puede comparar ─────────────────────────

export interface Referencia {
  id: string;
  /** Lo que se lee en el segmentado. Corto: caben cuatro. */
  etiqueta: string;
  intento: Intento;
}

/**
 * Las referencias REALES de un test: el intento anterior, el más cercano a tres
 * meses, el mejor y el primero. Se deduplican (con tres intentos, «anterior» y
 * «hace 12 semanas» pueden ser el mismo) y se descarta el de hoy. Sin historia,
 * la lista sale vacía y la pantalla lo dice en vez de fabricar una comparación.
 */
export function referencias(test: TestComparado): Referencia[] {
  const previos = test.intentos.slice(0, -1);
  if (previos.length === 0) return [];

  const anterior = previos[previos.length - 1];
  const mejor = previos.reduce((m, i) =>
    menosEsMejor(test.unidad) ? (i.valor < m.valor ? i : m) : i.valor > m.valor ? i : m,
  );
  const primero = previos[0];
  // El «hace 12 semanas» honesto: el intento más cercano a esa marca, no uno
  // inventado. Si el más cercano ya es el anterior, no se ofrece dos veces.
  const trimestral = previos.reduce((m, i) => (i.cuando.includes('3 meses') ? i : m), anterior);

  const candidatos: Referencia[] = [
    { id: 'anterior', etiqueta: 'Anterior', intento: anterior },
    { id: 'trimestre', etiqueta: 'Hace 3 meses', intento: trimestral },
    { id: 'mejor', etiqueta: 'Tu mejor', intento: mejor },
    { id: 'primero', etiqueta: '1ª vez', intento: primero },
  ];

  const vistos = new Set<string>();
  return candidatos.filter((r) => {
    if (vistos.has(r.intento.id)) return false;
    vistos.add(r.intento.id);
    return true;
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Los escenarios
// ═════════════════════════════════════════════════════════════════════════════

/** 2 km de remo: un solo esfuerzo, el tiempo manda, el split es lo que se lee. */
const REMO_2K: TestComparado = {
  id: 'remo-2k',
  nombre: 'Remo 2 km',
  modalidad: 'ergo',
  protocolo: '2000 m a tope · un solo esfuerzo',
  unidad: 'segundos',
  agregacion: 'unico',
  calibra: 'tus zonas de remo',
  umbralUnidad: 'por500m',
  ritmo: (s) => s / 4,
  zonas: ZONAS_500M,
  intentos: [
    { id: 'feb', fecha: '5 FEB', cuando: 'hace 6 meses', valor: 492.4, tramos: [], fcMedia: 171, fcMax: 181, umbral: 128.1 },
    { id: 'may', fecha: '6 MAY', cuando: 'hace 3 meses', valor: 478.6, tramos: [], fcMedia: 174, fcMax: 184, umbral: 124.7 },
    { id: 'jun', fecha: '12 JUN', cuando: 'hace 7 semanas', valor: 469.0, tramos: [], fcMedia: 175, fcMax: 185, umbral: 122.3 },
    { id: 'jul', fecha: '30 JUL', cuando: 'hoy', valor: 461.2, tramos: [], fcMedia: 176, fcMax: 186, umbral: 120.3 },
  ],
};

/** 2 × 2′: el test que el coach quiere y que hoy el sistema no sabe montar.
 *  Tiempo FIJO, así que lo que se mide son METROS — más es mejor — y hacen falta
 *  dos cosas que hoy no existen: tramos declarados y una agregación. */
const DOS_POR_DOS: TestComparado = {
  id: 'dos-por-dos',
  nombre: 'Remo 2 × 2′',
  modalidad: 'ergo',
  protocolo: '2 × 2 min a tope · 3 min suave entre medias',
  unidad: 'metros',
  agregacion: 'media',
  calibra: 'tus zonas de remo',
  umbralUnidad: 'por500m',
  // Metros en 120 s → segundos por 500 m.
  ritmo: (m) => 60000 / m,
  zonas: ZONAS_500M,
  intentos: [
    {
      id: 'may',
      fecha: '6 MAY',
      cuando: 'hace 3 meses',
      valor: 571,
      tramos: [
        { etiqueta: '1er tramo', valor: 578, fc: 179 },
        { etiqueta: '2º tramo', valor: 564, fc: 182 },
      ],
      fcMedia: 180,
      fcMax: 184,
      umbral: 126.0,
    },
    {
      id: 'jul',
      fecha: '30 JUL',
      cuando: 'hoy',
      valor: 606.5,
      tramos: [
        { etiqueta: '1er tramo', valor: 612, fc: 181 },
        { etiqueta: '2º tramo', valor: 601, fc: 184 },
      ],
      fcMedia: 182,
      fcMax: 186,
      umbral: 120.8,
    },
  ],
};

/** El mismo tiempo con nueve pulsaciones menos. Hoy la app lo pinta como −0,4 s
 *  —es decir, como nada— cuando es la mejora más limpia de las tres. */
const MISMO_TIEMPO: TestComparado = {
  id: 'mismo-tiempo',
  nombre: 'Ski 1 km',
  modalidad: 'ergo',
  protocolo: '1000 m a tope · un solo esfuerzo',
  unidad: 'segundos',
  agregacion: 'unico',
  calibra: 'tus zonas de ski',
  umbralUnidad: 'por500m',
  ritmo: (s) => s / 2,
  zonas: ZONAS_500M,
  intentos: [
    { id: 'may', fecha: '20 MAY', cuando: 'hace 3 meses', valor: 222.4, tramos: [], fcMedia: 177, fcMax: 186, umbral: 116.2 },
    { id: 'jul', fecha: '30 JUL', cuando: 'hoy', valor: 222.0, tramos: [], fcMedia: 168, fcMax: 179, umbral: 116.0 },
  ],
};

/** Correr: la mitad de HYROX. El mismo lenguaje, en /km. */
const CARRERA_5K: TestComparado = {
  id: 'carrera-5k',
  nombre: 'Carrera 5K',
  modalidad: 'run',
  protocolo: '5 km a fondo · un solo esfuerzo',
  unidad: 'segundos',
  agregacion: 'unico',
  calibra: 'tus zonas de correr',
  umbralUnidad: 'porKm',
  ritmo: (s) => s / 5,
  zonas: ZONAS_KM,
  intentos: [
    { id: 'may', fecha: '6 MAY', cuando: 'hace 3 meses', valor: 1438.0, tramos: [], fcMedia: 178, fcMax: 191, umbral: 287.6 },
    { id: 'jul', fecha: '30 JUL', cuando: 'hoy', valor: 1369.4, tramos: [], fcMedia: 176, fcMax: 190, umbral: 273.9 },
  ],
};

/** La primera vez: no hay contra qué, y eso se dice. */
const PRIMERA: TestComparado = {
  id: 'primera',
  nombre: 'Remo 2 km',
  modalidad: 'ergo',
  protocolo: '2000 m a tope · un solo esfuerzo',
  unidad: 'segundos',
  agregacion: 'unico',
  calibra: 'tus zonas de remo',
  umbralUnidad: 'por500m',
  ritmo: (s) => s / 4,
  zonas: ZONAS_500M,
  intentos: [
    { id: 'feb', fecha: '5 FEB', cuando: 'hoy', valor: 492.4, tramos: [], fcMedia: 171, fcMax: 181, umbral: 128.1 },
  ],
};

/** Un intento viejo sin reloj: el pulso de entonces no existe y no se rellena. */
const SIN_PULSO: TestComparado = {
  ...REMO_2K,
  id: 'sin-pulso',
  intentos: [
    { id: 'may', fecha: '6 MAY', cuando: 'hace 3 meses', valor: 478.6, tramos: [], fcMedia: null, fcMax: null, umbral: 124.7 },
    { id: 'jul', fecha: '30 JUL', cuando: 'hoy', valor: 461.2, tramos: [], fcMedia: 176, fcMax: 186, umbral: 120.3 },
  ],
};

export const TESTS: Record<string, TestComparado> = {
  'dos-por-dos': DOS_POR_DOS,
  'remo-2k': REMO_2K,
  'carrera-5k': CARRERA_5K,
  'mismo-tiempo': MISMO_TIEMPO,
  primera: PRIMERA,
  'sin-pulso': SIN_PULSO,
};
