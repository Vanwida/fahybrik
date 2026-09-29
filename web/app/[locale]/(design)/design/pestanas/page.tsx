import { setRequestLocale } from 'next-intl/server';
import { TandaIndex } from '@/components/design-twin/TandaIndex';
import { coleccionDe } from '@/components/design-twin/registry';

// La colección «Las pestañas, rehechas» (29-sep): Hoy, Plan, Carreras y Perfil
// con el diseño de «Hoy · El día». Segmento estático, como `entreno`.
export default async function TandaPestanasPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TandaIndex coleccion={coleccionDe('pestanas')} localePrefix={`/${locale}`} />;
}
