'use client';

// PropuestaCard — the coach DECISION strip: IA proposals the coach approves or
// rejects, surfaced above the 4-lane board in HoyBoard. Two kinds (discriminated
// by card.kind), both a one-decision card wired to the REAL per-proposal endpoints:
//
//   · 'week_adjustment' (autorregulación) → the weekly adjustment the system
//     proposed after evaluating the athlete's week. Shows the recommendation +
//     a before→after mini-diff (template names). Actions:
//       - Aprobar  → POST /api/coach/athletes/{id}/week-adjustment/{pid}/approve
//                    (applies the slot changes to workout_assignments)
//       - Rechazar → POST …/week-adjustment/{pid}/reject
//   · 'monthly_block' → the next month/block proposed for the athlete. Shows the
//     month name + start date + rationale. Actions:
//       - Aprobar  → POST /api/coach/athletes/{id}/monthly-block/{pid}/approve
//                    (instantiates the month into assignments)
//       - Rechazar → POST …/monthly-block/{pid}/reject
//
// On a successful action the card disappears (optimistic), keyed by proposal_id so
// an athlete with BOTH a weekly and a monthly proposal removes only the acted card.
// Mirrors the AsignacionSugerida / SiguienteMicrociclo strip pattern exactly.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2DecisionCard } from '@/lib/dashboard/v2/hoy-lanes';

const BTN_BASE =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-[11px] font-semibold transition-colors';

/** The endpoint path segment per decision kind (mirrors the inbox approve routes). */
function endpointBase(card: V2DecisionCard): string {
  return card.kind === 'week_adjustment' ? 'week-adjustment' : 'monthly-block';
}

/** "dd/mm" for the monthly-block start date (ISO Monday). */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function Card({
  card,
  onResolved,
}: {
  card: V2DecisionCard;
  /** Called after a successful approve/reject so the parent removes the card. */
  onResolved: (proposalId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: 'approve' | 'reject') {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${card.athlete_id}/${endpointBase(card)}/${card.proposal_id}/${action}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      if (res.ok) {
        onResolved(card.proposal_id);
        // The approved adjustment/block now lives in the plan — refresh so the rest
        // of the board (lanes, counts) reflects it on the next read.
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(
        body?.error?.message ??
          (action === 'approve'
            ? 'No se pudo aprobar. Inténtalo de nuevo.'
            : 'No se pudo rechazar. Inténtalo de nuevo.'),
      );
    } catch {
      setError(
        action === 'approve'
          ? 'No se pudo aprobar. Inténtalo de nuevo.'
          : 'No se pudo rechazar. Inténtalo de nuevo.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-72 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
      {/* Identity row + kind chip */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <span className="shrink-0 rounded-[var(--v2-r-xs)] bg-[color:var(--v2-surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
            {card.kind === 'week_adjustment' ? 'Semanal' : 'Mensual'}
          </span>
        </div>
      </div>

      {card.kind === 'week_adjustment' ? (
        <WeekAdjustmentBody card={card} />
      ) : (
        <MonthlyBlockBody card={card} />
      )}

      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => act('approve')}
          disabled={busy != null}
          className={cn(
            BTN_BASE,
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name="check" size={15} />
          {busy === 'approve' ? 'Aprobando…' : 'Aprobar'}
        </button>
        <button
          type="button"
          onClick={() => act('reject')}
          disabled={busy != null}
          className={cn(
            BTN_BASE,
            'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)] disabled:opacity-50',
          )}
        >
          <MIcon name="close" size={15} />
          {busy === 'reject' ? 'Rechazando…' : 'Rechazar'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/v2/atletas/${card.athlete_id}`)}
          className={cn(
            BTN_BASE,
            'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          Ver atleta
          <MIcon name="arrow_forward" size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Week-adjustment body: recommendation title + summary + before→after diff ────

function WeekAdjustmentBody({
  card,
}: {
  card: Extract<V2DecisionCard, { kind: 'week_adjustment' }>;
}) {
  return (
    <>
      <p className="mt-1.5 text-xs font-semibold leading-snug text-[color:var(--v2-fg)]">
        {card.title}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[color:var(--v2-muted)]">
        {card.summary}
      </p>

      {card.diff_rows.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {card.diff_rows.map((row) => (
            <li
              key={row.day_label}
              className="flex items-center gap-1.5 text-[11px] leading-tight"
            >
              <span className="w-7 shrink-0 font-semibold uppercase text-[color:var(--v2-faint)]">
                {row.day_label}
              </span>
              <span className="truncate text-[color:var(--v2-muted)]">{row.before}</span>
              <MIcon
                name="arrow_forward"
                size={12}
                className="shrink-0 text-[color:var(--v2-faint)]"
              />
              <span className="truncate font-semibold text-[color:var(--v2-fg)]">
                {row.after}
              </span>
            </li>
          ))}
          {card.extra_change_count > 0 ? (
            <li className="text-[11px] text-[color:var(--v2-faint)]">
              +<span className="v2-num">{card.extra_change_count}</span> cambio
              {card.extra_change_count === 1 ? '' : 's'} más
            </li>
          ) : null}
        </ul>
      ) : null}
    </>
  );
}

// ── Monthly-block body: month name + start date + rationale ─────────────────────

function MonthlyBlockBody({
  card,
}: {
  card: Extract<V2DecisionCard, { kind: 'monthly_block' }>;
}) {
  return (
    <>
      <p className="mt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Siguiente bloque:{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">«{card.month_name}»</span>{' '}
        <span className="text-[color:var(--v2-faint)]">
          (desde el <span className="v2-num">{shortDate(card.proposed_start_date)}</span>)
        </span>
      </p>
      {card.rationale ? (
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[color:var(--v2-faint)]">
          {card.rationale}
        </p>
      ) : null}
    </>
  );
}

// ── Strip (exported for HoyBoard) ───────────────────────────────────────────────

export function PropuestasStrip({ cards }: { cards: V2DecisionCard[] }) {
  const [visible, setVisible] = useState<V2DecisionCard[]>(cards);

  if (visible.length === 0) return null;

  function handleResolved(proposalId: string) {
    setVisible((prev) => prev.filter((c) => c.proposal_id !== proposalId));
  }

  return (
    <section aria-label="Propuestas pendientes" className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="rule" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Propuestas para aprobar
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {visible.length}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {visible.map((card) => (
          <Card key={card.id} card={card} onResolved={handleResolved} />
        ))}
      </div>
    </section>
  );
}
