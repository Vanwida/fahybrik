import { setRequestLocale } from 'next-intl/server';
import { TandaEntrenoIndex } from '@/components/design-twin/TandaEntrenoIndex';

// Segmento estático: gana a `[screen]`, así que `/design/entreno` es la
// portada de la colección y no busca una pantalla con id «entreno».
export default async function TandaEntrenoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TandaEntrenoIndex localePrefix={`/${locale}`} />;
}
