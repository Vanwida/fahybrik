'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import {
  METHODOLOGY_AREAS,
  AREA_COMPLETION,
  type MethodologyArea,
} from '@/lib/dashboard/coach/methodology/defaults';

// Section landing: the 14 areas as cards (spec §4 + §6). First-run shows a
// guided-tour banner; steady-state shows editable cards with completion +
// last-edited. Built areas link into their sub-route; not-yet-built ones read
// "próximamente" but are still listed (full scope visible).

const TOTAL_AREAS = METHODOLOGY_AREAS.length;

function areaState(id: number): 'confirmed' | 'prefilled' | 'empty' {
  const c = AREA_COMPLETION[id];
  if (!c) return 'empty';
  if (c.confirmed > 0) return 'confirmed';
  if (c.prefilled > 0) return 'prefilled';
  return 'empty';
}

export function MethodologyShell() {
  // First-run = nothing confirmed yet. (Mock; real value from saved fields.)
  const confirmedCount = useMemo(
    () =>
      METHODOLOGY_AREAS.reduce(
        (n, a) => n + (AREA_COMPLETION[a.id]?.confirmed ? 1 : 0),
        0,
      ),
    [],
  );
  const [tourDismissed, setTourDismissed] = useState(false);
  const isFirstRun = confirmedCount === 0 && !tourDismissed;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-headline-lg">Metodología</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Tu cerebro de entrenador, en estructura. La IA selecciona y adapta tus plantillas como lo
          harías tú — nunca genera desde cero.
        </p>
      </header>

      {/* Completion meter */}
      <div className="flex items-center gap-4">
        <div className="metric-readout">
          <span className="metric-readout__value">
            {confirmedCount}
            <span className="metric-readout__unit"> / {TOTAL_AREAS}</span>
          </span>
          <span className="metric-readout__label">áreas confirmadas</span>
        </div>
        <div className="h-1.5 flex-1 overflow-hidden rounded-[var(--r-pill)] bg-[color:var(--surface-elevated)]">
          <div
            className="h-full rounded-[var(--r-pill)] bg-[color:var(--accent)] transition-[width] duration-500"
            style={{ width: `${(confirmedCount / TOTAL_AREAS) * 100}%` }}
          />
        </div>
      </div>

      {/* First-run guided tour banner */}
      {isFirstRun ? (
        <div className="banner-review">
          <div className="flex items-start gap-3">
            <MIcon name="route" size={20} className="mt-0.5 text-[color:var(--accent)]" />
            <div className="space-y-0.5">
              <p className="font-heading-sm text-[color:var(--fg)]">
                Recorrido guiado — todo viene pre-rellenado con tus defaults
              </p>
              <p className="text-[13px] text-[color:var(--text-muted)]">
                Cada área llega con los valores que ya usas (badge{' '}
                <span className="font-bold text-[color:var(--warning)]">default Pablo</span>). Solo
                tienes que confirmar o editar — no escribir de cero.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTourDismissed(true)}
            className="focus-ring shrink-0 rounded-[var(--r-sm)] px-2 py-1 text-xs font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
          >
            Entendido
          </button>
        </div>
      ) : null}

      {/* 14 area cards */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {METHODOLOGY_AREAS.map((area, i) => (
          <AreaCard key={area.id} area={area} index={i} />
        ))}
      </ul>
    </div>
  );
}

function AreaCard({ area, index }: { area: MethodologyArea; index: number }) {
  const built = area.status === 'built';
  const state = areaState(area.id);
  const completion = AREA_COMPLETION[area.id];

  const inner = (
    <div
      className={cn(
        'card-elevated stagger-in group flex h-full flex-col gap-3 p-4',
        built && 'cursor-pointer',
        !built && 'opacity-75',
      )}
      style={{ ['--stagger-i' as string]: index }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-m)]',
              built
                ? 'bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface-elevated))] text-[color:var(--accent)]'
                : 'bg-[color:var(--surface-elevated)] text-[color:var(--text-muted)]',
            )}
          >
            <MIcon name={area.icon} size={20} />
          </span>
          <div>
            <span className="micro-label block">Área {area.id}</span>
            <h3 className="font-heading-sm leading-snug text-[color:var(--fg)]">{area.title}</h3>
          </div>
        </div>
        {built ? (
          <MIcon
            name="chevron_right"
            size={20}
            className="mt-1 shrink-0 text-[color:var(--text-muted)] transition-colors group-hover:text-[color:var(--accent)]"
          />
        ) : (
          <span className="mt-1 shrink-0 rounded-[var(--r-pill)] border border-[color:var(--border-subtle)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[color:var(--text-muted)]">
            próximamente
          </span>
        )}
      </div>

      <p className="line-clamp-2 text-[13px] leading-relaxed text-[color:var(--text-muted)]">
        {area.summary}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="micro-label">{area.phase}</span>
        <span className="flex items-center gap-1.5 text-[11px]">
          {state === 'prefilled' ? (
            <span className="flex items-center gap-1 font-bold uppercase tracking-[0.06em] text-[color:var(--warning)]">
              <MIcon name="circle" size={8} filled />
              por confirmar
            </span>
          ) : state === 'confirmed' ? (
            <span className="flex items-center gap-1 font-bold uppercase tracking-[0.06em] text-[color:var(--ok)]">
              <MIcon name="check" size={12} />
              confirmada
            </span>
          ) : (
            <span className="font-bold uppercase tracking-[0.06em] text-[color:var(--text-muted)]">
              vacía
            </span>
          )}
          {completion?.lastEditedAt ? (
            <span className="metric-num text-[10px] text-[color:var(--text-muted)]">
              · {completion.lastEditedAt}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );

  if (built && area.segment) {
    return (
      <li>
        <Link href={`/metodologia/${area.segment}`} className="focus-ring block rounded-[var(--r-l)]">
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div aria-disabled className="rounded-[var(--r-l)]">
        {inner}
      </div>
    </li>
  );
}
