// LA FICHA DE LA SESIÓN — el contrato de lo que se LEE antes de empezar.
//
// Las dos propuestas (`ficha-guion`, `ficha-ruta`) pintan EXACTAMENTE esta lectura:
// lo que cambia entre ellas es la organización, no el dato. Es la misma separación
// que ya tiene Swift (`LecturaSesionPrevia`: la lectura decide qué se enseña y la
// vista pinta) y la que tiene el resto del doble (`kit-plan/contrato`, `kit-hoy`).
//
// QUÉ PREGUNTAS RESPONDE (el orden es el de la pantalla, porque es el orden en que
// se hacen):
//   1. ¿Qué es y cuánto me va a llevar?      → título, cuándo, duración (o por qué no hay)
//   2. ¿Qué quiere mi coach?                  → su nota, con firma
//   3. ¿Qué tengo que hacer, y en qué orden?  → bloques con su formato
//   4. ¿Qué hago exactamente en cada cosa?    → movimiento · dosis · contra qué · descanso
//   5. ¿Qué preparo?                          → material
//   6. ¿Y ahora?                              → empezar
//
// LO QUE NO SE INVENTA (CONTRATO-UI §7, «"No se sabe" es un valor de primera clase»):
//   · la duración: el servidor dejó de estimarla el 29-jul; o la escribe el coach o
//     no hay número y se dice POR QUÉ (`DuracionDeSesion`);
//   · una dosis que el coach no escribió: `dosis: null` se pinta como el nombre solo;
//   · un vídeo que no existe: sin vídeo no hay miniatura de gesto.

import type { Modalidad } from '../datos-reales';

export type { Modalidad };

/** Zona de frecuencia cardiaca 1–5 (`HRZone`). */
export type Zona = 1 | 2 | 3 | 4 | 5;

/** Una serie escrita una a una: solo cuando NO son todas iguales (rampa, pirámide). */
export interface SerieEscrita {
  /** «5 reps», «30 s». */
  trabajo: string;
  carga?: string;
  /** Descanso DESPUÉS de esta serie, ya escrito («2:30»). */
  descanso?: string;
}

/**
 * La forma de una carrera o un ergo por tramos (`RunStructure`): «repite N veces
 * esto». Aplanarla a «500 m · descanso 1:00» pierde el ×16 y llama «descanso» a un
 * minuto que se corre al trote.
 */
export interface PerfilTramos {
  repeticiones: number;
  trabajo: {
    /** «500 m», «800 m», «3:00». */
    medida: string;
    zona?: Zona;
    /** Cualquier otro objetivo ya escrito: «@ 4:10/km», «@ 1:50/500m». */
    objetivo?: string;
  };
  recuperacion?: {
    /** La frase entera, como la dice el entreno en vivo: «recuperación 1:00 suave en Z2», «descanso 2:00». */
    frase: string;
    zona?: Zona;
    /** Un recuperador que se TROTA no se dibuja como un descanso. */
    activa: boolean;
  };
}

/** Lo que le toca a cada uno cuando se entrena en pareja (Dobles). */
export interface Reparto {
  /** Tu parte, en la misma unidad que la dosis total. */
  tuParte: string;
  /** Cuánto es el total de la estación. */
  total: string;
}

export interface Movimiento {
  id: string;
  /** `exercises.name` tal cual está guardado (en inglés): el hueco de traducción es del modelo, no se tapa. */
  nombre: string;
  modalidad: Modalidad;
  /**
   * La dosis escrita («4 × 5», «45:00», «500 m», «100 reps»). `null` = el coach no la
   * escribió: se pinta el nombre solo, jamás un «— reps» ni un 0.
   */
  dosis: string | null;
  /** Contra qué: kilos, ritmo, RPE, %RM («100 kg», «@ 4:35/km», «RPE 8», «70 % RM»). */
  objetivo?: string;
  zona?: Zona;
  /** Series una a una, solo cuando difieren (la dosis resume: «5 × 5»). */
  series?: SerieEscrita[];
  /** Descanso entre series cuando es el mismo en todas («1:30»). */
  descanso?: string;
  tempo?: string;
  /** Lo que el coach escribió PARA ESTE movimiento. */
  nota?: string;
  /** El %RM resuelto a kilos con TU 1RM («Según tu 1RM»). Solo si el servidor lo resolvió. */
  segunTuRm?: { kg: string };
  perfil?: PerfilTramos;
  reparto?: Reparto;
  /** Su papel dentro del bloque: «A1», «A2», «Min. impar». */
  rol?: string;
  /**
   * Lo que hay que tener a mano. Es un atributo del EJERCICIO (como la modalidad,
   * migración 0053), no de la sesión: ausente = se lee del catálogo de ejercicios.
   */
  material?: string[];
}

export type FormatoBloque =
  /** Fuerza y accesorios: cada movimiento con sus series. */
  | { tipo: 'series' }
  | { tipo: 'superserie'; rondas: number; descanso?: string }
  /** `alterna`: cada movimiento ocupa un minuto distinto (impar / par). */
  | { tipo: 'emom'; minutos: number; alterna: boolean }
  | { tipo: 'amrap'; minutos: number }
  | { tipo: 'fortime'; rondas?: number; topeMin?: number }
  /** Carrera o ergo por tramos: el perfil manda. */
  | { tipo: 'intervalos' }
  /** Rodaje, tirada, ergo continuo. */
  | { tipo: 'continuo' }
  /** Simulación tipo HYROX: N estaciones, cada una precedida de la misma carrera. */
  | { tipo: 'estaciones'; carrera: string }
  /** Calentamiento y vuelta a la calma: se leen de una vez, no ítem a ítem. */
  | { tipo: 'marco' };

export type RolDeBloque = 'calentamiento' | 'principal' | 'vuelta';

export interface Bloque {
  id: string;
  titulo: string;
  rol: RolDeBloque;
  formato: FormatoBloque;
  /** Solo si se SABE (lo escribe el coach o lo dicta el formato: un AMRAP de 12 son 12). */
  minutos?: number;
  /** La nota del coach para este bloque. */
  nota?: string;
  movimientos: Movimiento[];
}

/** Por qué no hay duración (`DuracionDesconocida.frase`, espejo literal). */
export type RazonSinDuracion = 'Dura lo que tardes' | 'Hasta donde aguantes' | 'Según tu ritmo y tus descansos' | 'Sin detallar';

export interface UltimaVez {
  /** «9:32 · 95 ppm». Solo lo que alguien midió. */
  resumen: string;
  /** «hace 6 días». */
  cuando: string;
}

export interface LecturaFicha {
  titulo: string;
  origen: 'coach' | 'libre';
  /** «Hoy», «Mañana», «Jueves». */
  cuando: string;
  coach?: string;
  /** Minutos que ESCRIBIÓ el coach. Ausente → `sinDuracion` dice por qué. */
  minutos?: number;
  sinDuracion?: RazonSinDuracion;
  /** El porqué, en la voz del coach. Ausente cuando no hay coach detrás (un libre no lleva frase de nadie). */
  nota?: string;
  /** Es una prueba: se mide, no tiene camino a mano. */
  prueba?: boolean;
  /** Entrenas en pareja: con quién. */
  conPareja?: string;
  ultima?: UltimaVez;
  /** Vacío = «sin detalle»: se dice, no se inventa una sesión. */
  bloques: Bloque[];
}

/** Un escenario del doble: una lectura y lo que hay que mirar en ella. */
export interface CasoFicha {
  id: string;
  titulo: string;
  mira: string;
  /** De la base de producción (con su procedencia) o caso de diseño para romper el modelo. */
  origen: 'real' | 'diseño';
  lectura: LecturaFicha;
}
