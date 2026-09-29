// LAS FRASES DE «PLAN» — el copy de los estados y de los diálogos, en un solo
// sitio y probado (`tests/design-twin/plan-rehecho.test.ts`): español natural de
// gimnasio, tuteo, cero guiones largos, y ninguna frase que afirme lo que el coach
// hará o por qué pausó nada (DECISIONS 7-ago: «ninguno de los tres afirma qué hará
// el coach ni cuándo»).
//
// Lo que sale de un dato (el nombre del coach, una fecha) entra por parámetro: el
// nombre del coach es un DATO (HARD RULE Nº0), jamás una constante.

import { fechaConDia, fechaLarga } from './fechas';

const tuCoach = (coach: string | null) => coach ?? 'Tu coach';

export const TEXTOS = {
  pausa: {
    kicker: 'Plan en pausa',
    titulo: 'Tu plan está en pausa',
    apoyo: (coach: string | null) => `${tuCoach(coach)} ha pausado tu plan. Tu progreso está guardado y no pierdes nada.`,
    /** El código del motivo (`paused_reason`) NO sale al atleta: solo desde cuándo, si se sabe. */
    nota: (desde: string | null) => (desde ? `En pausa desde el ${fechaLarga(desde)}.` : 'Retomamos en cuanto estés listo.'),
  },
  error: {
    kicker: 'Tu plan',
    titulo: 'No pudimos cargar tu plan',
    apoyo: 'Revisa tu conexión e inténtalo de nuevo.',
  },
  empiezaDespues: {
    kicker: 'Tu plan',
    titulo: (inicio: string) => `Tu plan empieza el ${fechaConDia(inicio)}`,
    apoyo: 'Esta semana no tienes sesiones. Ya está todo montado y te espera.',
    nota: 'Aparecerá aquí el mismo día.',
  },
  preparando: {
    kicker: 'Tu plan',
    titulo: 'Tu plan se está preparando',
    apoyo: (coach: string | null) => `En cuanto ${coach ? coach : 'tu coach'} lo asigne lo verás aquí, día a día.`,
  },
  semanaFalla: {
    kicker: 'Esa semana',
    titulo: 'No pudimos cargar esa semana',
    apoyo: 'Revisa tu conexión e inténtalo de nuevo. Lo de esta semana sigue donde estaba.',
  },
  semanaVacia: {
    kicker: 'Esa semana',
    titulo: 'Esa semana aún no tiene sesiones',
    apoyo: 'En cuanto haya algo lo verás aquí.',
  },
  descanso: {
    kicker: 'Descanso',
    titulo: (esHoy: boolean) => (esHoy ? 'Hoy descansas' : 'Descanso'),
    apoyo: (esHoy: boolean) => (esHoy ? 'No hay nada en el plan para hoy.' : 'Nada en el plan para este día.'),
    semanaCerrada: 'La semana ya está cerrada.',
  },
  muro: {
    titulo: 'Límite de visibilidad',
    porDefecto: 'Tu entrenador ha limitado hasta dónde puedes ver el plan.',
    cerrar: 'Entendido',
  },
  conflicto: {
    titulo: 'Tienes un entreno en curso',
    mensaje: (titulo: string | null) => (titulo ? `${titulo} sigue abierto. ¿Qué quieres hacer?` : 'Hay un entreno activo. ¿Qué quieres hacer?'),
    seguir: 'Seguir',
    terminar: 'Terminar y empezar',
    cancelar: 'Cancelar',
  },
  deshacer: {
    titulo: '¿Deshacer este entreno?',
    mensaje: 'Se borrará lo que registraste y el entreno volverá a pendiente. Esto no se puede deshacer.',
    confirmar: 'Deshacer y borrar lo registrado',
    cancelar: 'Cancelar',
  },
  borrar: {
    titulo: '¿Borrar este entreno libre?',
    mensaje: 'Lo creaste tú: se borra el entreno y lo registrado. No volverá a aparecer.',
    confirmar: 'Borrar del todo',
    cancelar: 'Cancelar',
  },
  fallo: {
    marcar: 'No se pudo marcar como hecha. Inténtalo de nuevo.',
    mover: 'No se pudo mover la sesión. Inténtalo de nuevo.',
    deshacer: 'No se pudo deshacer la sesión. Inténtalo de nuevo.',
    borrar: 'No se pudo borrar el entreno. Inténtalo de nuevo.',
  },
  hecho: {
    marcada: 'Marcada como hecha.',
    movida: (dia: string) => `Movida a ${dia}.`,
    deshecha: 'Vuelve a estar pendiente.',
    borrada: 'Entreno borrado.',
  },
} as const;
