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
import { Stations } from '@/components/landing/sections/Stations';
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

  // Cookieless, PII-free visit count. headers() MUST be read here, during the request
  // scope — calling it inside `after()` throws (the request store is gone post-response).
  // We capture the materialized headers now and hand them to `after()`, so the DB write
  // runs after the response ships and never blocks render. Errors swallowed in recordVisit.
  const requestHeaders = await headers();
  after(async () => {
    await recordVisit('landing', requestHeaders);
  });

  return (
    <>
      <Hero />
      <ProblemPromise />
      <Coach />
      <HowItWorks />
      <Methodology />
      <AppShowcase />
      <Stations />
      <RaceAnalytics />
      <Faq />
      <FinalCta />
    </>
  );
}
