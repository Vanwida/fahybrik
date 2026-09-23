'use client';

// v2 · ATLETA · INTAKE REVIEW — the coach's review-and-activate screen for a new
// athlete. Left column = the decisions that build the intake commit; right column =
// the athlete's onboarding answers (read-only). The footer gate unlocks "Asignar
// plan", which POSTs to the EXISTING commit endpoint (/api/coach/intake/[id]) — the
// same call that marks the intake reviewed (intake_completed_at), drops the athlete
// from the "alta sin revisar" lane, and materialises the first microciclo in DRAFT.
//
// AGNOSTIC: the LEVEL decision reuses ClasificacionCard (coach-owned athlete_levels,
// the same control as PerfilTab). The plan-mode step only asks shared vs personal —
// it does not invent a microciclo skeleton. Nothing here hardcodes a method.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { StatusBadge, buttonVariants } from '@/components/v2/ui';
import { ArrowRight, ChevronRight, CircleCheck, Hourglass } from 'lucide-react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { ClasificacionCard } from '@/components/v2/atleta-detalle/ClasificacionCard';
import { AthleteAnswers } from '@/components/v2/intake/AthleteAnswers';
import { IntakeRaces } from '@/components/v2/intake/IntakeRaces';
import {
  AssignBar,
  BaselineTestsStep,
  EventAnchorStep,
  StepShell,
  WarningsStep,
  WelcomeNotesStep,
  type GateCheck,
} from '@/components/v2/intake/IntakeSteps';
import { BlockStructureStep } from '@/components/v2/intake/IntakeBlockStructure';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import { INTAKE_PLAN_MODE_DEFAULT, type IntakePlanMode } from '@fahybrid/shared/schema/coach-intake';
import { tenureSuffix } from '@/lib/dashboard/relative-time';
import { useLevelAxisLabel } from '@/components/v2/controls/useLevelAxisLabel';

/** La siguiente alta de la fila, con el resto de la fila detrás. */
function nextHref(queue: string[]): string {
  const [next, ...rest] = queue;
  return `/atletas/${next}/intake${rest.length > 0 ? `?fila=${rest.join(',')}` : ''}`;
}

const EVENT_WARNING_KINDS = new Set(['a_event_invalid', 'a_event_close']);
const SEX_LABEL: Record<string, string> = { male: 'Masculino', female: 'Femenino', other: 'Otro' };

/** "esperando N días/h" tenure from onboarding — SAME elapsed source (tenureSuffix)
 *  as the athlete ficha, so the same athlete shows the same number in both. */
function waitingLabel(onboardedAt: string | null): string | null {
  const suffix = tenureSuffix(onboardedAt);
  if (suffix == null) return null;
  return suffix === 'instantes' ? 'recién llegado' : `esperando ${suffix}`;
}

export function IntakeReview({
  review,
  athleteId,
  embedded = false,
  queue = [],
}: {
  review: IntakeReviewPayload;
  athleteId: string;
  /** Dentro de la ficha (el atleta «Nuevo»): sin ruta ni cabecera propias, y al
   *  asignar se recarga la ficha en vez de navegar. */
  embedded?: boolean;
  /** «Revisar en fila» (Hoy): las altas que vienen detrás, en orden. */
  queue?: string[];
}) {
  const router = useRouter();
  const axisLabel = useLevelAxisLabel();
  const { profile, classification, month_proposal } = review;
  const { athlete, suggestions, warnings, target_event } = profile;

  const alreadyReviewed = athlete.intake_completed_at != null;

  // ── Form state (defaults seeded from the auto-suggestions) ────────────────────
  // De qué nace el plan: la periodización que el coach ya tiene montada (defecto,
  // el comportamiento de siempre) o una cadena de microciclos solo para él.
  const [planMode, setPlanMode] = useState<IntakePlanMode>(INTAKE_PLAN_MODE_DEFAULT);
  const [includedTests, setIncludedTests] = useState<Set<string>>(
    () => new Set(suggestions.baseline_tests.map((t) => t.slug)),
  );
  const [welcomeSend, setWelcomeSend] = useState(true);
  const [welcomeBody, setWelcomeBody] = useState(suggestions.welcome_draft);
  const [notes, setNotes] = useState('');
  const [acknowledged, setAcknowledged] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Gate derivation ───────────────────────────────────────────────────────────
  const eventOk = target_event != null && !target_event.is_in_past;
  // Level is required only when the coach actually has a level catalog to pick from;
  // otherwise we degrade (the numeric snapshot still records a level suggestion).
  const nivelOk = classification.levels.length === 0 || classification.level_id != null;
  const manualWarnings = useMemo(
    () => warnings.filter((w) => !EVENT_WARNING_KINDS.has(w.kind)),
    [warnings],
  );
  const avisosOk = manualWarnings.every((w) => acknowledged.has(w.kind));
  const canAssign = eventOk && nivelOk && avisosOk;

  const checks: GateCheck[] = [
    { key: 'evento', label: 'Evento', state: eventOk ? 'ok' : 'blocked' },
    { key: 'nivel', label: axisLabel, state: nivelOk ? 'ok' : 'pending' },
    {
      key: 'avisos',
      label: `Avisos ${manualWarnings.filter((w) => acknowledged.has(w.kind)).length}/${manualWarnings.length}`,
      state: avisosOk ? 'ok' : 'pending',
    },
    { key: 'bienvenida', label: 'Bienvenida', state: 'ok' },
  ];

  function toggleTest(slug: string) {
    setIncludedTests((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }
  function ackWarning(kind: string) {
    setAcknowledged((prev) => new Set(prev).add(kind));
  }

  async function assign() {
    if (!canAssign || submitting || !target_event) return;
    setSubmitting(true);
    setError(null);
    const body = {
      target_event_id: target_event.event_id,
      plan_mode: planMode,
      // Numeric snapshot level (1-4) — the algorithm's reading; the functional,
      // agnostic level is the catalog level set via ClasificacionCard above.
      level: suggestions.level,
      baseline_tests: suggestions.baseline_tests.filter((t) => includedTests.has(t.slug)),
      welcome: { send: welcomeSend, body: welcomeSend ? welcomeBody.trim() || null : null },
      acknowledged_warnings: Array.from(acknowledged),
      notes: notes.trim() ? notes.trim() : null,
    };
    try {
      const res = await fetch(`/api/coach/intake/${athleteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'No se pudo asignar. Inténtalo de nuevo.');
        setSubmitting(false);
        return;
      }
      // Alta cerrada → la ficha pasa a su calendario (el primer programa, oculto).
      if (embedded) router.refresh();
      else if (queue.length > 0) router.push(nextHref(queue));
      else router.push(`/atletas/${athleteId}`);
    } catch {
      setError('No se pudo asignar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  // ── Already-reviewed guard ────────────────────────────────────────────────────
  if (alreadyReviewed) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-16 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-v2-ok-soft text-v2-ok">
          <CircleCheck aria-hidden strokeWidth={1.75} className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="t-title-sm text-v2-fg">Alta ya revisada</h1>
          <p className="t-body text-v2-muted">El alta de {athlete.full_name} ya está revisada. Su plan está en marcha.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/atletas/${athleteId}`} className={buttonVariants({ variant: 'primary' })}>
            Ver plan del atleta
            <ArrowRight aria-hidden strokeWidth={1.75} />
          </Link>
          <Link href="/hoy?vista=altas" className={buttonVariants({ variant: 'ghost' })}>
            Volver a Hoy
          </Link>
          {queue.length > 0 ? (
            <Link href={nextHref(queue)} className={buttonVariants({ size: 'md' })}>
              Siguiente alta · quedan {queue.length}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const tenure = waitingLabel(athlete.onboarded_at);

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-5">
      {embedded ? null : (
      <>
      {/* ── Breadcrumb ───────────────────────────────────────────────────────── */}
      <nav aria-label="Ruta" className="flex items-center gap-1 t-meta text-v2-muted">
        <Link href="/hoy?vista=altas" className="v2-focus rounded-[4px] hover:text-v2-fg">
          Altas pendientes
        </Link>
        <ChevronRight aria-hidden strokeWidth={1.75} className="size-3.5 text-v2-faint" />
        <Link href={`/atletas/${athleteId}`} className="v2-focus rounded-[4px] hover:text-v2-fg">
          {athlete.full_name}
        </Link>
        <ChevronRight aria-hidden strokeWidth={1.75} className="size-3.5 text-v2-faint" />
        <span className="text-v2-fg">Alta pendiente</span>
        {queue.length > 0 ? (
          <Link href={nextHref(queue)} className={buttonVariants({ size: 'sm', className: 'ml-auto' })}>
            Siguiente alta · quedan {queue.length}
          </Link>
        ) : null}
      </nav>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3">
        <AthleteAvatar name={athlete.full_name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <StatusBadge size="sm" tone="info" label="Alta pendiente" />
          <h1 className="t-title text-v2-fg">{athlete.full_name}</h1>
          <div className="flex flex-wrap items-center gap-2 t-meta text-v2-muted">
            {athlete.age != null ? <span className="t-tnum">{athlete.age} años</span> : null}
            {athlete.sex ? <span>· {SEX_LABEL[athlete.sex] ?? athlete.sex}</span> : null}
            {athlete.primary_discipline ? (
              <span className="uppercase">· {athlete.primary_discipline}</span>
            ) : null}
            {tenure ? (
              <span className="inline-flex items-center gap-1 text-v2-faint">
                <Hourglass aria-hidden strokeWidth={1.75} className="size-3.5" />
                {tenure}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      </>
      )}

      {/* ── Two columns ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left — decisions */}
        <div className="flex flex-col gap-4">
          <StepShell n={1}>
            <EventAnchorStep targetEvent={target_event} />
          </StepShell>

          <StepShell n={2}>
            <div className="flex flex-col gap-2">
              <ClasificacionCard athleteId={athleteId} data={classification} />
              {planMode === 'shared' && month_proposal ? (
                <p className="px-0.5 t-meta text-v2-faint">
                  Programa de referencia para su {axisLabel.toLowerCase()}: {month_proposal.month_name}.
                </p>
              ) : null}
            </div>
          </StepShell>

          <StepShell n={3}>
            <BlockStructureStep mode={planMode} onChangeMode={setPlanMode} />
          </StepShell>

          <StepShell n={4}>
            <BaselineTestsStep
              tests={suggestions.baseline_tests}
              included={includedTests}
              onToggle={toggleTest}
            />
          </StepShell>

          <StepShell n={5}>
            <WarningsStep
              warnings={warnings}
              acknowledged={acknowledged}
              onAck={ackWarning}
              eventResolved={eventOk}
            />
          </StepShell>

          <StepShell n={6}>
            <WelcomeNotesStep
              send={welcomeSend}
              body={welcomeBody}
              notes={notes}
              onChangeSend={setWelcomeSend}
              onChangeBody={setWelcomeBody}
              onChangeNotes={setNotes}
            />
          </StepShell>
        </div>

        {/* Right — athlete data (read-only): real races, then onboarding answers */}
        <aside className="flex flex-col gap-3">
          <IntakeRaces past={review.races.past} upcoming={review.races.upcoming} />
          <div className="flex flex-col gap-2">
            <span className="t-label text-v2-faint">Respuestas del atleta</span>
            <AthleteAnswers profile={profile} />
          </div>
        </aside>
      </div>

      <AssignBar
        checks={checks}
        canAssign={canAssign}
        submitting={submitting}
        error={error}
        readyHint={
          planMode === 'personal'
            ? 'No se crea ningún programa todavía. Lo escribes tú desde su plan.'
            : 'Se asigna el primer programa con sus semanas ocultas al atleta, para que lo revises antes de publicar.'
        }
        onAssign={assign}
      />
    </div>
  );
}
