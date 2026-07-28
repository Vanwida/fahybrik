import { setRequestLocale } from 'next-intl/server';
import { TwinIndex } from '@/components/design-twin/TwinIndex';

export default async function DesignIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TwinIndex localePrefix={`/${locale}`} />;
}
