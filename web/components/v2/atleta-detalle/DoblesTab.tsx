'use client';

// DOBLES — the coach-authored joint HYROX Doubles race strategy, read view. Only
// rendered for a Dobles-modality athlete (gated by header.is_dobles upstream).
//
// Reads the REAL shared backend: GET /api/coach/athletes/[id]/dobles-simulation
// (the same A-centric coach contract the editor writes to, shared/schema/
// dobles-simulation.ts). "self" = athlete A = the athlete in the route; the
// partner = their linked users.partner_id. The endpoint returns the 8 canonical
// stations with each split's assignment (A / Juntos / B) + A's share, plus the
// running / RoxZone / tactical notes.
//
// HONEST STATES (no fabricated strategy):
//   • loading            → skeleton
//   • fetch / API error  → inline error card
//   • !has_partner       → "vincula la pareja" notice (the coach must pair first)
//   • exists === false   → "sin simulación" empty state (the prefilled 50/50
//                          default the GET returns is NOT shown as if it were the
//                          authored plan — that would be a fake strategy)
//   • exists === true    → the real 8-station split + notes
//
// This view does NOT import the v1 editor; it is V2-native and only consumes the
// shared API + shared zod types.

import { useEffect, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { Pill } from '@/components/v2/Pill';
import { Panel } from './parts';
import type {
  DoblesSimulationCoachResponse,
  DoblesStationSplit,
  DoblesAssignedTo,
} from '@fahybrid/shared/schema/dobles-simulation';

type LabeledSplit = DoblesStationSplit & { label: string };

type ApiResponse = DoblesSimulationCoachResponse | { error: { code: string; message: string } };

function firstName(name: string | null, fallback: string): string {
  const t = name?.trim();
  if (!t) return fallback;
  return t.split(/\s+/)[0] ?? fallback;
}

function sharePct(share: number): number {
  return Math.round(share * 100);
}

export function DoblesTab({
  athlete_id,
  athlete_name,
  partner_name,
}: {
  athlete_id: string;
  athlete_name: string;
  partner_name: string | null;
}) {
  const [data, setData] = useState<DoblesSimulationCoachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Synchronous loading/error reset before the fetch: a legitimate sync to the
  // athlete_id change, not a derived render-time setState. Scoped disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/coach/athletes/${athlete_id}/dobles-simulation`, { credentials: 'include' })
      .then(async (res) => {
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || 'error' in json) {
          setError('error' in json ? json.error.message : 'No se pudo cargar la simulación.');
          setData(null);
        } else {
          setData(json);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Error de red al cargar la simulación de Dobles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [athlete_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <DoblesSkeleton />;

  if (error) {
    return (
      <EmptyState
        icon="error_outline"
        title="No se pudo cargar la simulación"
        description={error}
      />
    );
  }

  if (!data) return null;

  const aName = firstName(data.athlete_a_name ?? athlete_name, 'Atleta');
  const bName = firstName(data.athlete_b_name ?? partner_name, 'Pareja');

  if (!data.has_partner) {
    return (
      <EmptyState
        icon="group_add"
        title="Sin pareja de Dobles vinculada"
        description={`${aName} todavía no tiene pareja vinculada. Vincula la pareja para poder crear la simulación de carrera.`}
      />
    );
  }

  if (!data.exists) {
    return (
      <EmptyState
        icon="swap_horiz"
        title="Aún sin simulación creada"
        description={`Cuando definas el reparto de las 8 estaciones entre ${aName} y ${bName}, la estrategia aparecerá aquí.`}
      />
    );
  }

  const aLed = data.station_splits.filter((s) => s.assigned_to === 'a').length;
  const bLed = data.station_splits.filter((s) => s.assigned_to === 'b').length;
  const shared = data.station_splits.filter((s) => s.assigned_to === 'split').length;

  return (
    <div className="flex flex-col gap-5">
      {/* Pair header + tactical note */}
      <div className="flex flex-col gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4 shadow-[var(--v2-shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span style={{ color: 'var(--v2-accent)' }}>{aName}</span>
            <span className="text-[color:var(--v2-faint)]">+</span>
            <span style={{ color: 'var(--v2-info)' }}>{bName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pill tone="accent" variant="soft">
              {aName} {aLed}
            </Pill>
            <Pill tone="neutral" variant="soft">
              Juntos {shared}
            </Pill>
            <Pill tone="info" variant="soft">
              {bName} {bLed}
            </Pill>
          </div>
        </div>
        {data.tactical_note ? (
          <p className="text-sm leading-relaxed text-[color:var(--v2-fg)]">{data.tactical_note}</p>
        ) : (
          <p className="text-xs text-[color:var(--v2-faint)]">Sin nota táctica.</p>
        )}
      </div>

      {/* Station splits */}
      <Panel title="Reparto de estaciones" bodyClassName="p-0 overflow-hidden">
        <ul className="flex flex-col">
          {data.station_splits.map((s) => (
            <StationRow key={s.station_index} split={s} aName={aName} bName={bName} />
          ))}
        </ul>
      </Panel>

      {/* Running + RoxZone notes */}
      {data.running_note || data.roxzone_note ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.running_note ? (
            <NoteCard icon="directions_run" title="Carrera (juntos)" body={data.running_note} />
          ) : null}
          {data.roxzone_note ? (
            <NoteCard icon="sync_alt" title="RoxZone (relevos)" body={data.roxzone_note} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Station row ──────────────────────────────────────────────────────────────

// Color axis per assignment: A = orange (--v2-accent), B = blue (--v2-info),
// split = neutral fg. Mirrors the iOS/editor convention (self=orange, partner=blue).
const ASSIGN_COLOR_VAR: Record<DoblesAssignedTo, string> = {
  a: '--v2-accent',
  b: '--v2-info',
  split: '--v2-fg',
};

function StationRow({
  split,
  aName,
  bName,
}: {
  split: LabeledSplit;
  aName: string;
  bName: string;
}) {
  const isSplit = split.assigned_to === 'split';
  const aShare = sharePct(split.self_share); // self_share = athlete A's share
  const ledLabel = split.assigned_to === 'a' ? aName : split.assigned_to === 'b' ? bName : 'Juntos';
  const ledColor = `var(${ASSIGN_COLOR_VAR[split.assigned_to]})`;

  return (
    <li className="flex flex-col gap-2 border-b border-[color:var(--v2-border)] px-3.5 py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-[color:var(--v2-fg)]">{split.label}</span>
        <span
          className="shrink-0 rounded-[var(--v2-r-pill)] px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: ledColor, background: `color-mix(in srgb, ${ledColor} 12%, transparent)` }}
        >
          {ledLabel}
        </span>
      </div>

      {/* Share bar — A (orange) vs B (blue) */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-[color:var(--v2-surface-2)]">
        <span className="h-full" style={{ width: `${aShare}%`, background: 'var(--v2-accent)' }} />
        <span className="h-full" style={{ width: `${100 - aShare}%`, background: 'var(--v2-info)' }} />
      </div>

      <div className="flex items-center justify-between">
        {isSplit ? (
          <span className="v2-num text-[11px] text-[color:var(--v2-muted)]">
            <span style={{ color: 'var(--v2-accent)' }}>{aName} {aShare}%</span>
            {' · '}
            <span style={{ color: 'var(--v2-info)' }}>{bName} {100 - aShare}%</span>
          </span>
        ) : (
          <span className="v2-num text-[11px] text-[color:var(--v2-faint)]">
            {split.assigned_to === 'a' ? `${aName} la lleva entera` : `${bName} la lleva entera`}
          </span>
        )}
        {split.note ? (
          <span className="truncate pl-2 text-[11px] italic text-[color:var(--v2-muted)]" title={split.note}>
            {split.note}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function NoteCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3.5 shadow-[var(--v2-shadow-card)]">
      <div className="flex items-center gap-1.5">
        <MIcon name={icon} size={15} className="text-[color:var(--v2-faint)]" />
        <span className="v2-micro">{title}</span>
      </div>
      <p className="text-sm leading-relaxed text-[color:var(--v2-fg)]">{body}</p>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function DoblesSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-20 animate-pulse rounded-[var(--v2-r-l)] bg-[color:var(--v2-surface-2)]" />
      <div className="h-72 animate-pulse rounded-[var(--v2-r-l)] bg-[color:var(--v2-surface-2)]" />
    </div>
  );
}
