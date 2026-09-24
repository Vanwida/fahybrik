import './guia.css';
import { BrandFonts } from '@/components/brand/BrandFonts';
import { GuiaReader } from '@/components/v2/guia/GuiaReader';

// GUÍA DEL ENTRENADOR — lector a todo lo ancho dentro del panel: sigue el tema
// del panel, sin segunda barra lateral (el índice es un panel que se abre).
// Fuera de la navegación principal: se llega desde «?» y desde el enlace de
// ayuda de cada pantalla (GUIA_SLUGS). <BrandFonts>: las maquetas de la app del
// atleta usan sus fuentes, que el panel ya no carga.

export default function GuiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <BrandFonts>
      <GuiaReader>{children}</GuiaReader>
    </BrandFonts>
  );
}
