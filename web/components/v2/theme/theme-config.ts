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

/** Default when nothing is stored and no system preference resolves. */
export const V2_THEME_DEFAULT: V2Theme = 'dark';
