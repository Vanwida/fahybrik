// Tokens del reloj — espejo literal de ios/FAHYBRIKWatch/WatchTheme.swift.
//
// El reloj NO comparte paleta con el iPhone: su lienzo es negro puro (#000, no
// el #0b0b0c del móvil) y sus zonas son los hues vivos de los mockups, elegidos
// para leerse sobre negro. Por eso WatchTheme.swift redeclara los hexes en vez
// de importar Theme.swift, y por eso aquí NO se usan las vars --twin-* de color:
// usarlas mentiría sobre lo que el atleta ve en la muñeca. De twin.css sí viene
// la tipografía (--twin-font-sans se hereda de .twin-root: SF Pro real).

export const W = {
  // Superficies — lienzo siempre negro con tarjetas casi negras encima.
  bg: '#000000',
  surface: '#141414',
  surfaceRaised: '#1F1F1F',
  transitionBg: '#140D07',
  restBg: '#0D1B0F',

  // Texto.
  ink: '#FFFFFF',
  /**
   * EL CROMO NO PUEDE SER UN GRIS FIJO, porque el fondo ya no es negro fijo.
   *
   * Era `#8A8A8E`, que vale sobre negro y NO vale sobre un lienzo teñido: sobre el
   * verde de la Z3 al 45 % se queda en 2,30:1 y sobre el ámbar de la Z4 en 2,09:1,
   * así que la unidad, las versales y el segundo nivel dejan de leerse. Blanco con
   * alfa sí, y el alfa sale de medir contra el peor caso (el ámbar): 0,70 da 4,47:1
   * —por debajo del 4,5 que pide un texto pequeño— y 0,76 lo cruza (4,95:1). Sobre
   * negro da 11,76:1 y sigue pesando menos que el dato.
   */
  dim: 'rgba(255,255,255,0.76)',
  /** El dato EN PAUSA: no desaparece, se apaga. */
  inkApagado: 'rgba(255,255,255,0.45)',

  // Naranja de marca (el único acento afilado).
  orange: '#F06A2A',
  orangePress: '#D85A20',
  orangeSoft: '#FF8A4C',

  // Hues semánticos de zona.
  zoneGreen: '#2FD14F',
  zoneAmber: '#FFB340',
  zoneRed: '#FF4D4D',
  zoneBlue: '#2A6CFF',
  greenOn: '#06280F',
} as const;

/**
 * EL TOPE DEL TINTE DE ZONA — plano, no un degradado que se va a negro.
 *
 * Espejo de `WatchTinte.maxOpacity`. Por qué 45 y no más: lo pone el ámbar de la
 * Z4, porque el aro (`orangeSoft`) tiene que mantener 3:1 contra el lienzo y sobre
 * ámbar al 45 % se queda en 3,08:1 — al 50 % ya es 2,67 y al 55 % 2,31, o sea que
 * el aro desaparece. Con ese mismo 45 % el numeral blanco va de 7,18:1 (ámbar, el
 * peor caso) a 12,25:1 (azul).
 */
export const TINTE_MAX = 0.45;

/** HRZone 1–5 → su hue sobre negro (WatchTheme.zoneColor). */
export function zoneColor(zone: 1 | 2 | 3 | 4 | 5): string {
  switch (zone) {
    // El gris de la Z1 es SU hue, no el cromo: dejaron de ser el mismo valor
    // cuando `dim` pasó a blanco con alfa para poder vivir sobre un lienzo teñido.
    case 1: return '#8A8A8E';
    case 2: return W.zoneBlue;
    case 3: return W.zoneGreen;
    case 4: return W.zoneAmber;
    case 5: return W.zoneRed;
  }
}

/** Segundos de cuenta atrás a partir de los cuales el número se pone naranja. */
export const URGENT_THRESHOLD_S = 3;

/** Mínimo entre hápticos de «fuera de zona» (WatchTheme.zoneExitHapticThrottle). */
export const ZONE_EXIT_HAPTIC_THROTTLE_S = 15;

/**
 * Pesos SwiftUI → CSS. `.heavy` ≈ 800 y `.semibold` = 600, el mismo mapeo que
 * usa twin.css para la voz del iPhone.
 */
export const HEAVY = 800;
export const SEMIBOLD = 600;

/**
 * Ancho útil del lienzo del reloj (208 pt) menos el safe area lateral que fija
 * DeviceFrame (8 pt por lado). Las pantallas restan además su propio padding.
 */
export const CANVAS_W = 192;
/** Ancho de contenido dentro de LiveScaffold (padding horizontal 10). */
export const SCAFFOLD_W = CANVAS_W - 20;
/** Ancho de contenido de las pantallas con padding horizontal 12. */
export const PADDED_W = CANVAS_W - 24;
