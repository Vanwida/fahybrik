'use client';

// NivelSugeridoCard — a decision card for a new athlete whose level has been
// algorithmically suggested but not yet confirmed by the coach.
//
// Rendered in a horizontal scroll strip above the 4-lane board in HoyBoard.
// Two actions:
//   · Aceptar nivel  → PATCH /api/coach/athletes/{id}/level, then removes card
//   · Ver atleta →   → navigates to /v2/atletas/{id}

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2NivelSugeridoCard } from '@/lib/dashboard/v2/hoy-lanes';
import { Rail } from '@/components/v2/Rail';

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIDENCE_META: Record<
  V2NivelSugeridoCard['confidence'],
  { label: string; colorVar: string; softVar: string }
> = {
  high: {
    label: 'confianza alta',
    colorVar: '--v2-ok',
    softVar: '--v2-ok-soft',
  },
  medium: {
    label: 'confianza media',
    colorVar: '--v2-warn',
    softVar: '--v2-warn-soft',
  },
  low: {
    label: 'confianza baja',
    colorVar: '--v2-muted',
    softVar: '--v2-surface-2',
  },
};

function ConfidenceBadge({ confidence }: { confidence: V2NivelSugeridoCard['confidence'] }) {
  const meta = CONFIDENCE_META[confidence];
  return (
    <span
      className="inline-flex items-center rounded-[var(--v2-r-pill)] px-2 py-0.5 text-label font-semibold"
      style={{
        background: `var(${meta.softVar})`,
        color: `var(${meta.colorVar})`,
      }}
    >
      {meta.label}
    </span>
  );
}

// ── Single card ───────────────────────────────────────────────────────────────

export function NivelSugeridoCard({
  card,
  onAccepted,
}: {
  card: V2NivelSugeridoCard;
  /** Called after a successful PATCH so the parent can remove the card. */
  onAccepted: (athleteId: number) => void;
}) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    if (accepting) return;
    setAccepting(true);
    try {
      const res = await fetch(`/api/coach/athletes/${card.athlete_id}/level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_id: card.suggested_level_id }),
      });
      if (res.ok) {
        onAccepted(card.athlete_id);
      }
    } finally {
      setAccepting(false);
    }
  }

  const btnBase =
    'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-s)] px-2 text-label font-semibold transition-colors';

  return (
    <div className="w-60 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5">
      {/* Identity row */}
      <div className="flex items-center gap-2.5">
        <AthleteAvatar name={card.athlete_name} size="md" />
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
            {card.athlete_name}
          </span>
          <LevelBadge level={null} />
        </div>
      </div>

      {/* Proposal line */}
      <p className="mt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Nivel sugerido:{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">
          {card.suggested_level_name}
          {card.suggested_level_label ? ` — ${card.suggested_level_label}` : ''}
        </span>
      </p>

      {/* Confidence badge */}
      <div className="mt-1.5">
        <ConfidenceBadge confidence={card.confidence} />
      </div>

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting}
          className={cn(
            btnBase,
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name="check_circle" size={15} />
          {accepting ? 'Guardando…' : 'Aceptar nivel'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/atletas/${card.athlete_id}`)}
          className={cn(
            btnBase,
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

// ── Strip (exported for HoyBoard) ─────────────────────────────────────────────

export function NivelSugeridoStrip({ cards }: { cards: V2NivelSugeridoCard[] }) {
  const [visible, setVisible] = useState<V2NivelSugeridoCard[]>(cards);

  if (visible.length === 0) return null;

  function handleAccepted(athleteId: number) {
    setVisible((prev) => prev.filter((c) => c.athlete_id !== athleteId));
  }

  return (
    <section aria-label="Niveles pendientes de confirmar" className="mt-4">
      {/* Section header */}
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="school" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Nivel pendiente de confirmar
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-eyebrow font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {visible.length}
        </span>
      </div>

      {/* Horizontal scroll row */}
      <Rail>
        {visible.map((card) => (
          <NivelSugeridoCard key={card.id} card={card} onAccepted={handleAccepted} />
        ))}
      </Rail>
    </section>
  );
}
