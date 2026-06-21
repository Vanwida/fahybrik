// v2 · BIBLIOTECA — "Codificar el método." Server component: loads the three
// library surfaces (sesiones = templates, bloques = library blocks, fases = the
// coach's periodization phases) via the existing loaders, shapes them into the
// v2 view model, and hands the result to the client <BibliotecaView> for tab +
// rail filtering + live search. The active tab is reflected in ?tab= so it is
// linkable; the client owns the in-page interactions.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadBibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import { BibliotecaView, type BibliotecaTab } from '@/components/v2/biblioteca/BibliotecaView';

export const dynamic = 'force-dynamic';

const VALID_TABS: readonly BibliotecaTab[] = ['sesiones', 'bloques', 'fases'];

function resolveTab(raw: string | string[] | undefined): BibliotecaTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return VALID_TABS.includes(v as BibliotecaTab) ? (v as BibliotecaTab) : 'sesiones';
}

export default async function V2BibliotecaPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCoachSession();
  if (!session) return null;

  const { tab } = await searchParams;
  const initialTab = resolveTab(tab);

  // A dead loader must never 500 the page — degrade to empty and let the view
  // render its EmptyState per tab.
  const data = await loadBibliotecaData({ coach_id: session.coach_id }).catch(() => ({
    sesiones: [],
    bloques: [],
    fases: [],
    counts: { sesiones: 0, bloques: 0, fases: 0 },
  }));

  return <BibliotecaView data={data} initialTab={initialTab} />;
}
