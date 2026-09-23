import type { ReactNode } from 'react';
import { brandFontVars } from '@/app/brand-fonts';

/**
 * Da las fuentes de marca (Geist, Geist Mono, Archivo, Archivo Narrow) a un
 * subárbol. `display: contents` → no añade caja: el hijo sigue siendo, a efectos
 * de layout, hijo directo de quien lo era (p. ej. el `flex-1` sobre el body).
 * `.brand-fonts` (globals.css) recalcula aquí las variables que dependen de esas
 * fuentes, porque en :root ya no existen.
 */
export function BrandFonts({ children }: { children: ReactNode }) {
  return <div className={`${brandFontVars} brand-fonts contents`}>{children}</div>;
}
