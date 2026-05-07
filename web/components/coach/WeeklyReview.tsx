'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  Calendar as CalendarIcon,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  FlaskConical,
  History,
  MessageSquare,
  Pause,
  Plus,
  RotateCcw,
  Sparkle,
  Target,
  TrendingDown,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type {
  CohortPlanDay,
  CohortPlanWeek,
  CoachWeeklyReview,
  MassAdjustmentOpportunity,
  WeeklyAttentionItem,
  WeeklyReviewDecision,
  WeeklyReviewHistoryItem,
  WeeklyReviewNote,
  WeeklyTransitionItem,
} from '@/lib/coach/weekly-review-schema';

// =============================================================================
// Public component
// =============================================================================

type SerializedReview = Omit<CoachWeeklyReview, 'coach_id'> & { coach_id: string };

interface WeeklyReviewProps {
  initial_review: SerializedReview;
  initial_attention: WeeklyAttentionItem[];
  initial_transitions: WeeklyTransitionItem[];
  initial_mass_adjustments: MassAdjustmentOpportunity[];
  initial_plan: CohortPlanWeek[];
  history: WeeklyReviewHistoryItem[];
  coach_first_name: string;
}

export function WeeklyReview(props: WeeklyReviewProps) {
  // Set in an effect to keep render pure — see react-hooks/purity. The ref is
  // only consumed inside event handlers, so a brief gap on the first frame
  // (where it's 0) is fine.
  const openedAtRef = useRef<number>(0);
  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  const [decisions, setDecisions] = useState<WeeklyReviewDecision[]>(props.initial_review.decisions);
  const [notes, setNotes] = useState<WeeklyReviewNote[]>(props.initial_review.notes);
  const [status, setStatus] = useState<CoachWeeklyReview['status']>(props.initial_review.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const isApproved = status === 'approved';

  async function persist(action: 'save_draft' | 'approve' | 'defer') {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/weekly-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          iso_week_start: props.initial_review.iso_week_start,
          decisions,
          notes,
          plan_edits: props.initial_review.plan_edits,
          duration_ms: Date.now() - openedAtRef.current,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(data?.error?.message ?? 'no se pudo guardar la review');
      }
      const data = (await res.json()) as { review: SerializedReview };
      setStatus(data.review.status);
      setSaving(false);
      return data.review;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error desconocido');
      setSaving(false);
      throw e;
    }
  }

  function recordDecision(decision: WeeklyReviewDecision) {
    setDecisions((prev) => [...prev, decision]);
  }

  function addNote(body: string) {
    if (!body.trim()) return;
    const note: WeeklyReviewNote = {
      id: crypto.randomUUID(),
      body: body.trim(),
      created_at: new Date().toISOString(),
    };
    setNotes((prev) => [...prev, note]);
  }

  function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="flex w-full flex-col gap-6 px-6 py-6 sm:px-8 sm:py-7">
      <ReviewHeader
        coach_first_name={props.coach_first_name}
        snapshot={props.initial_review.snapshot}
        status={status}
        decisions_count={decisions.length}
        history_count={props.history.length}
        onToggleHistory={() => setHistoryOpen((v) => !v)}
      />

      {historyOpen && <HistoryPanel items={props.history} onClose={() => setHistoryOpen(false)} />}

      <SectionSummary snapshot={props.initial_review.snapshot} />

      <SectionAttention
        items={props.initial_attention}
        decisions={decisions}
        readOnly={isApproved}
        onAction={(item, action) => {
          recordDecision({
            kind: 'attention_action',
            athlete_id: item.athlete_id,
            action,
            decided_at: new Date().toISOString(),
          });
        }}
      />

      <SectionTransitions
        items={props.initial_transitions}
        decisions={decisions}
        readOnly={isApproved}
        onAdvance={(item) => {
          if (item.next_block) {
            recordDecision({
              kind: 'transition_advanced',
              athlete_id: item.athlete_id,
              from_block: item.current_block,
              to_block: item.next_block,
              decided_at: new Date().toISOString(),
            });
          }
        }}
        onHold={(item) => {
          recordDecision({
            kind: 'transition_held',
            athlete_id: item.athlete_id,
            block: item.current_block,
            extended_weeks: 1,
            decided_at: new Date().toISOString(),
          });
        }}
      />

      <SectionMassAdjustments
        items={props.initial_mass_adjustments}
        decisions={decisions}
        readOnly={isApproved}
        onApply={(opp) => {
          recordDecision({
            kind: 'mass_adjustment_applied',
            opportunity_id: opp.id,
            affected_count: opp.affected_count,
            decided_at: new Date().toISOString(),
          });
        }}
      />

      <SectionPlan plan={props.initial_plan} />

      <SectionNotes
        notes={notes}
        readOnly={isApproved}
        onAdd={addNote}
        onRemove={removeNote}
      />

      <SectionActions
        status={status}
        saving={saving}
        error={error}
        decisions_count={decisions.length}
        notes_count={notes.length}
        onApprove={() => void persist('approve')}
        onDefer={() => void persist('defer')}
        onSaveDraft={() => void persist('save_draft')}
      />
    </div>
  );
}

// =============================================================================
// Header
// =============================================================================

function ReviewHeader(props: {
  coach_first_name: string;
  snapshot: CoachWeeklyReview['snapshot'];
  status: CoachWeeklyReview['status'];
  decisions_count: number;
  history_count: number;
  onToggleHistory: () => void;
}) {
  const range = formatWeekRange(props.snapshot.iso_week_start, props.snapshot.iso_week_end);
  const statusLabel = props.status === 'approved'
    ? 'aprobada'
    : props.status === 'deferred'
      ? 'aplazada'
      : 'pendiente';
  const statusTone = props.status === 'approved'
    ? 'text-[color:var(--ok)]'
    : props.status === 'deferred'
      ? 'text-[color:var(--muted)]'
      : 'text-[color:var(--accent)]';

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--hairline)] pb-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Semana {props.snapshot.week_number} · {range}
        </p>
        <h1 className="mt-2 font-display italic font-black text-3xl tracking-tight leading-tight text-[color:var(--fg)] sm:text-4xl">
          REVIEW SEMANAL
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {props.coach_first_name.toUpperCase()} · {props.snapshot.active_athlete_count} atletas activos · ~25 min
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-[11px] uppercase tracking-[0.16em] ${statusTone} tabular-nums`}>
          {statusLabel}{props.decisions_count > 0 ? ` · ${props.decisions_count} decisiones` : ''}
        </span>
        {props.history_count > 0 && (
          <button
            type="button"
            onClick={props.onToggleHistory}
            className="flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
          >
            <History className="size-3.5" aria-hidden strokeWidth={1.5} />
            historial
          </button>
        )}
      </div>
    </header>
  );
}

function HistoryPanel({ items, onClose }: { items: WeeklyReviewHistoryItem[]; onClose: () => void }) {
  return (
    <section
      aria-label="Historial de reviews"
      className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Reviews anteriores
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
        >
          cerrar
        </button>
      </header>
      <ul className="divide-y divide-[color:var(--hairline)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between py-2 text-sm">
            <a
              href={`/review/${item.id}`}
              className="flex flex-1 items-center gap-3 text-[color:var(--fg)] hover:text-[color:var(--accent)]"
            >
              <span className="tabular-nums w-[88px]">{item.iso_week_start}</span>
              <span className="text-[color:var(--muted)] tabular-nums">
                {item.decisions_count} decisiones · {item.notes_count} notas
              </span>
            </a>
            <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
              {item.status === 'approved' ? 'aprobada' : 'aplazada'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// =============================================================================
// Section 1 — Resumen cohorte
// =============================================================================

function SectionSummary({ snapshot }: { snapshot: CoachWeeklyReview['snapshot'] }) {
  const polarization = snapshot.polarization;
  const polarizationDriftWarning =
    snapshot.polarization_drift != null && snapshot.polarization_drift > 6;

  return (
    <SectionShell title="Resumen cohorte" icon={Target}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <Metric
          label="Compliance global"
          value={snapshot.compliance_pct != null ? `${snapshot.compliance_pct}%` : '—'}
          delta={snapshot.compliance_pct_delta_vs_lw}
          suffix="vs LW"
        />
        <Metric
          label="Volumen total"
          value={snapshot.total_volume_hours != null ? `${snapshot.total_volume_hours}h` : '—'}
          delta={snapshot.total_volume_pct_delta_vs_lw}
          suffix="vs LW"
        />
        <Metric
          label="Polarization"
          value={
            polarization
              ? `${polarization.low}/${polarization.mid}/${polarization.high}`
              : '—'
          }
          warn={polarizationDriftWarning}
          subtitle={
            snapshot.polarization_drift != null
              ? `target 80/0/20 · drift ${formatSigned(snapshot.polarization_drift)}`
              : null
          }
        />
        <Metric
          label="PRs"
          value={snapshot.prs_count.toString()}
          subtitle={snapshot.prs_athletes > 0 ? `${snapshot.prs_athletes} atletas` : null}
        />
        <Metric
          label="Lesiones / quejas"
          value={snapshot.injuries_count.toString()}
          subtitle={snapshot.injuries_summary}
          warn={snapshot.injuries_count > 0}
        />
        <Metric
          label="HRV cohort"
          value={hrvLabel(snapshot.hrv_trend)}
          icon={hrvIcon(snapshot.hrv_trend)}
        />
        <Metric
          label="Sleep cohort"
          value={snapshot.sleep_avg_h != null ? formatHours(snapshot.sleep_avg_h) : '—'}
          delta={snapshot.sleep_avg_delta_min}
          suffix="min vs LW"
        />
      </dl>
    </SectionShell>
  );
}

function Metric(props: {
  label: string;
  value: string;
  delta?: number | null;
  suffix?: string;
  subtitle?: string | null;
  warn?: boolean;
  icon?: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">{props.label}</dt>
      <dd className="flex items-center gap-2">
        <span
          className={`font-display italic font-black text-2xl tabular-nums ${
            props.warn ? 'text-[color:var(--warning)]' : 'text-[color:var(--fg)]'
          }`}
        >
          {props.value}
        </span>
        {Icon && <Icon className="size-4 text-[color:var(--muted)]" aria-hidden strokeWidth={1.5} />}
        {props.delta != null && (
          <span
            className={`text-[11px] tabular-nums ${
              props.delta >= 0 ? 'text-[color:var(--ok)]' : 'text-[color:var(--warning)]'
            }`}
          >
            {props.delta >= 0 ? '▲' : '▼'} {formatSigned(props.delta)}
            {props.suffix ? ` ${props.suffix}` : ''}
          </span>
        )}
      </dd>
      {props.subtitle && (
        <p className="text-[11px] text-[color:var(--muted)] tabular-nums">{props.subtitle}</p>
      )}
    </div>
  );
}

// =============================================================================
// Section 2 — Atletas que requieren atención
// =============================================================================

function SectionAttention(props: {
  items: WeeklyAttentionItem[];
  decisions: WeeklyReviewDecision[];
  readOnly: boolean;
  onAction: (
    item: WeeklyAttentionItem,
    action: 'deload' | 'modified_plan' | 'message_sent' | 'test_scheduled',
  ) => void;
}) {
  if (props.items.length === 0) {
    return (
      <SectionShell title="Atletas que requieren atención" icon={AlertTriangle} count={0}>
        <p className="text-sm text-[color:var(--muted)]">
          Todo nominal — ningún atleta en alerta esta semana.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Atletas que requieren atención"
      icon={AlertTriangle}
      count={props.items.length}
      countTone="warning"
    >
      <ul className="divide-y divide-[color:var(--hairline)]">
        {props.items.map((item) => {
          const taken = props.decisions.find(
            (d) => d.kind === 'attention_action' && d.athlete_id === item.athlete_id,
          );
          return (
            <li key={item.athlete_id} className="flex flex-wrap items-start gap-4 py-4">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-display italic font-black text-base text-[color:var(--fg)]">
                    {item.full_name}
                  </span>
                  {item.block_type && (
                    <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] tabular-nums">
                      · {item.block_type} w{item.block_week}
                    </span>
                  )}
                  <SeverityChip severity={item.severity} />
                </div>
                <ul className="mt-1 space-y-0.5">
                  {item.signals.map((s, i) => (
                    <li
                      key={i}
                      className="text-xs text-[color:var(--muted)] tabular-nums before:mr-2 before:content-['·']"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--accent)]">
                  <Sparkle className="size-3" aria-hidden strokeWidth={1.5} />
                  {item.recommendation}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ActionButton
                  label="asignar deload"
                  disabled={props.readOnly || taken?.kind === 'attention_action'}
                  onClick={() => props.onAction(item, 'deload')}
                  active={taken?.kind === 'attention_action' && taken.action === 'deload'}
                />
                <ActionButton
                  label="plan modificado"
                  disabled={props.readOnly || taken?.kind === 'attention_action'}
                  onClick={() => props.onAction(item, 'modified_plan')}
                  active={taken?.kind === 'attention_action' && taken.action === 'modified_plan'}
                />
                <ActionButton
                  icon={MessageSquare}
                  label="mensaje"
                  disabled={props.readOnly || taken?.kind === 'attention_action'}
                  onClick={() => props.onAction(item, 'message_sent')}
                  active={taken?.kind === 'attention_action' && taken.action === 'message_sent'}
                />
                <ActionButton
                  icon={Beaker}
                  label="programar test"
                  disabled={props.readOnly || taken?.kind === 'attention_action'}
                  onClick={() => props.onAction(item, 'test_scheduled')}
                  active={taken?.kind === 'attention_action' && taken.action === 'test_scheduled'}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

function SeverityChip({ severity }: { severity: 'critical' | 'warning' }) {
  const tone = severity === 'critical'
    ? 'border-[color:var(--accent)]/40 text-[color:var(--accent)]'
    : 'border-[color:var(--warning)]/40 text-[color:var(--warning)]';
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] ${tone}`}>
      {severity === 'critical' ? 'crítico' : 'aviso'}
    </span>
  );
}

// =============================================================================
// Section 3 — Atletas listos para transición de bloque
// =============================================================================

function SectionTransitions(props: {
  items: WeeklyTransitionItem[];
  decisions: WeeklyReviewDecision[];
  readOnly: boolean;
  onAdvance: (item: WeeklyTransitionItem) => void;
  onHold: (item: WeeklyTransitionItem) => void;
}) {
  if (props.items.length === 0) {
    return (
      <SectionShell title="Listos para transición de bloque" icon={FlaskConical} count={0}>
        <p className="text-sm text-[color:var(--muted)]">
          Ningún atleta cierra bloque esta semana.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Listos para transición de bloque"
      icon={FlaskConical}
      count={props.items.length}
    >
      <ul className="divide-y divide-[color:var(--hairline)]">
        {props.items.map((item) => {
          const taken = props.decisions.find(
            (d) =>
              (d.kind === 'transition_advanced' || d.kind === 'transition_held') &&
              d.athlete_id === item.athlete_id,
          );
          return (
            <li key={item.athlete_id} className="flex flex-wrap items-start gap-4 py-4">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-display italic font-black text-base text-[color:var(--fg)]">
                    {item.full_name}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] tabular-nums">
                    · {item.current_block} w{item.current_week}
                  </span>
                  {item.recommendation === 'advance' && (
                    <span className="rounded-full border border-[color:var(--ok)]/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[color:var(--ok)]">
                      avanzar
                    </span>
                  )}
                </div>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {item.signals.map((s, i) => (
                    <li key={i} className="text-xs text-[color:var(--muted)] tabular-nums">
                      {s}
                    </li>
                  ))}
                </ul>
                {item.next_block && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--accent)]">
                    <Sparkle className="size-3" aria-hidden strokeWidth={1.5} />
                    {item.recommendation === 'advance'
                      ? `Avanzar a ${item.next_block} w1 · confianza ${item.confidence}`
                      : item.recommendation === 'regress'
                        ? `Regresión recomendada · confianza ${item.confidence}`
                        : `Mantener en ${item.current_block} · confianza ${item.confidence}`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ActionButton
                  icon={ArrowRight}
                  label={item.next_block ? `avanzar a ${item.next_block}` : 'avanzar'}
                  primary={item.recommendation === 'advance'}
                  disabled={props.readOnly || !item.next_block || taken != null}
                  active={taken?.kind === 'transition_advanced'}
                  onClick={() => props.onAdvance(item)}
                />
                <ActionButton
                  icon={Pause}
                  label={`extender ${item.current_block} w${item.current_week + 1}`}
                  disabled={props.readOnly || taken != null}
                  active={taken?.kind === 'transition_held'}
                  onClick={() => props.onHold(item)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

// =============================================================================
// Section 4 — Mass adjustments (link out to /coach/mass-adjustments)
// =============================================================================

function SectionMassAdjustments(props: {
  items: MassAdjustmentOpportunity[];
  decisions: WeeklyReviewDecision[];
  readOnly: boolean;
  onApply: (opp: MassAdjustmentOpportunity) => void;
}) {
  if (props.items.length === 0) {
    return (
      <SectionShell title="Mass adjustments oportunidades" icon={Wrench} count={0}>
        <p className="text-sm text-[color:var(--muted)]">
          Sin patrones cohorte-wide que justifiquen ajuste masivo esta semana.
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell
      title="Mass adjustments oportunidades"
      icon={Wrench}
      count={props.items.length}
    >
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {props.items.map((opp) => {
          const applied = props.decisions.find(
            (d) => d.kind === 'mass_adjustment_applied' && d.opportunity_id === opp.id,
          );
          return (
            <li
              key={opp.id}
              className="flex flex-col gap-2 rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4"
            >
              <div className="flex items-start gap-2">
                <Wrench
                  className="size-4 shrink-0 text-[color:var(--accent)]"
                  aria-hidden
                  strokeWidth={1.5}
                />
                <div className="flex-1">
                  <p className="text-sm text-[color:var(--fg)]">{opp.rationale}</p>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{opp.suggestion}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a
                  href={`/coach/mass-adjustments?opportunity=${encodeURIComponent(opp.id)}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] px-3 text-xs uppercase tracking-[0.12em] text-[color:var(--fg)] hover:border-[color:var(--accent)]/40 hover:text-[color:var(--accent)]"
                >
                  ver detalle
                  <ExternalLink className="size-3" aria-hidden strokeWidth={1.5} />
                </a>
                <ActionButton
                  icon={Check}
                  label={opp.cta_label}
                  primary
                  disabled={props.readOnly || applied != null}
                  active={applied != null}
                  onClick={() => props.onApply(opp)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}

// =============================================================================
// Section 5 — Plan próximas 2 semanas
// =============================================================================

function SectionPlan({ plan }: { plan: CohortPlanWeek[] }) {
  return (
    <SectionShell title="Plan próximas 2 semanas" icon={CalendarIcon}>
      <div className="flex flex-col gap-4">
        {plan.map((week) => (
          <PlanWeekTable key={week.iso_week_start} week={week} />
        ))}
      </div>
      <footer className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-[color:var(--muted)]">
          Calendario simplificado · arrastra una sesión para intercambiar (próximamente).
        </p>
        <button
          type="button"
          disabled
          className="h-8 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] px-3 text-xs uppercase tracking-[0.12em] text-[color:var(--muted)]"
          title="Pendiente — uses /coach/mass-adjustments por ahora"
        >
          editar masivo
        </button>
      </footer>
    </SectionShell>
  );
}

function PlanWeekTable({ week }: { week: CohortPlanWeek }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--hairline)]">
      <header className="flex items-center justify-between bg-[color:var(--surface)] px-3 py-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          {week.week_label} · empieza {week.iso_week_start}
        </span>
      </header>
      <table className="w-full text-sm">
        <thead className="bg-[color:var(--surface)] text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-[88px]">Día</th>
            <th className="px-3 py-2 text-left font-medium">AM</th>
            <th className="px-3 py-2 text-left font-medium">PM</th>
            <th className="px-3 py-2 text-left font-medium">Highlights</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--hairline)]">
          {week.days.map((day) => (
            <PlanRow key={day.iso_date} day={day} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanRow({ day }: { day: CohortPlanDay }) {
  return (
    <tr className={day.is_today ? 'bg-[color:var(--accent)]/[0.04]' : undefined}>
      <td className="px-3 py-2 font-display italic font-black text-[color:var(--fg)] tabular-nums">
        {day.weekday_label} {day.iso_date.slice(8)}
      </td>
      <td className="px-3 py-2 text-[color:var(--fg)]">{day.am_focus ?? '—'}</td>
      <td className="px-3 py-2 text-[color:var(--fg)]">{day.pm_focus ?? '—'}</td>
      <td className="px-3 py-2 text-[color:var(--muted)]">{day.highlights ?? ''}</td>
    </tr>
  );
}

// =============================================================================
// Section 6 — Notas semana (Pablo journal)
// =============================================================================

function SectionNotes(props: {
  notes: WeeklyReviewNote[];
  readOnly: boolean;
  onAdd: (body: string) => void;
  onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit() {
    if (!draft.trim()) return;
    props.onAdd(draft);
    setDraft('');
  }

  return (
    <SectionShell title="Notas semana" icon={MessageSquare}>
      <ul className="mb-3 flex flex-col gap-2">
        {props.notes.map((n) => (
          <li
            key={n.id}
            className="flex items-start gap-3 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2"
          >
            <Sparkle
              className="mt-1 size-3 shrink-0 text-[color:var(--accent)]"
              aria-hidden
              strokeWidth={1.5}
            />
            <div className="flex-1">
              <p className="text-sm text-[color:var(--fg)] whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] tabular-nums">
                {formatNoteTimestamp(n.created_at)}
              </p>
            </div>
            {!props.readOnly && (
              <button
                type="button"
                onClick={() => props.onRemove(n.id)}
                className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)] hover:text-[color:var(--accent)]"
              >
                quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      {!props.readOnly && (
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]" htmlFor="weekly-review-note">
            + nota
          </label>
          <textarea
            id="weekly-review-note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Bajada general en compliance — vacaciones puente?"
            rows={3}
            className="w-full resize-none rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">
              cmd+enter para guardar · alimenta el RAG futuro
            </p>
            <button
              type="button"
              onClick={commit}
              disabled={!draft.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[color:var(--accent)] px-3 text-xs uppercase tracking-[0.12em] text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-3" aria-hidden strokeWidth={2} />
              añadir nota
            </button>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// =============================================================================
// Section 7 — Cerrar review
// =============================================================================

function SectionActions(props: {
  status: CoachWeeklyReview['status'];
  saving: boolean;
  error: string | null;
  decisions_count: number;
  notes_count: number;
  onApprove: () => void;
  onDefer: () => void;
  onSaveDraft: () => void;
}) {
  const isApproved = props.status === 'approved';

  return (
    <section
      aria-label="Cerrar review"
      className="sticky bottom-0 -mx-6 mt-2 border-t border-[color:var(--hairline)] bg-[color:var(--bg)]/85 px-6 py-4 backdrop-blur sm:-mx-8 sm:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-[color:var(--muted)]">
          <Clock className="size-3.5" aria-hidden strokeWidth={1.5} />
          <span className="tabular-nums">
            {props.decisions_count} decisiones · {props.notes_count} notas
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.error && (
            <p className="text-xs text-[color:var(--warning)]">· {props.error}</p>
          )}
          {isApproved ? (
            <span className="inline-flex h-9 items-center gap-2 rounded-md border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 px-4 text-sm uppercase tracking-[0.12em] text-[color:var(--ok)]">
              <Check className="size-4" aria-hidden strokeWidth={2} />
              review aprobada
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={props.onSaveDraft}
                disabled={props.saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] px-4 text-sm uppercase tracking-[0.12em] text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface)] disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" aria-hidden strokeWidth={1.5} />
                guardar borrador
              </button>
              <button
                type="button"
                onClick={props.onDefer}
                disabled={props.saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 text-sm uppercase tracking-[0.12em] text-[color:var(--muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-50"
              >
                <Pause className="size-3.5" aria-hidden strokeWidth={1.5} />
                aplazar
              </button>
              <button
                type="button"
                onClick={props.onApprove}
                disabled={props.saving}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[color:var(--accent)] px-5 text-sm uppercase tracking-[0.12em] font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:opacity-50"
              >
                <Check className="size-4" aria-hidden strokeWidth={2} />
                aprobar y aplicar
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Reusable building blocks
// =============================================================================

function SectionShell(props: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  count?: number;
  countTone?: 'warning' | 'accent';
}) {
  const Icon = props.icon;
  const tone = props.countTone === 'warning' ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted)]';
  return (
    <section
      aria-label={props.title}
      className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5"
    >
      <header className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-[color:var(--muted)]" aria-hidden strokeWidth={1.5} />
        <h2 className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          {props.title}
        </h2>
        {props.count != null && props.count > 0 && (
          <span className={`text-[11px] tabular-nums ${tone}`}>· {props.count}</span>
        )}
      </header>
      {props.children}
    </section>
  );
}

function ActionButton(props: {
  label: string;
  icon?: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  const Icon = props.icon;
  const base = 'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const tone = props.active
    ? 'border border-[color:var(--ok)]/40 bg-[color:var(--ok)]/10 text-[color:var(--ok)]'
    : props.primary
      ? 'bg-[color:var(--accent)] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)]'
      : 'border border-[color:var(--hairline)] bg-[color:var(--surface)] text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]';

  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className={`${base} ${tone}`}>
      {Icon && <Icon className="size-3" aria-hidden strokeWidth={1.5} />}
      {props.active && !Icon && <Check className="size-3" aria-hidden strokeWidth={2} />}
      {props.label}
    </button>
  );
}

// =============================================================================
// Formatting helpers
// =============================================================================

function formatWeekRange(startIso: string, endIso: string): string {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(n % 1 === 0 ? 0 : 1)}`;
}

function formatHours(h: number): string {
  const wholeH = Math.floor(h);
  const minutes = Math.round((h - wholeH) * 60);
  return `${wholeH}h${minutes.toString().padStart(2, '0')}`;
}

function hrvIcon(trend: 'up' | 'down' | 'flat' | null): LucideIcon | undefined {
  if (trend === 'up') return TrendingUp;
  if (trend === 'down') return TrendingDown;
  if (trend === 'flat') return ChevronRight;
  return undefined;
}

function hrvLabel(trend: 'up' | 'down' | 'flat' | null): string {
  if (trend === 'up') return 'al alza';
  if (trend === 'down') return 'a la baja';
  if (trend === 'flat') return 'estable';
  return '—';
}

function formatNoteTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return iso;
  }
}
