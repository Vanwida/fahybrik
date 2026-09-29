import { setRequestLocale } from 'next-intl/server';
import { TandaIndex } from '@/components/design-twin/TandaIndex';
import { coleccionDe } from '@/components/design-twin/registry';

// La colección «Analíticas, rehechas» (29-sep): la portada del atleta, sus
// detalles y la pestaña Rendimiento del coach, sobre un solo contrato.
// Segmento estático, como `entreno`.
export default async function TandaAnaliticasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TandaIndex coleccion={coleccionDe('analiticas')} localePrefix={`/${locale}`} />;
}
