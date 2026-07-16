'use client';

// AsignacionSugeridaCard — a one-click auto-assignment proposal for a classified
// athlete with no active sequence enrollment. The clean replacement for the failed
// "B6" card: wired to the REAL assign-sequence endpoint, never silently failing.
//
// Rendered in a horizontal scroll strip above the 4-lane board in HoyBoard.
//
// Two shapes (discriminated by card.kind):
//   · 'ok'      → the proposal. Shows "Nivel N2 · 4 días → empezar con
//                 «{microciclo}» ({N} semanas)". Actions:
//                   - Asignar    → POST /api/coach/athletes/{id}/assign-sequence
//                                  → on success the card disappears (optimistic).
//                   - Ver atleta → navigates to /v2/atletas/{id}.
//   · 'blocked' → an ACTIONABLE "why not" (e.g. "No hay secuencia para N4·5d").
//                 Links to the surface that fixes it (sequences editor for the
//                 sequence gaps; the athlete's profile for the days gaps). Never
//                 just hidden — surfacing the gap IS the point.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { MIcon } from '@/components/ui/MIcon';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { V2AsignacionSugeridaCard } from '@/lib/dashboard/v2/hoy-lanes';
import { Rail } from '@/components/v2/Rail';

// ── Shared button styling (matches NivelSugeridoCard) ───────────────────────────

const BTN_BASE =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-[11px] font-semibold transition-colors';

// ── Actionable "why not" mapping ────────────────────────────────────────────────
// Each blocked reason maps to ONE concrete fix the coach can act on. Days-related
// gaps live on the athlete's profile; sequence gaps live in the matrix editor.

function blockedFix(
  card: Extract<V2AsignacionSugeridaCard, { kind: 'blocked' }>,
): { label: string; href: string } {
  switch (card.reason) {
    case 'no_training_days':
    case 'days_out_of_band':
      // The fix is the athlete's training days → their profile.
      return { label: 'Editar días', href: `/atletas/${card.athlete_id}?tab=perfil` };
    case 'no_sequence_for_cell':
    case 'empty_sequence':
      // The fix is the (level × days) sequence → the level's periodization.
      return { label: 'Crear secuencia', href: `/periodizacion` };
    case 'not_classified':
    default:
      // Unreachable for these cards (classified-only), but keep a safe fallback.
      return { label: 'Ver atleta', href: `/atletas/${card.athlete_id}` };
  }
}

// ── 'ok' proposal card ──────────────────────────────────────────────────────────

function ProposalCard({
  card,
  onAssigned,
}: {
  card: Extract<V2AsignacionSugeridaCard, { kind: 'ok' }>;
  /** Called after a successful POST so the parent can remove the card. */
  onAssigned: (athleteId: number) => void;
}) {
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAssign() {
    if (assigning) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${card.athlete_id}/assign-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Body optional — the server defaults the start to next Monday.
        body: '{}',
      });
      if (res.ok) {
        onAssigned(card.athlete_id);
        return;
      }
      // Surface the server's message rather than silently swallowing a failure.
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? 'No se pudo asignar. Inténtalo de nuevo.');
    } catch {
      setError('No se pudo asignar. Inténtalo de nuevo.');
    } finally {
      setAssigning(false);
    }
  }

  const weeksLabel = `${card.first_microciclo_weeks} ${
    card.first_microciclo_weeks === 1 ? 'semana' : 'semanas'
  }`;

  return (
    <div className="w-64 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
      {/* Identity row */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <LevelBadge level={card.level_name} />
        </div>
      </div>

      {/* Proposal line: Nivel N2 · 4 días → empezar con «microciclo» (N semanas) */}
      <p className="mt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Nivel{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">{card.level_name}</span> ·{' '}
        <span className="v2-num">{card.days_per_week}</span> días → empezar con{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">
          «{card.first_microciclo_name}»
        </span>{' '}
        <span className="text-[color:var(--v2-faint)]">({weeksLabel})</span>
      </p>

      {error ? (
        <p className="mt-1.5 text-[11px] font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleAssign}
          disabled={assigning}
          className={cn(
            BTN_BASE,
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name="play_arrow" size={15} />
          {assigning ? 'Asignando…' : 'Asignar'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/atletas/${card.athlete_id}`)}
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

// ── 'blocked' actionable card ───────────────────────────────────────────────────

function BlockedCard({
  card,
}: {
  card: Extract<V2AsignacionSugeridaCard, { kind: 'blocked' }>;
}) {
  const fix = blockedFix(card);
  return (
    <div className="w-64 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)] bg-[color:var(--v2-surface)] p-2.5">
      {/* Identity row */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <LevelBadge level={card.level_name} />
        </div>
      </div>

      {/* Why we can't auto-assign yet (resolver message) */}
      <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        <MIcon
          name="warning"
          size={14}
          className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]"
        />
        <span>{card.message}</span>
      </p>

      {/* The one concrete fix */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Link
          href={fix.href}
          className={cn(
            BTN_BASE,
            'border border-[color:var(--v2-warn)] text-[color:var(--v2-warn)] hover:bg-[color:var(--v2-warn-soft)]',
          )}
        >
          <MIcon name="build" size={15} />
          {fix.label}
        </Link>
        <Link
          href={`/atletas/${card.athlete_id}`}
          className={cn(
            BTN_BASE,
            'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          Ver atleta
          <MIcon name="arrow_forward" size={15} />
        </Link>
      </div>
    </div>
  );
}

// ── Single card (dispatches by kind) ────────────────────────────────────────────

export function AsignacionSugeridaCard({
  card,
  onAssigned,
}: {
  card: V2AsignacionSugeridaCard;
  onAssigned: (athleteId: number) => void;
}) {
  if (card.kind === 'ok') {
    return <ProposalCard card={card} onAssigned={onAssigned} />;
  }
  return <BlockedCard card={card} />;
}

// ── Strip (exported for HoyBoard) ─────────────────────────────────────────────

export function AsignacionSugeridaStrip({
  cards,
}: {
  cards: V2AsignacionSugeridaCard[];
}) {
  const [visible, setVisible] = useState<V2AsignacionSugeridaCard[]>(cards);

  if (visible.length === 0) return null;

  function handleAssigned(athleteId: number) {
    setVisible((prev) => prev.filter((c) => c.athlete_id !== athleteId));
  }

  return (
    <section aria-label="Asignaciones sugeridas" className="mt-4">
      {/* Section header */}
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="auto_awesome_motion" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Asignación sugerida
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {visible.length}
        </span>
      </div>

      {/* Horizontal scroll row */}
      <Rail>
        {visible.map((card) => (
          <AsignacionSugeridaCard key={card.id} card={card} onAssigned={handleAssigned} />
        ))}
      </Rail>
    </section>
  );
}
