'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import type { IntakeProfile, IntakeWarning } from '@/lib/coach/intake';
import type {
  AthleteLevel,
  IntakeBaselineTest,
  IntakeBlockSpec,
  IntakeCommit,
} from '@/lib/coach/intake-schema';

// ── Constants ──────────────────────────────────────────────────────────────

const LEVELS: ReadonlyArray<{ value: AthleteLevel; label: string }> = [
  { value: 1, label: 'Principiante' },
  { value: 2, label: 'Intermedio' },
  { value: 3, label: 'Pro' },
  { value: 4, label: 'Élite' },
];

// Block-week bounds mirror the commit schema (intakeBlockSpecSchema: 1..20).
const MIN_BLOCK_WEEKS = 1;
const MAX_BLOCK_WEEKS = 20;
const WELCOME_MAX = 2000;
const NOTES_MAX = 2000;

const EMPHASIS_LABEL: Record<string, string> = {
  running: 'Carrera',
  strength: 'Fuerza',
  hyrox_specific: 'HYROX específico',
  balanced: 'Equilibrado',
};

// ── Local mutable state shapes ───────────────────────────────────────────────

interface EventOption {
  event_id: string;
  name: string;
  start_date: string;
  division: string | null;
  is_past: boolean;
}

interface CommitResultShape {
  athlete_id: string;
  macrocycle_id: string;
  scheduled_assignments: number;
  welcome_sent: boolean;
}

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'error'; message: string }
  | { phase: 'success'; result: CommitResultShape };

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeDecision({
  profile,
  athleteId,
}: {
  profile: IntakeProfile;
  athleteId: string;
}) {
  const router = useRouter();
  const { suggestions, warnings, target_event } = profile;

  // 1 · LEVEL (segmented, defaulted from suggestions)
  const [level, setLevel] = useState<AthleteLevel>(suggestions.level);

  // 1 · BLOCK structure (editable week counts per ACC/TRANS/REAL)
  const [blockSpecs, setBlockSpecs] = useState<IntakeBlockSpec[]>(() =>
    suggestions.block_specs.map((b) => ({ ...b })),
  );

  // 2 · BASELINE tests — checklist, all suggested ones included by default
  const [includedTests, setIncludedTests] = useState<Set<string>>(
    () => new Set(suggestions.baseline_tests.map((t) => t.slug)),
  );

  // 3 · WARNINGS acknowledgement — keyed by warning.kind
  const [ackedWarnings, setAckedWarnings] = useState<Set<string>>(new Set());

  // 4 · WELCOME message (editable, pre-filled)
  const [welcomeBody, setWelcomeBody] = useState(suggestions.welcome_draft);
  const [sendWelcome, setSendWelcome] = useState(true);

  // 5 · NOTES (optional)
  const [notes, setNotes] = useState('');

  // 6 · A-EVENT — defaults to the intake target; picker shown when missing/invalid
  const initialEventId =
    target_event && !target_event.is_in_past ? target_event.event_id : '';
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [events, setEvents] = useState<EventOption[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);

  // 7 · SUBMIT
  const [submit, setSubmit] = useState<SubmitState>({ phase: 'idle' });
  const [pending, startTransition] = useTransition();

  const needsEventPicker = initialEventId === '';

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

  // Gate: every surfaced warning must be acknowledged, a valid target event must
  // be selected, and at least one block must remain. This is the audit contract —
  // `acknowledged_warnings` is the record of what Pablo signed off on.
  const allWarningsAcked = warnings.every((w) => ackedWarnings.has(w.kind));
  const hasEvent = selectedEventId !== '';
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

  const setBlockWeeks = (idx: number, raw: string) => {
    const n = Number(raw);
    setBlockSpecs((prev) =>
      prev.map((b, i) =>
        i === idx
          ? { ...b, weeks: Number.isFinite(n) ? Math.round(n) : b.weeks }
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

  const buildPayload = (): IntakeCommit => {
    const baseline_tests: IntakeBaselineTest[] = suggestions.baseline_tests
      .filter((t) => includedTests.has(t.slug))
      .map((t) => ({
        slug: t.slug,
        label: t.label,
        kind: t.kind,
        scheduled_for: t.scheduled_for, // Pablo schedules programmed tests later
      }));

    return {
      // idSchema is number | bigint; event ids are numeric strings from the API.
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
            'error' in json
              ? json.error.message
              : 'No se pudo asignar el plan.';
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

  // ── Success state ──────────────────────────────────────────────────────────
  if (submit.phase === 'success') {
    return (
      <SuccessCard
        result={submit.result}
        onGoToPlan={() =>
          router.push(`/atletas/${athleteId}`)
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── 1 · Propuesta de la IA ─────────────────────────────────────── */}
      <Section
        title="Propuesta de la IA"
        hint="Punto de partida editable. Pablo confirma cada decisión."
      >
        {/* Level */}
        <Field label="Nivel del atleta">
          <div
            role="radiogroup"
            aria-label="Nivel del atleta"
            className="flex flex-wrap gap-2"
          >
            {LEVELS.map(({ value, label }) => {
              const active = level === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setLevel(value)}
                  className={cn(
                    'focus-ring rounded-[var(--r-pill)] border px-4 py-2 text-sm font-semibold transition',
                    'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[color:var(--text-muted)]',
                    'hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))] hover:text-[color:var(--fg)]',
                    active &&
                      'border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))]',
                  )}
                >
                  <span className="metric-num mr-1.5">{value}</span>
                  {label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {suggestions.level_rationale}
          </p>
        </Field>

        {/* Block structure */}
        <Field
          label="Estructura del macrociclo"
          hint={`Bloques ATR · ${totalWeeks} semanas totales`}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {blockSpecs.map((block, idx) => {
              const outOfRange =
                block.weeks < MIN_BLOCK_WEEKS || block.weeks > MAX_BLOCK_WEEKS;
              return (
                <div
                  key={`${block.type}-${idx}`}
                  className="rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] p-3"
                >
                  <span className="micro-label">{block.type}</span>
                  <p className="mt-0.5 text-sm text-[color:var(--fg)]">
                    {atrPhaseLabel(block.type)}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={MIN_BLOCK_WEEKS}
                      max={MAX_BLOCK_WEEKS}
                      value={block.weeks}
                      aria-label={`Semanas de ${atrPhaseLabel(block.type)}`}
                      aria-invalid={outOfRange}
                      onChange={(e) => setBlockWeeks(idx, e.target.value)}
                      className={cn(
                        'metric-num focus-ring w-16 rounded-[var(--r-sm)] border bg-[color:var(--surface-card)] px-2 py-1.5 text-center text-base text-[color:var(--fg)]',
                        outOfRange
                          ? 'border-[color:var(--danger)]'
                          : 'border-[color:var(--border-subtle)]',
                      )}
                    />
                    <span className="text-sm text-[color:var(--text-muted)]">
                      semanas
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {!blocksValid ? (
            <p className="mt-2 text-sm text-[color:var(--danger)]">
              Cada bloque debe tener entre {MIN_BLOCK_WEEKS} y {MAX_BLOCK_WEEKS}{' '}
              semanas.
            </p>
          ) : null}
        </Field>

        {/* Emphasis (display only — advisory) */}
        <Field label="Énfasis del bloque">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--surface-card))] px-3 py-1 text-xs font-bold uppercase tracking-[0.04em] text-[color:var(--accent)]">
              {EMPHASIS_LABEL[suggestions.block_emphasis.bias] ??
                suggestions.block_emphasis.bias}
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              advisory · Pablo decide la programación
            </span>
          </div>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {suggestions.block_emphasis.note}
          </p>
        </Field>
      </Section>

      {/* ── 2 · Tests baseline ─────────────────────────────────────────── */}
      <Section
        title="Tests baseline"
        hint="Marca los que entran en la primera semana."
      >
        {suggestions.baseline_tests.length === 0 ? (
          <p className="text-sm text-[color:var(--text-muted)]">
            La IA no sugirió tests baseline para este perfil.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {suggestions.baseline_tests.map((test) => {
              const checked = includedTests.has(test.slug);
              return (
                <li key={test.slug}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-[var(--r-l)] border px-3 py-2.5 transition',
                      checked
                        ? 'border-[color:color-mix(in_srgb,var(--accent)_30%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--accent)_5%,var(--surface-card))]'
                        : 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTest(test.slug)}
                      className="focus-ring size-4 shrink-0 accent-[color:var(--accent)]"
                    />
                    <span className="flex-1 text-sm text-[color:var(--fg)]">
                      {test.label}
                    </span>
                    <span className="micro-label">
                      {test.kind === 'auto' ? 'Pasivo' : 'Programado'}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ── 3 · Warnings ───────────────────────────────────────────────── */}
      {warnings.length > 0 ? (
        <Section
          title="Avisos"
          hint="Revisa y reconoce cada uno antes de asignar."
        >
          <ul className="flex flex-col gap-2">
            {warnings.map((w) => (
              <WarningRow
                key={w.kind}
                warning={w}
                acked={ackedWarnings.has(w.kind)}
                onToggle={() => toggleAck(w.kind)}
              />
            ))}
          </ul>
          {!allWarningsAcked ? (
            <p className="mt-3 text-sm text-[color:var(--warning)]">
              Reconoce todos los avisos para poder asignar el plan.
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* ── 6 · A-event ────────────────────────────────────────────────── */}
      <Section
        title="Evento objetivo (A)"
        hint="El plan se construye apuntando a esta carrera."
      >
        {needsEventPicker ? (
          <div>
            <p className="mb-3 text-sm text-[color:var(--warning)]">
              {target_event && target_event.is_in_past
                ? 'El A-event del intake está en el pasado. Elige un evento futuro.'
                : 'El atleta no tiene un A-event válido. Selecciona uno para asignar el plan.'}
            </p>
            <Field label="Selecciona evento A">
              <select
                value={selectedEventId}
                onFocus={loadEvents}
                onChange={(e) => setSelectedEventId(e.target.value)}
                aria-label="Evento objetivo A"
                className="focus-ring w-full rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm text-[color:var(--fg)]"
              >
                <option value="">
                  {eventsLoading ? 'Cargando eventos…' : '— Elige un evento —'}
                </option>
                {(events ?? []).map((ev) => (
                  <option key={ev.event_id} value={ev.event_id}>
                    {ev.name} · {ev.start_date}
                    {ev.division ? ` · ${ev.division}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {events != null && events.length === 0 ? (
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                No hay eventos futuros en el catálogo. Crea uno en Eventos antes
                de cerrar el intake.
              </p>
            ) : null}
          </div>
        ) : target_event ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-3">
            <div>
              <p className="text-base font-semibold text-[color:var(--fg)]">
                {target_event.name}
              </p>
              <p className="text-sm text-[color:var(--text-muted)]">
                {target_event.iso_date}
                {target_event.division ? ` · ${target_event.division}` : ''}
              </p>
            </div>
            <span className="metric-num text-sm text-[color:var(--accent)]">
              {target_event.days_to_event} días
            </span>
          </div>
        ) : null}
      </Section>

      {/* ── 4 · Mensaje de bienvenida ──────────────────────────────────── */}
      <Section title="Mensaje de bienvenida">
        <label className="mb-3 flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={sendWelcome}
            onChange={(e) => setSendWelcome(e.target.checked)}
            className="focus-ring size-4 accent-[color:var(--accent)]"
          />
          <span className="text-sm text-[color:var(--fg)]">
            Enviar al atleta al asignar el plan
          </span>
        </label>
        <textarea
          value={welcomeBody}
          onChange={(e) => setWelcomeBody(e.target.value.slice(0, WELCOME_MAX))}
          disabled={!sendWelcome}
          rows={4}
          aria-label="Mensaje de bienvenida"
          className={cn(
            'focus-ring w-full resize-y rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]',
            !sendWelcome && 'opacity-50',
          )}
          placeholder="Escribe un mensaje de bienvenida…"
        />
        <div className="mt-1 flex items-center justify-between">
          {sendWelcome && welcomeBody.trim().length === 0 ? (
            <span className="text-xs text-[color:var(--danger)]">
              Escribe el mensaje o desactiva el envío.
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs text-[color:var(--text-muted)]">
            {welcomeBody.length}/{WELCOME_MAX}
          </span>
        </div>
      </Section>

      {/* ── 5 · Notas del coach ────────────────────────────────────────── */}
      <Section title="Notas del coach" hint="Internas · opcionales.">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
          rows={3}
          aria-label="Notas del coach"
          className="focus-ring w-full resize-y rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]"
          placeholder="Notas privadas sobre el atleta o el plan…"
        />
        <div className="mt-1 text-right text-xs text-[color:var(--text-muted)]">
          {notes.length}/{NOTES_MAX}
        </div>
      </Section>

      {/* ── 7 · Assign ─────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-10 -mx-1 border-t border-[color:var(--border-subtle)] bg-[color:color-mix(in_srgb,var(--bg)_92%,transparent)] px-1 pb-2 pt-4 backdrop-blur">
        {submit.phase === 'error' ? (
          <p
            role="alert"
            className="mb-3 rounded-[var(--r-l)] border border-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_8%,var(--surface-card))] px-3 py-2.5 text-sm text-[color:var(--fg)]"
          >
            {submit.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[color:var(--text-muted)]">
            {!hasEvent
              ? 'Selecciona el evento objetivo.'
              : !allWarningsAcked
                ? 'Reconoce los avisos pendientes.'
                : !welcomeValid
                  ? 'Completa o desactiva el mensaje de bienvenida.'
                  : !blocksValid
                    ? 'Revisa las semanas de cada bloque.'
                    : 'Todo listo para asignar.'}
          </p>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!canAssign}
            aria-busy={pending}
            className={cn(
              'focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--r-l)] px-6 py-3 text-sm font-bold uppercase tracking-[0.04em] transition',
              'bg-[color:var(--accent)] text-[color:var(--accent-on)]',
              'hover:bg-[color:var(--accent-press)]',
              'disabled:cursor-not-allowed disabled:opacity-45',
            )}
          >
            {pending ? 'Asignando…' : 'Asignar plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-elevated p-5">
      <header className="mb-4 border-b border-[color:var(--border-subtle)] pb-3">
        <h3 className="font-heading uppercase text-[color:var(--fg)]">{title}</h3>
        {hint ? (
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">{hint}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="micro-label">{label}</span>
        {hint ? (
          <span className="text-xs text-[color:var(--text-muted)]">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function WarningRow({
  warning,
  acked,
  onToggle,
}: {
  warning: IntakeWarning;
  acked: boolean;
  onToggle: () => void;
}) {
  const critical = warning.severity === 'critical';
  return (
    <li>
      <label
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-[var(--r-l)] border px-3 py-3 transition',
          acked
            ? 'border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] opacity-70'
            : critical
              ? 'border-[color:var(--danger)] bg-[color:color-mix(in_srgb,var(--danger)_6%,var(--surface-card))]'
              : 'border-[color:color-mix(in_srgb,var(--warning)_45%,var(--border-subtle))] bg-[color:color-mix(in_srgb,var(--warning)_6%,var(--surface-card))]',
        )}
      >
        <input
          type="checkbox"
          checked={acked}
          onChange={onToggle}
          aria-label={`Reconocer aviso: ${warning.label}`}
          className="focus-ring mt-0.5 size-4 shrink-0 accent-[color:var(--accent)]"
        />
        <span className="flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-semibold text-[color:var(--fg)]',
                acked && 'line-through',
              )}
            >
              {warning.label}
            </span>
            <span
              className={cn(
                'rounded-[var(--r-pill)] px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.08em]',
                critical
                  ? 'text-[color:var(--danger)]'
                  : 'text-[color:var(--warning)]',
              )}
            >
              {critical ? 'Crítico' : 'Aviso'}
            </span>
          </span>
          <span className="mt-0.5 block text-sm text-[color:var(--text-muted)]">
            {warning.detail}
          </span>
        </span>
      </label>
    </li>
  );
}

function SuccessCard({
  result,
  onGoToPlan,
}: {
  result: CommitResultShape;
  onGoToPlan: () => void;
}) {
  return (
    <section className="card-elevated p-8 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[var(--r-pill)] bg-[color:color-mix(in_srgb,var(--ok)_18%,var(--surface-card))]">
        <span className="material-symbols-outlined text-[color:var(--ok)]">
          check
        </span>
      </div>
      <h3 className="font-heading uppercase text-[color:var(--fg)]">
        Plan asignado
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--text-muted)]">
        Macrociclo creado{' '}
        {result.scheduled_assignments > 0
          ? `· ${result.scheduled_assignments} sesión(es) programadas `
          : ''}
        {result.welcome_sent
          ? '· mensaje de bienvenida enviado'
          : '· sin mensaje enviado'}
        .
      </p>
      <button
        type="button"
        onClick={onGoToPlan}
        className="focus-ring mt-6 inline-flex items-center justify-center rounded-[var(--r-l)] bg-[color:var(--accent)] px-6 py-3 text-sm font-bold uppercase tracking-[0.04em] text-[color:var(--accent-on)] transition hover:bg-[color:var(--accent-press)]"
      >
        Ver plan del atleta
      </button>
    </section>
  );
}
