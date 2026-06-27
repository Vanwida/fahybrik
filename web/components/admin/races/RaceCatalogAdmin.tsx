'use client';

import { useCallback, useMemo, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import type { EventListItem } from '@/lib/coach/events';
import { RaceFormModal } from '@/components/admin/races/RaceFormModal';

// Owner/admin race-catalog curation surface (phase 2c). Lists the whole catalog,
// lets the owner add a race manually, fix/resolve scraped rows, and toggle
// visibility + verification inline. Reads the server-rendered list, reloads from
// /api/admin/races after every mutation.

const SERIES_LABEL: Record<string, string> = {
  hyrox: 'HYROX',
  deka: 'DEKA',
  athx: 'AthX',
  deadly_dozen: 'Deadly Dozen',
  other: 'Otra',
};

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatDate(iso: string): string {
  // iso is 'YYYY-MM-DD'; parse as local noon to avoid TZ off-by-one.
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : dateFmt.format(d);
}

type StatusFilter = 'all' | 'visible' | 'hidden' | 'unverified' | 'tentative';

export function RaceCatalogAdmin({
  initial_races,
}: {
  initial_races: EventListItem[];
}) {
  const [races, setRaces] = useState<EventListItem[]>(initial_races);
  const [query, setQuery] = useState('');
  const [seriesFilter, setSeriesFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ race: EventListItem | null } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/races', { cache: 'no-store' });
      if (!res.ok) throw new Error('load_failed');
      const data = (await res.json()) as { races: EventListItem[] };
      setRaces(data.races ?? []);
    } catch {
      setError('No se pudo refrescar el catálogo.');
    }
  }, []);

  const patch = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/races/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(b?.error?.message ?? 'No se pudo actualizar.');
        }
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo actualizar.');
      } finally {
        setBusyId(null);
      }
    },
    [reload],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return races.filter((r) => {
      if (seriesFilter !== 'all' && (r.series ?? 'other') !== seriesFilter)
        return false;
      if (statusFilter === 'visible' && !r.is_visible_to_athletes) return false;
      if (statusFilter === 'hidden' && r.is_visible_to_athletes) return false;
      if (statusFilter === 'unverified' && r.is_verified) return false;
      if (statusFilter === 'tentative' && !r.is_tentative) return false;
      if (q) {
        const hay = `${r.name} ${r.location ?? ''} ${r.country ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [races, query, seriesFilter, statusFilter]);

  const seriesPresent = useMemo(() => {
    const set = new Set<string>();
    for (const r of races) set.add(r.series ?? 'other');
    return [...set];
  }, [races]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1 border-b border-[color:var(--border-subtle)] pb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
          Catálogo
        </p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display-xl text-[color:var(--fg)]">Carreras</h1>
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              Catálogo compartido de competiciones. Añade lo que falte, corrige
              filas importadas y decide qué ven los atletas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal({ race: null })}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 text-sm font-bold uppercase tracking-wide text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
          >
            <MIcon name="add" size={18} />
            Añadir carrera
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]">
            <MIcon name="search" size={18} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, ciudad o país…"
            className="h-10 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] pl-10 pr-3 text-sm text-[color:var(--fg)] outline-none transition-colors placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent)]"
          />
        </div>
        <select
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          className="h-10 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-3 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
        >
          <option value="all">Todas las series</option>
          {seriesPresent.map((s) => (
            <option key={s} value={s}>
              {SERIES_LABEL[s] ?? s}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="h-10 rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--bg)] px-3 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
        >
          <option value="all">Todos los estados</option>
          <option value="visible">Solo visibles</option>
          <option value="hidden">Solo ocultas</option>
          <option value="unverified">Sin verificar</option>
          <option value="tentative">Por confirmar</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[color:var(--danger,#f23f3f)]">
          {error}
        </p>
      ) : null}

      {/* Lista */}
      {races.length === 0 ? (
        <EmptyState onAdd={() => setModal({ race: null })} />
      ) : filtered.length === 0 ? (
        <p className="rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
          Ninguna carrera coincide con el filtro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--r-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)]">
          {/* Header */}
          <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] items-center gap-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--text-muted)] lg:grid">
            <span>Carrera</span>
            <span className="w-28">Fecha</span>
            <span className="w-24 text-center">Visible</span>
            <span className="w-24 text-center">Verificada</span>
            <span className="w-10" />
          </div>
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {filtered.map((r) => (
              <RaceRow
                key={r.event_id}
                race={r}
                busy={busyId === r.event_id}
                onEdit={() => setModal({ race: r })}
                onToggleVisible={() =>
                  patch(r.event_id, {
                    is_visible_to_athletes: !r.is_visible_to_athletes,
                  })
                }
                onToggleVerified={() =>
                  patch(r.event_id, { verified: !r.is_verified })
                }
              />
            ))}
          </ul>
          <div className="border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-container-low)] px-4 py-2 text-[11px] text-[color:var(--text-muted)]">
            {filtered.length} de {races.length} carreras
          </div>
        </div>
      )}

      {modal ? (
        <RaceFormModal
          race={modal.race}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function RaceRow({
  race,
  busy,
  onEdit,
  onToggleVisible,
  onToggleVerified,
}: {
  race: EventListItem;
  busy: boolean;
  onEdit: () => void;
  onToggleVisible: () => void;
  onToggleVerified: () => void;
}) {
  return (
    <li className="grid grid-cols-1 items-center gap-3 px-4 py-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:gap-4">
      {/* Carrera */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {race.series ? (
            <span className="shrink-0 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--accent)]">
              {SERIES_LABEL[race.series] ?? race.series}
            </span>
          ) : null}
          <span className="truncate text-sm font-semibold text-[color:var(--fg)]">
            {race.name}
          </span>
          {race.is_past ? (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
              · pasada
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[color:var(--text-muted)]">
          <span>
            {[race.location, race.country].filter(Boolean).join(', ') || 'Sin ubicación'}
          </span>
          {race.division_options.length > 0 ? (
            <span className="truncate">· {race.division_options.join(' / ')}</span>
          ) : null}
          {race.source_url ? (
            <a
              href={race.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[color:var(--text-muted)] underline-offset-2 hover:text-[color:var(--accent)] hover:underline"
            >
              fuente
              <MIcon name="open_in_new" size={12} />
            </a>
          ) : null}
        </div>
      </div>

      {/* Fecha */}
      <div className="lg:w-28">
        {race.is_tentative || !race.start_date ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--warning,#f2a52e)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--warning,#f2a52e)]">
            Por confirmar
          </span>
        ) : (
          <span className="text-sm text-[color:var(--fg)]">
            {formatDate(race.start_date)}
          </span>
        )}
      </div>

      {/* Visible */}
      <div className="lg:w-24 lg:text-center">
        <Toggle
          on={race.is_visible_to_athletes}
          busy={busy}
          onClick={onToggleVisible}
          label={race.is_visible_to_athletes ? 'Visible' : 'Oculta'}
          ariaLabel={`${race.is_visible_to_athletes ? 'Ocultar' : 'Mostrar'} a atletas`}
        />
      </div>

      {/* Verificada */}
      <div className="lg:w-24 lg:text-center">
        <Toggle
          on={race.is_verified}
          busy={busy}
          onClick={onToggleVerified}
          label={race.is_verified ? 'Sí' : 'No'}
          icon={race.is_verified ? 'verified' : 'shield'}
          ariaLabel={`${race.is_verified ? 'Quitar verificación' : 'Verificar'}`}
        />
      </div>

      {/* Editar */}
      <div className="lg:w-10 lg:text-right">
        <button
          type="button"
          onClick={onEdit}
          aria-label="Editar carrera"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
        >
          <MIcon name="edit" size={16} />
        </button>
      </div>
    </li>
  );
}

function Toggle({
  on,
  busy,
  onClick,
  label,
  icon,
  ariaLabel,
}: {
  on: boolean;
  busy: boolean;
  onClick: () => void;
  label: string;
  icon?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={
        on
          ? 'inline-flex items-center gap-1 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--accent)] transition-colors disabled:opacity-50'
          : 'inline-flex items-center gap-1 rounded-full border border-[color:var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] disabled:opacity-50'
      }
    >
      {icon ? <MIcon name={icon} size={13} filled={on} /> : null}
      {label}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--r-md)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--surface-elevated)] text-[color:var(--text-muted)]">
        <MIcon name="event" size={24} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-[color:var(--fg)]">
          El catálogo está vacío
        </p>
        <p className="max-w-sm text-sm text-[color:var(--text-muted)]">
          Aún no hay carreras. Añade la primera manualmente para que tus atletas
          puedan fijarla como objetivo.
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex h-10 items-center gap-1.5 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 text-sm font-bold uppercase tracking-wide text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
      >
        <MIcon name="add" size={18} />
        Añadir carrera
      </button>
    </div>
  );
}
