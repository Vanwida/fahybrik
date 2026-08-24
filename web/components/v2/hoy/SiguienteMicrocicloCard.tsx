'use client';

// SiguienteMicrocicloCard — a one-click proposal to WALK an athlete's sequence to
// the next step, shown when their current microciclo has finished. Mirrors
// AsignacionSugeridaCard exactly (one-click + optimistic remove + surfaced server
// error), wired to the REAL advance-sequence endpoint.
//
// The copy reflects what advancing will DO (V2SiguienteMicrocicloAction):
//   · 'advance'  → "terminó «{finished}» · siguiente: «{next}»"
//   · 'repeat'   → "terminó «{finished}» · repetir el ciclo"
//   · 'level_up' → "terminó «{finished}» · subir a {nivel}"
//   · 'stop'     → "terminó «{finished}» · cerrar el plan"
// The action button POSTs to /api/coach/athletes/{id}/advance-sequence; on success
// the card disappears (optimistic) like the assignment strip.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { V2SiguienteMicrocicloCard } from '@/lib/dashboard/v2/hoy-lanes';
import { DecisionStrip } from '@/components/v2/hoy/DecisionStrip';

const BTN_BASE =
  'v2-focus inline-flex h-7 items-center gap-1 rounded-[var(--v2-r-pill)] px-2.5 text-label font-semibold transition-colors';

// Action → the verb on the button + the trailing "siguiente:" clause.
function actionCopy(card: V2SiguienteMicrocicloCard): { button: string; next: React.ReactNode } {
  switch (card.action) {
    case 'advance':
      return {
        button: 'Avanzar',
        next: (
          <>
            siguiente:{' '}
            <span className="font-semibold text-[color:var(--v2-fg)]">
              «{card.next_microciclo_name ?? 'siguiente ciclo'}»
            </span>
          </>
        ),
      };
    case 'repeat':
      return {
        button: 'Repetir ciclo',
        next: <span className="font-semibold text-[color:var(--v2-fg)]">repetir el ciclo</span>,
      };
    case 'level_up':
      return {
        button: 'Subir nivel',
        next: (
          <>
            subir a{' '}
            <span className="font-semibold text-[color:var(--v2-fg)]">
              {card.next_level_name ?? 'siguiente nivel'}
            </span>
          </>
        ),
      };
    case 'stop':
    default:
      return {
        button: 'Cerrar plan',
        next: <span className="font-semibold text-[color:var(--v2-fg)]">cerrar el plan</span>,
      };
  }
}

function Card({
  card,
  onAdvanced,
}: {
  card: V2SiguienteMicrocicloCard;
  /** Called after a successful POST so the parent can remove the card. */
  onAdvanced: (athleteId: number) => void;
}) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdvance() {
    if (advancing) return;
    setAdvancing(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${card.athlete_id}/advance-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        onAdvanced(card.athlete_id);
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? 'No se pudo avanzar. Inténtalo de nuevo.');
    } catch {
      setError('No se pudo avanzar. Inténtalo de nuevo.');
    } finally {
      setAdvancing(false);
    }
  }

  const { button, next } = actionCopy(card);
  // 'stop' closes the plan rather than publishing new work — a quieter (neutral)
  // affordance than the accent "advance/repeat/level_up" actions.
  const isStop = card.action === 'stop';

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

      {/* "terminó «microciclo N» · {siguiente clause}" */}
      <p className="mt-1.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Terminó{' '}
        <span className="font-semibold text-[color:var(--v2-fg)]">
          «{card.finished_microciclo_name}»
        </span>{' '}
        · {next}
      </p>

      {error ? (
        <p className="mt-1.5 text-label font-medium text-[color:var(--v2-danger)]">{error}</p>
      ) : null}

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          className={cn(
            BTN_BASE,
            isStop
              ? 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)] disabled:opacity-50'
              : 'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50',
          )}
        >
          <MIcon name={isStop ? 'flag' : 'skip_next'} size={15} />
          {advancing ? 'Procesando…' : button}
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

export function SiguienteMicrocicloStrip({
  cards,
}: {
  cards: V2SiguienteMicrocicloCard[];
}) {
  const [visible, setVisible] = useState<V2SiguienteMicrocicloCard[]>(cards);

  if (visible.length === 0) return null;

  function handleAdvanced(athleteId: number) {
    setVisible((prev) => prev.filter((c) => c.athlete_id !== athleteId));
  }

  return (
    <DecisionStrip icon="skip_next" label="Siguiente ciclo" count={visible.length}>
      {visible.map((card) => (
        <Card key={card.id} card={card} onAdvanced={handleAdvanced} />
      ))}
    </DecisionStrip>
  );
}
