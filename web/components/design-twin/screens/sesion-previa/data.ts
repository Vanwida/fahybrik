// La ficha de la sesión — lo que hace falta ADEMÁS de la prescripción.
//
// `datos-reales.ts` trae lo que la base guarda hoy: qué se hace y cuánto. Esta
// pantalla necesita tres cosas más para que el atleta entienda la sesión antes
// de empezarla, y ninguna existe todavía en el modelo:
//
//   1. el PORQUÉ del coach (una línea suya en la plantilla),
//   2. el VÍDEO de cada ejercicio y sus claves técnicas,
//   3. el MATERIAL, que es un atributo del EJERCICIO igual que la modalidad
//      (ver «Modality intrinsic to exercise», migración 0053) y que hoy no está
//      en `exercises`.
//
// Los tres son CONTENIDO (lo escribe el coach, se guarda una vez y no cambia
// con el atleta), no medidas. Por eso pueden vivir aquí sin romper el §7: lo
// que jamás se inventa es un dato DEL ATLETA. Todo lo que esta pantalla dice
// sobre lo que el atleta hizo sale de `MEDIDO_*`, y lo que no está medido se
// pinta como lo que es: un hueco.

import {
  BACK_SQUAT,
  CIRCUITO_PIERNA,
  FARTLEK_16X500,
  HYROX,
  MEDIDO_CIRCUITO,
  MEDIDO_SQUAT,
  type ItemReal,
} from '../../datos-reales';

// ---------------------------------------------------------------------------
// El frame de vídeo — qué se dibuja para cada ejercicio
// ---------------------------------------------------------------------------

/**
 * El gesto que se dibuja en la miniatura. No es decoración: un `Air Squat` con
 * una barra encima sería una instrucción equivocada, así que el peso corporal
 * y la barra son poses distintas, y empujar el trineo no se dibuja igual que
 * arrastrarlo.
 */
export type Pose =
  | 'correr'
  | 'remo'
  | 'ski'
  | 'bici'
  | 'trineo'
  | 'trineo-cuerda'
  | 'burpee'
  | 'carga'
  | 'zancada'
  | 'lanzamiento'
  | 'sentadilla'
  | 'sentadilla-libre'
  | 'balanceo'
  | 'suelo-rotacion'
  | 'rodillo'
  | 'respiracion'
  | 'generico';

export interface FichaEjercicio {
  pose: Pose;
  /** Duración del clip, en segundos. Metadato del vídeo, no del atleta. */
  videoS: number;
  /** Lo que hay que tener a mano, en palabras de box. Vacío = nada. */
  material: string[];
  /** Las dos o tres cosas que el coach repite. Vacío = aún no las ha escrito. */
  claves: string[];
}

const GENERICO: FichaEjercicio = { pose: 'generico', videoS: 0, material: [], claves: [] };

/**
 * Clave = `exercises.name` TAL CUAL (en inglés, como está guardado). No se
 * traduce aquí por lo mismo que explica `datos-reales.ts`: el hueco es del
 * modelo y taparlo en el mockup lo escondería de quien decide arreglarlo.
 */
export const EJERCICIOS: Record<string, FichaEjercicio> = {
  Run: {
    pose: 'correr',
    videoS: 24,
    material: [],
    claves: [
      'Zancada corta y rápida al salir de la estación, que las piernas vienen cargadas.',
      'El primer kilómetro se corre por sensación, no mirando el reloj.',
    ],
  },
  Rowing: {
    pose: 'remo',
    videoS: 36,
    material: ['remo'],
    claves: [
      'Empuja con las piernas primero; los brazos son lo último que tira.',
      'Vuelve despacio hacia delante: la recuperación dura el doble que el tirón.',
      'Ronda las 24 remadas por minuto y deja que el ritmo lo ponga la pierna.',
    ],
  },
  SkiErg: {
    pose: 'ski',
    videoS: 32,
    material: ['ski'],
    claves: [
      'Todo sale de la cadera: cierra el abdomen y baja, no tires solo con los brazos.',
      'Termina el gesto por debajo de la cadera antes de volver arriba.',
    ],
  },
  BikeErg: {
    pose: 'bici',
    videoS: 20,
    material: ['bici'],
    claves: [
      'Sentado y con los hombros sueltos.',
      'Sube la cadencia poco a poco y deja la resistencia baja.',
    ],
  },
  'Sled Push': {
    pose: 'trineo',
    videoS: 28,
    material: ['trineo'],
    claves: [
      'Brazos estirados y cuerpo inclinado, como si empujaras una pared.',
      'Pasos cortos y seguidos: si te paras, arrancar otra vez cuesta el doble.',
    ],
  },
  'Sled Pull': {
    pose: 'trineo-cuerda',
    videoS: 30,
    material: ['trineo', 'cuerda'],
    claves: [
      'Baja la cadera y tira con las piernas, nunca con la espalda.',
      'Recoge la cuerda mano sobre mano sin dejar que pierda tensión.',
    ],
  },
  'Sled drag (backwards)': {
    pose: 'trineo-cuerda',
    videoS: 26,
    material: ['trineo'],
    claves: [
      'Hacia atrás, con el pecho alto y las rodillas blandas.',
      'Mira por encima del hombro cada pocos pasos.',
    ],
  },
  'Burpee Broad Jump': {
    pose: 'burpee',
    videoS: 26,
    material: [],
    claves: [
      'Pecho al suelo y salta lejos, no alto.',
      'Cae con las rodillas blandas y encadena la siguiente sin pararte.',
    ],
  },
  'Farmers Carry': {
    pose: 'carga',
    videoS: 22,
    material: ['kettlebells'],
    claves: [
      'Hombros atrás y abdomen apretado; no dejes que el peso te hunda.',
      'Paso corto y rápido, y si sueltas, sueltas las dos a la vez.',
    ],
  },
  'Sandbag Lunges': {
    pose: 'zancada',
    videoS: 30,
    material: ['saco'],
    claves: [
      'El saco alto en la espalda, sujeto con los dos brazos.',
      'Rodilla al suelo suave y empuja con el talón de delante.',
    ],
  },
  'Wall Balls': {
    pose: 'lanzamiento',
    videoS: 28,
    material: ['balón', 'pared'],
    claves: [
      'Sentadilla completa y lanza aprovechando el impulso de las piernas.',
      'Recibe el balón con los brazos flexionados y baja otra vez sin parar.',
    ],
  },
  'Back Squat': {
    pose: 'sentadilla',
    videoS: 42,
    material: ['barra', 'discos', 'jaula'],
    claves: [
      'Barra bien apoyada en la espalda y aire dentro antes de bajar.',
      'Baja hasta que la cadera pase de la rodilla sin perder la curva de la espalda.',
      'Sube empujando el suelo con todo el pie, no solo con la punta.',
    ],
  },
  'Air Squat': {
    pose: 'sentadilla-libre',
    videoS: 18,
    material: [],
    claves: [
      'Peso repartido en todo el pie y rodillas hacia fuera.',
      'Baja del todo, que esto es para abrir cadera.',
    ],
  },
  'Reverse Lunge': {
    pose: 'zancada',
    videoS: 34,
    material: ['mancuernas o barra'],
    claves: [
      'Paso atrás largo y rodilla al suelo sin golpear.',
      'El peso se queda en la pierna de delante todo el rato.',
    ],
  },
  'Leg Swings': {
    pose: 'balanceo',
    videoS: 16,
    material: [],
    claves: [
      'Sujétate a algo y balancea suelto, sin forzar el final del recorrido.',
      'Primero adelante y atrás; después, cruzando por delante.',
    ],
  },
  'Thoracic Rotation': {
    pose: 'suelo-rotacion',
    videoS: 20,
    material: ['esterilla'],
    claves: [
      'Rodillas juntas y quietas: el que gira es el pecho.',
      'Acompaña cada giro soltando el aire.',
    ],
  },
  'Foam roll lower body': {
    pose: 'rodillo',
    videoS: 38,
    material: ['rodillo'],
    claves: [
      'Pasa despacio y párate donde moleste, respirando largo.',
      'Cuádriceps, isquios y gemelo, sin prisa.',
    ],
  },
  'Breathing Work': {
    pose: 'respiracion',
    videoS: 24,
    material: ['esterilla'],
    claves: [
      'Cuatro segundos de aire por la nariz, seis soltando por la boca.',
      'Sentado y con los hombros abajo, deja que baje el pulso.',
    ],
  },
};

export function fichaDe(nombre: string): FichaEjercicio {
  return Object.prototype.hasOwnProperty.call(EJERCICIOS, nombre) ? EJERCICIOS[nombre] : GENERICO;
}

/** El material de la sesión entera, sin repetir y en el orden en que aparece. */
export function materialDe(items: ItemReal[]): string[] {
  const visto = new Set<string>();
  for (const item of items) {
    for (const cosa of fichaDe(item.nombre).material) visto.add(cosa);
  }
  return [...visto];
}

// ---------------------------------------------------------------------------
// Lo que el coach pone en la plantilla
// ---------------------------------------------------------------------------

/**
 * PUESTA EN ESCENA — el único dato de este fichero que no sale de una fila.
 *
 * `datos-reales.ts` guarda la ejecución pero no su fecha, y una medida vieja
 * sin edad miente por omisión. La app lo lee de `workout_executions`; aquí se
 * fija a mano para que el guion sea reproducible. Es un CUÁNDO, nunca un
 * CUÁNTO: no hay ni una medida inventada en toda la pantalla.
 */
const HACE_DIAS = { squat: 6, circuito: 9 } as const;

export interface SesionMedida {
  duracionS: number;
  fcMediaPpm: number | null;
  haceDias: number;
}

export interface FichaSesion {
  /**
   * El porqué, en la voz del coach. Ausente cuando NO hay coach detrás: un
   * entreno libre se lo monta el atleta, y ponerle ahí una frase de Pablo sería
   * atribuirle algo que no ha dicho.
   */
  porque?: string;
  coach?: string;
  /** Minutos que el coach declara al montar la plantilla. Campo propuesto. */
  duracionMin?: number;
  /** Lo que tardaste la última vez que hiciste ESTA sesión (`MEDIDO_*`). */
  ultima?: SesionMedida;
}

export const FICHAS: Record<string, FichaSesion> = {
  [HYROX.procedencia]: {
    coach: 'Pablo',
    porque:
      'Hoy haces la carrera entera de una tirada. No salgas a tope: quiero verte salir de cada estación corriendo, no andando.',
    duracionMin: 75,
  },
  [CIRCUITO_PIERNA.procedencia]: {
    coach: 'Pablo',
    porque:
      'Piernas para el trineo. Ve pesado y con calma, que aquí no corre el reloj: lo que cuenta es empujar bien cada serie.',
    duracionMin: 55,
    ultima: {
      duracionS: MEDIDO_CIRCUITO.duracionS,
      fcMediaPpm: MEDIDO_CIRCUITO.fcMediaPpm,
      haceDias: HACE_DIAS.circuito,
    },
  },
  [BACK_SQUAT.procedencia]: {
    ultima: {
      duracionS: MEDIDO_SQUAT.duracionS,
      fcMediaPpm: MEDIDO_SQUAT.fcMediaPpm,
      haceDias: HACE_DIAS.squat,
    },
  },
  // El fartlek no trae ficha, y es un vacío DECIDIDO, no un olvido: el coach lo
  // dictó por el conector MCP y su `coach_note` llegó null, igual que la duración
  // y la última vez (nadie lo ha hecho todavía). Ponerle aquí una frase suya sería
  // atribuirle algo que no ha dicho.
  [FARTLEK_16X500.procedencia]: {},
};

export function fichaSesionDe(procedencia: string): FichaSesion {
  return Object.prototype.hasOwnProperty.call(FICHAS, procedencia) ? FICHAS[procedencia] : {};
}

// ---------------------------------------------------------------------------
// Tu última vez — SOLO lo que alguien midió
// ---------------------------------------------------------------------------

export interface UltimaVez {
  /** Lo que cumpliste, con la misma grafía que la prescripción. */
  resumen: string;
  duracionS: number;
  fcMediaPpm: number | null;
  haceDias: number;
  /**
   * Cuántas veces te hemos medido en este ejercicio. Con una sola no hay
   * récord que enseñar, y eso se dice en vez de inventarse un mejor registro.
   */
  medidas: number;
}

/**
 * Un ejercicio entra aquí SOLO si hay una ejecución suya en la base. Hoy es
 * uno: el `Back Squat` de la asignación 349, que es justo la de `BACK_SQUAT`.
 * Los demás no tienen medida, y la pantalla lo dice con todas las letras.
 */
export const ULTIMA_VEZ: Record<string, UltimaVez> = {
  'Back Squat': {
    resumen: '4×5 con 100 kg',
    duracionS: MEDIDO_SQUAT.duracionS,
    fcMediaPpm: MEDIDO_SQUAT.fcMediaPpm,
    haceDias: HACE_DIAS.squat,
    medidas: 1,
  },
};

export function ultimaVezDe(nombre: string): UltimaVez | null {
  return Object.prototype.hasOwnProperty.call(ULTIMA_VEZ, nombre) ? ULTIMA_VEZ[nombre] : null;
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

// AQUÍ VIVÍA `descansoTexto`, el «canónico prestado» que esta pantalla se escribió
// para el descanso por debajo del minuto. Ya no hace falta y encima mentía: decía
// «45 s» con espacio donde la app escribe «45s». La variante `subMinuto` es ahora
// un parámetro de `reloj()` en `datos-reales.ts`, igual que en `Formato.clock`, así
// que el descanso se escribe con `reloj(s, 'segundos')` y hay UNA grafía (§2).

/**
 * «1 movimiento» / «23 movimientos». El singular también es un caso: la sesión
 * de un solo ítem es la NORMA (9 de las 11 asignaciones del atleta 64), así que
 * el plural pegado a un 1 se ve todos los días.
 */
export function palabraMovimientos(cuantos: number): string {
  return cuantos === 1 ? 'movimiento' : 'movimientos';
}
