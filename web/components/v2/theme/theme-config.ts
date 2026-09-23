// v2 theme config — PLAIN module (no 'use client'). These constants must be
// importable by BOTH the client provider AND the server-rendered inline
// V2ThemeScript. When they lived in the 'use client' V2ThemeProvider, a server
// component importing them received a client-reference PROXY (whose string form
// is an error-throwing function body), so the inline pre-paint script became
// invalid JS → "Invalid or unexpected token" on every page. Keeping them here,
// dependency-free, lets the server interpolate the real string values.

export type V2Theme = 'dark' | 'light';

/** localStorage key for the persisted v2 theme — single source of truth. */
export const V2_THEME_STORAGE_KEY = 'fahybrid:v2-theme';

/** Tema por defecto del panel: OSCURO (DECISIONS 2026-09-23). */
export const V2_THEME_DEFAULT: V2Theme = 'dark';

/**
 * Lienzo de cada tema — lo que pinta la barra de estado / el splash de la PWA
 * (`<meta name="theme-color">`). Igual que --v2-bg en v2-theme.css.
 */
export const V2_THEME_CANVAS: Record<V2Theme, string> = {
  dark: '#0B0B0C',
  light: '#F4F4F2',
};

/**
 * Qué tema pinta el panel: lo guardado gana; si no hay nada, OSCURO. El sistema
 * ya no decide (antes: sistema → claro); el claro es la alternativa del botón.
 */
export function resolveV2Theme(stored: string | null | undefined): V2Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return V2_THEME_DEFAULT;
}
