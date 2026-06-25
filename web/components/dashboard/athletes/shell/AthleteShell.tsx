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
import type { AtrTransitionReadiness } from '@/lib/dashboard/coach/atr-transition-detector';
import type { AtrBlockType } from '@fahybrid/shared/domain/coach/types';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import {
  AssignFlow,
  type AssignFlowRace,
  type CreatedDraftInfo,
} from '@/components/dashboard/assign-flow/AssignFlow';
import { AthleteBodyView } from '@/components/dashboard/athletes/AthleteBodyView';
import { AthletePerformanceView } from '@/components/dashboard/athletes/AthletePerformanceView';
import { AthleteModalityView } from '@/components/dashboard/athletes/AthleteModalityView';
import {
  AthleteShellHeader,
  type AthleteSection,
} from './AthleteShellHeader';
import { AthleteCalendarSection } from './AthleteCalendarSection';
import { AthleteAttentionZone } from './AthleteAttentionZone';
import { AthleteContextRail } from './AthleteContextRail';

interface AthleteShellProps {
  profile: AthleteProfileShell;
  resumen: AthleteResumen;
  initialPlan: AthletePlanPayload;
  pendingProposal: PendingAdjustment | null;
  /** Nombres de plantilla resueltos del diff de la propuesta (id → name). */
  proposalTemplateNames: Record<string, string>;
  monthlyBlockProposal: MonthlyBlockProposal | null;
  programmingStatus: ProgrammingStatus;
  blocksView: AthleteBlocksView | null;
  subscription: AthleteSubscriptionStatus | null;
  transition: AtrTransitionReadiness;
  /** Fases de periodización del coach (0052). [] → fallback ATR legacy. */
  coachPhases: MethodologyPhase[];
  initialSection: AthleteSection;
  initialZoom: PlanViewMode;
  focusReview: boolean;
}

/**
 * "Acumulación · Semana 3 de 5" — fase activa con semanas reales del bloque.
 * El nombre de fase sale del resolver sobre las fases del coach; sin fases (o
 * bloque legacy) cae al enum ATR → idéntico a hoy.
 */
function buildPhaseLine(
  plan: AthletePlanPayload,
  blockWeek: number | null,
  coachPhases: ReadonlyArray<MethodologyPhase>,
): string | null {
  const block = plan.macro.block;
  if (!block) return null;
  // Resolve via the ACTIVE block's coach phase_id (0052) so the Hub header shows
  // the coach's phase name — identical to the Macro roadmap. No phase_id / no
  // coach phases → resolver falls back to the legacy ATR label.
  const phase = resolvePhase(
    { type: block as AtrBlockType, phase_id: plan.macro.block_phase_id },
    coachPhases,
  ).label;
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
  proposalTemplateNames,
  monthlyBlockProposal,
  programmingStatus,
  blocksView,
  subscription,
  transition,
  coachPhases,
  initialSection,
  initialZoom,
  focusReview,
}: AthleteShellProps) {
  const [section, setSection] = useState<AthleteSection>(initialSection);
  const [zoom, setZoom] = useState<PlanViewMode>(initialZoom);
  const [assignOpen, setAssignOpen] = useState(false);
  const [planReloadKey, setPlanReloadKey] = useState(0);
  // Apertura de la superficie de revisión: vive en la shell para que tanto la
  // zona "Requiere tu atención" como el deep-link ?focus=review la disparen.
  const [reviewOpen, setReviewOpen] = useState(focusReview);
  // Bloque recién creado en borrador (vía AssignFlow). Cuando está presente, la
  // revisión NO mira la propuesta semanal: ancla en la primera semana real del
  // bloque y publica TODAS sus semanas de golpe — así se cierra el loop.
  const [createdDraft, setCreatedDraft] = useState<CreatedDraftInfo | null>(null);
  // Propuesta semanal recién creada por "Evaluar semana": la revisión la usa SIN
  // esperar al router.refresh (evita la carrera en la que `pendingProposal` del
  // servidor aún no está refrescada). Se prefiere sobre la prop del servidor.
  const [freshProposal, setFreshProposal] = useState<PendingAdjustment | null>(null);
  const effectiveProposal = freshProposal ?? pendingProposal;
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
    () => buildPhaseLine(initialPlan, profile.block_week, coachPhases),
    [initialPlan, profile.block_week, coachPhases],
  );

  // Ancla de carrera para el flujo "Programar bloque": la carrera OBJETIVO (la
  // meta a la que apunta el plan), con fallback al evento A — misma derivación
  // que el header (AthleteShellHeader).
  const assignFlowRace: AssignFlowRace | null =
    resumen.target_race != null
      ? { name: resumen.target_race.name, days_until: resumen.target_race.days_until }
      : profile.a_event != null
        ? { name: profile.a_event.name, days_until: profile.a_event.days_until }
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col">
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

      {/* Zona ÚNICA "Requiere tu atención" — consolida intake + propuesta IA +
          evaluar semana (sustituye a los dos banners naranja). Ancho completo
          sobre el grid, justo debajo del header. */}
      <div className="pt-5">
        <AthleteAttentionZone
          athleteId={profile.athlete_id}
          athleteName={profile.full_name}
          intakePending={profile.intake_pending}
          pendingProposal={effectiveProposal}
          monthlyBlockProposal={monthlyBlockProposal}
          programmingStatus={programmingStatus}
          transition={transition}
          onReviewOpen={() => {
            if (section !== 'calendario') changeSection('calendario');
            setReviewOpen(true);
          }}
          onProgramNextBlock={() => setAssignOpen(true)}
          onProposalCreated={setFreshProposal}
        />
      </div>

      {/* Layout 2 columnas: contenido ancho a la izquierda + rail estrecho de
          contexto (ATR · carrera · suscripción) a la derecha; apila en móvil. */}
      <div className="grid gap-[var(--gutter)] pt-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
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
              pendingProposal={effectiveProposal}
              proposalTemplateNames={proposalTemplateNames}
              monthlyBlockProposal={monthlyBlockProposal}
              blocksView={blocksView}
              coachPhases={coachPhases}
              blockWeek={profile.block_week}
              race={assignFlowRace}
              focusReview={focusReview}
              reviewOpen={reviewOpen}
              onReviewOpenChange={setReviewOpen}
              createdDraft={createdDraft}
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

        <AthleteContextRail
          plan={initialPlan}
          blockWeek={profile.block_week}
          coachPhases={coachPhases}
          subscription={subscription}
        />
      </div>

      {/* Programar el próximo bloque (AssignFlow, PHASE 3). Montado a nivel shell
          para que el CTA del header y el empty state compartan instancia. El
          confirm CREA EN BORRADOR: tras crearlo, abre "Revisar & publicar" para
          que el coach lo revise y publique antes de que lo vea el atleta. */}
      <AssignFlow
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        athlete={{ id: profile.athlete_id, full_name: profile.full_name }}
        race={assignFlowRace}
        coachPhases={coachPhases}
        onCreatedDraft={(info) => {
          setCreatedDraft(info);
          setPlanReloadKey((k) => k + 1);
          if (section !== 'calendario') changeSection('calendario');
          setReviewOpen(true);
        }}
      />
    </div>
  );
}
