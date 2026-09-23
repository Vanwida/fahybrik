// Programar › un grupo: su plan de un vistazo, programas, gente y regla.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { getGroup } from '@/lib/coach/groups';
import { sql } from '@/lib/db';
import { listPrograms } from '@/lib/dashboard/programming/programs';
import { loadGroupPlanExtras } from '@/lib/dashboard/programming/group-plan';
import { GroupPage } from '@/components/v2/periodizacion/GroupPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Grupo' };

export default async function GrupoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const groupId = Number(id);
  if (!Number.isInteger(groupId) || groupId <= 0) notFound();
  const coachId = Number(session.coach_id);
  const group = await getGroup(coachId, groupId);
  if (!group) notFound();
  const [extras, programs, levels] = await Promise.all([
    loadGroupPlanExtras({ coach_id: coachId, program_ids: group.programs.map((p) => p.program_id), member_ids: group.members.map((m) => m.athlete_id) }).catch(() => ({ volumes: {}, races: [] })),
    listPrograms({ coach_id: coachId }).catch(() => []),
    sql<Array<{ id: string; name: string; label: string }>>`select id::text, name, label from athlete_levels where coach_id = ${coachId} order by sort_order, id`.catch(() => []),
  ]);
  return (
    <GroupPage
      group={group}
      volumes={extras.volumes}
      races={extras.races}
      programs={programs.filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name, weeks: p.weeks }))}
      levels={levels}
    />
  );
}
