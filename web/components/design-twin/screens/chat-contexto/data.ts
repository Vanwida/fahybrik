// Datos de la propuesta «chat contextual».
//
// NO son filas de producción: son casos de prueba plausibles montados para
// romper el diseño (dos sesiones el mismo día, una hecha y una pendiente, una
// semana con futuro, y un ejercicio DENTRO de un entreno). El hilo real de
// producción vive en `../chat-coach/data.ts` y esta pantalla reutiliza sus
// piezas para que la comparación no mida mi pulso.
//
// El «hoy» de estos datos es miércoles 12 de agosto de 2026.

import { CONVERSACION, type Mensaje, type RefContexto } from '../chat-coach/data';

export interface EntrenoElegible {
  ref: string;
  titulo: string;
  /** Cómo se lee la fecha desde hoy: «hoy», «ayer», «lun 10». */
  cuando: string;
  estado: 'hecho' | 'pendiente';
  /** Segunda línea: de qué va, para no elegir a ciegas entre dos «Fuerza A». */
  pie: string;
}

/** Lo que el selector ofrece, agrupado como lo ofrece. */
export const ELEGIBLES: { seccion: string; entrenos: EntrenoElegible[] }[] = [
  {
    seccion: 'Hoy',
    entrenos: [
      { ref: '9412', titulo: 'Fuerza A', cuando: 'hoy', estado: 'pendiente', pie: 'Empuje · 4 bloques' },
      { ref: '9411', titulo: 'Rodaje suave', cuando: 'hoy', estado: 'hecho', pie: '40 min · zona 2' },
    ],
  },
  {
    seccion: 'Esta semana',
    entrenos: [
      { ref: '9420', titulo: 'Simulación HYROX', cuando: 'vie 14', estado: 'pendiente', pie: 'Completa · con sled' },
      { ref: '9416', titulo: 'Fuerza B', cuando: 'jue 13', estado: 'pendiente', pie: 'Tirón · 5 bloques' },
      { ref: '9405', titulo: 'Series de umbral', cuando: 'ayer', estado: 'hecho', pie: '6×1000 · 3 min' },
      { ref: '9398', titulo: 'Metcon', cuando: 'lun 10', estado: 'hecho', pie: 'AMRAP 18 min' },
    ],
  },
  {
    seccion: 'Antes',
    entrenos: [
      { ref: '9372', titulo: 'Tirada larga', cuando: 'sáb 9', estado: 'hecho', pie: '18 km · ritmo libre' },
      // El segundo «Fuerza A» de la lista: es LA razón de que cada fila lleve pie.
      { ref: '9350', titulo: 'Fuerza A', cuando: 'mar 5', estado: 'hecho', pie: 'Empuje · 4 bloques' },
    ],
  },
];

/** El entreno elegido en el guion, ya rotulado por el servidor. */
export const CONTEXTO_SESION: RefContexto = {
  kind: 'session',
  ref: '9412',
  label: 'Fuerza A · hoy',
  preview: 'Empuje · 4 bloques · 55 min',
};

/** El caso fino: un ejercicio DENTRO de ese entreno. */
export const CONTEXTO_EJERCICIO: RefContexto = {
  kind: 'session',
  ref: '9412',
  sub: 'back-squat',
  label: 'Back squat · Fuerza A, hoy',
  // La respuesta a la pregunta, sin abrir nada: es justo el descanso que se
  // discute en el mensaje de al lado.
  preview: '4×5 · 80% · descanso 90 s',
};

/** Borrador escrito con el contexto ya puesto. */
export const BORRADOR = 'No me llega con 90 s de descanso, ¿lo alargo o bajo peso?';

/**
 * Cómo queda el hilo cuando el contexto viaja. Dos cosas que mirar: la tarjeta
 * va DENTRO de la burbuja (no es un mensaje aparte) y la respuesta del coach no
 * repite «¿de qué me hablas?», que es la mitad del valor.
 */
export const HILO_CON_CONTEXTO: Mensaje[] = [
  // Sobre el hilo real de producción, para que se vea qué cambia y qué no.
  ...CONVERSACION,
  {
    id: 33,
    de: 'atleta',
    dia: 'Hoy',
    hora: '18:22',
    texto: BORRADOR,
    contexto: CONTEXTO_SESION,
  },
  {
    id: 34,
    de: 'coach',
    hora: '18:35',
    texto: 'Mantén los 90 s y baja un 5% la barra. La densidad es el estímulo del bloque, no el peso.',
  },
];

/** El mismo hilo, pero preguntando por UN ejercicio del entreno. */
export const HILO_EJERCICIO: Mensaje[] = [
  ...CONVERSACION,
  {
    id: 41,
    de: 'atleta',
    dia: 'Hoy',
    hora: '18:26',
    texto: '¿Bajo hasta el paralelo o más? Al final del recorrido noto la cadera.',
    contexto: CONTEXTO_EJERCICIO,
  },
  {
    id: 42,
    de: 'coach',
    hora: '18:41',
    texto: 'Para en paralelo esta semana. Si la cadera sigue avisando, lo vemos el viernes en persona.',
  },
];

/** Las filas del menú de una sesión pendiente, tal como existen hoy en Swift. */
export const MENU_SESION: {
  etiqueta: string;
  glifo?: NombreGlifo;
  nueva?: boolean;
  submenu?: boolean;
  destructiva?: boolean;
}[] = [
  { etiqueta: 'Ver ejercicios y técnica', glifo: 'lista' },
  { etiqueta: 'Preguntar al coach', glifo: 'mensaje', nueva: true },
  { etiqueta: 'Mover a otro día', submenu: true },
  { etiqueta: 'Marcar como hecha', glifo: 'check' },
  { etiqueta: 'Completar ahora', glifo: 'lapiz' },
];

/** Los iconos que dibuja `Glifo`. Espejo aproximado de los SF Symbols de Swift. */
export type NombreGlifo = 'lista' | 'mensaje' | 'check' | 'lapiz' | 'play';

/** El diálogo del «+», tal como existe hoy, con la fila nueva al final. */
export const MENU_ADJUNTAR: { etiqueta: string; nueva?: boolean; submenu?: boolean }[] = [
  { etiqueta: 'Grabar nota de voz' },
  { etiqueta: 'Hacer una foto' },
  { etiqueta: 'Grabar vídeo' },
  { etiqueta: 'Foto o vídeo de la galería' },
  { etiqueta: 'Archivo' },
  { etiqueta: 'Sobre un entreno', nueva: true, submenu: true },
];

/** Las filas del menú de un ejercicio del brief: hoy no hay menú, la fila nace sola. */
export const MENU_EJERCICIO: { etiqueta: string; glifo?: NombreGlifo; nueva?: boolean }[] = [
  { etiqueta: 'Ver la técnica', glifo: 'play' },
  { etiqueta: 'Preguntar al coach', glifo: 'mensaje', nueva: true },
];
