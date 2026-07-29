'use client';

// EVALUAR SEMANA — the coach-facing autoregulation panel at the top of the
// Rendimiento tab. It surfaces the PENDING week-adjustment proposal (or lets the
// coach evaluate the week on demand): the verdict, the fired triggers with their
// real numbers, the recommendation + coach summary + rationale, the evaluated
// week's feed, and the concrete slot changes (with resolved template names). The
// coach approves or rejects; an ok verdict is auto-resolved ("sin cambios").
//
// Self-contained (CarrerasTab pattern): fetches its own pending proposal on mount
// and owns the propose/approve/reject mutations, so every state — loading / error
// / no-pending / proposal / in-flight — is real, never mocked.

import { useCallback, useEffect, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { SectionHeading } from '../parts';
import { Chip, TONE_VAR, type Tone } from './ui';
import { WeekFeed } from './WeekFeed';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';
import type {
  FiredTrigger,
  WeekAdjustmentProposalRecord,
  WeekFeedSummary,
} from '@/lib/dashboard/coach/weekly-evaluation';

// ── Normalised view shape (the GET pending + the POST propose response both map
//    into this, so the panel has ONE render path) ────────────────────────────────
type Recommendation = 'keep' | 'soften' | 'swap' | 'rest_day';
type Verdict = 'ok' | 'needs_adjustment';
interface SlotChange {
  date: string;
  slot: 'am' | 'pm';
  from_template_id: string | number | null;
  to_template_id: string | number | null;
}
interface ShownProposal {
  id: string;
  status: 'pending' | 'approved' | 'superseded' | null;
  verdict: Verdict;
  recommendation: Recommendation;
  rationale: string;
  coach_summary: string;
  slot_changes: SlotChange[];
  template_names: Record<string, string>;
  fired_triggers: FiredTrigger[];
  week_feed: WeekFeedSummary | null;
  week_start: string;
}

interface GetResp {
  proposal: PendingAdjustment | null;
  template_names: Record<string, string>;
  fired_triggers: FiredTrigger[];
}

const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  keep: 'Mantener',
  soften: 'Suavizar',
  swap: 'Cambiar',
  rest_day: 'Día de descanso',
};

const VERDICT_META: Record<Verdict, { label: string; tone: Tone }> = {
  ok: { label: 'Semana correcta', tone: 'ok' },
  needs_adjustment: { label: 'Requiere ajuste', tone: 'warn' },
};

const TRIGGER_TONE: Record<FiredTrigger['tone'], Tone> = { warning: 'warn', danger: 'danger' };

const WEEK_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Madrid',
});

function fromGet(r: GetResp): ShownProposal | null {
  const p = r.proposal;
  if (!p) return null;
  return {
    id: p.id,
    status: 'pending',
    verdict: p.verdict === 'ok' ? 'ok' : 'needs_adjustment',
    recommendation: p.proposal.recommendation,
    rationale: p.proposal.rationale,
    coach_summary: p.coach_summary ?? p.proposal.coach_summary,
    slot_changes: p.proposal.slot_changes as unknown as SlotChange[],
    template_names: r.template_names,
    fired_triggers: r.fired_triggers,
    week_feed: null,
    week_start: p.week_start,
  };
}

function fromPost(rec: WeekAdjustmentProposalRecord): ShownProposal {
  return {
    id: rec.id,
    status: rec.status,
    verdict: rec.verdict === 'ok' ? 'ok' : 'needs_adjustment',
    recommendation: rec.proposal.recommendation,
    rationale: rec.proposal.rationale,
    coach_summary: rec.proposal.coach_summary,
    slot_changes: rec.proposal.slot_changes as unknown as SlotChange[],
    template_names: {},
    fired_triggers: rec.fired_triggers,
    week_feed: rec.week_feed,
    week_start: rec.week_start,
  };
}

function templateName(names: Record<string, string>, id: string | number | null): string {
  if (id == null) return 'Descanso';
  return names[String(id)] ?? `Plantilla #${id}`;
}

export function EvaluarSemanaPanel({ athleteId }: { athleteId: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shown, setShown] = useState<ShownProposal | null>(null);
  const [busy, setBusy] = useState<'propose' | 'approve' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPending = useCallback(async (): Promise<GetResp | null> => {
    const res = await fetch(`/api/coach/athletes/${athleteId}/week-adjustment`);
    const body = (await res.json().catch(() => null)) as (GetResp & { error?: { message?: string } }) | null;
    if (!res.ok || !body) {
      throw new Error(body?.error?.message ?? 'No se pudo cargar la evaluación de la semana.');
    }
    return body;
  }, [athleteId]);

  const reloadPending = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await loadPending();
      setShown(r ? fromGet(r) : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la evaluación.');
    } finally {
      setLoading(false);
    }
  }, [loadPending]);

  useEffect(() => {
    void reloadPending();
  }, [reloadPending]);

  const handlePropose = useCallback(async () => {
    setBusy('propose');
    setActionError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/week-adjustment/propose`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as
        | { proposal?: WeekAdjustmentProposalRecord; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.proposal) {
        setActionError(body?.error?.message ?? 'No se pudo evaluar la semana.');
        return;
      }
      const next = fromPost(body.proposal);
      // Los slot_changes recién propuestos traen IDs, no nombres: refrescamos el
      // GET para resolverlos (manteniendo el feed + triggers de la evaluación viva).
      if (next.status === 'pending' && next.slot_changes.length > 0) {
        try {
          const g = await loadPending();
          if (g) next.template_names = g.template_names;
        } catch {
          // Nombres opcionales: si falla, caemos a "Plantilla #id" (no bloquea).
        }
      }
      setShown(next);
    } catch {
      setActionError('No se pudo evaluar la semana. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }, [athleteId, loadPending]);

  const review = useCallback(
    async (action: 'approve' | 'reject', proposalId: string) => {
      setBusy(action);
      setActionError(null);
      try {
        const res = await fetch(
          `/api/coach/athletes/${athleteId}/week-adjustment/${proposalId}/${action}`,
          { method: 'POST' },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setActionError(
            body?.error?.message ??
              (action === 'approve' ? 'No se pudo aprobar.' : 'No se pudo rechazar.'),
          );
          return;
        }
        // Refetch: la propuesta ya no está pending → vuelve al estado "evaluar".
        const g = await loadPending().catch(() => null);
        setShown(g ? fromGet(g) : null);
      } catch {
        setActionError('No se pudo completar la acción. Inténtalo de nuevo.');
      } finally {
        setBusy(null);
      }
    },
    [athleteId, loadPending],
  );

  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeading>Evaluar semana</SectionHeading>
      <div className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
        {loading ? (
          <LoadingRow />
        ) : loadError ? (
          <ErrorRow message={loadError} />
        ) : shown ? (
          <ProposalView
            p={shown}
            busy={busy}
            actionError={actionError}
            onApprove={() => void review('approve', shown.id)}
            onReject={() => void review('reject', shown.id)}
            onDismiss={() => setShown(null)}
          />
        ) : (
          <EvaluateCta busy={busy === 'propose'} error={actionError} onEvaluate={() => void handlePropose()} />
        )}
      </div>
    </section>
  );
}

// ── No pending proposal → on-demand evaluation CTA ──────────────────────────────
function EvaluateCta({
  busy,
  error,
  onEvaluate,
}: {
  busy: boolean;
  error: string | null;
  onEvaluate: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex items-start gap-2.5">
        <MIcon name="tune" size={20} className="mt-0.5 text-[color:var(--v2-accent)]" />
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
            Sin ajuste pendiente
          </span>
          <span className="text-xs leading-relaxed text-[color:var(--v2-muted)]">
            Evalúa la semana anterior para ver si el plan necesita ajuste y, si procede, revisar la
            propuesta.
          </span>
        </div>
      </div>
      {error ? <span className="text-label font-medium text-[color:var(--v2-danger)]">{error}</span> : null}
      <button
        type="button"
        onClick={onEvaluate}
        disabled={busy}
        className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? (
          <MIcon name="progress_activity" size={15} className="animate-spin" />
        ) : (
          <MIcon name="tune" size={15} />
        )}
        Evaluar semana
      </button>
    </div>
  );
}

// ── A shown proposal (verdict + why + recommendation + changes + actions) ────────
function ProposalView({
  p,
  busy,
  actionError,
  onApprove,
  onReject,
  onDismiss,
}: {
  p: ShownProposal;
  busy: 'propose' | 'approve' | 'reject' | null;
  actionError: string | null;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const verdict = VERDICT_META[p.verdict];
  const actionable = p.status === 'pending';

  return (
    <div className="flex flex-col gap-4">
      {/* Verdict + recommendation + evaluated week */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label font-bold"
          style={{ background: `var(--v2-${verdict.tone}-soft)`, color: `var(${TONE_VAR[verdict.tone]})` }}
        >
          <MIcon name={p.verdict === 'ok' ? 'check_circle' : 'warning'} size={14} filled />
          {verdict.label}
        </span>
        <Chip label="Recomendación" value={RECOMMENDATION_LABEL[p.recommendation]} tone="accent" />
        <span className="v2-num ml-auto text-label text-[color:var(--v2-faint)]">
          Semana del {WEEK_FMT.format(new Date(p.week_start))}
        </span>
      </div>

      {/* Fired triggers — the "por qué" with real numbers */}
      {p.fired_triggers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {p.fired_triggers.map((t) => (
            <Chip key={t.code} label={t.label} value={t.value} tone={TRIGGER_TONE[t.tone]} />
          ))}
        </div>
      ) : null}

      {/* Coach summary + rationale */}
      <div className="flex flex-col gap-1">
        {p.coach_summary ? (
          <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{p.coach_summary}</span>
        ) : null}
        {p.rationale ? (
          <span className="text-xs leading-relaxed text-[color:var(--v2-muted)]">{p.rationale}</span>
        ) : null}
      </div>

      {/* Evaluated week feed */}
      {p.week_feed ? <WeekFeed feed={p.week_feed} /> : null}

      {/* Concrete slot changes */}
      {p.slot_changes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Cambios propuestos</span>
          <div className="flex flex-col gap-1.5">
            {p.slot_changes.map((c, i) => (
              <div
                key={`${c.date}-${c.slot}-${i}`}
                className="flex items-center gap-2 rounded-[var(--v2-r-s)] bg-[color:var(--v2-surface-2)] px-2.5 py-1.5"
              >
                <span className="v2-num text-label text-[color:var(--v2-faint)]">
                  {WEEK_FMT.format(new Date(c.date))} · {c.slot.toUpperCase()}
                </span>
                <span className="ml-auto flex items-center gap-1.5 text-label text-[color:var(--v2-fg)]">
                  <span className="truncate text-[color:var(--v2-muted)]">
                    {templateName(p.template_names, c.from_template_id)}
                  </span>
                  <MIcon name="arrow_forward" size={13} className="shrink-0 text-[color:var(--v2-faint)]" />
                  <span className="truncate font-semibold">
                    {templateName(p.template_names, c.to_template_id)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {actionError ? (
        <span className="text-label font-medium text-[color:var(--v2-danger)]">{actionError}</span>
      ) : null}

      {/* Actions */}
      {actionable ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={busy != null}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3.5 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)] disabled:opacity-50"
          >
            {busy === 'reject' ? (
              <MIcon name="progress_activity" size={15} className="animate-spin" />
            ) : (
              <MIcon name="close" size={15} />
            )}
            Rechazar
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={busy != null}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3.5 text-xs font-semibold text-[color:var(--v2-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'approve' ? (
              <MIcon name="progress_activity" size={15} className="animate-spin" />
            ) : (
              <MIcon name="check" size={15} />
            )}
            Aprobar
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="text-label text-[color:var(--v2-muted)]">
            Semana correcta — el plan sigue sin cambios.
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="v2-focus inline-flex h-8 items-center rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            Entendido
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-xs text-[color:var(--v2-faint)]">
      <MIcon name="progress_activity" size={16} className="animate-spin" />
      Cargando evaluación…
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--v2-danger)]">
      <MIcon name="error" size={16} />
      {message}
    </div>
  );
}
