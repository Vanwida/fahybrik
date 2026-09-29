import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth/admin-session';
import './twin.css';
import './studio.css';
// Los tokens del panel del coach, para las propuestas de dispositivo
// «escritorio»: viven acotados a `.v2-root`, así que no tocan ni el estudio ni
// el lienzo del iPhone. La fuente del panel (Figtree) viaja por la misma vía.
import '../../(v2)/v2-theme.css';
import { flexrFontVars } from '../../(v2)/fonts';
import { BrandFonts } from '@/components/brand/BrandFonts';

// El doble — réplica viva de la app iOS para dirigir UX (docs/DECISIONS.md).
// Puerta ADMIN-ONLY + noindex: es la mesa de trabajo de Alex, no una superficie
// de producto — un coach (Pablo incluido) NO debe ver propuestas a medias ni el
// panel de dirección. proxy.ts exige login Clerk en /design; aquí se estrecha
// al rol `admin` (user_roles), el mismo gate duro que protege /admin.
export const metadata: Metadata = {
  title: 'El doble — la app en la web',
  robots: { index: false, follow: false },
};

export default async function DesignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // DEV-ONLY: `next dev` no tiene sesión Clerk (el middleware ya salta el gate
  // en development, ver proxy.ts) — el doble debe poder abrirse en local.
  if (process.env.NODE_ENV !== 'development') {
    const session = await getAdminSession();
    if (!session) redirect('/sign-in');
  }

  return (
    <BrandFonts>
      <div className={`studio-root ${flexrFontVars}`}>{children}</div>
    </BrandFonts>
  );
}
