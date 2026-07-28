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
  dim: '#8A8A8E',

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

/** HRZone 1–5 → su hue sobre negro (WatchTheme.zoneColor). */
export function zoneColor(zone: 1 | 2 | 3 | 4 | 5): string {
  switch (zone) {
    case 1: return W.dim;
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
