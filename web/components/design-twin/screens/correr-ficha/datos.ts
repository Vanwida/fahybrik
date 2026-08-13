// LA FICHA DE UNA CARRERA — los cuatro escenarios que prueban el nivel 2 del
// mapa (docs/analiticas-running-mapa.md): la MISMA lectura de `lectura-carrera`
// pero alcanzada días después desde el historial, con lo que esa vista no tiene
// — comparativa contra tu última sesión similar e historial del mismo entreno.
//
// NO SE DUPLICA EL MODELO. El sujeto (veredicto vs lectura honesta), la curva,
// el troceado y el mapa son `lecturaDeCorrer` + las piezas de `lectura-carrera`,
// tal cual — esta pantalla no inventa una segunda lectura de lo mismo. Lo que
// SÍ es nuevo de esta ficha (`tipo` para la cabecera, comparativa, historial del
// mismo entreno, récord, procedencia externa y los derivados que aquí no
// existían) vive en `Ficha`, que ENVUELVE una `Carrera` sin tocarla.
//
// PROCEDENCIA: señal ilustrativa, igual que en `lectura-carrera` — ninguna
// ejecución real tiene aún traza de correr. El escenario ① reutiliza LITERALMENTE
// el 6×800 que Alex ya aprobó en esa pantalla («series-veredicto»): es la misma
// sesión, vista más tarde desde el historial en vez de al terminar — que es
// justo el argumento de esta ficha.

import { ESCENAS as ESCENAS_LECTURA } from '../lectura-carrera/datos';
import type { Carrera } from '../lectura-carrera/modelo';
import type { Derivada } from '../lectura-carrera/piezas';
import { generar, suelto, type Paso } from '../lectura-carrera/senal';

// ---------------------------------------------------------------------------
// Lo nuevo de esta ficha — nunca duplica lo que ya vive en `Carrera`/`Lectura`
// ---------------------------------------------------------------------------

/** La clasificación «por tipo de entreno» del NIVEL 1 del mapa. Va en la
 *  cabecera; la SUPERFICIE (calle/cinta) es un eje aparte y no se mezcla aquí. */
export type TipoEntreno = 'Series' | 'Rodaje' | 'Cuestas';

export interface FilaHistorialEntreno {
  fecha: string;
  ritmoMedioSkm: number;
  /** Nulo = ese día no hubo banda que juzgar (p. ej. un rodaje libre). */
  pctBanda: number | null;
}

export interface Comparativa {
  /** «tu último 6×800» · «tu último rodaje similar». */
  etiqueta: string;
  /** s/km: negativo = hoy más rápido. Nulo si no hay sesión contra la que medir. */
  deltaRitmoSkm: number | null;
  /** ppm al mismo ritmo pedido: negativo = hoy te costó menos. */
  deltaFcPpm: number | null;
  /** Puntos porcentuales dentro de banda: positivo = hoy mejor cumplimiento.
   *  Nulo cuando ninguna de las dos sesiones tuvo banda que juzgar. */
  deltaPctBanda: number | null;
  /** La frase de «qué cambió», generada por dato — nunca la escribe el atleta. */
  frase: string;
}

export interface Ficha {
  carrera: Carrera;
  tipo: TipoEntreno;
  /**
   * La fecha corta de la cabecera («mar 11 ago»). Vive aparte de `carrera.cuando`
   * (que es prosa larga, «Martes 11 de agosto») porque el doble no tiene un
   * formateador de fecha compartido en web — se autora a mano, como el resto de
   * `cuando` en `lectura-carrera/datos.ts`.
   */
  fechaCorta: string;
  /** El entreno prescrito, para el subtítulo de la cabecera. Nulo = no hubo uno
   *  que nombrar (una salida libre no tiene nombre de entreno, solo fecha). */
  nombreEntreno: string | null;
  /** Solo cuando la sesión no se registró en la app: la línea fina de origen. */
  procedenciaExterna?: string;
  /** «Mejor 5 km» — nulo si esta sesión no batió nada. */
  record?: string | null;
  comparativa?: Comparativa | null;
  historial?: { titulo: string; filas: FilaHistorialEntreno[] } | null;
  /** Derivados que `derivadasDe` (lectura-carrera) no conoce: cadencia,
   *  inclinación… solo cuando la fuente de esta sesión concreta los trae. */
  derivadosExtra?: Derivada[];
}

// ---------------------------------------------------------------------------
// ① SERIE PRESCRITA — el 6×800 que Alex ya aprobó, alcanzado desde el historial
// ---------------------------------------------------------------------------

const SERIE_BASE = ESCENAS_LECTURA['series-veredicto'];

const SERIE_HOY: Carrera = {
  ...SERIE_BASE,
  // Al terminar decía «Hoy»; once días después, desde el historial, lleva su
  // fecha real — es la misma sesión, no una nueva.
  cuando: 'Martes 11 de agosto',
  momento: 'revision',
};

const SERIE_FICHA: Ficha = {
  carrera: SERIE_HOY,
  tipo: 'Series',
  fechaCorta: 'mar 11 ago',
  nombreEntreno: SERIE_HOY.titulo,
  comparativa: {
    etiqueta: 'tu último 6×800',
    // Hoy: 5 de 6 dentro (83%), media ≈ 213 s/km. Hace dos semanas: 3 de 6 (50%),
    // 216 s/km — los mismos números que enseña la fila «28 jul» del historial.
    deltaRitmoSkm: -3,
    deltaFcPpm: -4,
    deltaPctBanda: 33,
    frase: 'Las dos últimas repeticiones aguantaron: hace dos semanas se te caían a partir de la cuarta.',
  },
  historial: {
    titulo: 'Todos tus 6×800',
    filas: [
      { fecha: '28 jul', ritmoMedioSkm: 216, pctBanda: 50 },
      { fecha: '14 jul', ritmoMedioSkm: 219, pctBanda: 33 },
      { fecha: '30 jun', ritmoMedioSkm: 222, pctBanda: 17 },
    ],
  },
};

// ---------------------------------------------------------------------------
// ② RODAJE LIBRE — sin prescripción, con GPS, con su propio récord de tramo
// ---------------------------------------------------------------------------

const RODAJE_BASE = ESCENAS_LECTURA['libre'];

const RODAJE_HOY: Carrera = {
  ...RODAJE_BASE,
  cuando: 'Viernes 7 de agosto',
  momento: 'revision',
};

const RODAJE_FICHA: Ficha = {
  carrera: RODAJE_HOY,
  tipo: 'Rodaje',
  fechaCorta: 'vie 7 ago',
  // Salida sin prescripción: no hay un nombre de entreno que dar, solo la fecha.
  nombreEntreno: null,
  record: 'Mejor 5 km',
  comparativa: {
    etiqueta: 'tu último rodaje similar',
    deltaRitmoSkm: -4,
    deltaFcPpm: -2,
    // Ninguno de los dos rodajes llevaba banda: no hay cumplimiento que comparar.
    deltaPctBanda: null,
    frase: 'El mismo recorrido, 4 segundos más rápido por kilómetro y con menos pulso.',
  },
  historial: null,
};

// ---------------------------------------------------------------------------
// ③ IMPORTADA DE GARMIN — sin veredicto ni banda, con cadencia y su procedencia
// ---------------------------------------------------------------------------

function guionImportada(): Paso[] {
  return [
    suelto(600, 318, 132, 308),
    suelto(1500, 300, 142, 292),
    suelto(900, 294, 146, 288),
    suelto(600, 305, 138, 315),
  ];
}
const importada = generar(guionImportada(), 'calle');

const IMPORTADA_HOY: Carrera = {
  titulo: 'Rodaje',
  cuando: 'Domingo 26 de julio',
  momento: 'revision',
  prescrito: null,
  objetivo: { clase: 'ninguno' },
  superficie: 'calle',
  fcMediaPpm: importada.fcMediaPpm,
  fcMaxPpm: importada.fcMaxPpm,
  desnivelM: 52,
  traza: importada.traza,
  repeticiones: importada.repeticiones,
  certezaTramos: null,
  kilometros: importada.kilometros,
  zonasS: importada.zonasS,
  derivado: {},
  ruta: importada.ruta,
  distanciaM: importada.distanciaM,
  duracionS: importada.duracionS,
  procedencia:
    'Señal ilustrativa de un FIT importado: sin objetivo (el coach no lo prescribió en la app) y con cadencia, que solo trae el reloj.',
};

const IMPORTADA_FICHA: Ficha = {
  carrera: IMPORTADA_HOY,
  tipo: 'Rodaje',
  fechaCorta: 'dom 26 jul',
  // El reloj no trae un nombre de entreno, solo la actividad: nada que nombrar.
  nombreEntreno: null,
  procedenciaExterna: 'Del archivo de tu reloj',
  derivadosExtra: [{ etiqueta: 'Cadencia', valor: '169', pie: 'pasos/min' }],
};

// ---------------------------------------------------------------------------
// ④ CUESTAS EN CINTA — con inclinación, sin GPS y sin anunciar que falta mapa
// ---------------------------------------------------------------------------

/** 6 × 500 m al 6%, con una décima de fatiga al final: la primera a 254 s/km,
 *  la última a 258 — la misma caída que ya lee `lecturaDeCorrer` como sujeto. */
const CUESTA_CINTA_SKM = [254, 251, 249, 250, 253, 258];
function guionCuestaCinta(): Paso[] {
  const g: Paso[] = [suelto(420, 335, 122, 322)];
  CUESTA_CINTA_SKM.forEach((skm, i) => {
    g.push({ papel: 'trabajo', distanciaM: 500, skm, ppm: 156 + i * 3, pendientePct: 6 });
    if (i < CUESTA_CINTA_SKM.length - 1) {
      g.push({ papel: 'recuperacion', modo: 'andando', dur: 90, skm: 640, ppm: 126 });
    }
  });
  g.push(suelto(300, 330, 120));
  return g;
}
const cuestaCinta = generar(guionCuestaCinta(), 'cinta');

const CINTA_HOY: Carrera = {
  titulo: 'Cuestas en cinta',
  cuando: 'Jueves 30 de julio',
  momento: 'revision',
  prescrito: '6 × 500 m al 6% de inclinación · trote llano entre series',
  objetivo: { clase: 'sensacion' },
  superficie: 'cinta',
  fcMediaPpm: cuestaCinta.fcMediaPpm,
  fcMaxPpm: cuestaCinta.fcMaxPpm,
  // 6 reps × 500 m al 6% = 180 m de subida virtual: la cinta SÍ acumula desnivel
  // cuando hay inclinación declarada — a diferencia de la cinta plana, que no
  // tiene ninguno (`series-cinta` en lectura-carrera).
  desnivelM: 180,
  traza: cuestaCinta.traza,
  repeticiones: cuestaCinta.repeticiones,
  certezaTramos: 'marcados',
  kilometros: cuestaCinta.kilometros,
  zonasS: cuestaCinta.zonasS,
  derivado: { bajadaPulsoPpm: 30 },
  // Cinta: no hay ruta que dibujar, y no se declara — la regla del §6.2 bis es
  // que un hueco se dice solo cuando hay un acto que lo llena, y en cinta no lo hay.
  ruta: [],
  distanciaM: cuestaCinta.distanciaM,
  duracionS: cuestaCinta.duracionS,
  procedencia:
    'Señal ilustrativa al 6% de inclinación constante. Por encima del umbral del coach (3%), el troceado se lee en tiempo y no en ritmo — la misma regla que en calle.',
};

const CINTA_FICHA: Ficha = {
  carrera: CINTA_HOY,
  tipo: 'Cuestas',
  fechaCorta: 'jue 30 jul',
  nombreEntreno: CINTA_HOY.titulo,
  derivadosExtra: [{ etiqueta: 'Inclinación', valor: '6', pie: '% constante' }],
};

// ---------------------------------------------------------------------------

export const ESCENAS: Record<string, Ficha> = {
  'serie-prescrita': SERIE_FICHA,
  'rodaje-libre': RODAJE_FICHA,
  'importada-garmin': IMPORTADA_FICHA,
  cinta: CINTA_FICHA,
};
