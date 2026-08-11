'use client';

// «vivo-clave» — el modelo del CONTENIDO explicativo de un tramo en vivo.
//
// EL HUECO, verificado en el Swift: `WorkoutSegment` (Workout/WorkoutModels.swift)
// lleva `videoUrl` y NADA MÁS de contenido. Ni consejos, ni descripción, ni la
// nota que el coach escribió hoy para esa línea. Todo eso SÍ viaja al móvil —
// `WorkoutItem` (Plan/AssignmentDetail.swift) tiene `cues`, `exerciseDescription`
// y `notes`, y `ExerciseDetailView` los pinta en tres secciones— pero se queda
// en la ficha del plan y no cruza al tramo que corre el entreno.
//
// Consecuencia en la pantalla: durante una serie lo único que el atleta puede
// pedir es un VÍDEO, y abrirlo pausa el cronómetro (ActiveWorkoutView.swift,
// `session.pauseForVideo()`). En mitad de una serie nadie para a ver un vídeo.
//
// EL MODELO. El contenido de un movimiento son cuatro cosas independientes y
// cualquiera puede faltar:
//
//   nota        → lo que el coach escribió para HOY en esta línea   (`notes`)
//   consejos    → la técnica del catálogo, igual todos los días     (`cues`)
//   descripción → el gesto explicado largo         (`exerciseDescription`)
//   vídeo       → la demostración                     (`exerciseVideoUrl`)
//
// De las cuatro, solo UNA puede leerse sin parar: la que cabe en una línea. Por
// eso la precedencia vive aquí, en una función, y no repartida por las vistas.

import { SQUAT, pulsoTras, type Prescripcion } from '../vivo-fuerza/data';

// ---------------------------------------------------------------------------
// El contenido y su precedencia
// ---------------------------------------------------------------------------

/** De dónde salió la clave. La ficha lo dice; la línea no lo necesita. */
export type OrigenClave = 'nota' | 'consejos';

/** Lo que la app sabe de este movimiento. Cualquier campo puede ser nulo. */
export interface Contenido {
  /** `WorkoutItem.notes` — lo que el coach escribió para HOY en esta línea. */
  nota: string | null;
  /** `WorkoutItem.cues` — la técnica del catálogo, la misma todos los días. */
  consejos: string | null;
  /** `WorkoutItem.exerciseDescription` — el gesto entero, para leer con calma. */
  descripcion: string | null;
  /** `WorkoutItem.exerciseVideoUrl` — hay vídeo, y abrirlo pausa el cronómetro. */
  video: boolean;
}

export interface Clave {
  texto: string;
  origen: OrigenClave;
}

/**
 * LA PRECEDENCIA, en un solo sitio.
 *
 * Lo que el coach escribió HOY gana a los consejos del catálogo: «hoy baja el
 * peso y cuida la espalda» es una instrucción para esta sesión y este atleta, y
 * «pecho alto» es verdad todos los días. Cuando las dos existen se pinta la
 * específica; la otra sigue entera en la ficha, que no la pierde.
 *
 * Sin ninguna de las dos devuelve nulo, y entonces NO hay línea (§7): un texto
 * de relleno o un «sin técnica disponible» ocuparían el mismo sitio sin decir
 * nada, y el atleta acabaría dejando de mirar ahí.
 *
 * Es MECANISMO, no método: el orden no depende de la escuela del coach, sino de
 * qué dato es más específico para el momento que el atleta tiene delante.
 */
export function claveDe(c: Contenido): Clave | null {
  if (c.nota) return { texto: c.nota, origen: 'nota' };
  if (c.consejos) return { texto: c.consejos, origen: 'consejos' };
  return null;
}

// ---------------------------------------------------------------------------
// El caso: el mismo Back Squat en las cuatro pantallas
// ---------------------------------------------------------------------------

/**
 * Los cuatro escenarios corren la MISMA serie (Back Squat 4×5 a 100 kg, serie 2
 * de 4, la prescripción de `vivo-fuerza`) y solo cambian el contenido. Así lo
 * único que se juzga es la línea: si además cambiara el movimiento, la carga o
 * la posición en el riel, no se sabría qué está moviendo la comparación.
 */
export const PRESCRIPCION: Prescripcion = SQUAT;

/** Serie 2 de 4: la 1 ya está registrada (misma foto que `vivo-fuerza`). */
export const SERIE_ACTIVA = 1;

/** El bloque al que pertenece el tramo (`WorkoutSegment.blockTitle`). */
export const BLOQUE = 'Fuerza';

/**
 * El pulso mientras trabajas, del reloj de la muñeca: el máximo medido de esta
 * misma asignación. Sobre el umbral cae en Z1 y el lienzo se tiñe de calma.
 */
export const PULSO_TRABAJANDO = pulsoTras(0);

/** El gesto entero. Es el mismo en los cuatro casos que lo tienen. */
const DESCRIPCION_SQUAT =
  'Barra alta, pies a la anchura de los hombros y punteras un poco abiertas. Baja controlando hasta pasar la paralela, aprieta el abdomen y sube empujando el suelo con todo el pie.';

/** La técnica del catálogo. Una línea, porque una línea es lo que cabe. */
const CONSEJOS_SQUAT = 'Pecho alto y rodillas fuera al subir.';

export interface Caso {
  contenido: Contenido;
  /** El guion abre la ficha solo: es lo que el escenario viene a enseñar. */
  abreFicha: boolean;
}

export const CASOS: Record<string, Caso> = {
  // (a) Los dos existen y solo se pinta la nota de hoy.
  'nota-de-hoy': {
    contenido: {
      nota: 'Hoy baja el peso y cuida la espalda.',
      consejos: CONSEJOS_SQUAT,
      descripcion: DESCRIPCION_SQUAT,
      video: true,
    },
    abreFicha: false,
  },
  // (b) Hoy el coach no escribió nada, así que habla el catálogo.
  'consejos-del-catalogo': {
    contenido: {
      nota: null,
      consejos: CONSEJOS_SQUAT,
      descripcion: DESCRIPCION_SQUAT,
      video: true,
    },
    abreFicha: false,
  },
  // (c) Ni nota ni consejos: no hay línea. El vídeo sigue donde estaba.
  'sin-clave': {
    contenido: { nota: null, consejos: null, descripcion: null, video: true },
    abreFicha: false,
  },
  // (d) Una nota larga de verdad: se corta a una línea y la ficha la sirve entera.
  'clave-larga': {
    contenido: {
      nota: 'Hoy baja el peso y cuida la espalda: calienta con la barra sola, aprieta el abdomen antes de bajar y corta la serie en cuanto pierdas la posición.',
      consejos: CONSEJOS_SQUAT,
      descripcion: DESCRIPCION_SQUAT,
      video: true,
    },
    abreFicha: true,
  },
};

/** Cuánto se ve la línea cortada antes de que el guion abra la ficha. */
export const RETARDO_FICHA_MS = 1700;
