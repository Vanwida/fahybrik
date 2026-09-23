// Mesa de QA de los componentes COMPARTIDOS del panel (components/v2/shared) con
// datos REALES del coach de la sesión: el lead y las pantallas de la ola 2 los
// prueban aquí antes de montarlos. Fuera de la navegación, como /ajustes/sistema.
// `?abrir=vistazo|asignar|chat` abre uno de entrada (capturas).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadRoster } from '@/lib/dashboard/athletes/roster';
import { loadSetupChecklist } from '@/lib/coach/setup-checklist';
import { SharedDemo, type DemoRow } from '@/components/v2/shared/SharedDemo';

export const metadata: Metadata = {
  title: 'Compartidos — panel',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CompartidosPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ abrir?: string; atleta?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) redirect('/sign-in');
  const sp = await searchParams;

  const [roster, checklist] = await Promise.all([
    loadRoster({ coach_id: session.coach_id }),
    loadSetupChecklist(session.coach_id),
  ]);
  // Una muestra variada: el atleta pedido (Marc Vidal en la semilla), el peor de
  // cada estado y los primeros.
  const focusId = sp.atleta ?? '11';
  const byKey = new Map<string, (typeof roster)[number]>();
  for (const r of roster) if (!byKey.has(r.status.key)) byKey.set(r.status.key, r);
  const sample = [...roster.filter((r) => r.athlete_id === focusId), ...byKey.values(), ...roster.slice(0, 8)].filter(
    (r, i, all) => all.findIndex((x) => x.athlete_id === r.athlete_id) === i,
  );
  const rows: DemoRow[] = sample.slice(0, 10).map((r) => ({
    athlete_id: r.athlete_id,
    name: r.name,
    avatar_url: r.avatar_url,
    level_label: r.level?.label ?? null,
    status: r.status,
    readiness: r.readiness,
    adherence_14d: r.adherence_14d,
  }));

  return <SharedDemo rows={rows} checklist={checklist} open={sp.abrir ?? null} focusAthleteId={focusId} />;
}
