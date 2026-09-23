import type { Metadata, Viewport } from "next";
import { getLocale } from "next-intl/server";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

// Clerk UI theming — dark base + brand orange (#F06A2A), coherente con el
// design system del dashboard. Centralizado aquí para que <SignIn/>, <SignUp/>
// y <UserButton/> hereden marca sin repetir tokens.
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    // Solo sobreescribimos el acento (naranja de marca) y el radio. El resto
    // (fondo de tarjeta y colores de texto con contraste) lo pone el baseTheme
    // dark — sobreescribir colorBackground a casi-negro aplastaba el texto.
    colorPrimary: "#F06A2A",
    borderRadius: "12px",
  },
} as const;

// Las fuentes de marca (Geist, Archivo) NO se cargan aquí: las pone cada layout
// que las usa con <BrandFonts> (app/brand-fonts.ts). El panel del coach es solo
// Figtree ((v2)/fonts.ts) y los iconos son SVG de Lucide (MIcon), así que este
// layout ya no mete fuentes ni la hoja de Material Symbols en ninguna página.

export const metadata: Metadata = {
  title: "FAHYBRID",
  description: "FAHYBRID — Coach dashboard",
};

// Barra de estado / splash de la PWA: oscuro por defecto (panel y landing lo
// son). El panel repinta estas metas al tema elegido (V2ThemeScript /
// V2ThemeProvider), así que en claro la barra también va clara.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0C" },
    { media: "(prefers-color-scheme: light)", color: "#0B0B0C" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang={locale}
        className="dark h-full"
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
