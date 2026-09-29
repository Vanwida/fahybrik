// Medidas y recetas de «Hoy · El día». Nada de aquí es un color: los colores
// son SIEMPRE `var(--twin-*)` (twin.css, claro y oscuro salen solos). Lo que sí
// vive aquí es la escala tipográfica (CONTRATO-UI §4.1) y los dos únicos
// mezcladores de color permitidos: un tinte de un token sobre una superficie y
// un velo transparente del mismo token.

import type { CSSProperties } from 'react';

/** Margen lateral de la portada. */
export const MARGEN = 20;

export const RADIO = {
  /** El sujeto y el póster: las dos únicas piezas grandes de la pantalla. */
  grande: 28,
  /** Tarjetas y teselas. */
  tarjeta: 22,
  /** Filas resaltadas dentro de una tarjeta. */
  fila: 16,
  pastilla: 9999,
} as const;

/** Escala en px (= pt del lienzo del iPhone). El suelo es 15: sin excepción. */
export const TAM = {
  /** Etiqueta, apoyo, unidad, pie (CONTRATO §4.1). */
  suelo: 15,
  /** Cuerpo y texto de lista. */
  cuerpo: 17,
  /** Título de sección. */
  seccion: 24,
  /** Un dato del día (marca, pasos). */
  dato: 32,
  /** Saludo. */
  saludo: 30,
  /** El sujeto: display de marca, cursiva pesada. */
  display: 44,
  /** La cuenta atrás del póster. */
  cuenta: 80,
  /** «Hoy» en el póster el día de la carrera: una palabra, no una cifra. */
  cuentaHoy: 64,
} as const;

/** Alto del área táctil mínima (≥ 44 pt). */
export const TOQUE = 48;

const FUENTE = 'var(--twin-font-sans)';

/**
 * La tipografía de una pieza: peso, tamaño en px, interlineado. Cursiva = voz de marca.
 * Va en LONGHANDS y no en el atajo `font`: el atajo reinicia `font-variant-numeric`, y
 * React avisa (y pierde las cifras tabulares) cuando un mismo elemento cambia su
 * `font` y mantiene `fontVariantNumeric`.
 */
export function fuente(peso: number, px: number, alto = 1.25, cursiva = false): CSSProperties {
  return {
    fontFamily: FUENTE,
    fontStyle: cursiva ? 'italic' : 'normal',
    fontWeight: peso,
    fontSize: px,
    lineHeight: alto,
  };
}

/** Un tinte de un token sobre una superficie (nunca un hex). */
export function tinte(color: string, pct: number, sobre = 'var(--twin-surface-elevated)'): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${sobre})`;
}

/** Un velo transparente de un token. */
export function velo(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** Las tres fotos del catálogo de la app (`RaceCardBackground*`), copiadas a public/twin/hoy. */
/** Las tres fotos del catálogo de la app (`Carrera.fondo` en kit-hoy, `RaceCardBackground*` en iOS). */
export type FondoCarrera = 'sled-push' | 'running' | 'wall-balls';

export const FOTO: Record<FondoCarrera, { src: string; posicion: string }> = {
  'sled-push': { src: '/twin/hoy/race-sled-push.jpg', posicion: '50% 62%' },
  running: { src: '/twin/hoy/race-running.jpg', posicion: '50% 46%' },
  'wall-balls': { src: '/twin/hoy/race-wall-balls.jpg', posicion: '50% 58%' },
};

/** Cifras tabulares: que 39 no baile al pasar a 38. */
export const TABULAR = { fontVariantNumeric: 'tabular-nums' } as const;
