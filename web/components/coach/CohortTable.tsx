'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Minus,
} from 'lucide-react';
import type {
  CohortRow,
  ColumnKey,
  FilterState,
} from '@/lib/coach/types';
import { COLUMN_LABELS, COLUMN_WIDTHS } from '@/lib/coach/columns';
import { AlertChip } from './AlertChip';
import { SyncIndicator, formatRelative } from './SyncIndicator';

interface CohortTableProps {
  rows: CohortRow[];
  columns: ColumnKey[];
  filters: FilterState;
  selected: Set<string>;
  onSelectChange: (next: Set<string>) => void;
  onRowOpen?: (athlete_id: string) => void;
}

type SortKey = ColumnKey;
type SortDir = 'asc' | 'desc';

export function CohortTable({
  rows,
  columns,
  filters,
  selected,
  onSelectChange,
  onRowOpen,
}: CohortTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('alert');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  }

  function toggleRow(id: string, ev: React.MouseEvent | React.ChangeEvent) {
    ev.stopPropagation();
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectChange(next);
  }

  function toggleAll() {
    if (selected.size === sorted.length) {
      onSelectChange(new Set());
    } else {
      onSelectChange(new Set(sorted.map((r) => r.athlete_id)));
    }
  }

  const allSelected = selected.size > 0 && selected.size === sorted.length;
  const someSelected = selected.size > 0 && selected.size < sorted.length;

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)]">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="bg-[color:var(--surface)]">
            <th
              scope="col"
              className="sticky top-0 z-10 w-9 border-b border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 py-2 text-left"
            >
              <input
                type="checkbox"
                aria-label="Seleccionar todos"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                className="size-3.5 accent-[color:var(--accent)]"
              />
            </th>
            {columns.map((col) => (
              <th
                key={col}
                scope="col"
                className={`sticky top-0 z-10 border-b border-[color:var(--hairline)] bg-[color:var(--surface)] py-2 text-left text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)] ${COLUMN_WIDTHS[col]} ${col === 'alert' ? 'px-2' : 'px-3'}`}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(col)}
                  className="group inline-flex items-center gap-1 hover:text-[color:var(--fg)]"
                >
                  {col === 'alert' ? '⚑' : COLUMN_LABELS[col]}
                  <SortIcon active={sortKey === col} dir={sortDir} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">
                Sin atletas que coincidan con el filtro.
              </td>
            </tr>
          ) : (
            sorted.map((row, idx) => (
              <Row
                key={row.athlete_id}
                row={row}
                columns={columns}
                selected={selected.has(row.athlete_id)}
                striped={idx % 2 === 1}
                onToggle={(ev) => toggleRow(row.athlete_id, ev)}
                onOpen={() => onRowOpen?.(row.athlete_id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) {
    return (
      <ArrowUpDown
        className="size-3 text-[color:var(--muted)] opacity-50 group-hover:opacity-100"
        aria-hidden
        strokeWidth={1.5}
      />
    );
  }
  return dir === 'asc' ? (
    <ArrowUp className="size-3 text-[color:var(--fg)]" aria-hidden strokeWidth={2} />
  ) : (
    <ArrowDown className="size-3 text-[color:var(--fg)]" aria-hidden strokeWidth={2} />
  );
}

interface RowProps {
  row: CohortRow;
  columns: ColumnKey[];
  selected: boolean;
  striped: boolean;
  onToggle: (ev: React.ChangeEvent | React.MouseEvent) => void;
  onOpen: () => void;
}

function Row({ row, columns, selected, striped, onToggle, onOpen }: RowProps) {
  const baseRow = striped
    ? 'bg-[color:var(--surface)]'
    : 'bg-transparent';
  const selectedRow = selected ? 'bg-[color:var(--accent)]/[0.04]' : '';
  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-b border-[color:var(--hairline)]/60 transition-colors hover:bg-[color:var(--surface-elevated)] ${baseRow} ${selectedRow}`}
    >
      <td className="px-2 py-1.5">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${row.full_name}`}
          checked={selected}
          onClick={(ev) => ev.stopPropagation()}
          onChange={onToggle}
          className="size-3.5 accent-[color:var(--accent)]"
        />
      </td>
      {columns.map((col) => (
        <td
          key={col}
          className={`py-1.5 ${col === 'alert' ? 'px-2' : 'px-3'} ${COLUMN_WIDTHS[col]} align-middle`}
        >
          <Cell row={row} col={col} />
        </td>
      ))}
    </tr>
  );
}

function Cell({ row, col }: { row: CohortRow; col: ColumnKey }) {
  switch (col) {
    case 'alert':
      return <AlertChip alert={row.primary_alert} />;
    case 'name':
      return (
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-[color:var(--fg)]">{row.full_name}</span>
          {row.is_demo && (
            <span className="rounded-full border border-[color:var(--hairline)] px-1.5 py-0 text-[9px] uppercase tracking-wider text-[color:var(--muted)]">
              demo
            </span>
          )}
        </div>
      );
    case 'block':
      return <BlockCell type={row.block_type} week={row.block_week} />;
    case 'compliance':
      return <ComplianceCell value={row.compliance_pct} />;
    case 'hrv':
      return <HrvCell delta={row.hrv_delta_ms} trend={row.hrv_trend} />;
    case 'acr':
      return <AcrCell value={row.acr} />;
    case 'tsb':
      return <TsbCell value={row.tsb} />;
    case 'next':
      return (
        <span className="text-sm text-[color:var(--fg)] tabular-nums">
          {row.next_session?.label ?? <span className="text-[color:var(--muted)]">—</span>}
        </span>
      );
    case 'sync':
      return <SyncIndicator minutes_ago={row.sync_minutes_ago} />;
    case 'race_readiness':
      return <ReadinessCell value={row.race_readiness} />;
    case 'polarization':
      return <PolarizationCell value={row.polarization_pct} />;
    case 'z45_7d':
      return <PercentCell value={row.z45_pct_7d} />;
    case 'ctl':
      return <NumCell value={row.ctl} />;
    case 'atl':
      return <NumCell value={row.atl} />;
    case 'vo2max':
      return <NumCell value={row.vo2max} trend={row.vo2max_trend} />;
    case 'sleep_7d':
      return <SleepCell value={row.sleep_avg_7d_h} />;
    case 'rhr':
      return <NumCell value={row.rhr} suffix="bpm" />;
    case 'days_to_event':
      return (
        <span className="text-sm tabular-nums text-[color:var(--fg)]">
          {row.days_to_a_event != null ? `${row.days_to_a_event}d` : <span className="text-[color:var(--muted)]">—</span>}
        </span>
      );
    case 'volume_7d':
      return <NumCell value={row.volume_7d_h} suffix="h" />;
    case 'sessions_today':
      return <SessionsTodayCell sessions={row.sessions_today} />;
    case 'last_checkin':
      return (
        <span className="text-xs text-[color:var(--muted)] tabular-nums">
          {row.last_checkin_at ? formatRelative(minutesSince(row.last_checkin_at)) : '—'}
        </span>
      );
  }
}

function BlockCell({ type, week }: { type: 'ACC' | 'TRANS' | 'REAL' | null; week: number | null }) {
  if (!type) return <span className="text-[color:var(--muted)]">—</span>;
  const accent =
    type === 'REAL'
      ? 'text-[color:var(--accent)]'
      : type === 'TRANS'
        ? 'text-[color:var(--warning)]'
        : 'text-[color:var(--fg)]';
  return (
    <span className={`text-xs tabular-nums uppercase tracking-[0.1em] ${accent}`}>
      {type}{' '}
      <span className="text-[color:var(--muted)]">w{week ?? '—'}</span>
    </span>
  );
}

function ComplianceCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const tone =
    value >= 85
      ? 'text-[color:var(--ok)]'
      : value >= 70
        ? 'text-[color:var(--warning)]'
        : 'text-[color:var(--danger)]';
  return <span className={`text-sm tabular-nums ${tone}`}>{value}%</span>;
}

function HrvCell({ delta, trend }: { delta: number | null; trend: 'up' | 'down' | 'flat' | null }) {
  if (delta == null || trend == null) return <span className="text-[color:var(--muted)]">—</span>;
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '─';
  const tone =
    trend === 'up'
      ? 'text-[color:var(--ok)]'
      : trend === 'down' && delta <= -10
        ? 'text-[color:var(--danger)]'
        : trend === 'down'
          ? 'text-[color:var(--warning)]'
          : 'text-[color:var(--fg)]';
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      <span aria-hidden>{arrow}</span> {delta > 0 ? '+' : ''}
      {delta}
    </span>
  );
}

function AcrCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const tone =
    value >= 0.8 && value <= 1.3
      ? 'text-[color:var(--fg)]'
      : value < 0.6 || value > 1.5
        ? 'text-[color:var(--danger)]'
        : 'text-[color:var(--warning)]';
  return <span className={`text-sm tabular-nums ${tone}`}>{value.toFixed(2)}</span>;
}

function TsbCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const tone =
    value >= 0
      ? 'text-[color:var(--ok)]'
      : value >= -10
        ? 'text-[color:var(--warning)]'
        : 'text-[color:var(--danger)]';
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(0)}
    </span>
  );
}

function ReadinessCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const tone =
    value >= 80
      ? 'text-[color:var(--ok)]'
      : value >= 60
        ? 'text-[color:var(--fg)]'
        : 'text-[color:var(--warning)]';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-sm tabular-nums ${tone}`}>{value}</span>
      <span className="h-1 w-8 rounded-full bg-[color:var(--surface-elevated)]">
        <span
          className={`block h-1 rounded-full ${
            value >= 80
              ? 'bg-[color:var(--ok)]'
              : value >= 60
                ? 'bg-[color:var(--fg)]'
                : 'bg-[color:var(--warning)]'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
    </div>
  );
}

function PolarizationCell({
  value,
}: {
  value: { low: number; mid: number; high: number } | null;
}) {
  if (!value) return <span className="text-[color:var(--muted)]">—</span>;
  const drift = Math.max(
    Math.abs(value.low - 80),
    Math.abs(value.mid - 0),
    Math.abs(value.high - 20),
  );
  const flag = drift > 10;
  return (
    <span
      className={`text-xs tabular-nums ${flag ? 'text-[color:var(--warning)]' : 'text-[color:var(--fg)]'}`}
      title={`Polarization Z1-2 / Z3 / Z4-5 — target 80/0/20`}
    >
      {value.low}/{value.mid}/{value.high}
    </span>
  );
}

function PercentCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  return <span className="text-sm tabular-nums text-[color:var(--fg)]">{value}%</span>;
}

function NumCell({
  value,
  suffix,
  trend,
}: {
  value: number | null;
  suffix?: string;
  trend?: 'up' | 'down' | 'flat' | null;
}) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const formatted = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : null;
  return (
    <span className="text-sm tabular-nums text-[color:var(--fg)]">
      {arrow && <span className="mr-0.5 text-[color:var(--muted)]">{arrow}</span>}
      {formatted}
      {suffix && <span className="ml-0.5 text-[10px] text-[color:var(--muted)]">{suffix}</span>}
    </span>
  );
}

function SleepCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[color:var(--muted)]">—</span>;
  const tone =
    value >= 7.5
      ? 'text-[color:var(--ok)]'
      : value >= 6.5
        ? 'text-[color:var(--fg)]'
        : 'text-[color:var(--warning)]';
  return (
    <span className={`text-sm tabular-nums ${tone}`}>
      {value.toFixed(1)}
      <span className="ml-0.5 text-[10px] text-[color:var(--muted)]">h</span>
    </span>
  );
}

function SessionsTodayCell({ sessions }: { sessions: { am: 'done' | 'pending' | null; pm: 'done' | 'pending' | null } }) {
  if (!sessions.am && !sessions.pm) {
    return <span className="text-[color:var(--muted)]">—</span>;
  }
  return (
    <div className="flex items-center gap-1 text-xs tabular-nums">
      <SlotBadge label="AM" status={sessions.am} />
      <SlotBadge label="PM" status={sessions.pm} />
    </div>
  );
}

function SlotBadge({ label, status }: { label: 'AM' | 'PM'; status: 'done' | 'pending' | null }) {
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded border border-[color:var(--hairline)] px-1 py-0 text-[10px] text-[color:var(--muted)]">
        <Minus className="size-2.5" aria-hidden strokeWidth={2} />
        {label}
      </span>
    );
  }
  const isDone = status === 'done';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0 text-[10px] ${
        isDone
          ? 'bg-[color:var(--ok)]/12 text-[color:var(--ok)]'
          : 'bg-[color:var(--surface-elevated)] text-[color:var(--fg)]'
      }`}
    >
      {isDone ? <Check className="size-2.5" aria-hidden strokeWidth={2.5} /> : <Minus className="size-2.5" aria-hidden strokeWidth={2} />}
      {label}
    </span>
  );
}

function applyFilters(rows: CohortRow[], filters: FilterState): CohortRow[] {
  return rows.filter((r) => {
    if (filters.in_gym && !r.in_gym_today) return false;
    if (filters.alert && r.alerts.length === 0) return false;
    if (filters.twice_daily && !r.flags.twice_daily_today) return false;
    if (filters.a_event_30d && !r.flags.a_event_within_30d) return false;
    if (filters.block && r.block_type !== filters.block) return false;
    return true;
  });
}

function sortRows(rows: CohortRow[], key: ColumnKey, dir: SortDir): CohortRow[] {
  const factor = dir === 'asc' ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => factor * compareByKey(a, b, key));
  return out;
}

function compareByKey(a: CohortRow, b: CohortRow, key: ColumnKey): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va == null && vb == null) return a.full_name.localeCompare(b.full_name);
  if (va == null) return 1;
  if (vb == null) return -1;
  if (typeof va === 'number' && typeof vb === 'number') return va - vb;
  return String(va).localeCompare(String(vb));
}

function sortValue(r: CohortRow, key: ColumnKey): number | string | null {
  switch (key) {
    case 'alert':
      return alertWeight(r);
    case 'name':
      return r.full_name;
    case 'block':
      return blockWeight(r.block_type);
    case 'compliance':
      return r.compliance_pct;
    case 'hrv':
      return r.hrv_delta_ms;
    case 'acr':
      return r.acr;
    case 'tsb':
      return r.tsb;
    case 'next':
      return r.next_session?.iso_date ?? null;
    case 'sync':
      return r.sync_minutes_ago == null ? null : -r.sync_minutes_ago;
    case 'race_readiness':
      return r.race_readiness;
    case 'polarization':
      return r.polarization_pct?.high ?? null;
    case 'z45_7d':
      return r.z45_pct_7d;
    case 'ctl':
      return r.ctl;
    case 'atl':
      return r.atl;
    case 'vo2max':
      return r.vo2max;
    case 'sleep_7d':
      return r.sleep_avg_7d_h;
    case 'rhr':
      return r.rhr == null ? null : -r.rhr;
    case 'days_to_event':
      return r.days_to_a_event == null ? null : -r.days_to_a_event;
    case 'volume_7d':
      return r.volume_7d_h;
    case 'sessions_today':
      return (r.sessions_today.am ? 1 : 0) + (r.sessions_today.pm ? 1 : 0);
    case 'last_checkin':
      return r.last_checkin_at == null ? null : -minutesSince(r.last_checkin_at);
  }
}

function alertWeight(r: CohortRow): number {
  if (r.primary_alert?.severity === 'critical') return 100 + r.alerts.length;
  if (r.primary_alert?.severity === 'warning') return 50 + r.alerts.length;
  return 0;
}

function blockWeight(t: 'ACC' | 'TRANS' | 'REAL' | null): number {
  switch (t) {
    case 'REAL':
      return 3;
    case 'TRANS':
      return 2;
    case 'ACC':
      return 1;
    default:
      return 0;
  }
}

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}
