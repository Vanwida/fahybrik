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

/** Default when nothing is stored and the system is not asking for dark. */
export const V2_THEME_DEFAULT: V2Theme = 'light';

/**
 * Qué tema pinta el panel: lo guardado gana; si no hay nada, el sistema;
 * si el sistema tampoco dice, el claro FLEXR.
 */
export function resolveV2Theme(
  stored: string | null | undefined,
  prefersDark: boolean,
): V2Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  if (prefersDark) return 'dark';
  return V2_THEME_DEFAULT;
}
