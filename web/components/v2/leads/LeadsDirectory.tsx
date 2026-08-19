'use client';

// LeadsDirectory — client orchestrator for /v2/leads. Owns the header (display
// title + real count chips per status + live search), the controls (status filter +
// "ver archivados" toggle), and the table. All filtering/search is client-side over
// the single server-loaded payload. Archived statuses (convertido, descartado) are
// HIDDEN by default; the toggle reveals them. No invented data — every chip count
// reads the real `counts` map from the loader.

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { SegmentedControl, type SegmentOption } from '@/components/v2/SegmentedControl';
import { LeadsTable } from '@/components/v2/leads/LeadsTable';
import { PendingCitasCard } from '@/components/v2/citas/PendingCitasCard';
import { WaitlistQueueCard } from '@/components/v2/leads/WaitlistQueueCard';
import type { LeadListItem } from '@/lib/dashboard/coach/leads';
import type { UpcomingCall } from '@/lib/citas/store';
import type { CapacityState } from '@/lib/coach/capacity';
import type { WaitlistEntry } from '@/lib/leads/waitlist';
import type { PillTone } from '@/components/v2/Pill';
import {
  LEAD_STATUS_META,
  LEAD_STATUS_ORDER,
  type LeadStatus,
} from '@/lib/dashboard/coach/leads-status';
import { cn } from '@/lib/utils';

type StatusFilter = 'todos' | LeadStatus;

/** Capacity chip: green with room, amber on the last plaza, red when full. */
function capacityTone(cap: CapacityState): PillTone {
  if (cap.max === null) return 'neutral';
  if (cap.full) return 'danger';
  if (cap.slots_available === 1) return 'warn';
  return 'ok';
}

export function LeadsDirectory({
  leads,
  counts,
  total,
  upcomingCalls,
  capacity,
  waitlist,
}: {
  leads: LeadListItem[];
  counts: Record<LeadStatus, number>;
  total: number;
  upcomingCalls: UpcomingCall[];
  /** Live athlete cap vs active (#18). null when the read degraded → chip hidden. */
  capacity: CapacityState | null;
  /** Leads on the capacity waitlist, FIFO. Empty → the queue card is not rendered. */
  waitlist: WaitlistEntry[];
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [showArchived, setShowArchived] = useState(false);

  // Picking an archived status from the dropdown implies revealing archived — the
  // list must never go silently empty against the "hide archived by default" guard.
  const selectedIsArchived =
    statusFilter !== 'todos' && LEAD_STATUS_META[statusFilter].archived;
  const effectiveShowArchived = showArchived || selectedIsArchived;

  // Status segments — the archived states only appear once archived is shown.
  const statusOptions = useMemo<ReadonlyArray<SegmentOption<StatusFilter>>>(() => {
    const opts: SegmentOption<StatusFilter>[] = [{ value: 'todos', label: 'Todos' }];
    for (const s of LEAD_STATUS_ORDER) {
      if (!effectiveShowArchived && LEAD_STATUS_META[s].archived) continue;
      opts.push({ value: s, label: LEAD_STATUS_META[s].label });
    }
    return opts;
  }, [effectiveShowArchived]);

  // Leads visible in the current archived-visibility scope (footer denominator).
  const scopeLeads = useMemo(
    () =>
      leads.filter((l) => effectiveShowArchived || !LEAD_STATUS_META[l.status].archived),
    [leads, effectiveShowArchived],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopeLeads.filter((l) => {
      if (statusFilter !== 'todos' && l.status !== statusFilter) return false;
      if (q) {
        const hay = `${l.nombre ?? ''} ${l.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopeLeads, query, statusFilter]);

  const archivedCount = counts.convertido + counts.descartado;

  return (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4">
      {/* ── Citas pendientes ──────────────────────────────────────────────── */}
      {upcomingCalls.length > 0 ? <PendingCitasCard calls={upcomingCalls} /> : null}

      {/* ── Lista de espera (capacidad, #18) ──────────────────────────────── */}
      {waitlist.length > 0 ? <WaitlistQueueCard entries={waitlist} /> : null}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Leads</span>
            <span className="text-[color:var(--v2-muted)]"> · {total}</span>
          </h1>
          <p className="text-xs text-[color:var(--v2-muted)]">
            Prospectos del onboarding web, aún no son atletas.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Capacity chip leads the cluster — the plaza budget frames the whole funnel. */}
            {capacity ? (
              <Pill
                tone={capacityTone(capacity)}
                variant="soft"
                title={
                  capacity.max === null
                    ? 'Sin cupo máximo: los leads nunca entran en lista de espera.'
                    : 'Atletas activos frente al cupo máximo. Al llegar al cupo, los leads nuevos entran en lista de espera.'
                }
              >
                {capacity.max === null ? (
                  'Sin límite'
                ) : (
                  <>
                    Cupo&nbsp;
                    <span className="v2-num">
                      {capacity.active}/{capacity.max}
                    </span>
                  </>
                )}
              </Pill>
            ) : null}
            {LEAD_STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => {
              const meta = LEAD_STATUS_META[s];
              return (
                <Pill key={s} tone={meta.tone} variant="soft">
                  <span className="v2-num">{counts[s]}</span>&nbsp;{meta.label.toLowerCase()}
                </Pill>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[color:var(--v2-faint)]">
              <MIcon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar por nombre o email…"
              aria-label="Buscar lead por nombre o email"
              className={cn(
                'v2-focus h-9 w-52 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] pl-8 pr-3 text-sm sm:w-64',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
                'focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Horizontal scroll keeps the segmented control usable on narrow screens. */}
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            ariaLabel="Filtrar por estado"
            options={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            size="sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          aria-pressed={showArchived}
          className={cn(
            'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] px-3 text-label font-semibold whitespace-nowrap transition-colors',
            showArchived
              ? 'border border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
              : 'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
          )}
        >
          <MIcon name={showArchived ? 'visibility_off' : 'inventory_2'} size={15} />
          {showArchived ? 'Ocultar archivados' : 'Ver archivados'}
          {archivedCount > 0 ? <span className="v2-num opacity-80">{archivedCount}</span> : null}
        </button>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <LeadsTable leads={filtered} scopeTotal={scopeLeads.length} hasAnyLeads={total > 0} />
    </div>
  );
}
