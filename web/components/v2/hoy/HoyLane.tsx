'use client';

// HoyLane — one triage column: a sticky header (dot + title + count) over a
// scroll of LaneCards. Caps visible cards and shows a "+ N más" footer when
// truncated. Renders a calm EmptyState when the lane has no cards (after the
// active search filter). One of the 4 equal board columns.

import { LaneCard } from '@/components/v2/hoy/LaneCard';
import { EmptyState } from '@/components/v2/EmptyState';
import type { V2Lane, V2LaneCard } from '@/lib/dashboard/v2/hoy-lanes';
import { cn } from '@/lib/utils';

/** Max cards rendered per lane before the "+ N más" footer. */
const LANE_CARD_CAP = 8;

const EMPTY_COPY: Record<string, { icon: string; title: string }> = {
  fallo_sesiones: { icon: 'check_circle', title: 'Nadie ha fallado sesiones' },
  listo_progresar: { icon: 'trending_up', title: 'Sin candidatos a progresar hoy' },
  vigilar_fisiologia: { icon: 'favorite', title: 'Fisiología en verde' },
  espera_respuesta: { icon: 'mark_chat_read', title: 'Bandeja al día' },
};

export function HoyLane({ lane, cards }: { lane: V2Lane; cards: V2LaneCard[] }) {
  const visible = cards.slice(0, LANE_CARD_CAP);
  const overflow = cards.length - visible.length;
  const empty = EMPTY_COPY[lane.id] ?? { icon: 'inbox', title: 'Sin elementos' };

  return (
    <section
      className="flex min-w-0 flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
      aria-label={lane.title}
    >
      {/* Lane header */}
      <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 rounded-t-[var(--v2-r-l)] border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: `var(${lane.dot_var})` }}
          />
          <h2 className="truncate text-body font-bold text-[color:var(--v2-fg)]">{lane.title}</h2>
        </div>
        <span
          className={cn(
            'v2-num shrink-0 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-label font-bold',
            cards.length > 0
              ? 'text-[color:var(--v2-fg)]'
              : 'text-[color:var(--v2-faint)]',
          )}
          style={cards.length > 0 ? { background: `color-mix(in srgb, var(${lane.dot_var}) 18%, transparent)` } : undefined}
        >
          {cards.length}
        </span>
      </header>

      {/* Cards */}
      <div className="flex flex-col gap-1.5 p-1.5">
        {visible.length === 0 ? (
          <EmptyState icon={empty.icon} title={empty.title} className="border-none py-8" />
        ) : (
          visible.map((card, i) => <LaneCard key={card.id} card={card} index={i} />)
        )}

        {overflow > 0 ? (
          <button
            type="button"
            className="v2-focus mt-0.5 rounded-[var(--v2-r-s)] py-2 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            + {overflow} más
          </button>
        ) : null}
      </div>
    </section>
  );
}
