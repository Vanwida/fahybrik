import type { Metadata } from "next";
import { Geist, Geist_Mono, Archivo, Archivo_Narrow } from "next/font/google";
import { getLocale } from "next-intl/server";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

// Clerk UI theming — dark base + Fabrik orange (#F06A2A), coherente con el
// design system del dashboard. Centralizado aquí para que <SignIn/>, <SignUp/>
// y <UserButton/> hereden marca sin repetir tokens.
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    // Solo sobreescribimos el acento (naranja Fabrik) y el radio. El resto
    // (fondo de tarjeta y colores de texto con contraste) lo pone el baseTheme
    // dark — sobreescribir colorBackground a casi-negro aplastaba el texto.
    colorPrimary: "#F06A2A",
    borderRadius: "12px",
  },
} as const;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["800", "900"],
  style: ["italic", "normal"],
});

// Narrow athletic headings for the coach dashboard. Layered ahead of
// Archivo in the --font-display stack (see globals.css dashboard block).
const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-narrow",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "FAHYBRIK",
  description: "FAHYBRIK — Coach dashboard",
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
        className={`dark ${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${archivoNarrow.variable} h-full`}
      >
        <head>
          {/* Material Symbols Outlined — icon font used across the coach
              dashboard. Loaded globally so dashboard pages render icons. */}
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          />
        </head>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
