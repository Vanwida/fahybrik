import { BrandFonts } from '@/components/brand/BrandFonts';

// Página pública con la voz de marca (Geist / Archivo): las fuentes ya no vienen
// del layout raíz, que solo carga lo que comparte todo (ver app/brand-fonts.ts).
export default function Layout({ children }: { children: React.ReactNode }) {
  return <BrandFonts>{children}</BrandFonts>;
}
