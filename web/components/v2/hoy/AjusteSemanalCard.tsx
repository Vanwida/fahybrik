'use client';

// AjusteSemanalCard — a pending weekly-adjustment proposal from Pablo IA, surfaced
// as a decision card above the 4-lane board (sibling of NivelSugeridoCard /
// AsignacionSugeridaCard). The proposals are cron-generated and stored in
// week_adjustment_proposals; the inbox loader already computes them — this only
// RENDERS them and wires the two existing endpoints:
//   · Aceptar      → POST /api/coach/athletes/{id}/week-adjustment/{proposalId}/approve
//                    (applies the slot changes + clears the signal) → card disappears.
//   · Ver propuesta→ navigates to the athlete (/atletas/{id}) to see the full week.
//   · Ignorar      → POST .../reject → card disappears.
// Optimistic remove on success, matching the existing decision strips.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2WeekAdjustmentCard } from '@/lib/dashboard/v2/hoy-lanes';

const BTN_BASE =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-[11px] font-semibold transition-colors';

/** "23 jun" from an ISO date (YYYY-MM-DD), box timezone-safe (date-only). */
function weekStartLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const fmt = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return fmt.format(new Date(Date.UTC(y, m - 1, d))).replace(/\.$/, '');
}

// ── Single card ───────────────────────────────────────────────────────────────

export function AjusteSemanalCard({
  card,
  onResolved,
}: {
  card: V2WeekAdjustmentCard;
  /** Called after a successful approve/reject so the parent can remove the card. */
  onResolved: (proposalId: number) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: 'approve' | 'reject') {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(
        `/api/coach/athletes/${card.athlete_id}/week-adjustment/${card.proposal_id}/${action}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      );
      if (res.ok) {
        onResolved(card.proposal_id);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? 'No se pudo aplicar. Inténtalo de nuevo.');
    } catch {
      setError('No se pudo aplicar. Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-72 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
      {/* Identity + week */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <span className="text-[11px] text-[color:var(--v2-faint)]">
            semana del {weekStartLabel(card.week_start)}
          </span>
        </div>
      </div>

      {/* Recommendation title + summary */}
      <p className="mt-1.5 text-xs font-semibold text-[color:var(--v2-fg)]">{card.title}</p>
      <p className="mt-0.5 text-xs leading-snug text-[color:var(--v2-muted)]">{card.summary}</p>

      {/* Diff mini-table: día · antes → después */}
      {card.diff_rows.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {card.diff_rows.map((row, i) => (
            <li
              key={`${row.day_label}-${i}`}
              className="flex items-center gap-1.5 text-[11px] leading-snug"
            >
              <span className="w-9 shrink-0 font-semibold uppercase text-[color:var(--v2-faint)]">
                {row.day_label}
              </span>
              <span className="truncate text-[color:var(--v2-muted)] line-through">
                {row.before}
              </span>
              <MIcon
                name="arrow_forward"
                size={12}
                className="shrink-0 text-[color:var(--v2-faint)]"
              />
              <span className="truncate font-medium text-[color:var(--v2-fg)]">{row.after}</span>
            </li>
          ))}
          {card.extra_change_count > 0 ? (
            <li className="text-[11px] text-[color:var(--v2-faint)]">
              +{card.extra_change_count} más
            </li>
          ) : null}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => resolve('approve')}
          disabled={busy != null}
          className={cn(
            BTN_BASE,
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name="check_circle" size={15} />
          {busy === 'approve' ? 'Aplicando…' : 'Aceptar'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/atletas/${card.athlete_id}`)}
          className={cn(
            BTN_BASE,
            'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          Ver propuesta
          <MIcon name="arrow_forward" size={15} />
        </button>
        <button
          type="button"
          onClick={() => resolve('reject')}
          disabled={busy != null}
          className={cn(
            BTN_BASE,
            'text-[color:var(--v2-faint)] hover:text-[color:var(--v2-fg)] disabled:opacity-50',
          )}
        >
          {busy === 'reject' ? 'Ignorando…' : 'Ignorar'}
        </button>
      </div>
    </div>
  );
}

// ── Strip (exported for HoyBoard) ─────────────────────────────────────────────

export function AjusteSemanalStrip({ cards }: { cards: V2WeekAdjustmentCard[] }) {
  const [visible, setVisible] = useState<V2WeekAdjustmentCard[]>(cards);

  if (visible.length === 0) return null;

  function handleResolved(proposalId: number) {
    setVisible((prev) => prev.filter((c) => c.proposal_id !== proposalId));
  }

  return (
    <section aria-label="Ajustes de semana sugeridos" className="mt-4">
      {/* Section header */}
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="tune" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Ajuste de semana sugerido
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {visible.length}
        </span>
      </div>

      {/* Horizontal scroll row */}
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {visible.map((card) => (
          <AjusteSemanalCard key={card.id} card={card} onResolved={handleResolved} />
        ))}
      </div>
    </section>
  );
}
