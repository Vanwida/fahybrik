import { notFound } from 'next/navigation';
import { GUIA_FIRST_SLUG, findGuiaSection } from '@/components/v2/guia/config';
import { GUIA_SECTION_REGISTRY } from '@/components/v2/guia/sections/registry';
import { GuiaPrevNext } from '@/components/v2/guia/GuiaPrevNext';

// /guia/<slug> — one section. The slug is validated against the single config; an
// unknown slug 404s. The first section is canonical at /guia, so its slug 404s
// here to avoid a duplicate URL.

export default async function GuiaSectionPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  if (slug === GUIA_FIRST_SLUG) notFound();

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
