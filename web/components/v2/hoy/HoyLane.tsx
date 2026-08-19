'use client';

// HoyLane — una columna de triaje: cabecera (punto + título + contador) sobre las
// tarjetas. Corta a LANE_CARD_CAP y enseña «+ N más» cuando sobra.
//
// UNA CALLE VACÍA NO ES UNA TARJETA VACÍA. Se pliega a una línea. El check
// verde (buena noticia) solo si hay semana viva; si nadie ve la semana el
// vacío es neutro, no salud del club. §6 y §8.2.

import { LaneCard } from '@/components/v2/hoy/LaneCard';
import { MIcon } from '@/components/ui/MIcon';
import type { V2Lane, V2LaneCard } from '@/lib/dashboard/v2/hoy-lanes';
import type { HoyEmptyLane } from '@fahybrid/shared/domain/coach/club-hoy';
import { cn } from '@/lib/utils';

/** Max cards rendered per lane before the "+ N más" footer. */
const LANE_CARD_CAP = 8;

export function HoyLane({
  lane,
  cards,
  empty,
}: {
  lane: V2Lane;
  cards: V2LaneCard[];
  empty: HoyEmptyLane;
}) {
  const visible = cards.slice(0, LANE_CARD_CAP);
  const overflow = cards.length - visible.length;

  // ── Vacía: una línea, no un panel. Check verde solo si hay semana viva. ──
  if (cards.length === 0) {
    const ok = empty.tone === 'ok';
    return (
      <section
        className="flex min-w-0 items-center gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] px-2.5 py-1.5"
        aria-label={lane.title}
      >
        <MIcon
          name={ok ? 'check' : 'remove'}
          size={14}
          className={cn(
            'shrink-0',
            ok ? 'text-[color:var(--v2-ok)]' : 'text-[color:var(--v2-faint)]',
          )}
        />
        <span className="truncate text-label text-[color:var(--v2-muted)]">{empty.copy}</span>
      </section>
    );
  }

  return (
    <section
      className="flex min-w-0 flex-col rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]"
      aria-label={lane.title}
    >
      {/* Lane header */}
      <header className="sticky top-0 z-[1] flex items-center justify-between gap-2 rounded-t-[var(--v2-r-card)] border-b border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: `var(${lane.dot_var})` }}
          />
          <h2 className="truncate text-body font-bold text-[color:var(--v2-fg)]">{lane.title}</h2>
        </div>
        <span
          className={cn('v2-num shrink-0 rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-label font-bold', 'text-[color:var(--v2-fg)]')}
          style={{ background: `color-mix(in srgb, var(${lane.dot_var}) 18%, transparent)` }}
        >
          {cards.length}
        </span>
      </header>

      {/* Cards */}
      <div className="flex flex-col gap-1.5 p-1.5">
        {visible.map((card, i) => (
          <LaneCard key={card.id} card={card} index={i} />
        ))}

        {overflow > 0 ? (
          <button
            type="button"
            className="v2-focus mt-0.5 rounded-[var(--v2-r-pill)] py-2 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
          >
            + {overflow} más
          </button>
        ) : null}
      </div>
    </section>
  );
}
