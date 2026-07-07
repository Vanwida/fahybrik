import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { CitaBooking } from '@/components/citas/CitaBooking';

// Public videollamada booking (funnel #2) — /{locale}/cita/{token}. Standalone
// branded page, OUTSIDE any route group, so it renders no marketing or dashboard
// chrome. The opaque token IS the credential; there is no auth. Always dynamic
// (the picker reads live availability client-side).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reserva tu llamada · FAHYBRID',
  description: 'Elige el hueco para tu videollamada con Pablo.',
  robots: { index: false, follow: false },
};

interface CitaPageProps {
  params: Promise<{ locale: string; token: string }>;
}

export default async function CitaPage({ params }: CitaPageProps) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <CitaBooking token={token} />;
}
