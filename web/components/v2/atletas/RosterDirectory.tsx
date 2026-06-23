'use client';

// RosterDirectory — client orchestrator for /v2/atletas. Owns the top bar
// (display title + real count chips + live search + coach avatar), the filter row
// (Estado · Nivel · Fase · Test pendiente + an "ordenar" sort), and the table.
// All filtering/sorting is client-side over the server-loaded rows (the full
// roster fits in one round-trip); search is live. No invented data — every chip
// count and filter reads a real derived field (lib/dashboard/v2/atletas-*).

import { useMemo, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { FilterDropdown, type DropdownOption } from '@/components/v2/atletas/FilterDropdown';
import { RosterTable } from '@/components/v2/atletas/RosterTable';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import { toRosterRow, type RosterRow } from '@/lib/dashboard/v2/atletas-row';
import type { RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { cn } from '@/lib/utils';

// ── Filter option sets (kept here as the single UI source of these axes) ───────
type StatusFilter = 'todos' | RosterStatus;
// LevelFilter uses string so any coach-defined level name works (N1–N5 default,
// but coaches can customise). 'todos' = no filter applied.
type LevelFilter = 'todos' | string;
type PhaseFilter = 'todas' | 'ACC' | 'TRANS' | 'REAL' | 'sin';
type TestFilter = 'todos' | 'pendiente';
type SortKey = 'adherencia' | 'nombre' | 'nivel' | 'estado';

const STATUS_OPTIONS: ReadonlyArray<DropdownOption<StatusFilter>> = [
  { value: 'todos', label: 'Todos' },
  { value: 'activa', label: 'Activa' },
  { value: 'atencion', label: 'Atención' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'sin_plan', label: 'Sin plan' },
];

// Default level options match the N1–N5 seed in migration 0057. Coaches who
// rename their levels will need these regenerated from the DB in the future.
const LEVEL_OPTIONS: ReadonlyArray<DropdownOption<LevelFilter>> = [
  { value: 'todos', label: 'Todos' },
  { value: 'N1', label: 'N1' },
  { value: 'N2', label: 'N2' },
  { value: 'N3', label: 'N3' },
  { value: 'N4', label: 'N4' },
  { value: 'N5', label: 'N5' },
];

const PHASE_OPTIONS: ReadonlyArray<DropdownOption<PhaseFilter>> = [
  { value: 'todas', label: 'Todas' },
  { value: 'ACC', label: 'Acumulación' },
  { value: 'TRANS', label: 'Intensificación' },
  { value: 'REAL', label: 'Tapering' },
  { value: 'sin', label: 'Sin fase' },
];

const TEST_OPTIONS: ReadonlyArray<DropdownOption<TestFilter>> = [
  { value: 'todos', label: 'Todos' },
  // The roster row exposes intake_pending (athlete to set up) — the closest real
  // "pending" signal until a re-test schedule is modeled.
  // TODO(model): replace with a real next_test/overdue_test signal.
  { value: 'pendiente', label: 'Alta sin revisar' },
];

const SORT_OPTIONS: ReadonlyArray<DropdownOption<SortKey>> = [
  { value: 'adherencia', label: 'adherencia' },
  { value: 'nombre', label: 'nombre' },
  { value: 'nivel', label: 'nivel' },
  { value: 'estado', label: 'estado' },
];

// Severity ordering for the "estado" sort — most actionable first.
const STATUS_SORT_RANK: Record<RosterStatus, number> = {
  atencion: 0,
  nuevo: 1,
  sin_plan: 2,
  activa: 3,
};

interface DirectoryRow extends RosterRow {
  /** Raw flag carried through for the "test pendiente" filter. */
  intake_pending: boolean;
}

export function RosterDirectory({
  athletes,
  coach_name,
}: {
  athletes: AthleteRow[];
  coach_name: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [level, setLevel] = useState<LevelFilter>('todos');
  const [phase, setPhase] = useState<PhaseFilter>('todas');
  const [test, setTest] = useState<TestFilter>('todos');
  const [sort, setSort] = useState<SortKey>('adherencia');

  // Build view-model rows once per athletes change.
  const rows: DirectoryRow[] = useMemo(
    () => athletes.map((a) => ({ ...toRosterRow(a), intake_pending: a.intake_pending })),
    [athletes],
  );

  // Real count chips — activos / nuevos / requieren atención (all derived).
  const counts = useMemo(() => {
    let activos = 0;
    let nuevos = 0;
    let atencion = 0;
    for (const r of rows) {
      if (r.status === 'nuevo') nuevos += 1;
      else if (r.status === 'atencion') atencion += 1;
      if (r.status === 'activa') activos += 1;
    }
    return { activos, nuevos, atencion };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (status !== 'todos' && r.status !== status) return false;
      if (level !== 'todos' && r.level !== level) return false;
      if (phase !== 'todas') {
        if (phase === 'sin' ? r.phase_code != null : r.phase_code !== phase) return false;
      }
      if (test === 'pendiente' && !r.intake_pending) return false;
      if (q && !r.full_name.toLowerCase().includes(q)) return false;
      return true;
    });

    out.sort((a, b) => {
      switch (sort) {
        case 'adherencia':
          // Highest adherence first; nulls (no scheduled work) sink to the end.
          return (b.adherence_pct ?? -1) - (a.adherence_pct ?? -1);
        case 'nivel':
          return b.level_rank - a.level_rank || a.full_name.localeCompare(b.full_name, 'es');
        case 'estado':
          return (
            STATUS_SORT_RANK[a.status] - STATUS_SORT_RANK[b.status] ||
            a.full_name.localeCompare(b.full_name, 'es')
          );
        case 'nombre':
        default:
          return a.full_name.localeCompare(b.full_name, 'es');
      }
    });
    return out;
  }, [rows, query, status, level, phase, test, sort]);

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="v2-display text-3xl sm:text-4xl">
            <span className="text-[color:var(--v2-fg)]">Atletas</span>
            <span className="text-[color:var(--v2-muted)]"> · {rows.length}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="ok" variant="soft">
              <span className="v2-num">{counts.activos}</span>&nbsp;activos
            </Pill>
            <Pill tone="info" variant="soft">
              <span className="v2-num">{counts.nuevos}</span>&nbsp;nuevos
            </Pill>
            <Pill tone="danger" variant="soft">
              <span className="v2-num">{counts.atencion}</span>&nbsp;requieren atención
            </Pill>
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

      {/* ── Filter row ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="Estado"
          options={STATUS_OPTIONS}
          value={status}
          defaultValue="todos"
          onChange={setStatus}
        />
        <FilterDropdown
          label="Nivel"
          options={LEVEL_OPTIONS}
          value={level}
          defaultValue="todos"
          onChange={setLevel}
        />
        <FilterDropdown
          label="Fase"
          options={PHASE_OPTIONS}
          value={phase}
          defaultValue="todas"
          onChange={setPhase}
        />
        <FilterDropdown
          label="Test pendiente"
          options={TEST_OPTIONS}
          value={test}
          defaultValue="todos"
          onChange={setTest}
        />
        <div className="ml-auto">
          <FilterDropdown
            label="ordenar"
            options={SORT_OPTIONS}
            value={sort}
            defaultValue="adherencia"
            onChange={setSort}
            align="right"
          />
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <RosterTable rows={filtered} total={rows.length} hasAnyAthletes={rows.length > 0} />
    </div>
  );
}
