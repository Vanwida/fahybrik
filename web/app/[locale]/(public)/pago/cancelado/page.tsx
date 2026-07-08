import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { PagoStatusHero } from '../PagoStatusHero';

// Checkout-cancelled page (#15) — /{locale}/pago/cancelado
//
// Stripe redirects here if the athlete abandons Checkout. No charge is made.
// They can retry from the acceptance email's pay button. Never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pago no completado — FAHYBRID',
  description: 'No se ha realizado ningún cargo. Puedes volver a intentarlo cuando quieras.',
  robots: { index: false, follow: false },
};

export default async function PagoCanceladoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PagoStatusHero
      variant="cancel"
      title="Pago no completado"
      body="No se ha realizado ningún cargo. Puedes volver a intentarlo desde el botón de pago del email que te enviamos."
      hint="Si tienes cualquier duda, escríbenos a hello@fahybrid.com."
    />
  );
}
