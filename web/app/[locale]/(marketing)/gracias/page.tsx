import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Check } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pago recibido — FAHYBRID',
  robots: { index: false, follow: false },
};

const PLAN_LABEL: Record<string, string> = {
  individual: 'Individual',
  dobles: 'Dobles',
  pro_elite: 'Elite',
};

// Stripe Payment Links redirect here after a successful payment (see lib/landing/cta).
export default async function GraciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { plan } = await searchParams;
  const planLabel = plan ? PLAN_LABEL[plan] : undefined;

  return (
    <section className="mx-auto flex min-h-[72vh] max-w-[640px] flex-col items-center justify-center px-6 py-24 text-center">
      <span
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)] text-[color:var(--accent-on)]"
      >
        <Check className="size-7 stroke-[2.5]" />
      </span>

      <h1 className="mt-8 font-display text-[clamp(2rem,5vw,3rem)] font-black italic leading-[1.05] tracking-tight text-[color:var(--fg)]">
        ¡Pago recibido!
      </h1>

      {planLabel ? (
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--accent)]">
          Plan {planLabel}
        </p>
      ) : null}

      <p className="mt-6 max-w-[46ch] leading-relaxed text-[color:var(--muted)]">
        Bienvenido a FAHYBRID. Descarga la app y entra con el mismo email con el que has
        pagado: ahí completas tu onboarding y tu entrenador te monta el plan en 48–72h.
      </p>

      <p className="mt-10 text-[13px] text-[color:var(--muted)]">
        Disponible en iOS · ¿Algo no cuadra?{' '}
        <a
          href="mailto:hello@fahybrid.com"
          className="text-[color:var(--fg)] underline-offset-4 hover:underline"
        >
          hello@fahybrid.com
        </a>
      </p>
    </section>
  );
}
