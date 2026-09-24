// Fuentes de MARCA — landing, doble (app del atleta en la web), páginas públicas,
// admin y los mockups de la app en la guía. NO las carga el panel del coach, que
// es solo Figtree (`(v2)/fonts.ts`): antes vivían en el layout raíz y metían 37
// caras de fuente en cada página del panel (auditoría E, T10).
//
// Se aplican con <BrandFonts> (components/brand/BrandFonts.tsx) en cada layout
// que las usa. next/font solo inyecta el @font-face en las rutas que importan
// este módulo.

import { Geist, Geist_Mono, Archivo, Archivo_Narrow } from 'next/font/google';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  weight: ['800', '900'],
  style: ['italic', 'normal'],
});

// Titulares estrechos atléticos: van delante de Archivo en --font-display.
const archivoNarrow = Archivo_Narrow({
  variable: '--font-archivo-narrow',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal'],
});

/** Clases que exponen las cuatro variables de fuente de marca a un subárbol. */
export const brandFontVars = `${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${archivoNarrow.variable}`;
