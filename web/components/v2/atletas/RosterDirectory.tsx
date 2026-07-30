'use client';

// RosterDirectory — client orchestrator for /v2/atletas. Owns the top bar
// (display title + real count chips + live search + coach avatar), the filter row
// (Estado · Nivel · Fase · Test pendiente + an "ordenar" sort), and the table.
// All filtering/sorting is client-side over the server-loaded rows (the full
// roster fits in one round-trip); search is live. No invented data — every chip
// count and filter reads a real derived field (lib/dashboard/v2/atletas-*).

import { useMemo, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { FilterDropdown, type DropdownOption } from '@/components/v2/atletas/FilterDropdown';
import { RosterTable } from '@/components/v2/atletas/RosterTable';
import { AddAthleteModal } from '@/components/v2/atletas/AddAthleteModal';
import { DoublesPairsPanel } from '@/components/v2/atletas/DoublesPairsPanel';
import { PageFrame } from '@/components/v2/PageFrame';
import type { AthleteRow } from '@/lib/dashboard/athletes/list';
import type { DoublesPair } from '@/lib/dashboard/coach/doubles-pairs';
import { toRosterRow, type RosterRow } from '@/lib/dashboard/v2/atletas-row';
import type { RosterStatus } from '@/lib/dashboard/v2/atletas-status';
import { cn } from '@/lib/utils';

// ── Filter option sets (kept here as the single UI source of these axes) ───────
type StatusFilter = 'todos' | RosterStatus;
// LevelFilter uses string so any coach-defined level name works (N1–N5 default,
// but coaches can customise). 'todos' = no filter applied.
type LevelFilter = 'todos' | string;
// AGNOSTIC: phase = the coach's microciclo name (athlete_month_assignments →
// program_month_templates.name). Options are derived from the real names present
// in the roster, never a hardcoded phase set. 'todas' = no filter,
// 'sin' = athletes with no active microciclo.
type PhaseFilter = 'todas' | 'sin' | string;
type TestFilter = 'todos' | 'pendiente';
type SortKey = 'adherencia' | 'nombre' | 'nivel' | 'estado';

const STATUS_OPTIONS: ReadonlyArray<DropdownOption<StatusFilter>> = [
  { value: 'todos', label: 'Todos' },
  { value: 'activa', label: 'Activa' },
  { value: 'atencion', label: 'Atención' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'sin_plan', label: 'Sin plan' },
  { value: 'pausa', label: 'En pausa' },
  { value: 'baja', label: 'Baja' },
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

// Severity ordering for the "estado" sort — most actionable first, resting
// lifecycle states (pausa / baja) last. "Se va" sorts to the very top: it is the
// only state with a deadline attached, and the window to react closes by itself.
const STATUS_SORT_RANK: Record<RosterStatus, number> = {
  se_va: 0,
  atencion: 1,
  nuevo: 2,
  sin_plan: 3,
  activa: 4,
  pausa: 5,
  baja: 6,
};

interface DirectoryRow extends RosterRow {
  /** Raw flag carried through for the "test pendiente" filter. */
  intake_pending: boolean;
}

export function RosterDirectory({
  athletes,
  coach_name,
  doubles_pairs = [],
}: {
  athletes: AthleteRow[];
  coach_name: string;
  doubles_pairs?: DoublesPair[];
}) {
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
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

  // Fase options derived from the real microciclo names present in the roster
  // (AGNOSTIC — whatever the coach named them), plus "Todas" / "Sin fase".
  const phaseOptions = useMemo<ReadonlyArray<DropdownOption<PhaseFilter>>>(() => {
    const names = Array.from(
      new Set(rows.map((r) => r.phase_code).filter((c): c is string => c != null)),
    ).sort((a, b) => a.localeCompare(b, 'es'));
    return [
      { value: 'todas', label: 'Todas' },
      ...names.map((n) => ({ value: n, label: n })),
      { value: 'sin', label: 'Sin fase' },
    ];
  }, [rows]);

  // Real count chips — all derived. activos / nuevos / atención are the always-on
  // headline; pausa / baja / piden pausa surface only when present (exceptional states).
  const counts = useMemo(() => {
    let activos = 0;
    let nuevos = 0;
    let atencion = 0;
    let pausa = 0;
    let baja = 0;
    let pidenPausa = 0;
    for (const r of rows) {
      if (r.status === 'nuevo') nuevos += 1;
      else if (r.status === 'atencion') atencion += 1;
      else if (r.status === 'pausa') pausa += 1;
      else if (r.status === 'baja') baja += 1;
      if (r.status === 'activa') activos += 1;
      if (r.pause_request_label) pidenPausa += 1;
    }
    return { activos, nuevos, atencion, pausa, baja, pidenPausa };
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

  // ── Composición (§6.1 `llena` · §9.2 «un instrumento, no un documento») ────
  // La pantalla es un marco a altura completa: cabecera fija arriba, la tabla
  // ocupando TODO lo que sobre y scrolleando por dentro. Antes era una pila
  // vertical y con tres filas dejaba 295 px muertos debajo.
  //
  // Y el sobrante de ANCHO se gana llevándose lo secundario fuera de la pila
  // (§6 regla 4, «lo secundario se pliega»): de xl para arriba, las altas sin
  // revisar y las parejas de dobles viven en una columna a la derecha en vez de
  // empujar la tabla hacia abajo. Eso deja la tabla en ~1.000 px, que es justo
  // lo que suman sus columnas — y con ello desaparece el vacío de ~470 px que
  // abría el `1fr` del nombre en medio de cada fila.
  const head = (
    <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-3">
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
            {counts.pidenPausa > 0 ? (
              <Pill tone="warn" variant="soft">
                <span className="v2-num">{counts.pidenPausa}</span>&nbsp;piden pausa
              </Pill>
            ) : null}
            {counts.pausa > 0 ? (
              <Pill tone="warn" variant="soft">
                <span className="v2-num">{counts.pausa}</span>&nbsp;en pausa
              </Pill>
            ) : null}
            {counts.baja > 0 ? (
              <Pill tone="neutral" variant="soft">
                <span className="v2-num">{counts.baja}</span>&nbsp;de baja
              </Pill>
            ) : null}
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
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="person_add" size={17} />
            Agregar atleta
          </button>
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
          options={phaseOptions}
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
    </div>
  );

  return (
    <PageFrame
      altura="llena"
      head={head}
      // Por debajo de xl lo secundario NO cabe al lado, así que va debajo y la
      // pantalla scrollea: la tabla se queda con la primera pantalla entera
      // (`min-h-full` + `flex-1`) y lo secundario espera abajo, sin robarle el
      // pliegue. De xl para arriba nada scrollea: son dos columnas fijas.
      bodyClassName="overflow-y-auto pb-4 sm:pb-6 xl:overflow-hidden"
    >
      <div className="mx-auto flex w-full max-w-[var(--v2-container)] flex-col gap-4 xl:grid xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-stretch">
        {/* ── El instrumento ───────────────────────────────────────────────────
             `min-h-[60svh]`: por debajo de xl la tabla se queda con la mayor
             parte de la primera pantalla y lo secundario cae por debajo del
             pliegue. 60 % de la ventana pequeña deja sitio a la cabecera (título,
             contadores y dos filas de filtros) sin recortar la lista a tres
             filas, que es lo que pasaba al repartir el alto entre los tres
             bloques. De xl arriba manda la rejilla y esto no aplica. */}
        <div className="flex min-h-[60svh] flex-col xl:min-h-0 xl:flex-1">
          <RosterTable
            rows={filtered}
            total={rows.length}
            hasAnyAthletes={rows.length > 0}
            onAdd={() => setAddOpen(true)}
          />
        </div>

        {/* ── Lo secundario, plegado al lado en vez de encima de la tabla ──── */}
        <aside className="flex shrink-0 flex-col gap-3 xl:min-h-0 xl:shrink xl:overflow-y-auto">
          {counts.nuevos > 0 ? (
            <Link
              href="/altas"
              className="v2-focus group flex shrink-0 items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-accent)]/30 bg-[color:var(--v2-accent-soft)] px-3.5 py-2.5 transition-colors hover:border-[color:var(--v2-accent)]"
            >
              <MIcon name="how_to_reg" size={18} className="shrink-0 text-[color:var(--v2-accent)]" />
              <span className="min-w-0 text-body font-semibold text-[color:var(--v2-fg)]">
                <span className="v2-num">{counts.nuevos}</span>{' '}
                {counts.nuevos === 1 ? 'alta sin revisar' : 'altas sin revisar'}
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-label font-semibold text-[color:var(--v2-accent)]">
                Revisar
                <MIcon
                  name="arrow_forward"
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ) : null}

          <DoublesPairsPanel pairs={doubles_pairs} athletes={athletes} />
        </aside>
      </div>

      {addOpen ? <AddAthleteModal onClose={() => setAddOpen(false)} /> : null}
    </PageFrame>
  );
}
