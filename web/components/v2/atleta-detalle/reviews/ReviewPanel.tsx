'use client';

// Revisiones 1:1 (#21) — coach panel at the TOP of the ficha's '1:1' tab, above the
// session history. Drives the recurring 1:1 review loop from the coach side:
//   • cadence selector (Sin revisiones / Mensual / Trimestral) → PATCH review-cadence
//   • a status pill + line: próxima reservada · propuesta enviada · toca revisión · al día
//   • propose a review (the athlete then books their slot) or cancel a booked one
// State comes from getAthleteReviewState (server); every action refreshes so the panel
// reflects the new truth. The session history (SessionReportsBlock) stays below.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Panel } from '@/components/v2/atleta-detalle/parts';
import { Pill, type PillTone } from '@/components/v2/Pill';
import { SegmentedControl, type SegmentOption } from '@/components/v2/SegmentedControl';
import {
  REVIEW_CADENCES,
  REVIEW_CADENCE_LABELS,
  type ReviewCadence,
} from '@fahybrid/shared/domain/coach/reviews';
import type { AthleteReviewState } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useReviewMutations } from './review-mutations';

const MS_PER_DAY = 86_400_000;

// Cadence segments — labels from the shared domain (single source), so the selector never
// drifts from the DB CHECK / the iOS copy.
const CADENCE_OPTIONS: ReadonlyArray<SegmentOption<ReviewCadence>> = REVIEW_CADENCES.map((c) => ({
  value: c,
  label: REVIEW_CADENCE_LABELS[c],
}));

const JOIN_CLS =
  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-[13px] font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]';
const ACTION_CLS =
  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-[13px] font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-50';
const CANCEL_CLS =
  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-2 text-[13px] font-semibold text-[color:var(--v2-danger)] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (
    d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY));
}

interface StatusView {
  tone: PillTone;
  label: string;
  detail: string | null;
}

/** The status pill + line, driven by the state. Priority mirrors getAthleteReviewState:
 *  próxima reservada > propuesta enviada > toca revisión > al día. */
function deriveStatus(review: AthleteReviewState, firstName: string): StatusView {
  if (review.next_review) {
    return { tone: 'ok', label: 'Próxima revisión', detail: fmtDateTime(review.next_review.requested_start) };
  }
  if (review.proposal_pending) {
    return { tone: 'info', label: 'Propuesta enviada', detail: `esperando que ${firstName} reserve` };
  }
  const lastLabel = review.last_review_at
    ? `última hace ${daysSince(review.last_review_at)} días`
    : 'aún sin primera revisión';
  if (review.due) {
    return { tone: 'warn', label: 'Toca revisión', detail: lastLabel };
  }
  // Al día — muestra el contexto de la última revisión salvo que no haya cadencia ni historial.
  const detail = review.last_review_at || review.cadence !== 'ninguna' ? lastLabel : null;
  return { tone: 'ok', label: 'Al día', detail };
}

export function ReviewPanel({
  athleteId,
  athleteName,
  review,
}: {
  athleteId: string;
  athleteName: string;
  review: AthleteReviewState | null;
}) {
  if (!review) {
    return (
      <Panel title="Revisiones 1:1">
        <p className="text-sm text-[color:var(--v2-muted)]">
          No pudimos cargar el estado de revisiones. Recarga la página.
        </p>
      </Panel>
    );
  }
  return <ReviewPanelBody athleteId={athleteId} athleteName={athleteName} review={review} />;
}

function ReviewPanelBody({
  athleteId,
  athleteName,
  review,
}: {
  athleteId: string;
  athleteName: string;
  review: AthleteReviewState;
}) {
  const m = useReviewMutations(athleteId);
  // Optimistic cadence — the click reflects immediately, then reconciles to the server
  // value when the next router.refresh() lands. Adjust-state-during-render (no effect):
  // the React-recommended way to sync local state to a changing prop.
  const [optimistic, setOptimistic] = useState<ReviewCadence | null>(null);
  const [prevServerCadence, setPrevServerCadence] = useState<ReviewCadence>(review.cadence);
  // Which action is in flight (drives the per-button spinner).
  const [active, setActive] = useState<'cadence' | 'propose' | 'cancel' | null>(null);
  // Inline note for a declined proposal (already booked / proposed too recently).
  const [note, setNote] = useState<string | null>(null);

  if (review.cadence !== prevServerCadence) {
    // The server value changed (a refresh landed) → it wins; drop any optimistic override.
    setPrevServerCadence(review.cadence);
    setOptimistic(null);
  }
  const cadence = optimistic ?? review.cadence;

  const firstName = athleteName.trim().split(/\s+/)[0] || athleteName;
  const status = deriveStatus(review, firstName);
  const next = review.next_review;

  async function onCadence(nextCadence: ReviewCadence) {
    if (nextCadence === cadence || m.busy) return;
    setNote(null);
    setOptimistic(nextCadence); // reflect the click immediately
    setActive('cadence');
    const ok = await m.setCadence(nextCadence);
    setActive(null);
    if (!ok) setOptimistic(null); // revert to the server value; the hook set the error
  }

  async function onPropose() {
    setNote(null);
    setActive('propose');
    const res = await m.propose();
    setActive(null);
    if (res && !res.proposed) {
      setNote(
        res.reason === 'already_booked'
          ? 'Ya hay una revisión reservada.'
          : `Ya enviaste una propuesta hace poco. Espera a que ${firstName} reserve.`,
      );
    }
  }

  async function onCancel() {
    setNote(null);
    setActive('cancel');
    await m.cancel();
    setActive(null);
  }

  return (
    <Panel title="Revisiones 1:1">
      <div className="flex flex-col gap-4">
        {/* Cadencia */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="v2-micro">Cadencia de revisión</span>
            <span className="text-xs text-[color:var(--v2-muted)]">
              Cada cuánto toca una videollamada 1:1 con {firstName}.
            </span>
          </div>
          <SegmentedControl
            ariaLabel="Cadencia de revisión"
            options={CADENCE_OPTIONS}
            value={cadence}
            onChange={onCadence}
            size="sm"
          />
        </div>

        <div className="h-px bg-[color:var(--v2-border)]" />

        {/* Estado + acciones */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <Pill tone={status.tone} variant="soft">
              {status.label}
            </Pill>
            {status.detail ? (
              <span className="text-sm text-[color:var(--v2-muted)]">{status.detail}</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {next ? (
              <>
                {next.meet_link ? (
                  <a href={next.meet_link} target="_blank" rel="noreferrer" className={JOIN_CLS}>
                    <MIcon name="videocam" size={16} />
                    Unirse
                  </a>
                ) : null}
                <button type="button" onClick={onCancel} disabled={m.busy} className={CANCEL_CLS}>
                  <MIcon
                    name={active === 'cancel' ? 'progress_activity' : 'event_busy'}
                    size={16}
                    className={active === 'cancel' ? 'animate-spin' : undefined}
                  />
                  Cancelar revisión
                </button>
              </>
            ) : (
              <button type="button" onClick={onPropose} disabled={m.busy} className={ACTION_CLS}>
                <MIcon
                  name={active === 'propose' ? 'progress_activity' : 'send'}
                  size={16}
                  className={active === 'propose' ? 'animate-spin' : undefined}
                />
                Proponer revisión
              </button>
            )}
          </div>
        </div>

        {note ? <p className="text-xs text-[color:var(--v2-muted)]">{note}</p> : null}
        {m.error ? (
          <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
            {m.error}
          </p>
        ) : null}
      </div>
    </Panel>
  );
}
