// LA GRAMÁTICA DE BOTONES — §5 del modelo, como DATO. PURO.
//
// Un reloj de cinco botones (H6): START/STOP = enter, BACK/LAP = esc (UNA
// tecla), UP = página anterior, DOWN = página siguiente, UP largo = menú, y
// LIGHT, que es del sistema. `MANDOS` es la tabla de §5 fila a fila: para cada
// estado y cada botón, la acción (un id que la vista ejecuta), lo que dice §5
// (`dice`, normalizado: un test lo compara con el documento) y el rótulo de
// la tecla que se pinta junto al botón en los estados de reposo.
//
// Lo que la tabla hace cumplir, y por eso ninguna pantalla puede saltárselo:
//   · una pulsación = una acción (G4); la carcasa ignora la tecla repetida;
//   · BACK en el vivo es la VUELTA, jamás cerrar la app grabando (H7);
//   · durante los 5 s de deshacer, UP deshace (y solo entonces);
//   · UP largo abre Controles; en pausa, Controles es BACK.
//
// Qué NO hacer: resolver una tecla en una pantalla con un `if` propio (se
// consulta `accionDe`); añadir un estado sin su fila en §5.

export type BotonGarmin = 'start' | 'back' | 'up' | 'down' | 'upLargo' | 'light';

/** Los cinco de la tabla de §5, en su orden de columnas. LIGHT es del sistema. */
export const BOTONES_TABLA = ['start', 'back', 'up', 'down', 'upLargo'] as const;

/** Nombre físico del botón, como lo lleva la carcasa grabado. */
export const NOMBRE_BOTON: Record<BotonGarmin, string> = {
  start: 'START/STOP',
  back: 'BACK/LAP',
  up: 'UP',
  down: 'DOWN',
  upLargo: 'UP (largo)',
  light: 'LIGHT',
};

export type EstadoMandos =
  | 'brief'
  | 'cuenta'
  | 'paso'
  | 'deshacer'
  | 'recupera'
  | 'fuerza'
  | 'anotar'
  | 'amrap'
  | 'pausa'
  | 'controles'
  | 'resumen';

/** El nombre de la fila en §5, literal: el test cruza la tabla con el documento por aquí. */
export const FILA_MODELO: Record<EstadoMandos, string> = {
  brief: 'Brief',
  cuenta: 'Cuenta atrás 3-2-1',
  paso: 'Paso en curso',
  deshacer: 'Durante los 5 s de deshacer',
  recupera: 'Recuperación / descanso',
  fuerza: 'Serie de fuerza',
  anotar: 'Anotar la serie (en el descanso)',
  amrap: 'AMRAP / puntuación',
  pausa: 'Pausa',
  controles: 'Controles',
  resumen: 'RPE / Resumen',
};

/**
 * Estados de REPOSO: el atleta mira el reloj con calma, así que junto a cada
 * botón se pinta su rótulo. En el vivo, no: estorba y nadie lo lee corriendo.
 */
export const REPOSO: ReadonlySet<EstadoMandos> = new Set(['brief', 'pausa', 'controles', 'resumen']);

export type IdAccion =
  | 'empezar'
  | 'salir'
  | 'sesion-anterior'
  | 'sesion-siguiente'
  | 'ajustes'
  | 'cancelar'
  | 'pausa'
  | 'siguiente-paso'
  | 'pagina-anterior'
  | 'pagina-siguiente'
  | 'controles'
  | 'deshacer'
  | 'empezar-ya'
  | 'serie-hecha'
  | 'confirmar-campo'
  | 'campo-anterior'
  | 'valor-mas'
  | 'valor-menos'
  | 'ronda-hecha'
  | 'reps-mas'
  | 'reps-menos'
  | 'reanudar'
  | 'elegir'
  | 'cerrar'
  | 'anterior'
  | 'siguiente'
  | 'confirmar'
  | 'atras'
  | 'luz';

export interface Mando {
  accion: IdAccion;
  /** Lo que dice §5 en esa celda (sin negritas ni paréntesis). */
  dice: string;
  /** El rótulo junto al botón (solo en reposo). */
  rotulo: string;
}

type Fila = Record<(typeof BOTONES_TABLA)[number], Mando | null>;

const m = (accion: IdAccion, dice: string, rotulo: string): Mando => ({ accion, dice, rotulo });

const PAG_ANT = m('pagina-anterior', 'página anterior', 'Página');
const PAG_SIG = m('pagina-siguiente', 'página siguiente', 'Página');
const PAUSA = m('pausa', 'Pausa', 'Pausa');
const CONTROLES = m('controles', 'Controles', 'Controles');

/** LA TABLA DE §5. Una fila por estado; `null` = «—» (el botón no hace nada ahí). */
export const MANDOS: Record<EstadoMandos, Fila> = {
  brief: {
    start: m('empezar', 'Empezar', 'Empezar'),
    back: m('salir', 'Atrás', 'Salir'),
    up: m('sesion-anterior', 'sesión anterior del día', 'Anterior'),
    down: m('sesion-siguiente', 'sesión siguiente', 'Siguiente'),
    upLargo: m('ajustes', 'Ajustes', 'Ajustes'),
  },
  cuenta: { start: m('cancelar', 'Cancelar', 'Cancelar'), back: m('cancelar', 'Cancelar', 'Cancelar'), up: null, down: null, upLargo: null },
  paso: { start: PAUSA, back: m('siguiente-paso', 'Siguiente paso + 5 s de deshacer', 'Paso'), up: PAG_ANT, down: PAG_SIG, upLargo: CONTROLES },
  deshacer: { start: PAUSA, back: m('siguiente-paso', 'siguiente paso otra vez', 'Paso'), up: m('deshacer', 'Deshacer', 'Deshacer'), down: PAG_SIG, upLargo: CONTROLES },
  recupera: { start: PAUSA, back: m('empezar-ya', 'Empezar ya', 'Empezar ya'), up: PAG_ANT, down: PAG_SIG, upLargo: CONTROLES },
  fuerza: { start: PAUSA, back: m('serie-hecha', 'Serie hecha', 'Serie hecha'), up: PAG_ANT, down: PAG_SIG, upLargo: CONTROLES },
  anotar: {
    start: m('confirmar-campo', 'confirmar campo', 'Confirmar'),
    back: m('campo-anterior', 'campo anterior', 'Anterior'),
    up: m('valor-mas', 'valor +', '+'),
    down: m('valor-menos', 'valor −', '−'),
    upLargo: null,
  },
  amrap: {
    start: PAUSA,
    back: m('ronda-hecha', 'Ronda hecha', 'Ronda hecha'),
    up: m('reps-mas', 'reps +1', '+1'),
    down: m('reps-menos', 'reps −1', '−1'),
    upLargo: CONTROLES,
  },
  pausa: { start: m('reanudar', 'Reanudar', 'Reanudar'), back: CONTROLES, up: null, down: null, upLargo: null },
  controles: {
    start: m('elegir', 'elegir', 'Elegir'),
    back: m('cerrar', 'cerrar', 'Cerrar'),
    up: m('anterior', 'anterior', 'Anterior'),
    down: m('siguiente', 'siguiente', 'Siguiente'),
    upLargo: null,
  },
  resumen: {
    start: m('confirmar', 'confirmar / siguiente', 'Confirmar'),
    back: m('atras', 'atrás', 'Atrás'),
    up: m('valor-mas', 'valor +', '+'),
    down: m('valor-menos', 'valor −', '−'),
    upLargo: null,
  },
};

/** LIGHT no está en §5: es la luz del reloj, del sistema, en todo estado. */
export const LUZ: Mando = m('luz', 'luz de fondo (del sistema)', 'Luz');

/** Lo que hace un botón en un estado (`null` = nada). */
export function accionDe(estado: EstadoMandos, boton: BotonGarmin): Mando | null {
  if (boton === 'light') return LUZ;
  return MANDOS[estado][boton];
}

// ---------------------------------------------------------------------------
// El teclado del doble
// ---------------------------------------------------------------------------

/** Cuánto hay que mantener UP para que sea «UP largo» (el menú de Garmin). */
export const PULSACION_LARGA_MS = 1000;

/** La tecla del doble para cada botón (lo que dice el rótulo de pista). */
export const TECLA: Record<BotonGarmin, string> = {
  start: 'Enter',
  back: '⌫ / Esc',
  up: '↑',
  down: '↓',
  upLargo: '⇧↑',
  light: 'L',
};

/** La tecla pulsada, a botón. `null` = no es del reloj (se deja pasar). */
export function botonDeTecla(e: { key: string; shiftKey: boolean }): BotonGarmin | null {
  switch (e.key) {
    case 'Enter':
      return 'start';
    case 'Backspace':
    case 'Escape':
      return 'back';
    case 'ArrowUp':
      return e.shiftKey ? 'upLargo' : 'up';
    case 'ArrowDown':
      return 'down';
    case 'l':
    case 'L':
      return 'light';
    default:
      return null;
  }
}
