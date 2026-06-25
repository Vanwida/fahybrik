'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AthleteModality, AthleteRow } from '@/lib/dashboard/athletes/list';
import type { MethodologyPhase } from '@fahybrid/shared/schema/methodology-phases';
import { indexPhasesById } from '@/lib/dashboard/coach/resolve-phase';
import {
  READINESS_BUCKET_LABEL,
  isReadinessBucket,
  readinessBucket,
  type ReadinessBucket,
} from '@/lib/dashboard/constants/readiness';
import {
  AthleteRosterRow,
  athleteStateRead,
} from '@/components/dashboard/athletes/AthleteRosterRow';
import { ATHLETE_STATE_SORT_RANK } from '@/lib/dashboard/coach/athlete-status';
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
  /**
   * Fases de periodización del coach (migración 0052). Se indexan una vez y se
   * pasan a cada fila para resolver el nombre de fase de su bloque igual que la
   * ficha del atleta. [] pre-migración → el resolver cae al enum ATR legacy.
   */
  coachPhases: MethodologyPhase[];
}

export function AthletesList({ athletes, coachPhases }: AthletesListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Índice id→fase construido UNA vez (no por fila) para el resolver de fase.
  const phasesById = useMemo(() => indexPhasesById(coachPhases), [coachPhases]);

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
    const rows = athletes.filter((a) => {
      if (!matchesFilter(a, filter)) return false;
      if (!matchesModality(a, modalityFilter)) return false;
      if (!matchesReadiness(a, readinessFilter)) return false;
      if (!q) return true;
      return a.full_name.toLowerCase().includes(q);
    });
    // Orden por URGENCIA (triage): Necesita atención → Seguir de cerca → En
    // ritmo → Sin datos. Un atleta con bandera de acción (intake / plan
    // pendiente) sube por delante de su mismo nivel. Desempate alfabético para
    // un orden estable.
    return rows
      .map((a) => ({
        a,
        rank: ATHLETE_STATE_SORT_RANK[athleteStateRead(a).level],
        needsAction: a.intake_pending || a.programming_status !== 'ok',
      }))
      .sort((x, y) => {
        if (x.rank !== y.rank) return x.rank - y.rank;
        if (x.needsAction !== y.needsAction) return x.needsAction ? -1 : 1;
        return x.a.full_name.localeCompare(y.a.full_name);
      })
      .map((r) => r.a);
  }, [athletes, filter, modalityFilter, readinessFilter, search]);

  const atrNote =
    atrStatus.state === 'done'
      ? atrStatus.suggested > 0
        ? `${atrStatus.suggested} sugerencia${atrStatus.suggested === 1 ? '' : 's'} nueva${atrStatus.suggested === 1 ? '' : 's'}`
        : atrStatus.suppressed > 0
          ? 'Sin cambios (ya notificadas)'
          : `0/${atrStatus.checked} listos`
      : atrStatus.state === 'error'
        ? 'Error al revisar'
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-col gap-[var(--s-l)]">
      {/* HEADER — identidad + buscar + acciones (primaria naranja + secundaria
          ATR junto al header, NO varada al otro lado del vacío). */}
      <header className="flex flex-col gap-[var(--s-m)]">
        <nav className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span>Dashboard</span>
          <MIcon name="chevron_right" size={14} aria-hidden />
          <span className="text-[color:var(--fg)]">Atletas</span>
        </nav>
        <div className="flex flex-col items-start gap-[var(--s-m)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display-lg text-[color:var(--fg)]">Atletas</h1>
            <span className="metric-num text-sm font-semibold text-[color:var(--text-muted)]">
              {filtered.length}
              {filtered.length !== athletes.length ? ` / ${athletes.length}` : ''}
            </span>
          </div>
          <div className="flex w-full flex-wrap items-center gap-[var(--s-s)] sm:w-auto">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar atleta…"
              className="w-full sm:w-56"
            />
            <button
              type="button"
              onClick={handleRevisarTransiciones}
              disabled={atrStatus.state === 'loading' || isPending}
              title="Revisar transiciones ATR de todos los atletas"
              className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-transparent px-3 text-[13px] font-semibold text-[color:var(--text-muted)] transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MIcon name="published_with_changes" size={16} aria-hidden />
              {atrStatus.state === 'loading' ? 'Revisando…' : 'Transiciones ATR'}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 text-[13px] font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)]"
            >
              <MIcon name="person_add" size={17} aria-hidden />
              Añadir atleta
            </button>
          </div>
        </div>
        {atrNote ? (
          <span
            className={cn(
              'text-xs',
              atrStatus.state === 'error'
                ? 'text-[color:var(--danger)]'
                : 'text-[color:var(--text-muted)]',
            )}
          >
            {atrNote}
          </span>
        ) : null}
      </header>

      {/* FILTROS — barra compacta única: modalidad + readiness + estado de
          programación, agrupados con separadores en lugar de 3 filas apiladas. */}
      <div className="flex flex-wrap items-center gap-x-[var(--s-m)] gap-y-[var(--s-s)]">
        <div className="flex flex-wrap items-center gap-[var(--s-xs)]">
          {MODALITY_FILTERS.map(({ key, label }) => (
            <FilterChip
              key={`modality-${key}`}
              label={label}
              active={modalityFilter === key}
              onClick={() => setModalityFilter(key)}
            />
          ))}
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-[color:var(--border-subtle)] md:block" />
        <div className="flex flex-wrap items-center gap-[var(--s-xs)]">
          {READINESS_FILTERS.map(({ key, label }) => (
            <FilterChip
              key={`readiness-${key}`}
              label={label}
              active={readinessFilter === key}
              onClick={() => setReadinessFilter(key)}
            />
          ))}
        </div>
        <span aria-hidden className="hidden h-5 w-px bg-[color:var(--border-subtle)] md:block" />
        <div className="flex flex-wrap items-center gap-[var(--s-xs)]">
          {FILTERS.map(({ key, label }) => (
            <FilterChip key={key} label={label} active={filter === key} onClick={() => setFilter(key)} />
          ))}
        </div>
      </div>

      {/* LISTA — filas densas de atleta, ordenadas por urgencia (triage). */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">
          {athletes.length === 0 ? 'No hay atletas todavía.' : 'Ningún atleta coincide con el filtro.'}
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
          role="list"
          aria-label="Atletas, ordenados por urgencia"
        >
          {filtered.map((athlete, i) => (
            <AthleteRosterRow
              key={athlete.athlete_id}
              athlete={athlete}
              phasesById={phasesById}
              withDivider={i > 0}
              index={i}
            />
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

export type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';
