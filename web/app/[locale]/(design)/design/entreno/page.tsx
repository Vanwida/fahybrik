import { setRequestLocale } from 'next-intl/server';
import { TandaIndex } from '@/components/design-twin/TandaIndex';
import { coleccionDe } from '@/components/design-twin/registry';

// Segmento estático: gana a `[screen]`, así que `/design/entreno` es la
// portada de la colección y no busca una pantalla con id «entreno».
export default async function TandaEntrenoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TandaIndex coleccion={coleccionDe('entreno')} localePrefix={`/${locale}`} />;
}
