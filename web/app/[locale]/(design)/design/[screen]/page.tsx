import { setRequestLocale } from 'next-intl/server';
import { TwinStage } from '@/components/design-twin/TwinStage';

export default async function DesignScreenPage({
  params,
}: {
  params: Promise<{ locale: string; screen: string }>;
}) {
  const { locale, screen } = await params;
  setRequestLocale(locale);
  return <TwinStage screenId={screen} localePrefix={`/${locale}`} />;
}
