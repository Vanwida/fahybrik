import type { Metadata } from 'next';
import { after } from 'next/server';
import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { recordVisit } from '@/lib/analytics/visits';
import { HERO } from '@/lib/landing/content';
import { Hero } from '@/components/landing/sections/Hero';
import { ProblemPromise } from '@/components/landing/sections/ProblemPromise';
import { HowItWorks } from '@/components/landing/sections/HowItWorks';
import { Methodology } from '@/components/landing/sections/Methodology';
import { RaceAnalytics } from '@/components/landing/sections/RaceAnalytics';
import { AppShowcase } from '@/components/landing/sections/AppShowcase';
import { Coach } from '@/components/landing/sections/Coach';
import { Faq } from '@/components/landing/sections/Faq';
import { FinalCta } from '@/components/landing/sections/FinalCta';

export const metadata: Metadata = {
  title: 'FAHYBRID — Entrenamiento HYROX y DEKA personalizado',
  description: HERO.sub,
};

// Required for server-side visit counting: force-dynamic makes the server component run
// on EVERY hit (a static page would be served from cache and never re-count). Landing
// traffic is low, so the static→dynamic tradeoff is acceptable. See lib/analytics/visits.ts.
export const dynamic = 'force-dynamic';

interface InicioPageProps {
  params: Promise<{ locale: string }>;
}

export default async function InicioPage({ params }: InicioPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Cookieless, PII-free visit count AFTER the response is sent (next/server `after`),
  // so the DB write never blocks render. Errors are swallowed inside recordVisit.
  after(async () => {
    await recordVisit('landing', await headers());
  });

  return (
    <>
      <Hero />
      <ProblemPromise />
      <Coach />
      <HowItWorks />
      <Methodology />
      <AppShowcase />
      <RaceAnalytics />
      <Faq />
      <FinalCta />
    </>
  );
}
