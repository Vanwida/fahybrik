'use client';

// HoyBoard — the client orchestrator for the flagship Hoy screen. Renders the
// top bar (display title + real count chips + search + coach avatar) and the
// 4-lane board. Owns the search query: typing filters cards by athlete name
// across every lane (counts in the headers reflect the filtered view). Data is
// computed server-side (buildHoyLanes) and passed in via props.

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { HoyLane } from '@/components/v2/hoy/HoyLane';
import { NivelSugeridoStrip } from '@/components/v2/hoy/NivelSugeridoCard';
import type { V2HoyData, V2LaneCard } from '@/lib/dashboard/v2/hoy-lanes';
import { cn } from '@/lib/utils';

function matches(card: V2LaneCard, q: string): boolean {
  return card.athlete_name.toLowerCase().includes(q);
}

export function HoyBoard({
  data,
  today,
  coach_name,
}: {
  data: V2HoyData;
  today: string;
  coach_name: string;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Filter cards per lane by the search query (empty query → all cards).
  const filteredLanes = useMemo(
    () =>
      data.lanes.map((lane) => ({
        lane,
        cards: q ? lane.cards.filter((c) => matches(c, q)) : lane.cards,
      })),
    [data.lanes, q],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Hoy</span>
            <span className="text-[color:var(--v2-muted)]"> · {today}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="neutral" variant="soft">
              <span className="v2-num">{data.total_athletes}</span>&nbsp;atletas
            </Pill>
            <Pill tone="danger" variant="soft">
              <span className="v2-num">{data.need_attention_count}</span>&nbsp;requieren atención
            </Pill>
            <Pill tone="info" variant="soft">
              <span className="v2-num">{data.awaiting_reply_count}</span>&nbsp;sin respuesta
            </Pill>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* Search */}
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar atleta…"
              aria-label="Buscar atleta"
              className={cn(
                'v2-focus h-9 w-44 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] pl-8 pr-3 text-sm sm:w-56',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
                'focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>
          <AthleteAvatar name={coach_name} size="md" />
        </div>
      </div>

      {/* ── Nivel sugerido strip (new athletes awaiting level confirmation) ── */}
      <NivelSugeridoStrip cards={data.nivel_sugerido_cards} />

      {/* ── Board · 4 equal lanes ────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 items-start gap-2.5 md:grid-cols-2 xl:grid-cols-4">
        {filteredLanes.map(({ lane, cards }) => (
          <HoyLane key={lane.id} lane={lane} cards={cards} />
        ))}
      </div>
    </div>
  );
}
