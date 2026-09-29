// LOS TOKENS DEL VIVO DEL IPHONE — docs/vivo-iphone/modelo.md (I8, I9, §3).
//
// Un token por PAPEL, no por tono. Ninguna pantalla `iphone-vivo-*` escribe
// un `fontSize` ni un hex a mano: tira de aquí. El color es el MISMO que el
// de la muñeca (`kit-reloj/tokens.ts`: fondo negro, tinta, tinta2, naranja
// solo acción, espectro de zonas del coach): un estado, dos pintores, un
// lenguaje. Lo que cambia es el LIENZO (402 × 874 pt, safe areas del sistema)
// y la ESCALA (el héroe se lee a 2–3 m: el móvil vive en la consola de la
// cinta, en el soporte del remo o en el suelo junto a la barra).
//
// ── EL NUMERAL (I9, §10.2) ─────────────────────────────────────────────────
// UN token para toda la app: cambiarlo cambia todas las cifras del vivo. Por
// defecto SF con cifras de ancho fijo y recto, como la muñeca. La cara del
// numeral (recto o la itálica de marca) es decisión de Alex (§7 del modelo):
// se toma en `NUMERAL.estilo`, en un solo sitio.
//
// ── LA ESCALA (suelo 15 pt, CONTRATO-UI §4.1) ──────────────────────────────
//   sujeto     72–176 pt, ajustado al ancho útil y al alto de su banda
//   trabajo    40 pt   — lo que falta del paso y la dosis (§10.6: nunca en gris)
//   dato       30 pt   — el valor de una celda de la rejilla (≥ 28: «un dato de la sesión»)
//   datoTexto  20 pt   — un valor categórico en la rejilla («6 Bench Press · 60 kg»)
//   posicion   22 pt bold — la cabecera: «Serie 3/6 · 1000 m»
//   crono      22 pt   — el crono de sesión (o el total) en la cabecera
//   cuerpo     17 pt   — «Luego ·», «Viene:», la hoja de terminar
//   etiqueta   15 pt semibold — etiquetas y unidades. EL SUELO.
//   nota       15 pt   — honestidad («sin señal del remo»)
//   botón      64 pt de alto (I5.8: ≥ 64, en la zona del pulgar), 20 pt
//
// ── EL COLOR (I8) ──────────────────────────────────────────────────────────
// Fondo negro; naranja SOLO para la acción primaria y el trabajo en la tira;
// zonas con el espectro del coach (Z1 azul pizarra, nunca gris) y tinte de
// fondo SOLO cuando el paso va a zona; recuperación y descanso monocromos.
// Los estados de enlace no llevan color propio: se dicen con forma y palabra.

import type { CSSProperties } from 'react';
import { C, TINTE_ZONA_PCT, type EscalaHeroe, type Peso } from '../kit-reloj/tokens';

export { C, TINTE_ZONA_PCT, colorZona, espectroZonas, tinte, DESHACER_MS, anchoTexto, cuerpoQueCabe, tallaHeroe } from '../kit-reloj/tokens';
export type { EscalaHeroe, Peso, TallaHeroe } from '../kit-reloj/tokens';

// ---------------------------------------------------------------------------
// Lienzo
// ---------------------------------------------------------------------------

/**
 * iPhone 17 Pro, en pt (el marco del doble). La gramática se comprueba a
 * 390 × 844 y 430 × 932: nada se trunca ni desborda entre esos anchos.
 */
export const LIENZO = { ancho: 402, alto: 874, minAncho: 390, maxAncho: 430 } as const;

/** Margen lateral del contenido. El de la app (Theme.Spacing) es 16; aquí 20: el vivo respira más. */
export const MARGEN = 20;

/** Lo que queda a lo ancho para el héroe y las filas, a un ancho de lienzo dado. */
export const anchoUtil = (anchoLienzo: number): number => anchoLienzo - 2 * MARGEN;

/** Aire entre filas de la anatomía. */
export const HUECO = 10;

// ---------------------------------------------------------------------------
// El numeral — UN token (I9)
// ---------------------------------------------------------------------------

export const NUMERAL = {
  familia: 'var(--twin-font-sans)',
  /** `normal` = SF recto (propuesto). `italic` = la itálica de marca. Decide Alex (§7). */
  estilo: 'normal' as 'normal' | 'italic',
  peso: 600 as Peso,
  variante: 'tabular-nums',
  /** Un pelín más apretado por encima de 60 pt: las cifras grandes de SF abren demasiado. */
  trackingGrande: '-0.02em',
} as const;

/** El estilo de toda cifra del vivo. Cambiar `NUMERAL` cambia todas. */
export function estiloNumeral(cuerpo: number, peso: Peso = NUMERAL.peso): CSSProperties {
  return {
    fontFamily: NUMERAL.familia,
    fontStyle: NUMERAL.estilo,
    fontWeight: peso,
    fontVariantNumeric: NUMERAL.variante,
    fontSize: cuerpo,
    lineHeight: 1,
    letterSpacing: cuerpo >= 60 ? NUMERAL.trackingGrande : 0,
  };
}

// ---------------------------------------------------------------------------
// La escala
// ---------------------------------------------------------------------------

export const TI = {
  sujeto: { min: 72, max: 176, peso: 600, caja: 0.84 } satisfies EscalaHeroe,
  /** La etiqueta pegada al sujeto («quedan», «lo dices tú», «total»). */
  etiquetaSujeto: { cuerpo: 17, peso: 600 as Peso, alto: 22 },
  trabajo: { cuerpo: 40, peso: 600 as Peso },
  dato: { cuerpo: 30, peso: 600 as Peso },
  datoTexto: { cuerpo: 20, peso: 600 as Peso },
  posicion: { cuerpo: 22, peso: 700 as Peso },
  crono: { cuerpo: 22, peso: 600 as Peso },
  cuerpo: { cuerpo: 17, peso: 500 as Peso },
  etiqueta: { cuerpo: 15, peso: 600 as Peso },
  nota: { cuerpo: 15, peso: 500 as Peso },
  boton: { alto: 64, cuerpo: 20, peso: 700 as Peso },
  botonMenor: { alto: 44, cuerpo: 17, peso: 600 as Peso },
  chip: { alto: 30, cuerpo: 15, peso: 600 as Peso },
  banda: { pista: 10, rotulo: 15, palabra: 17 },
  /** El suelo absoluto (CONTRATO-UI §4.1). Nada se pinta por debajo. */
  suelo: 15,
} as const;

/**
 * El alto de cada franja de la anatomía (I5), en pt. La banda del sujeto es
 * FIJA: su centro óptico cae a la misma altura en todas las familias
 * (§10.3). El sobrante del lienzo lo absorbe la rejilla (crecen sus celdas),
 * nunca una cola vacía (§6.1).
 */
export const ALTO = {
  cabecera: 64,
  puntos: 12,
  sujeto: 196,
  banda: 48,
  trabajo: 52,
  luego: 40,
  tira: 20,
  accion: 64,
  /** Lo que se deja por encima del indicador de inicio del sistema. */
  pieAccion: 12,
} as const;

/**
 * La celda de la rejilla: lo mínimo para etiqueta + valor a 30 pt. A 844 pt de
 * alto, con banda, trabajo y 2 × 2 celdas, el presupuesto deja 163 pt a la
 * rejilla: dos filas de 76 más el hueco (lo comprueba kit-iphone-vivo.test).
 * `compacta`: etiqueta y valor en una fila (el descanso que anota necesita el
 * sitio para la serie).
 */
export const CELDA = { minAlto: 76, compacta: 52, radio: 18, padding: 10 } as const;

/** Radios: el botón es una píldora; las superficies, redondeadas como las tarjetas de la app. */
export const RADIO = { boton: 32, chip: 15, superficie: 18, hoja: 28 } as const;

// ---------------------------------------------------------------------------
// Color: lo que el iPhone añade a `C` (sin significados nuevos)
// ---------------------------------------------------------------------------

export const CI = {
  ...C,
  /** Un botón que no se puede pulsar todavía («Empezar» sin GPS): superficie y tinta2. */
  desactivadoFondo: C.superficie2,
  desactivadoTinta: C.tinta2,
  /** El carril de la tira de estructura: el gris del carril del reloj. */
  tira: C.carril,
  /** La rejilla y el descanso: superficie sobre el negro. */
  celda: C.superficie,
  /** El velo de la pausa y de la hoja de terminar. */
  velo: C.velo,
} as const;

/**
 * El tinte de zona de fondo (I8): un ambiente radial, SOLO cuando el paso va
 * a zona. Sobre negro, el mismo porcentaje que la muñeca en el centro y nada
 * en los bordes, para que las celdas y la acción sigan sobre negro.
 */
export function tinteAmbiente(color: string): string {
  return `radial-gradient(120% 70% at 50% 28%, color-mix(in srgb, ${color} ${TINTE_ZONA_PCT}%, ${C.fondo}), ${C.fondo} 72%)`;
}

// ---------------------------------------------------------------------------
// Lo que dura cada cosa (mecanismo, no método)
// ---------------------------------------------------------------------------

export const DURACION = {
  /** Mantener pulsado Terminar (estándar Apple Fitness / Strava). */
  terminarMs: 1000,
  /** El destello de un cambio de paso. */
  destelloMs: 380,
  /** La tarjeta del km recién hecho. */
  vueltaMs: 4000,
  /** La pausa que pide el atleta se reanuda sola (espejo de `Vivo.reanudaSolaS`: 10 s, el valor de la vista vieja). */
  reanudaSolaMs: 10000,
} as const;
