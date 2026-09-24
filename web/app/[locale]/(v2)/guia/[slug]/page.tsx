import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { GUIA_FIRST_SLUG, GUIA_SLUG_ALIASES, findGuiaSection, guiaHref } from '@/components/v2/guia/config';
import { GUIA_SECTION_REGISTRY } from '@/components/v2/guia/sections/registry';
import { GuiaPrevNext } from '@/components/v2/guia/GuiaPrevNext';

// /guia/<slug> — un artículo. El slug se valida contra el índice; uno que cambió
// de nombre redirige al nuevo; uno desconocido da 404. La portada es /guia, así
// que su slug aquí también redirige (una sola dirección por artículo).

export default async function GuiaSectionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const alias = GUIA_SLUG_ALIASES[slug];
  if (alias) redirect({ href: guiaHref(alias), locale });
  if (slug === GUIA_FIRST_SLUG) redirect({ href: '/guia', locale });

  const meta = findGuiaSection(slug);
  const Section = meta ? GUIA_SECTION_REGISTRY[slug] : undefined;
  if (!meta || !Section) notFound();

  return (
    <>
      <Section meta={meta} />
      <GuiaPrevNext slug={slug} />
    </>
  );
}
