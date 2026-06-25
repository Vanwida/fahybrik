// v2 · BIBLIOTECA — "Codificar el método." Server component: loads the three
// library surfaces (sesiones = templates, bloques = library blocks, microciclos =
// month templates) via the existing loaders, shapes them into the v2 view model,
// and hands the result to the client <BibliotecaView> for tab + rail filtering +
// live search. The active tab is reflected in ?tab= so it is linkable; the client
// owns the in-page interactions. (Periodization phases live in /periodizacion.)

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadBibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import {
  loadPipelineProgress,
  EMPTY_PIPELINE_PROGRESS,
} from '@/lib/dashboard/v2/orientacion';
import { BibliotecaView, type BibliotecaTab } from '@/components/v2/biblioteca/BibliotecaView';

export const dynamic = 'force-dynamic';

const VALID_TABS: readonly BibliotecaTab[] = ['sesiones', 'bloques', 'microciclos'];

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
  const [data, progress] = await Promise.all([
    loadBibliotecaData({ coach_id: session.coach_id }).catch(() => ({
      sesiones: [],
      bloques: [],
      microciclos: [],
      counts: { sesiones: 0, bloques: 0, microciclos: 0 },
    })),
    loadPipelineProgress(session.coach_id).catch(() => EMPTY_PIPELINE_PROGRESS),
  ]);

  return (
    <BibliotecaView
      data={data}
      initialTab={initialTab}
      coachKey={String(session.coach_id)}
      progress={progress}
    />
  );
}
