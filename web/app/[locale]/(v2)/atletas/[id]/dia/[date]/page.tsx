// v2 · ATLETA · DÍA — enlace viejo al editor de un día. El editor vive ahora en el
// panel del calendario de la ficha: se redirige a la ficha con el primer entreno
// de ese día abierto (`?sesion=`), o a la semana de ese día si no tiene ninguno.

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getCoachSession } from '@/lib/auth/coach-session';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AthleteDayRedirect({
  params,
}: {
  params: Promise<{ locale: string; id: string; date: string }>;
}) {
  const { locale, id, date } = await params;
  setRequestLocale(locale);
  const session = await getCoachSession();
  if (!session) return null;
  const athleteId = Number(id);
  if (!Number.isSafeInteger(athleteId) || athleteId <= 0 || !ISO_DATE.test(date)) notFound();

  const rows = await sql<Array<{ id: string }>>`
    select wa.id::text
    from workout_assignments wa
    join athletes a on a.id = wa.athlete_id and a.coach_id = ${Number(session.coach_id)}
    where wa.athlete_id = ${athleteId} and wa.scheduled_for = ${date}::date and wa.origin = 'coach'
    order by wa.planned_sequence nulls last, wa.id
    limit 1
  `;
  redirect({ href: rows[0] ? `/atletas/${athleteId}?sesion=${rows[0].id}` : `/atletas/${athleteId}`, locale });
}
