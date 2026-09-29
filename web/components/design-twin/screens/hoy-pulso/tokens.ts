// Los números de «El pulso» que no son de nadie más: la escala tipográfica del
// §4.1, la geometría del dial y las rutas de los fondos. Todo lo demás (colores,
// espaciado, radios) sale de los tokens `--twin-*` y de `kit-composicion/tokens`.

import type { Carrera, Reclamo } from '../../kit-hoy/contrato';

/** CONTRATO-UI §4.1: el suelo es 15; cuerpo 17; título de sección 24; dato de sesión 28. */
export const T = { apoyo: 15, cuerpo: 17, titulo: 24, dato: 28 } as const;

/** Margen lateral de la pantalla (el mismo 20 pt que `MARGEN_A` de las analíticas). */
export const MARGEN = 20;

/** Área táctil mínima (Apple HIG, §8 del contrato: móvil a una mano). */
export const TOQUE = 44;

/**
 * El dial. Un arco de 230° abierto por abajo: la abertura deja sitio DENTRO del
 * instrumento a la palabra de estado y a la salida (check-in / conectar), así el
 * dial no necesita una cola debajo.
 */
export const DIAL = {
  ancho: 300,
  alto: 280,
  cx: 150,
  cy: 148,
  r: 126,
  trazo: 14,
  /** Grados que se abre por abajo, a cada lado del eje vertical. */
  abertura: 65,
  /** Marcas del bisel: una cada 2,5 puntos de la escala 0-100; larga cada 25. */
  marcas: 40,
  cadaLarga: 10,
  /** Cifra: 120 pt; con tres dígitos («100») baja para no rozar el arco. */
  cifra: 120,
  cifraTres: 100,
  /** Halo teñido por la zona: alfa en % del color de zona, por apariencia. */
  haloOscuro: 20,
  haloClaro: 13,
} as const;

/** Fondos de la tarjeta de carrera (los tres del catálogo de la app). */
export const FONDO_CARRERA: Record<Carrera['fondo'], string> = {
  'sled-push': '/twin/hoy/race-sled-push.jpg',
  running: '/twin/hoy/race-running.jpg',
  'wall-balls': '/twin/hoy/race-wall-balls.jpg',
};

/**
 * Orden de lo que reclama dentro del bloque plegado: primero lo que caduca
 * (la pareja entrena AHORA), luego lo que tiene fecha (revisión) y al final lo
 * lento (batería de tests). El entreno a medias no está aquí: es la MISMA sesión
 * de hoy, empezada, y se promueve sobre la fila de hoy.
 */
export const ORDEN_RECLAMOS: Exclude<Reclamo['clave'], 'a-medias'>[] = ['pareja-en-vivo', 'revision', 'tests'];

/** Logotipo oficial (web/public/brand): blanco sobre lienzo oscuro, negro sobre claro. */
export const LOGO = { oscuro: '/brand/fh-logo-white.png', claro: '/brand/fh-logo-black.png', alto: 22, proporcion: 1200 / 507 } as const;

/**
 * Velo del color del lienzo sobre la foto de la carrera, en % de opacidad. Medido en
 * el peor caso (un píxel de foto blanco en oscuro, negro en claro): el texto de apoyo
 * (`--twin-muted`) da 4,85:1 en oscuro con 88 y 5,05:1 en claro con 78; con menos
 * velo la luz de la nave lo dejaba en 3,9:1.
 */
export const VELO_CARRERA = { oscuro: 88, claro: 78 } as const;
