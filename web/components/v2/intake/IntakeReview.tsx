'use client';

// v2 · ATLETA · INTAKE REVIEW — the coach's review-and-activate screen for a new
// athlete. Left column = the decisions that build the intake commit; right column =
// the athlete's onboarding answers (read-only). The footer gate unlocks "Asignar
// plan", which POSTs to the EXISTING commit endpoint (/api/coach/intake/[id]) — the
// same call that marks the intake reviewed (intake_completed_at), drops the athlete
// from the "alta sin revisar" lane, and materialises the first microciclo in DRAFT.
//
// AGNOSTIC: the LEVEL decision reuses ClasificacionCard (coach-owned athlete_levels,
// the same control as PerfilTab); block structure uses the coach's suggested
// microciclo names. Nothing here hardcodes a method (no ATR, no fixed level labels).

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { ClasificacionCard } from '@/components/v2/atleta-detalle/ClasificacionCard';
import { AthleteAnswers } from '@/components/v2/intake/AthleteAnswers';
import {
  AssignBar,
  BaselineTestsStep,
  BlockStructureStep,
  EventAnchorStep,
  StepShell,
  WarningsStep,
  WelcomeNotesStep,
  type GateCheck,
} from '@/components/v2/intake/IntakeSteps';
import type { IntakeReviewPayload } from '@/lib/dashboard/v2/intake-review';
import type { IntakeBlockSpec } from '@fahybrid/shared/schema/coach-intake';
import { tenureSuffix } from '@/lib/dashboard/relative-time';

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
}: {
  review: IntakeReviewPayload;
  athleteId: string;
}) {
  const router = useRouter();
  const { profile, classification, month_proposal } = review;
  const { athlete, suggestions, warnings, target_event } = profile;

  const alreadyReviewed = athlete.intake_completed_at != null;

  // ── Form state (defaults seeded from the auto-suggestions) ────────────────────
  const [blockSpecs, setBlockSpecs] = useState<IntakeBlockSpec[]>(() =>
    suggestions.block_specs.map((b) => ({ ...b })),
  );
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
    { key: 'nivel', label: 'Nivel', state: nivelOk ? 'ok' : 'pending' },
    { key: 'estructura', label: 'Estructura', state: 'ok' },
    {
      key: 'avisos',
      label: `Avisos ${manualWarnings.filter((w) => acknowledged.has(w.kind)).length}/${manualWarnings.length}`,
      state: avisosOk ? 'ok' : 'pending',
    },
    { key: 'bienvenida', label: 'Bienvenida', state: 'ok' },
  ];

  function changeWeeks(index: number, weeks: number) {
    setBlockSpecs((prev) => prev.map((b, i) => (i === index ? { ...b, weeks } : b)));
  }
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
      block_specs: blockSpecs,
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
      // Intake committed → land on the athlete's plan (the new draft microciclo).
      router.push(`/atletas/${athleteId}?tab=plan`);
    } catch {
      setError('No se pudo asignar. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  // ── Already-reviewed guard ────────────────────────────────────────────────────
  if (alreadyReviewed) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 py-16 text-center">
        <span className="text-[color:var(--v2-ok)]">
          <MIcon name="task_alt" size={40} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-[color:var(--v2-fg)]">Alta ya revisada</h1>
          <p className="text-sm text-[color:var(--v2-muted)]">
            El intake de {athlete.full_name} ya está completado. Su plan está en marcha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/atletas/${athleteId}?tab=plan`}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            Ver plan del atleta
            <MIcon name="arrow_forward" size={15} />
          </Link>
          <Link
            href="/altas"
            className="v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-sm font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
          >
            Volver a altas
          </Link>
        </div>
      </div>
    );
  }

  const tenure = waitingLabel(athlete.onboarded_at);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
      {/* ── Breadcrumb ───────────────────────────────────────────────────────── */}
      <nav aria-label="Ruta" className="flex items-center gap-1 text-xs text-[color:var(--v2-muted)]">
        <Link href="/altas" className="v2-focus hover:text-[color:var(--v2-fg)]">
          Altas
        </Link>
        <MIcon name="chevron_right" size={14} className="text-[color:var(--v2-faint)]" />
        <Link
          href={`/atletas/${athleteId}`}
          className="v2-focus hover:text-[color:var(--v2-fg)]"
        >
          {athlete.full_name}
        </Link>
        <MIcon name="chevron_right" size={14} className="text-[color:var(--v2-faint)]" />
        <span className="text-[color:var(--v2-fg)]">Intake</span>
      </nav>

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3">
        <AthleteAvatar name={athlete.full_name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="v2-micro text-[color:var(--v2-accent)]">Intake pendiente de revisión</span>
          <h1 className="v2-display text-2xl text-[color:var(--v2-fg)] sm:text-3xl">
            {athlete.full_name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--v2-muted)]">
            {athlete.age != null ? <span className="v2-num">{athlete.age} años</span> : null}
            {athlete.sex ? <span>· {SEX_LABEL[athlete.sex] ?? athlete.sex}</span> : null}
            {athlete.primary_discipline ? (
              <span className="uppercase">· {athlete.primary_discipline}</span>
            ) : null}
            {tenure ? (
              <span className="inline-flex items-center gap-1 text-[color:var(--v2-faint)]">
                <MIcon name="hourglass_top" size={13} />
                {tenure}
              </span>
            ) : null}
          </div>
        </div>
      </header>

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
              {month_proposal ? (
                <p className="flex items-start gap-1.5 px-0.5 text-[11px] text-[color:var(--v2-faint)]">
                  <MIcon name="auto_awesome" size={13} className="mt-px" />
                  <span>
                    Para su nivel, plantilla de referencia: {month_proposal.month_name}.
                  </span>
                </p>
              ) : null}
            </div>
          </StepShell>

          <StepShell n={3}>
            <BlockStructureStep
              specs={blockSpecs}
              emphasis={suggestions.block_emphasis}
              endDateIso={target_event?.iso_date ?? null}
              onChangeWeeks={changeWeeks}
            />
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

        {/* Right — athlete answers (read-only) */}
        <aside className="flex flex-col gap-2">
          <span className="v2-micro">Respuestas del atleta</span>
          <AthleteAnswers profile={profile} />
        </aside>
      </div>

      <AssignBar
        checks={checks}
        canAssign={canAssign}
        submitting={submitting}
        error={error}
        onAssign={assign}
      />
    </div>
  );
}
