import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCoachSession } from '@/lib/auth/coach-session';
import { buildAthleteResumen, ResumenError } from '@/lib/dashboard/coach/resumen';
import {
  buildAthletePlan,
  AthletePlanError,
  type PlanViewMode,
} from '@/lib/dashboard/coach/athlete-plan';
import { fetchAthleteProfileShell } from '@/lib/dashboard/coach/athlete-profile-shell';
import { getPendingProposalForAthlete } from '@/lib/dashboard/coach/week-adjustments';
import { getAthleteProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
import { listAthleteMonthAssignments } from '@/lib/dashboard/programming/assign-month';
import { loadPendingMonthlyBlock } from '@/lib/dashboard/coach/monthly-block-proposal';
import { getAthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import { buildAthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import { AthleteShell } from '@/components/dashboard/athletes/shell/AthleteShell';
import type { AthleteSection } from '@/components/dashboard/athletes/shell/AthleteShellHeader';

// Ficha de atleta calendar-first (UX redesign §2b): UNA página/shell. La nav
// de secciones es estado de cliente; los deep-links antiguos (/plan, /cuerpo,
// /rendimiento) redirigen aquí con ?section= / ?focus= / ?view=.

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ section?: string; focus?: string; view?: string }>;
}) {
  const { locale, id } = await params;
  const { section, focus, view } = await searchParams;
  setRequestLocale(locale);

  // Legacy deep link: la revisión de intake vive en su propia ruta.
  if (focus === 'intake') {
    redirect({ href: `/atletas/${id}/intake`, locale });
  }

  const session = await getCoachSession();
  if (!session) return null;

  const athleteId = Number(id);
  if (!Number.isFinite(athleteId)) notFound();

  const initialSection: AthleteSection =
    section === 'cuerpo' || section === 'rendimiento' ? section : 'calendario';
  const initialZoom: PlanViewMode =
    view === 'macro' || view === 'month' || view === 'week' ? view : 'week';

  // Fetch dentro de try/catch (404 → notFound). El JSX se construye DESPUÉS:
  // la regla react-hooks/error-boundaries prohíbe construir JSX dentro de un
  // try/catch (un error de render no se capturaría ahí de todas formas).
  const data = await fetchAthleteShellData(session.coach_id, athleteId, initialZoom);
  const [
    profile,
    resumen,
    plan,
    pendingProposal,
    programming,
    monthAssignments,
    monthlyBlockProposal,
    subscription,
    blocksView,
  ] = data;

  if (!profile) notFound();

  return (
    <AthleteShell
      profile={profile}
      resumen={resumen}
      initialPlan={plan}
      pendingProposal={pendingProposal}
      monthlyBlockProposal={monthlyBlockProposal}
      programmingStatus={programming.status}
      currentMonth={monthAssignments[0] ?? null}
      blocksView={blocksView}
      subscription={subscription}
      initialSection={initialSection}
      initialZoom={initialZoom}
      focusReview={focus === 'review'}
    />
  );
}

// Carga todos los datasets de la shell; un 404 de resumen/plan → notFound().
async function fetchAthleteShellData(
  coach_id: bigint,
  athlete_id: number,
  view_mode: PlanViewMode,
) {
  try {
    return await Promise.all([
      fetchAthleteProfileShell({ coach_id, athlete_id }),
      buildAthleteResumen({ coach_id, athlete_id }),
      buildAthletePlan({ coach_id, athlete_id, view_mode }),
      getPendingProposalForAthlete({ coach_id, athlete_id }),
      getAthleteProgrammingStatus({ athlete_id }),
      listAthleteMonthAssignments({ coach_id, athlete_id }),
      loadPendingMonthlyBlock({ athlete_id }),
      getAthleteSubscriptionStatus({ coach_id, athlete_id }),
      buildAthleteBlocksView({ coach_id, athlete_id }),
    ]);
  } catch (err) {
    if (
      (err instanceof ResumenError && err.status === 404) ||
      (err instanceof AthletePlanError && err.status === 404)
    ) {
      notFound();
    }
    throw err;
  }
}
