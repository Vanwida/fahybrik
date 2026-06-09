'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AthleteModality, AthleteRow } from '@/lib/dashboard/athletes/list';
import {
  READINESS_BUCKET_LABEL,
  isReadinessBucket,
  readinessBucket,
  type ReadinessBucket,
} from '@/lib/dashboard/constants/readiness';
import { AthleteCard } from '@/components/dashboard/athletes/AthleteCard';
import { AddAthleteModal } from '@/components/dashboard/athletes/AddAthleteModal';
import { SearchInput } from '@/components/dashboard/ui/SearchInput';
import { FilterChip } from '@/components/dashboard/ui/FilterChip';
import { MIcon } from '@/components/dashboard/MIcon';

export type AthleteFilter =
  | 'all'
  | 'alerts'
  | 'needs_review'
  | 'no_month'
  | 'empty_week'
  | 'week_ok'
  | 'block_acc'
  | 'block_trans'
  | 'block_real';

export type ModalityFilter = 'all' | AthleteModality;
export type ReadinessFilter = 'all' | ReadinessBucket;

const FILTERS: ReadonlyArray<{ key: AthleteFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'alerts', label: 'Alertas' },
  { key: 'needs_review', label: 'Revisión' },
  { key: 'no_month', label: 'Sin mes' },
  { key: 'empty_week', label: 'Semana vacía' },
  { key: 'week_ok', label: 'Semana OK' },
];

const MODALITY_FILTERS: ReadonlyArray<{ key: ModalityFilter; label: string }> = [
  { key: 'all', label: 'Modalidad: Todas' },
  { key: 'individual', label: 'Individual' },
  { key: 'dobles', label: 'Dobles' },
  { key: 'pro_elite', label: 'Pro' },
];

const READINESS_FILTERS: ReadonlyArray<{ key: ReadinessFilter; label: string }> = [
  { key: 'all', label: 'Readiness: Todos' },
  { key: 'ok', label: READINESS_BUCKET_LABEL.ok },
  { key: 'caution', label: READINESS_BUCKET_LABEL.caution },
  { key: 'low', label: READINESS_BUCKET_LABEL.low },
];

/** Debounce before mirroring filter state into the URL (search keystrokes). */
const URL_SYNC_DEBOUNCE_MS = 250;

function isAthleteFilter(v: string | null): v is AthleteFilter {
  return FILTERS.some((f) => f.key === v) || v === 'block_acc' || v === 'block_trans' || v === 'block_real';
}

function isModalityFilter(v: string | null): v is ModalityFilter {
  return MODALITY_FILTERS.some((f) => f.key === v);
}

function matchesModality(athlete: AthleteRow, modality: ModalityFilter): boolean {
  if (modality === 'all') return true;
  return athlete.modality === modality;
}

function matchesReadiness(athlete: AthleteRow, readiness: ReadinessFilter): boolean {
  if (readiness === 'all') return true;
  if (athlete.readiness_score == null) return false;
  return readinessBucket(athlete.readiness_score) === readiness;
}

function matchesFilter(athlete: AthleteRow, filter: AthleteFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'block_acc') return athlete.block_type === 'ACC';
  if (filter === 'block_trans') return athlete.block_type === 'TRANS';
  if (filter === 'block_real') return athlete.block_type === 'REAL';
  if (filter === 'alerts') {
    return athlete.programming_status !== 'ok' || athlete.alert_label != null;
  }
  if (filter === 'needs_review') {
    return (
      athlete.programming_status === 'pending_proposal' ||
      athlete.programming_status === 'month_2_pending'
    );
  }
  if (filter === 'week_ok') return athlete.week_ok;
  return athlete.programming_status === filter;
}

interface AthletesListProps {
  athletes: AthleteRow[];
}

export function AthletesList({ athletes }: AthletesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filtros persistidos en URL (?filter=&modality=&readiness=&q=) — UX
  // redesign §2a: no se resetean al navegar; el rail de HOY enlaza con
  // /atletas?readiness=<bucket>.
  const [filter, setFilter] = useState<AthleteFilter>(() => {
    const v = searchParams.get('filter');
    return isAthleteFilter(v) ? v : 'all';
  });
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>(() => {
    const v = searchParams.get('modality');
    return isModalityFilter(v) ? v : 'all';
  });
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>(() => {
    const v = searchParams.get('readiness');
    return isReadinessBucket(v) ? v : 'all';
  });
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');

  const [atrStatus, setAtrStatus] = useState<
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'done'; suggested: number; suppressed: number; checked: number }
    | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  // Deep-link: el CTA "Nuevo atleta" navega a `/atletas?nuevo=1`. Abre el modal
  // y elimina SOLO ese param (los filtros persistidos se conservan).
  // Apertura síncrona en respuesta a un query param: sincronización legítima a la
  // URL, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (searchParams.get('nuevo') === '1') {
      setAddOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete('nuevo');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }
  }, [searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Espejar el estado de filtros en la URL (replace, sin scroll) con un pequeño
  // debounce para no spamear el router mientras se teclea en el buscador.
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const sync = (key: string, value: string | null) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };
      sync('filter', filter === 'all' ? null : filter);
      sync('modality', modalityFilter === 'all' ? null : modalityFilter);
      sync('readiness', readinessFilter === 'all' ? null : readinessFilter);
      sync('q', search.trim() || null);
      const qs = params.toString();
      const current = window.location.search.replace(/^\?/, '');
      if (qs !== current) {
        router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, {
          scroll: false,
        });
      }
    }, URL_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filter, modalityFilter, readinessFilter, search, router]);

  async function handleRevisarTransiciones() {
    setAtrStatus({ state: 'loading' });
    try {
      const res = await fetch('/api/coach/atr-transition/check-all', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        setAtrStatus({ state: 'error', message: text || `HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as {
        checked: number;
        suggested: number;
        suppressed: number;
      };
      setAtrStatus({
        state: 'done',
        suggested: data.suggested,
        suppressed: data.suppressed,
        checked: data.checked,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setAtrStatus({ state: 'error', message: err instanceof Error ? err.message : 'Error' });
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      if (!matchesFilter(a, filter)) return false;
      if (!matchesModality(a, modalityFilter)) return false;
      if (!matchesReadiness(a, readinessFilter)) return false;
      if (!q) return true;
      return a.full_name.toLowerCase().includes(q);
    });
  }, [athletes, filter, modalityFilter, readinessFilter, search]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <nav className="mb-2 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
            <span>Dashboard</span>
            <ChevronIcon />
            <span className="text-[color:var(--fg)]">Atletas</span>
          </nav>
          <h1 className="font-display-lg text-[color:var(--fg)]">Atletas Activos</h1>
        </div>
        <div className="flex w-full items-center gap-3 md:w-auto">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar atleta…"
            className="w-full md:w-64"
          />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-[color:var(--accent-on)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
          >
            <MIcon name="person_add" size={18} />
            Añadir atleta
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {MODALITY_FILTERS.map(({ key, label }) => (
          <FilterChip
            key={`modality-${key}`}
            label={label}
            active={modalityFilter === key}
            onClick={() => setModalityFilter(key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {READINESS_FILTERS.map(({ key, label }) => (
          <FilterChip
            key={`readiness-${key}`}
            label={label}
            active={readinessFilter === key}
            onClick={() => setReadinessFilter(key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(({ key, label }) => (
          <FilterChip key={key} label={label} active={filter === key} onClick={() => setFilter(key)} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          {atrStatus.state === 'done' ? (
            <span className="text-xs text-[color:var(--text-muted)]">
              {atrStatus.suggested > 0
                ? `${atrStatus.suggested} sugerencia${atrStatus.suggested === 1 ? '' : 's'} nueva${atrStatus.suggested === 1 ? '' : 's'}`
                : atrStatus.suppressed > 0
                  ? 'sin cambios (ya notificadas)'
                  : `0/${atrStatus.checked} listos`}
            </span>
          ) : null}
          {atrStatus.state === 'error' ? (
            <span className="text-xs text-red-400">Error</span>
          ) : null}
          <button
            type="button"
            onClick={handleRevisarTransiciones}
            disabled={atrStatus.state === 'loading' || isPending}
            className="rounded-md border border-[color:var(--border)] bg-transparent px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {atrStatus.state === 'loading' ? 'Revisando…' : 'Revisar transiciones ATR'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          {athletes.length === 0 ? 'No hay atletas todavía.' : 'Ningún atleta coincide con el filtro.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--gutter)] md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((athlete, i) => (
            <AthleteCard key={athlete.athlete_id} athlete={athlete} index={i} />
          ))}
        </div>
      )}

      <AddAthleteModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          startTransition(() => router.refresh());
        }}
      />
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" />
    </svg>
  );
}

export type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
