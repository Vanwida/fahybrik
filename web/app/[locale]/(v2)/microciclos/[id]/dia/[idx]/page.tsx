// v2 · SCREEN 8 · EDITOR DE DÍA — legacy route. The day editor is no longer a
// separate page: it is the DÍA zoom level of the UNIFIED microciclo canvas,
// driven by the `?dia=N` query param at `/microciclos/[id]`. This route is kept
// only as a permanent redirect so old/bookmarked `/dia/[idx]` links resolve to
// the canvas with the day open.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function V2LegacyDayRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string; idx: string }>;
}) {
  const { locale, id, idx } = await params;
  redirect(`/${locale}/microciclos/${id}?dia=${idx}`);
}
