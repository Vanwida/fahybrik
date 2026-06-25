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
import {
  getPendingProposalForAthlete,
  loadProposalTemplateNames,
} from '@/lib/dashboard/coach/week-adjustments';
import { getAthleteProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
import { loadPendingMonthlyBlock } from '@/lib/dashboard/coach/monthly-block-proposal';
import { getAthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import { buildAthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import { evaluateAtrTransitionReadiness } from '@/lib/dashboard/coach/atr-transition-detector';
import { loadCoachPhases } from '@/lib/dashboard/coach/phases';
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

  // Fases de periodización del coach (migración 0052). Carga ÚNICA aquí; se hilan
  // a los componentes de display + al detector de transición. loadCoachPhases está
  // guardada: devuelve [] si la tabla no existe (pre-migración) → el resolver cae
  // al enum ATR legacy y la UI se ve idéntica a hoy.
  const coachPhases = await loadCoachPhases(session.coach_id);

  // Fetch dentro de try/catch (404 → notFound). El JSX se construye DESPUÉS:
  // la regla react-hooks/error-boundaries prohíbe construir JSX dentro de un
  // try/catch (un error de render no se capturaría ahí de todas formas).
  const data = await fetchAthleteShellData(
    session.coach_id,
    athleteId,
    initialZoom,
    coachPhases,
  );
  const [
    profile,
    resumen,
    plan,
    pendingProposal,
    programming,
    monthlyBlockProposal,
    subscription,
    blocksView,
    transition,
  ] = data;

  if (!profile) notFound();

  // Nombres de plantilla del diff de la propuesta (id → name) — resueltos en el
  // server con el resolver canónico para que la superficie de revisión muestre
  // nombres de sesión, nunca IDs numéricos.
  const proposalTemplateNames = pendingProposal
    ? await loadProposalTemplateNames({ proposal: pendingProposal.proposal })
    : {};

  return (
    <AthleteShell
      profile={profile}
      resumen={resumen}
      initialPlan={plan}
      pendingProposal={pendingProposal}
      proposalTemplateNames={proposalTemplateNames}
      monthlyBlockProposal={monthlyBlockProposal}
      programmingStatus={programming.status}
      blocksView={blocksView}
      subscription={subscription}
      transition={transition}
      coachPhases={coachPhases}
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
  coachPhases: Awaited<ReturnType<typeof loadCoachPhases>>,
) {
  try {
    return await Promise.all([
      fetchAthleteProfileShell({ coach_id, athlete_id }),
      buildAthleteResumen({ coach_id, athlete_id }),
      buildAthletePlan({ coach_id, athlete_id, view_mode }),
      getPendingProposalForAthlete({ coach_id, athlete_id }),
      getAthleteProgrammingStatus({ athlete_id }),
      loadPendingMonthlyBlock({ athlete_id }),
      getAthleteSubscriptionStatus({ coach_id, athlete_id }),
      buildAthleteBlocksView({ coach_id, athlete_id }),
      // Transición de fase (surface-only): config-driven por las fases del coach.
      // Un fallo del detector NUNCA debe tumbar la ficha → degradar a "no listo".
      evaluateAtrTransitionReadiness({ athlete_id, coachPhases }).catch(
        () =>
          ({ ready: false, current_block: null, reason: 'detector no disponible' }) as const,
      ),
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
