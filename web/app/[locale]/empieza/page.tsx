import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';

// Public lead funnel — /{locale}/empieza. Standalone full-viewport flow, OUTSIDE
// the (marketing) route group, so it renders no marketing header/footer.
export const metadata: Metadata = {
  title: 'Empieza — FAHYBRID',
  description: 'Cuéntanos de ti. En 4 minutos Pablo prepara tu llamada y tu plan.',
  robots: { index: false, follow: false },
};

interface EmpiezaPageProps {
  params: Promise<{ locale: string }>;
}

export default async function EmpiezaPage({ params }: EmpiezaPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <OnboardingFlow locale={locale} />;
}
