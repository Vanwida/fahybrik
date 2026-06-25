'use client';

// Client orchestrator for the V2 coach intake-review screen. Holds ALL the shared
// decision state (level · blockSpecs · includedTests · ackedWarnings ·
// welcomeBody/sendWelcome · notes · selectedEventId · events), the lazy events
// loader, the canAssign gate, the buildPayload, the POST to
// /api/coach/intake/[athlete_id], and the success state. The gate rules, the
// effectiveAcked event-resolved nuance, and the buildPayload mapping are PRESERVED
// EXACTLY from the V1 IntakeReview (byte-compatible commit payload).
//
// AGNOSTIC: phase labels come from resolvePhase(block, coachPhases) — never an ATR
// map. coachPhases is loaded server-side and passed in.

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { resolvePhase } from '@/lib/dashboard/coach/resolve-phase';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import type { IntakeProfile } from '@/lib/coach/intake';
import type {
  AthleteLevel,
  IntakeBaselineTest,
  IntakeBlockSpec,
  IntakeCommit,
} from '@/lib/coach/intake-schema';
import { MIcon } from '@/components/ui/MIcon';
import { EventCard, type EventOption, type OnboardingRace } from './cards/EventCard';
import { LevelCard } from './cards/LevelCard';
import { StructureCard } from './cards/StructureCard';
import { TestsCard } from './cards/TestsCard';
import { WarningsCard, isEventResolvedWarning } from './cards/WarningsCard';
import { WelcomeCard } from './cards/WelcomeCard';
import { IntakeEvidenceRailV2 } from './IntakeEvidenceRailV2';
import { IntakeGateBar } from './IntakeGateBar';

// Block-week bounds mirror the commit schema (intakeBlockSpecSchema: 1..20).
const MIN_BLOCK_WEEKS = 1;
const MAX_BLOCK_WEEKS = 20;

interface CommitResultShape {
  athlete_id: string;
  macrocycle_id: string;
  scheduled_assignments: number;
  welcome_sent: boolean;
  first_block_draft?: {
    block_type: 'ACC' | 'TRANS' | 'REAL';
    week_count: number;
    assignment_count: number;
  } | null;
}

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'error'; message: string }
  | { phase: 'success'; result: CommitResultShape };

/** dd mmm — compact event end-date marker for the structure timeline/eyebrow. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  if (!y || !m || !d) return null;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${MONTHS[m - 1]}`;
}

export function IntakeReviewV2({
  profile,
  athleteId,
  coachPhases,
}: {
  profile: IntakeProfile;
  athleteId: string;
  coachPhases: MethodologyPhase[];
}) {
  const router = useRouter();
  const { suggestions, warnings, target_event } = profile;

  // ── State (identical to V1 IntakeReview) ──────────────────────────────────
  const [level, setLevel] = useState<AthleteLevel>(suggestions.level);
  const [blockSpecs, setBlockSpecs] = useState<IntakeBlockSpec[]>(() =>
    suggestions.block_specs.map((b) => ({ ...b })),
  );
  const [includedTests, setIncludedTests] = useState<Set<string>>(
    () => new Set(suggestions.baseline_tests.map((t) => t.slug)),
  );
  const [ackedWarnings, setAckedWarnings] = useState<Set<string>>(new Set());
  const [welcomeBody, setWelcomeBody] = useState(suggestions.welcome_draft);
  const [sendWelcome, setSendWelcome] = useState(true);
  const [notes, setNotes] = useState('');

  const initialEventId =
    target_event && !target_event.is_in_past ? target_event.event_id : '';
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  const [submit, setSubmit] = useState<SubmitState>({ phase: 'idle' });
  const [pending, startTransition] = useTransition();

  // ── Lazy events loader (identical) ────────────────────────────────────────
  const loadEvents = async () => {
    if (events != null || eventsLoading) return;
    setEventsLoading(true);
    try {
      const res = await fetch('/api/coach/events?scope=upcoming', {
        credentials: 'include',
      });
      if (res.ok) {
        const json = (await res.json()) as { events?: EventOption[] };
        setEvents(json.events ?? []);
      } else {
        setEvents([]);
      }
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const hasEvent = selectedEventId !== '';

  // The critical A-event warning resolves by ANCHORING the event (no redundant
  // manual confirm). Every other warning still needs an explicit ack. The gate
  // stays "every warning acknowledged" — the event-resolved one is satisfied by
  // hasEvent. The committed acknowledged_warnings payload is unchanged.
  const effectiveAcked = useMemo(() => {
    const set = new Set(ackedWarnings);
    if (hasEvent) {
      for (const w of warnings) {
        if (isEventResolvedWarning(w)) set.add(w.kind);
      }
    }
    return set;
  }, [ackedWarnings, hasEvent, warnings]);

  const ackedCount = warnings.filter((w) => effectiveAcked.has(w.kind)).length;
  const allWarningsAcked = warnings.every((w) => effectiveAcked.has(w.kind));
  const hasBlocks = blockSpecs.length > 0;
  const blocksValid = blockSpecs.every(
    (b) => b.weeks >= MIN_BLOCK_WEEKS && b.weeks <= MAX_BLOCK_WEEKS,
  );
  const welcomeValid = !sendWelcome || welcomeBody.trim().length > 0;

  const canAssign =
    allWarningsAcked &&
    hasEvent &&
    hasBlocks &&
    blocksValid &&
    welcomeValid &&
    !pending &&
    submit.phase !== 'success';

  const totalWeeks = useMemo(
    () => blockSpecs.reduce((s, b) => s + b.weeks, 0),
    [blockSpecs],
  );

  // End-date marker: selected catalog event date if known, else the target.
  const endDateLabel = useMemo(() => {
    if (selectedEventId && events) {
      const sel = events.find((e) => e.event_id === selectedEventId);
      if (sel) return shortDate(sel.start_date);
    }
    if (target_event && !target_event.is_in_past) return shortDate(target_event.iso_date);
    return null;
  }, [selectedEventId, events, target_event]);

  // Onboarding race surfaced when no valid future target_event: prefer the
  // curated target_event (incl. past), else the athlete's own race_history
  // priority='target' row.
  const onboardingRace = useMemo<OnboardingRace | null>(() => {
    if (target_event) {
      return {
        name: target_event.name,
        iso_date: target_event.iso_date,
        division: target_event.division,
      };
    }
    const targetRace = profile.race_history.find((r) => r.priority === 'target');
    if (targetRace) {
      return {
        name: targetRace.name,
        iso_date: targetRace.iso_date,
        division: targetRace.division,
      };
    }
    return null;
  }, [target_event, profile.race_history]);

  // When the chooser is showing (no valid future target) and the athlete declared
  // an onboarding race, eagerly load the catalog ONCE so the "Usar esta carrera"
  // match can surface without the coach focusing the picker.
  const needsCatalogForMatch = initialEventId === '' && onboardingRace != null;
  useEffect(() => {
    if (needsCatalogForMatch) void Promise.resolve().then(loadEvents);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCatalogForMatch]);

  // ── Mutators ──────────────────────────────────────────────────────────────
  const stepBlock = (idx: number, delta: number) => {
    setBlockSpecs((prev) =>
      prev.map((b, i) =>
        i === idx
          ? {
              ...b,
              weeks: Math.min(
                MAX_BLOCK_WEEKS,
                Math.max(MIN_BLOCK_WEEKS, b.weeks + delta),
              ),
            }
          : b,
      ),
    );
  };

  const toggleTest = (slug: string) => {
    setIncludedTests((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleAck = (kind: string) => {
    setAckedWarnings((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  // ── Payload (byte-compatible with V1 buildPayload) ────────────────────────
  const buildPayload = (): IntakeCommit => {
    const baseline_tests: IntakeBaselineTest[] = suggestions.baseline_tests
      .filter((t) => includedTests.has(t.slug))
      .map((t) => ({
        slug: t.slug,
        label: t.label,
        kind: t.kind,
        scheduled_for: t.scheduled_for,
      }));

    return {
      target_event_id: Number(selectedEventId),
      block_specs: blockSpecs.map((b) => ({ type: b.type, weeks: b.weeks })),
      level,
      baseline_tests,
      welcome: {
        send: sendWelcome,
        body: sendWelcome ? welcomeBody.trim() : null,
      },
      acknowledged_warnings: warnings.map((w) => w.kind),
      notes: notes.trim().length > 0 ? notes.trim() : null,
    };
  };

  const handleAssign = () => {
    if (!canAssign) return;
    const payload = buildPayload();
    startTransition(async () => {
      setSubmit({ phase: 'idle' });
      try {
        const res = await fetch(`/api/coach/intake/${athleteId}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = (await res.json()) as
          | CommitResultShape
          | { error: { message: string } };
        if (!res.ok || 'error' in json) {
          const message =
            'error' in json ? json.error.message : 'No se pudo asignar el plan.';
          setSubmit({ phase: 'error', message });
          return;
        }
        setSubmit({ phase: 'success', result: json });
      } catch {
        setSubmit({
          phase: 'error',
          message: 'Error de red al asignar el plan. Reintenta.',
        });
      }
    });
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (submit.phase === 'success') {
    const result = submit.result;
    const draftPhaseLabel = result.first_block_draft
      ? resolvePhase({ type: result.first_block_draft.block_type }, coachPhases).label
      : null;
    return (
      <section className="mx-auto mt-2 flex max-w-xl flex-col items-center rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-8 text-center shadow-[var(--v2-shadow-card)]">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-[color:var(--v2-ok-soft)]">
          <MIcon name="check" size={24} className="text-[color:var(--v2-ok)]" filled />
        </div>
        <h3 className="v2-display text-xl uppercase text-[color:var(--v2-fg)]">
          {result.first_block_draft ? 'Primer bloque en borrador' : 'Plan asignado'}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--v2-muted)]">
          {result.first_block_draft
            ? `${draftPhaseLabel} · ${result.first_block_draft.week_count} semana(s) en borrador — revísalo y publícalo cuando lo veas listo`
            : `Macrociclo creado${
                result.scheduled_assignments > 0
                  ? ` · ${result.scheduled_assignments} sesión(es) programadas`
                  : ''
              }`}
          {result.welcome_sent
            ? ' · mensaje de bienvenida enviado'
            : ' · sin mensaje enviado'}
          .
        </p>
        <Link
          href={
            result.first_block_draft
              ? `/v2/atletas/${athleteId}?tab=plan`
              : `/v2/atletas/${athleteId}`
          }
          onClick={() => router.refresh()}
          className="v2-focus mt-6 inline-flex items-center justify-center gap-2 rounded-[var(--v2-r-m)] bg-[color:var(--v2-accent)] px-6 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          <MIcon name="person" size={16} aria-hidden />
          {result.first_block_draft ? 'Revisar el borrador' : 'Ver atleta'}
        </Link>
      </section>
    );
  }

  // What's blocking, for the footer sub-line.
  const blockingLabel = !hasEvent
    ? 'Falta anclar el evento objetivo'
    : !allWarningsAcked
      ? `${warnings.length - ackedCount} aviso(s) por confirmar`
      : !welcomeValid
        ? 'Completa o desactiva la bienvenida'
        : !blocksValid
          ? 'Revisa las semanas de cada bloque'
          : null;

  return (
    <>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT — DECISIONES */}
        <section
          aria-label="Decisiones"
          className="flex min-w-0 flex-col gap-5"
        >
          <EventCard
            profile={profile}
            onboardingRace={onboardingRace}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
            events={events}
            eventsLoading={eventsLoading}
            onLoadEvents={loadEvents}
          />
          <LevelCard profile={profile} level={level} onChange={setLevel} />
          <StructureCard
            profile={profile}
            blockSpecs={blockSpecs}
            totalWeeks={totalWeeks}
            endDateLabel={endDateLabel}
            coachPhases={coachPhases}
            onStep={stepBlock}
          />
          <TestsCard
            tests={suggestions.baseline_tests}
            included={includedTests}
            onToggle={toggleTest}
          />
          <WarningsCard
            warnings={warnings}
            acked={effectiveAcked}
            ackedCount={ackedCount}
            hasEvent={hasEvent}
            onToggle={toggleAck}
          />
          <WelcomeCard
            sendWelcome={sendWelcome}
            onSendWelcomeChange={setSendWelcome}
            welcomeBody={welcomeBody}
            onWelcomeBodyChange={setWelcomeBody}
            notes={notes}
            onNotesChange={setNotes}
          />
        </section>

        {/* RIGHT — EVIDENCE RAIL */}
        <aside className="min-w-0 lg:sticky lg:top-6">
          <IntakeEvidenceRailV2 profile={profile} />
        </aside>
      </div>

      <IntakeGateBar
        gates={{
          hasEvent,
          levelOk: true,
          blocksValid: hasBlocks && blocksValid,
          ackedCount,
          totalWarnings: warnings.length,
          welcomeValid,
        }}
        canAssign={canAssign}
        pending={pending}
        blockingLabel={blockingLabel}
        errorMessage={submit.phase === 'error' ? submit.message : null}
        onAssign={handleAssign}
      />
    </>
  );
}
