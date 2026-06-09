'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';

type AtrBlockType = 'ACC' | 'TRANS' | 'REAL';

type BlockMicrocycle = {
  microcycle_id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  scheduled: number;
  completed: number;
};

type AtrBlockView = {
  block_id: string;
  type: AtrBlockType;
  position: number;
  status: string;
  start_date: string;
  end_date: string;
  planned_weeks: number;
  microcycles: BlockMicrocycle[];
  assignment_count: number;
  is_assigned: boolean;
  available_week_templates: number;
};

type AthleteBlocksView = {
  athlete_id: string;
  macrocycle_id: string | null;
  macrocycle_status: string | null;
  start_date: string | null;
  end_date: string | null;
  current_block_type: AtrBlockType | null;
  blocks: AtrBlockView[];
};

interface AssignBlockPanelProps {
  athlete_id: string;
  /** Vista inicial server-rendered (evita un fetch en mount). */
  initial?: AthleteBlocksView | null;
  onAssigned?: () => void;
}

/**
 * Panel del plan por-microciclo (bloque ATR). Muestra los 3 bloques del
 * macrociclo con su estado real (activo/planificado/hecho) y permite asignar o
 * re-asignar (aprobar) el siguiente bloque, materializando sus semanas como
 * microciclos vía POST /assign-block.
 */
export function AssignBlockPanel({ athlete_id, initial = null, onAssigned }: AssignBlockPanelProps) {
  const router = useRouter();
  const [view, setView] = useState<AthleteBlocksView | null>(initial);
  const [loading, setLoading] = useState(initial == null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athlete_id}/assign-block`, {
        credentials: 'include',
      });
      if (!res.ok) {
        setError('No se pudo cargar el plan por bloques.');
        return;
      }
      const json = (await res.json()) as { blocks_view?: AthleteBlocksView };
      setView(json.blocks_view ?? null);
    } catch {
      setError('No se pudo cargar el plan por bloques.');
    } finally {
      setLoading(false);
    }
  }, [athlete_id]);

  // Fallback fetch solo cuando no hay vista server-rendered (la página la pasa
  // siempre). queueMicrotask evita el setState síncrono dentro del effect.
  useEffect(() => {
    if (initial != null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [initial, reload]);

  const assignBlock = (block: AtrBlockView, force: boolean) => {
    setMessage(null);
    setError(null);
    setBusyBlockId(block.block_id);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athlete_id}/assign-block`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ atr_block: block.type, force }),
        });
        const json = (await res.json()) as {
          error?: { message?: string };
          assign_block?: { assignment_count: number; already_assigned: boolean };
        };
        if (!res.ok) {
          setError(json.error?.message ?? 'Error al asignar el bloque.');
          return;
        }
        const count = json.assign_block?.assignment_count ?? 0;
        const wasAssigned = json.assign_block?.already_assigned ?? false;
        setMessage(
          wasAssigned
            ? `Bloque ${atrPhaseLabel(block.type)} ya estaba asignado (${count} ${count === 1 ? 'sesión' : 'sesiones'}).`
            : `Bloque ${atrPhaseLabel(block.type)} asignado · ${count} ${count === 1 ? 'sesión' : 'sesiones'}.`,
        );
        await reload();
        onAssigned?.();
        router.refresh();
      } catch {
        setError('Error al asignar el bloque.');
      } finally {
        setBusyBlockId(null);
      }
    });
  };

  if (loading && !view) {
    return (
      <div className="card-surface p-4">
        <p className="text-sm text-[color:var(--muted)]">Cargando plan por bloques…</p>
      </div>
    );
  }

  if (error && !view) {
    return (
      <div className="card-surface p-4">
        <p role="alert" className="text-sm text-[color:var(--danger)]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="focus-ring mt-3 rounded-[var(--r-m)] border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-semibold text-[color:var(--fg)]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!view || !view.macrocycle_id || view.blocks.length === 0) {
    return (
      <div className="card-surface p-4">
        <p className="text-sm font-semibold">Sin macrociclo</p>
        <p className="mt-1 text-xs text-[color:var(--muted)]">
          Este atleta aún no tiene un macrociclo con bloques ATR. Crea el macrociclo
          (objetivo + fechas) para poder asignar bloques uno a uno.
        </p>
      </div>
    );
  }

  // Próximo bloque a aprobar = primer bloque sin asignar en orden temporal.
  const nextBlockId = view.blocks.find((b) => !b.is_assigned)?.block_id ?? null;

  return (
    <section aria-label="Plan por bloque ATR (microciclo)" className="card-surface p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Plan por microciclo
          </p>
          <p className="text-sm font-semibold">Bloques ATR del macrociclo</p>
        </div>
        <p className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--muted)]">
          {fmtRange(view.start_date, view.end_date)}
        </p>
      </header>

      <ol className="mt-4 grid gap-3">
        {view.blocks.map((block) => {
          const isCurrent = view.current_block_type === block.type;
          const isNext = block.block_id === nextBlockId;
          const isBusy = busyBlockId === block.block_id && pending;
          const doneWeeks = block.microcycles.filter(
            (m) => m.scheduled > 0 && m.completed >= m.scheduled,
          ).length;

          return (
            <li
              key={block.block_id}
              className="rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-[color:var(--bg)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-[var(--r-pill)] border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--muted)]">
                    {block.type}
                  </span>
                  <p className="text-sm font-semibold text-[color:var(--fg)]">
                    {atrPhaseLabel(block.type)}
                  </p>
                  <StatusBadge status={block.status} isCurrent={isCurrent} isAssigned={block.is_assigned} />
                </div>
                <p className="text-[11px] text-[color:var(--muted)]">
                  {fmtRange(block.start_date, block.end_date)}
                </p>
              </div>

              <p className="mt-1 text-[11px] text-[color:var(--muted)]">
                {block.planned_weeks} {block.planned_weeks === 1 ? 'semana' : 'semanas'}
                {block.is_assigned
                  ? ` · ${block.assignment_count} ${block.assignment_count === 1 ? 'sesión' : 'sesiones'} · ${doneWeeks}/${block.microcycles.length} semanas completadas`
                  : ` · ${block.available_week_templates} ${block.available_week_templates === 1 ? 'plantilla' : 'plantillas'} disponibles`}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!block.is_assigned ? (
                  <button
                    type="button"
                    disabled={isBusy || block.available_week_templates === 0}
                    onClick={() => assignBlock(block, false)}
                    className="focus-ring rounded-[var(--r-m)] bg-[color:var(--accent)] px-3 py-2 text-xs font-semibold text-[color:var(--accent-on)] disabled:opacity-50"
                  >
                    {isBusy
                      ? 'Asignando…'
                      : isNext
                        ? 'Asignar / aprobar este bloque'
                        : 'Asignar este bloque'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => assignBlock(block, true)}
                    className="focus-ring rounded-[var(--r-m)] border border-[color:var(--hairline)] px-3 py-2 text-xs font-semibold text-[color:var(--fg)] disabled:opacity-50"
                  >
                    {isBusy ? 'Re-asignando…' : 'Re-asignar (sobrescribe)'}
                  </button>
                )}
                {block.is_assigned && block.available_week_templates === 0 ? (
                  <span className="text-[11px] text-[color:var(--warning)]">
                    Sin plantillas de esta fase — re-asignar fallará.
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {message ? (
        <p className="mt-3 text-xs font-medium text-[color:var(--fg)]">{message}</p>
      ) : null}
      {error && view ? (
        <p role="alert" className="mt-3 text-xs text-[color:var(--danger)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function StatusBadge({
  status,
  isCurrent,
  isAssigned,
}: {
  status: string;
  isCurrent: boolean;
  isAssigned: boolean;
}) {
  let label: string;
  let tone: string;
  if (status === 'completed') {
    label = 'Hecho';
    tone = 'var(--status-success, var(--accent))';
  } else if (isCurrent) {
    label = 'Activo';
    tone = 'var(--accent)';
  } else if (isAssigned) {
    label = 'Asignado';
    tone = 'var(--accent)';
  } else {
    label = 'Planificado';
    tone = 'var(--muted)';
  }
  return (
    <span
      className="rounded-[var(--r-pill)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{
        color: tone,
        backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

function fmtRange(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '';
  const from = isoToLocalNoon(fromIso);
  const to = isoToLocalNoon(toIso);
  const fmtShort: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const fmtFull: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
  return `${from.toLocaleDateString('es-ES', fmtShort)} → ${to.toLocaleDateString('es-ES', fmtFull)}`;
}

function isoToLocalNoon(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}
