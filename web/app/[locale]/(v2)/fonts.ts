// Fuente del panel del coach — SOLO Figtree (cuerpo, títulos y números
// tabulares, que son la voz display). Bricolage salió con el rediseño de
// 2026-09-23 (una sola familia). Scoped al dashboard: el layout (v2) añade la
// variable al wrapper `.v2-root`; v2-theme.css la consume vía --v2-font-sans.

import { Figtree } from 'next/font/google';

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/** Clase que expone --font-figtree al subárbol del panel. */
export const flexrFontVars = figtree.variable;
