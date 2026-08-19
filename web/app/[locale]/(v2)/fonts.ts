// Fuentes del panel FLEXR — Bricolage Grotesque (display) + Figtree (cuerpo y
// números tabulares). Scoped al dashboard: el layout (v2) añade estas variables
// al wrapper `.v2-root`; el resto de la web sigue con las fuentes del root.
// v2-theme.css las consume vía --v2-font-display / --v2-font-sans.

import { Bricolage_Grotesque, Figtree } from 'next/font/google';

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
});

const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  display: 'swap',
});

/** Clases que exponen --font-bricolage y --font-figtree al subárbol del panel. */
export const flexrFontVars = `${bricolage.variable} ${figtree.variable}`;
