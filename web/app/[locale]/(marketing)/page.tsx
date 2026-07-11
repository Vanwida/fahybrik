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

// One source for the page title / description / share image (reused by OG + Twitter).
const PAGE_TITLE = 'FAHYBRID — Entrenamiento HYROX y DEKA personalizado';
const PAGE_DESCRIPTION = HERO.sub;
const OG_IMAGE = '/landing/og.jpg';

export const metadata: Metadata = {
  metadataBase: new URL('https://fahybrid.com'),
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: '/',
    siteName: 'FAHYBRID',
    locale: 'es_ES',
    type: 'website',
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: 'FAHYBRID — entrenamiento HYROX personalizado',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [OG_IMAGE],
  },
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
      <RaceAnalytics />
      <Faq />
      <FinalCta />
    </>
  );
}
