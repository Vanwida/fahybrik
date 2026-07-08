import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { PagoStatusHero } from '../PagoStatusHero';

// Post-payment success page (#15) — /{locale}/pago/exito?session={CHECKOUT_SESSION_ID}
//
// Stripe redirects here after a successful Checkout. This page does NOT verify
// the payment (the webhook does the real work: activating access + sending the
// claim email). It only reassures the athlete. Never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pago confirmado — FAHYBRID',
  description: 'Tu pago se ha confirmado. Te enviamos el enlace para entrar en la app.',
  robots: { index: false, follow: false },
};

export default async function PagoExitoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PagoStatusHero
      variant="success"
      title="Pago confirmado"
      body="Te hemos enviado un email con el enlace para entrar en la app y empezar tu plan."
      hint="¿No lo ves en unos minutos? Revisa la carpeta de spam o escríbenos a hello@fahybrid.com."
    />
  );
}
