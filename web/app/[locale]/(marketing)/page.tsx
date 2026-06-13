import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { HERO } from '@/lib/landing/content';
import { Hero } from '@/components/landing/sections/Hero';
import { ProblemPromise } from '@/components/landing/sections/ProblemPromise';
import { HowItWorks } from '@/components/landing/sections/HowItWorks';
import { Methodology } from '@/components/landing/sections/Methodology';
import { RaceAnalytics } from '@/components/landing/sections/RaceAnalytics';
import { AppShowcase } from '@/components/landing/sections/AppShowcase';
import { Coach } from '@/components/landing/sections/Coach';
import { Pricing } from '@/components/landing/sections/Pricing';
import { Faq } from '@/components/landing/sections/Faq';
import { FinalCta } from '@/components/landing/sections/FinalCta';

export const metadata: Metadata = {
  title: 'FAHYBRID — Entrenamiento HYROX y DEKA personalizado',
  description: HERO.sub,
};

interface InicioPageProps {
  params: Promise<{ locale: string }>;
}

export default async function InicioPage({ params }: InicioPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Hero />
      <ProblemPromise />
      <Coach />
      <HowItWorks />
      <Methodology />
      <AppShowcase />
      <RaceAnalytics />
      <Pricing />
      <Faq />
      <FinalCta />
    </>
  );
}
