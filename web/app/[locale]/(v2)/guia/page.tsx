import { notFound } from 'next/navigation';
import { GUIA_FIRST_SLUG, findGuiaSection } from '@/components/v2/guia/config';
import { GUIA_SECTION_REGISTRY } from '@/components/v2/guia/sections/registry';
import { GuiaPrevNext } from '@/components/v2/guia/GuiaPrevNext';

// /guia — the guide home = the first section ("Qué es esta guía"). Served here
// (not at /guia/que-es-esta-guia) so the entry URL is clean.

export default function GuiaHomePage() {
  const meta = findGuiaSection(GUIA_FIRST_SLUG);
  const Section = GUIA_SECTION_REGISTRY[GUIA_FIRST_SLUG];
  if (!meta || !Section) notFound();

  return (
    <>
      <Section meta={meta} />
      <GuiaPrevNext slug={GUIA_FIRST_SLUG} />
    </>
  );
}
