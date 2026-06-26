import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { DEMO_COACHES, isDemoAccessEnabled } from '@/lib/auth/demo-access';
import { DemoAccessClient, type DemoCoachCard } from '@/components/demo/DemoAccessClient';

export const dynamic = 'force-dynamic';

// Gated demo access page. 404 (notFound) unless DEMO_ACCESS=1, so on production
// this route is indistinguishable from a non-existent page. Lets a colleague
// pick one of the two seeded demo coaches → sets the demo coach cookie → lands
// on /hoy as that coach; also reveals each coach's demo athlete Bearer for the
// iOS app.
export default async function AccesoDemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!isDemoAccessEnabled()) {
    notFound();
  }

  const coaches: DemoCoachCard[] = DEMO_COACHES.map((c) => ({
    slot: c.slot,
    label: c.label,
    athlete_label: c.athlete_label,
  }));

  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-16">
      <div className="mx-auto mb-10 w-full max-w-2xl text-center">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Acceso demo · FAHYBRID
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Elige un coach para recorrer el dashboard. Verás su roster, su atleta y
          sus microciclos.
        </p>
      </div>
      <DemoAccessClient coaches={coaches} locale={locale} />
    </main>
  );
}
