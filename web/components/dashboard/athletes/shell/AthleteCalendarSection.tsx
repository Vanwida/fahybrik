'use client';

// Sección CALENDARIO de la ficha del atleta (UX redesign §2b): UNA superficie
// con 3 niveles de zoom (Semana / Mes / Macro) sobre la misma data, banner de
// propuestas pendientes que abre la superficie canónica de revisión, empty
// state con CTA único de asignación y edición en sitio vía SessionDrawer.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
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
import type { CreatedDraftInfo } from '@/components/dashboard/assign-flow/AssignFlow';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import { AthleteReviewPublish } from './AthleteReviewPublish';
import { MonthlyBlockProposalPanel } from '@/components/dashboard/MonthlyBlockProposalPanel';
import { MIcon } from '@/components/dashboard/MIcon';
import { firstName } from '@/components/dashboard/assign-flow/helpers';
import { AthleteWeekCalendar } from './AthleteWeekCalendar';
import { AthleteBlockMonth } from './AthleteBlockMonth';
import { AthleteMacroRoadmap } from './AthleteMacroRoadmap';
import { buildRoadmap } from './block-roadmap';
import { AthleteSessionDrawerHost } from './AthleteSessionDrawerHost';
import { SessionCreateDialog } from './SessionCreateDialog';

interface AthleteCalendarSectionProps {
  athleteName: string;
  initialPlan: AthletePlanPayload;
  zoom: PlanViewMode;
  onZoomChange: (zoom: PlanViewMode) => void;
  programmingStatus: ProgrammingStatus;
  pendingProposal: PendingAdjustment | null;
  /** Nombres de plantilla resueltos del diff de la propuesta (id → name). */
  proposalTemplateNames: Record<string, string>;
  monthlyBlockProposal: MonthlyBlockProposal | null;
  blocksView: AthleteBlocksView | null;
  /** Fases de periodización del coach (0052). [] → fallback ATR legacy. */
  coachPhases: MethodologyPhase[];
  blockWeek: number | null;
  /** Carrera objetivo (header) — ancla del final del roadmap Macro. */
  race: { name: string; days_until: number } | null;
  /** Deep-link ?focus=review — aterriza con la revisión abierta y enfocada. */
  focusReview: boolean;
  /** Apertura controlada de la superficie de revisión (la dispara la shell). */
  reviewOpen: boolean;
  onReviewOpenChange: (open: boolean) => void;
  /**
   * Bloque recién creado en borrador (AssignFlow). Cuando está presente y NO hay
   * propuesta semanal, la revisión ancla en la primera semana real del bloque y
   * publica todas sus semanas de golpe (cierra el loop crear→revisar→publicar).
   */
  createdDraft: CreatedDraftInfo | null;
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

function blockContextLabel(
  plan: AthletePlanPayload,
  blockWeek: number | null,
  coachPhases: ReadonlyArray<MethodologyPhase>,
): string | null {
  const block = plan.macro.block;
  if (!block) return null;
  // Nombre de fase del resolver: usa el phase_id del bloque ACTIVO (0052) para
  // mostrar la fase del coach — idéntico al Macro roadmap. Sin phase_id / sin
  // fases del coach → cae al label ATR legacy.
  const phase = resolvePhase(
    { type: block as AtrBlockType, phase_id: plan.macro.block_phase_id },
    coachPhases,
  ).label;
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
  proposalTemplateNames,
  monthlyBlockProposal,
  blocksView,
  coachPhases,
  blockWeek,
  race,
  focusReview,
  reviewOpen,
  onReviewOpenChange,
  createdDraft,
  planReloadKey,
  onAssignOpen,
}: AthleteCalendarSectionProps) {
  const [plan, setPlan] = useState(initialPlan);
  const [anchorIso, setAnchorIso] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Click en una semana de Mes/Macro → salta a la vista Semana anclada a esa
  // fecha. Fijamos el ancla y disparamos el cambio de zoom (el effect de zoom
  // recarga el plan con ese anchor).
  const openWeek = (weekStartIso: string) => {
    setAnchorIso(weekStartIso);
    if (zoom !== 'week') {
      onZoomChange('week');
    } else {
      reloadPlan('week', weekStartIso);
    }
  };

  // Roadmap derivado de la vista por-bloque (fuente única de Mes + Macro). Hoy
  // se calcula en cliente; estable por render.
  const roadmap = useMemo(
    () => buildRoadmap(blocksView, new Date().toISOString().slice(0, 10), coachPhases),
    [blocksView, coachPhases],
  );

  const showEmpty = programmingStatus === 'no_month' && plan.total_sessions === 0;
  const currentWeek =
    zoom === 'week' ? plan.weeks[0] : plan.weeks.find((w) => w.days.some((d) => d.is_today));
  const weekDone = currentWeek
    ? currentWeek.days.reduce(
        (n, d) => n + d.sessions.filter((s) => s.status === 'completed').length,
        0,
      )
    : 0;
  const weekScheduled = currentWeek
    ? currentWeek.days.reduce((n, d) => n + d.sessions.length, 0)
    : 0;

  // El panel de bloque mensual (otra decisión del coach) sigue siendo una
  // superficie hermana de la revisión de la semana cuando hay propuesta de
  // bloque pendiente o estamos al final del microciclo.
  const monthlyPanelVisible =
    monthlyBlockProposal != null || programmingStatus === 'month_2_pending';

  return (
    <div className="flex flex-col gap-4">
      {/* Superficie canónica "Revisar & publicar" — el coach revisa EXACTAMENTE
          lo que verá el atleta (semana propuesta en BORRADOR, con el porqué + un
          diff con NOMBRES) y publica. La apertura la dispara la zona "Tus
          decisiones" (shell). El panel de bloque mensual (otra decisión) se
          mantiene como superficie hermana cuando aplica. */}
      {reviewOpen ? (
        <div id="athlete-review-surface" className="flex flex-col gap-4">
          <AthleteReviewPublish
            athleteId={plan.athlete_id}
            athleteName={athleteName}
            proposal={pendingProposal}
            createdDraft={createdDraft}
            templateNames={proposalTemplateNames}
            phaseLine={blockContextLabel(plan, blockWeek, coachPhases)}
            onClose={() => onReviewOpenChange(false)}
            onEditInCalendar={(weekStartIso) => {
              // "Editar plan": cierra la revisión y aterriza en la SEMANA
              // revisada (vista Semana anclada) para editar en sitio vía el
              // drawer de sesión — sin redirigir ni resetear el contexto.
              onReviewOpenChange(false);
              openWeek(weekStartIso);
            }}
          />
          {monthlyPanelVisible ? (
            <MonthlyBlockProposalPanel
              athlete_id={plan.athlete_id}
              proposal={monthlyBlockProposal}
            />
          ) : null}
        </div>
      ) : null}

      {/* Calendario regular — OCULTO durante la revisión: la superficie de
          revisión toma el área del calendario (revisión enfocada, sin duplicar
          la semana ni alargar la página). Vuelve con "× Cerrar". */}
      {reviewOpen ? null : (
        <>
      {/* Meta del calendario SOLO en Semana: rango + navegación + conteo, todo
          en una fila izq→dcha (§11). Mes y Macro traen su propia cabecera
          (bloque + semanas), así que aquí no duplicamos título (§12). */}
      {!showEmpty && zoom === 'week' ? (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
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
            {isPending ? (
              <span className="text-xs text-[color:var(--text-muted)]" role="status">
                Cargando…
              </span>
            ) : null}
          </div>

          {/* Conteo de la semana junto al resumen — SIN repetir el % (el hero
              del header ya es el cumplimiento) ni la fase ATR (§11, §12). */}
          {weekScheduled > 0 ? (
            <p className="flex items-baseline gap-2">
              <span className="micro-label">Esta semana</span>
              <span className="metric-num text-sm font-semibold text-[color:var(--fg)]">
                {weekDone}/{weekScheduled}
              </span>
              <span className="micro-label tracking-[0.06em]">hechas</span>
            </p>
          ) : (
            <span className="micro-label">Semana de descanso</span>
          )}
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

      {/* Calendario por zoom — o empty state con CTA único.
          SEMANA: training-log de días (sin cambios). MES: semanas del bloque
          actual como filas. MACRO: el roadmap ATR del macrociclo. Mes y Macro
          se construyen sobre el roadmap (vista por-bloque), NO sobre el rango
          de plan.weeks (que dependía de athlete_month_assignments, desalineado). */}
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
        <AthleteBlockMonth roadmap={roadmap} onOpenWeek={openWeek} />
      ) : (
        <AthleteMacroRoadmap
          roadmap={roadmap}
          coachPhases={coachPhases}
          race={race}
          onOpenWeek={openWeek}
          onProgramBlock={onAssignOpen}
        />
      )}
        </>
      )}

      {/* Carreras y suscripción se han movido al rail de contexto (AthleteContextRail,
          §6) — el contexto del plan vive en la columna derecha, no aquí debajo. */}

      {/* Drawer de sesión (edición en sitio, §2b) */}
      {selected ? (
        <AthleteSessionDrawerHost
          athleteId={plan.athlete_id}
          session={selected.session}
          dayOfWeek={selected.day.day_of_week}
          blockLabel={blockContextLabel(plan, blockWeek, coachPhases)}
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
          Programa el próximo bloque y publícalo para que {firstName(athleteName)} lo vea en su móvil.
        </p>
        <button
          type="button"
          onClick={onAssignOpen}
          aria-haspopup="dialog"
          className="focus-ring rounded-[var(--r-m)] bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
        >
          Programar bloque
        </button>
      </div>
    </div>
  );
}
