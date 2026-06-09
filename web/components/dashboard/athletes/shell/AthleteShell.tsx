'use client';

// Shell ÚNICA de la ficha de atleta (UX redesign §2b): header sticky + nav de
// secciones anclada (Calendario · Cuerpo · Rendimiento) que cambia de sección
// SIN navegación de página. Los deep-links (/plan, /cuerpo, /rendimiento)
// redirigen aquí con ?section= / ?focus= / ?view=. El calendario es la columna
// vertebral; Cuerpo y Rendimiento montan las vistas de datos existentes como
// secciones (se quedan montadas tras la primera visita — sin refetch al volver).

import { useMemo, useState } from 'react';
import type { AthleteProfileShell } from '@/lib/dashboard/coach/athlete-profile-shell';
import type { AthleteResumen } from '@/lib/dashboard/coach/resumen';
import type { AthletePlanPayload, PlanViewMode } from '@/lib/dashboard/coach/athlete-plan';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type { MonthlyBlockProposal } from '@/lib/dashboard/coach/monthly-block-proposal';
import type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
import type { AthleteBlocksView } from '@/lib/dashboard/coach/assign-block';
import type { AthleteSubscriptionStatus } from '@/lib/dashboard/coach/subscription-status';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import { ATR_PHASE_LABEL } from '@/lib/dashboard/constants/atr-phases';
import { AssignFlow } from '@/components/dashboard/assign-flow/AssignFlow';
import { AthleteBodyView } from '@/components/dashboard/athletes/AthleteBodyView';
import { AthletePerformanceView } from '@/components/dashboard/athletes/AthletePerformanceView';
import { AthleteModalityView } from '@/components/dashboard/athletes/AthleteModalityView';
import {
  AthleteShellHeader,
  type AthleteSection,
} from './AthleteShellHeader';
import {
  AthleteCalendarSection,
  type MonthAssignmentSummary,
} from './AthleteCalendarSection';

interface AthleteShellProps {
  profile: AthleteProfileShell;
  resumen: AthleteResumen;
  initialPlan: AthletePlanPayload;
  pendingProposal: PendingAdjustment | null;
  monthlyBlockProposal: MonthlyBlockProposal | null;
  programmingStatus: ProgrammingStatus;
  currentMonth: MonthAssignmentSummary | null;
  blocksView: AthleteBlocksView | null;
  subscription: AthleteSubscriptionStatus | null;
  initialSection: AthleteSection;
  initialZoom: PlanViewMode;
  focusReview: boolean;
}

/** "Acumulación · Semana 3 de 5" — fase activa con semanas reales del bloque. */
function buildPhaseLine(plan: AthletePlanPayload, blockWeek: number | null): string | null {
  const block = plan.macro.block;
  if (!block) return null;
  const phase = ATR_PHASE_LABEL[block as AtrBlockType] ?? block;
  const week = plan.macro.block_week ?? blockWeek;
  if (week == null) return phase;
  const span = plan.macro.block_spans.find((s) => s.block_type === block);
  return span ? `${phase} · Semana ${week} de ${span.week_count}` : `${phase} · Semana ${week}`;
}

export function AthleteShell({
  profile,
  resumen,
  initialPlan,
  pendingProposal,
  monthlyBlockProposal,
  programmingStatus,
  currentMonth,
  blocksView,
  subscription,
  initialSection,
  initialZoom,
  focusReview,
}: AthleteShellProps) {
  const [section, setSection] = useState<AthleteSection>(initialSection);
  const [zoom, setZoom] = useState<PlanViewMode>(initialZoom);
  const [assignOpen, setAssignOpen] = useState(false);
  const [planReloadKey, setPlanReloadKey] = useState(0);
  // Secciones visitadas: se montan a la primera y se OCULTAN al salir (los
  // datos de Cuerpo/Rendimiento no se re-piden al volver).
  const [visited, setVisited] = useState<Record<AthleteSection, boolean>>({
    calendario: true,
    cuerpo: initialSection === 'cuerpo',
    rendimiento: initialSection === 'rendimiento',
  });

  const changeSection = (next: AthleteSection) => {
    setSection(next);
    setVisited((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
  };

  const phaseLine = useMemo(
    () => buildPhaseLine(initialPlan, profile.block_week),
    [initialPlan, profile.block_week],
  );

  return (
    <div className="flex flex-col">
      <AthleteShellHeader
        profile={profile}
        resumen={resumen}
        phaseLine={phaseLine}
        section={section}
        onSectionChange={changeSection}
        zoom={zoom}
        onZoomChange={setZoom}
        onAssignOpen={() => setAssignOpen(true)}
      />

      <div className="pt-5">
        <section
          aria-label="Calendario"
          className={section === 'calendario' ? undefined : 'hidden'}
        >
          <AthleteCalendarSection
            athleteName={profile.full_name}
            initialPlan={initialPlan}
            zoom={zoom}
            onZoomChange={setZoom}
            programmingStatus={programmingStatus}
            pendingProposal={pendingProposal}
            monthlyBlockProposal={monthlyBlockProposal}
            currentMonth={currentMonth}
            blocksView={blocksView}
            subscription={subscription}
            blockWeek={profile.block_week}
            focusReview={focusReview}
            planReloadKey={planReloadKey}
            onAssignOpen={() => setAssignOpen(true)}
          />
        </section>

        {visited.cuerpo ? (
          <section aria-label="Cuerpo" className={section === 'cuerpo' ? undefined : 'hidden'}>
            <AthleteBodyView athlete_id={profile.athlete_id} />
          </section>
        ) : null}

        {visited.rendimiento ? (
          <section
            aria-label="Rendimiento"
            className={section === 'rendimiento' ? undefined : 'hidden'}
          >
            <div className="flex flex-col gap-10">
              <AthletePerformanceView athlete_id={profile.athlete_id} />
              <div>
                <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-3">
                  <h2 className="font-heading text-lg uppercase text-[color:var(--fg)]">
                    Modalidades · Run vs Row
                  </h2>
                  <span className="text-xs text-[color:var(--text-muted)]">
                    Reparto, ritmos y desglose por segmento
                  </span>
                </div>
                <AthleteModalityView athlete_id={profile.athlete_id} />
              </div>
            </div>
          </section>
        ) : null}
      </div>

      {/* Asignar & publicar — flujo único (AssignFlow, spec §5). Montado a nivel
          shell para que el CTA del header y el empty state compartan instancia
          y el toast de éxito sobreviva a la recarga del calendario. */}
      <AssignFlow
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        athlete={{ id: profile.athlete_id, full_name: profile.full_name }}
        onPublished={() => {
          setZoom('month');
          setPlanReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
}
