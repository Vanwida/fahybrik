'use client';

// Sección CALENDARIO de la ficha del atleta (UX redesign §2b): UNA superficie
// con 3 niveles de zoom (Semana / Mes / Macro) sobre la misma data, banner de
// propuestas pendientes que abre la superficie canónica de revisión, empty
// state con CTA único de asignación y edición en sitio vía SessionDrawer.

import { useEffect, useRef, useState, useTransition } from 'react';
import type {
  AthletePlanPayload,
  PlanDay,
  PlanSession,
  PlanViewMode,
  PlanWeekRow,
} from '@/lib/dashboard/coach/athlete-plan';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type { MonthlyBlockProposal } from '@/lib/dashboard/coach/monthly-block-proposal';
import type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
import type { AthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import { ATR_PHASE_LABEL } from '@/lib/dashboard/constants/atr-phases';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import { WeekReviewPanel } from '@/components/dashboard/WeekReviewPanel';
import { MonthlyBlockProposalPanel } from '@/components/dashboard/MonthlyBlockProposalPanel';
import { MonthAssignmentBanner } from '@/components/dashboard/MonthAssignmentBanner';
import { EvaluateWeekButton } from '@/components/dashboard/athletes/EvaluateWeekButton';
import { AthleteRaceSection } from '@/components/dashboard/athletes/AthleteRaceSection';
import { SubscriptionStatusCard } from '@/components/dashboard/athletes/SubscriptionStatusCard';
import { MIcon } from '@/components/dashboard/MIcon';
import { firstName } from '@/components/dashboard/assign-flow/helpers';
import { AthleteWeekCalendar } from './AthleteWeekCalendar';
import { AthleteMonthCalendar, weekCompliancePct } from './AthleteMonthCalendar';
import { AthleteMacroView } from './AthleteMacroView';
import { AthleteSessionDrawerHost } from './AthleteSessionDrawerHost';
import { SessionCreateDialog } from './SessionCreateDialog';

export interface MonthAssignmentSummary {
  month_name: string;
  level: string;
  start_date: string;
  end_date: string;
  assignment_count: number;
}

interface AthleteCalendarSectionProps {
  athleteName: string;
  initialPlan: AthletePlanPayload;
  zoom: PlanViewMode;
  onZoomChange: (zoom: PlanViewMode) => void;
  programmingStatus: ProgrammingStatus;
  pendingProposal: PendingAdjustment | null;
  monthlyBlockProposal: MonthlyBlockProposal | null;
  currentMonth: MonthAssignmentSummary | null;
  blocksView: AthleteBlocksView | null;
  subscription: AthleteSubscriptionStatus | null;
  blockWeek: number | null;
  /** Deep-link ?focus=review — aterriza con la revisión abierta y enfocada. */
  focusReview: boolean;
  /** Se incrementa cuando AssignFlow publica — recarga el plan. */
  planReloadKey: number;
  onAssignOpen: () => void;
}

const DAYS_PER_WEEK = 7;

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekRangeLabel(week: PlanWeekRow): string {
  const start = new Date(`${week.week_start}T12:00:00`);
  const end = new Date(`${week.week_end}T12:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();
  const month = (d: Date) => d.toLocaleDateString('es-ES', { month: 'long' });
  return sameMonth
    ? `${start.getDate()} – ${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

function blockContextLabel(plan: AthletePlanPayload, blockWeek: number | null): string | null {
  const block = plan.macro.block;
  if (!block) return null;
  const phase = ATR_PHASE_LABEL[block as AtrBlockType] ?? block;
  const week = plan.macro.block_week ?? blockWeek;
  return week != null ? `${phase} · Semana ${week}` : phase;
}

export function AthleteCalendarSection({
  athleteName,
  initialPlan,
  zoom,
  onZoomChange,
  programmingStatus,
  pendingProposal,
  monthlyBlockProposal,
  currentMonth,
  blocksView,
  subscription,
  blockWeek,
  focusReview,
  planReloadKey,
  onAssignOpen,
}: AthleteCalendarSectionProps) {
  const [plan, setPlan] = useState(initialPlan);
  const [anchorIso, setAnchorIso] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(focusReview);
  const [selected, setSelected] = useState<{ day: PlanDay; session: PlanSession } | null>(null);
  const [createDay, setCreateDay] = useState<PlanDay | null>(null);
  const [isPending, startTransition] = useTransition();

  const reloadPlan = (view: PlanViewMode, anchor: string | null) => {
    setLoadError(null);
    startTransition(async () => {
      try {
        const url = new URL(
          `/api/coach/athletes/${plan.athlete_id}/plan`,
          window.location.origin,
        );
        url.searchParams.set('view', view);
        if (anchor && view === 'week') url.searchParams.set('anchor', anchor);
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) {
          setLoadError('No se pudo cargar el calendario — reintenta.');
          return;
        }
        const json = (await res.json()) as { plan: AthletePlanPayload };
        setPlan(json.plan);
      } catch {
        setLoadError('Error de red al cargar el calendario — reintenta.');
      }
    });
  };

  // Recarga cuando cambia el zoom (mismo dato, distinta densidad/rango) o
  // cuando AssignFlow publica. Saltamos el primer render: el server ya envió
  // el plan del zoom inicial.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    reloadPlan(zoom, anchorIso);
    // reloadPlan es estable a efectos prácticos (solo usa plan.athlete_id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, planReloadKey]);

  // Deep-link ?focus=review → scroll a la superficie de revisión.
  useEffect(() => {
    if (!focusReview) return;
    const el = document.getElementById('athlete-review-surface');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusReview]);

  const navigateWeek = (deltaDays: number) => {
    const base = anchorIso ?? (zoom === 'week' && plan.weeks[0] ? plan.weeks[0].week_start : null);
    const next = addDaysIso(base ?? new Date().toISOString().slice(0, 10), deltaDays);
    setAnchorIso(next);
    reloadPlan('week', next);
  };

  const showEmpty = programmingStatus === 'no_month' && plan.total_sessions === 0;
  const currentWeek =
    zoom === 'week' ? plan.weeks[0] : plan.weeks.find((w) => w.days.some((d) => d.is_today));
  const weekAdherence = currentWeek ? weekCompliancePct(currentWeek) : null;
  const weekDone = currentWeek
    ? currentWeek.days.reduce(
        (n, d) => n + d.sessions.filter((s) => s.status === 'completed').length,
        0,
      )
    : 0;
  const weekScheduled = currentWeek
    ? currentWeek.days.reduce((n, d) => n + d.sessions.length, 0)
    : 0;

  const reviewables: string[] = [];
  if (pendingProposal) reviewables.push('ajuste semanal');
  if (monthlyBlockProposal) reviewables.push(`bloque mensual · ${monthlyBlockProposal.month_name}`);
  const monthlyPanelVisible =
    monthlyBlockProposal != null || programmingStatus === 'month_2_pending';
  if (!monthlyBlockProposal && programmingStatus === 'month_2_pending') {
    reviewables.push('fin de microciclo — propuesta del siguiente bloque');
  }
  const hasReview = reviewables.length > 0;
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {/* Banner fino: propuesta de Pablo IA pendiente (§2b paneles contextuales) */}
      {hasReview && !reviewOpen ? (
        <div className="banner-review" role="status">
          <div className="flex min-w-0 items-center gap-3">
            <MIcon name="pending_actions" size={18} className="shrink-0 text-[color:var(--accent)]" />
            <p className="truncate text-[13px] font-semibold text-[color:var(--fg)]">
              Propuesta de Pablo IA pendiente{' '}
              <span className="font-medium text-[color:var(--text-muted)]">
                · {reviewables.join(' · ')}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="focus-ring shrink-0 rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3 py-1.5 text-xs font-semibold text-[color:var(--fg)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]"
          >
            Revisar
          </button>
        </div>
      ) : null}

      {/* Superficie canónica de revisión (Antes/Propuesto · Aprobar/Rechazar) */}
      {hasReview && reviewOpen ? (
        <div id="athlete-review-surface" className="flex flex-col gap-4">
          {pendingProposal ? (
            <WeekReviewPanel proposal={pendingProposal} highlighted={focusReview} />
          ) : null}
          {monthlyPanelVisible ? (
            <MonthlyBlockProposalPanel
              athlete_id={plan.athlete_id}
              proposal={monthlyBlockProposal}
            />
          ) : null}
        </div>
      ) : null}

      {/* Meta del calendario: rango + navegación + adherencia + evaluación */}
      {!showEmpty ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {zoom === 'week' ? (
              <>
                <button
                  type="button"
                  onClick={() => navigateWeek(-DAYS_PER_WEEK)}
                  disabled={isPending}
                  aria-label="Semana anterior"
                  className="focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-50"
                >
                  <MIcon name="chevron_left" size={18} aria-hidden />
                </button>
                <h3 className="font-heading uppercase text-[color:var(--fg)]">
                  {currentWeek ? weekRangeLabel(currentWeek) : 'Semana'}
                </h3>
                <button
                  type="button"
                  onClick={() => navigateWeek(DAYS_PER_WEEK)}
                  disabled={isPending}
                  aria-label="Semana siguiente"
                  className="focus-ring flex h-7 w-7 items-center justify-center rounded-[var(--r-s)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-50"
                >
                  <MIcon name="chevron_right" size={18} aria-hidden />
                </button>
              </>
            ) : (
              <h3 className="font-heading uppercase text-[color:var(--fg)]">
                {zoom === 'month' ? 'Microciclo' : 'Macrociclo'}
              </h3>
            )}
            {blockContextLabel(plan, blockWeek) ? (
              <span className="micro-label">{blockContextLabel(plan, blockWeek)}</span>
            ) : null}
            {isPending ? (
              <span className="text-xs text-[color:var(--text-muted)]" role="status">
                Cargando…
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            {zoom === 'week' && weekAdherence != null ? (
              <p className="flex items-baseline gap-2">
                <span className="micro-label">Adherencia semana</span>
                <span className="metric-num text-sm font-semibold text-[color:var(--status-success)]">
                  {weekAdherence}%
                </span>
                <span className="micro-label tracking-[0.06em]">
                  {weekDone}/{weekScheduled} hechas
                </span>
              </p>
            ) : null}
            {zoom === 'week' ? <EvaluateWeekButton athleteId={plan.athlete_id} /> : null}
          </div>
        </div>
      ) : null}

      {loadError ? (
        <p
          role="alert"
          className="rounded-[var(--r-m)] border border-[color:color-mix(in_srgb,var(--danger)_40%,var(--border-subtle))] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--danger)]"
        >
          {loadError}{' '}
          <button
            type="button"
            onClick={() => reloadPlan(zoom, anchorIso)}
            className="focus-ring font-semibold underline"
          >
            reintentar
          </button>
        </p>
      ) : null}

      {/* Calendario por zoom — o empty state con CTA único */}
      {showEmpty ? (
        <EmptyCalendar athleteName={athleteName} onAssignOpen={onAssignOpen} />
      ) : zoom === 'week' ? (
        currentWeek ? (
          <AthleteWeekCalendar
            week={currentWeek}
            onSelectSession={(day, session) => setSelected({ day, session })}
            onAddSession={setCreateDay}
          />
        ) : null
      ) : zoom === 'month' ? (
        <>
          {currentMonth ? <MonthAssignmentBanner assignment={currentMonth} /> : null}
          <AthleteMonthCalendar
            weeks={plan.weeks}
            todayIso={todayIso}
            onSelectSession={(day, session) => setSelected({ day, session })}
          />
        </>
      ) : (
        <AthleteMacroView
          plan={plan}
          blockWeek={blockWeek}
          blocksView={blocksView}
          onZoomToMonth={() => onZoomChange('month')}
          onBlockAssigned={() => reloadPlan('macro', null)}
        />
      )}

      {/* Contexto del plan: carreras (el macro apunta a la A-race) + suscripción */}
      <div className="mt-4 grid gap-[var(--gutter)] lg:grid-cols-[2fr_1fr]">
        <AthleteRaceSection athleteId={plan.athlete_id} />
        <SubscriptionStatusCard subscription={subscription} />
      </div>

      {/* Drawer de sesión (edición en sitio, §2b) */}
      {selected ? (
        <AthleteSessionDrawerHost
          athleteId={plan.athlete_id}
          session={selected.session}
          dayOfWeek={selected.day.day_of_week}
          blockLabel={blockContextLabel(plan, blockWeek)}
          onClose={() => setSelected(null)}
          onSaved={() => reloadPlan(zoom, anchorIso)}
        />
      ) : null}

      {/* Alta rápida "+ sesión" */}
      {createDay ? (
        <SessionCreateDialog
          athleteId={plan.athlete_id}
          day={createDay}
          currentBlock={plan.current_block}
          onClose={() => setCreateDay(null)}
          onCreated={() => {
            setCreateDay(null);
            reloadPlan(zoom, anchorIso);
          }}
        />
      ) : null}
    </div>
  );
}

// ── Empty state: calendario vacío + CTA único (§2b estados) ─────────────────
function EmptyCalendar({
  athleteName,
  onAssignOpen,
}: {
  athleteName: string;
  onAssignOpen: () => void;
}) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="grid grid-cols-2 gap-[var(--gutter)] opacity-40 sm:grid-cols-4 lg:grid-cols-7"
      >
        {Array.from({ length: DAYS_PER_WEEK }, (_, i) => (
          <div
            key={i}
            className="h-64 rounded-[var(--r-l)] border border-dashed border-[color:var(--border-subtle)]"
          />
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
        <p className="font-heading text-[color:var(--fg)]">Sin plan publicado</p>
        <p className="max-w-sm text-sm text-[color:var(--text-muted)]">
          Asigna un microciclo y publícalo para que {firstName(athleteName)} lo vea en su móvil.
        </p>
        <button
          type="button"
          onClick={onAssignOpen}
          aria-haspopup="dialog"
          className="focus-ring rounded-[var(--r-m)] bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
        >
          Asignar microciclo
        </button>
      </div>
    </div>
  );
}
