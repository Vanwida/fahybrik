import { setRequestLocale } from 'next-intl/server';
import { TandaIndex } from '@/components/design-twin/TandaIndex';
import { coleccionDe } from '@/components/design-twin/registry';

// La colección «Hoy, rehecho» (29-sep): dos direcciones para la portada del
// atleta, sobre un solo modelo.
// Segmento estático, como `entreno`.
export default async function TandaHoyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TandaIndex coleccion={coleccionDe('hoy')} localePrefix={`/${locale}`} />;
}
