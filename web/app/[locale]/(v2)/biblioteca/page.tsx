// v2 · BIBLIOTECA — "Codificar el método." Server component: loads the library
// surfaces (bloques = blocks, sesiones = templates madre, microciclos = month
// templates) via the existing loaders, shapes them into the v2 view model, and
// hands the result to the client <BibliotecaView> for tab + rail filtering +
// live search. The active tab is reflected in ?tab= so it is linkable; the client
// owns the in-page interactions. (Periodization phases live in /v2/periodizacion.)
//
// Ejercicios (el peldaño más pequeño) carga sus propios datos en su panel.

import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadBibliotecaData } from '@/lib/dashboard/v2/biblioteca-data';
import {
  loadPipelineProgress,
  EMPTY_PIPELINE_PROGRESS,
} from '@/lib/dashboard/v2/orientacion';
import { BibliotecaView } from '@/components/v2/biblioteca/BibliotecaView';
import { resolveBibliotecaTab } from '@/components/v2/biblioteca/biblioteca-nav';

export const dynamic = 'force-dynamic';

function resolveTab(raw: string | string[] | undefined) {
  return resolveBibliotecaTab(Array.isArray(raw) ? raw[0] : raw);
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
      bloques: [],
      sesiones: [],
      microciclos: [],
      counts: { bloques: 0, sesiones: 0, microciclos: 0 },
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
