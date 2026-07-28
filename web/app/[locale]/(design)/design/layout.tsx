import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import './twin.css';
import './studio.css';

// El doble — réplica viva de la app iOS para dirigir UX (docs/DECISIONS.md).
// Misma puerta que el dashboard (sesión coach) + noindex: es herramienta
// interna, jamás una superficie de producto. proxy.ts añade /design a las
// rutas protegidas, y aquí se re-valida la sesión como hace el layout (v2).
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

  const session = await getCoachSession();
  if (!session) redirect('/sign-in');

  return <div className="studio-root">{children}</div>;
}
