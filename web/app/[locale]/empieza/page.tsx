import type { Metadata } from 'next';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { recordVisit } from '@/lib/analytics/visits';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

// Public lead funnel — /{locale}/empieza. Standalone full-viewport flow, OUTSIDE
// the (marketing) route group, so it renders no marketing header/footer.
export const metadata: Metadata = {
  title: 'Empieza — FAHYBRID',
  description: 'Cuéntanos de ti. En 4 minutos Pablo prepara tu llamada y tu plan.',
  robots: { index: false, follow: false },
};

// Required for server-side visit counting: run the server component on every hit
// (a cached static page would never re-count). See lib/analytics/visits.ts.
export const dynamic = 'force-dynamic';

interface EmpiezaPageProps {
  params: Promise<{ locale: string }>;
}

export default async function EmpiezaPage({ params }: EmpiezaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Cookieless, PII-free visit count. headers() MUST be read in request scope (not inside
  // `after()`, where the store is gone); we capture it now and write after the response.
  const requestHeaders = await headers();
  after(async () => {
    await recordVisit('empieza', requestHeaders);
  });

  return <OnboardingFlow locale={locale} />;
}
