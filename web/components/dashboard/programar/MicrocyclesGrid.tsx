'use client';

// MicrocyclesGrid — pestaña "Microciclos" de la biblioteca única (/programar,
// spec §3b). Cards como hasta ahora: nombre + nivel + fase ATR + nº semanas +
// último editado. La creación (metadata UNA vez) vive en NewMicrocycleWizard.

import { useMemo, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { PROGRAM_LEVEL_LABELS, type ProgramLevel } from '@/lib/dashboard/constants/program-levels';
import { atrBadgeClass, atrPhaseLabel } from '@/lib/dashboard/constants/atr-phases';
import { formatRelative } from '@/lib/dashboard/relative-time';
import { MIcon } from '@/components/ui/MIcon';

export interface MicrocycleRow {
  id: string;
  name: string;
  level: string;
  atr_block_hint: string | null;
  focus: string | null;
  week_count: number;
  updated_at: string;
}

export function MicrocyclesGrid({
  microcycles,
  onCreate,
}: {
  microcycles: MicrocycleRow[];
  onCreate: () => void;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...microcycles].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    [microcycles],
  );

  const handleDelete = async (m: MicrocycleRow) => {
    const ok = window.confirm(
      `¿Borrar "${m.name}"? Se eliminarán sus ${m.week_count} semanas plantilla. Los atletas con este microciclo ya asignado conservan su historial.`,
    );
    if (!ok) return;
    setDeletingId(m.id);
    try {
      const res = await fetch(`/api/coach/program-months/${m.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        window.alert(json?.error?.message ?? `Error al borrar (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Error al borrar');
    } finally {
      setDeletingId(null);
    }
  };

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full border border-[color:var(--border-subtle)] text-2xl text-[color:var(--text-muted)]"
          >
            +
          </span>
          <h2 className="font-headline-md text-[color:var(--fg)]">Aún no hay microciclos</h2>
          <p className="text-sm text-[color:var(--text-muted)]">
            Crea el primero. Cada microciclo es un bloque de 4 semanas con su
            fase ATR y nivel — las semanas heredan todo.
          </p>
          <button
            type="button"
            onClick={onCreate}
            className="focus-ring mt-2 rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] hover:brightness-110"
          >
            Crear primer microciclo
          </button>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" role="list">
      {sorted.map((m) => (
        <li key={m.id}>
          <MicrocycleCard
            microcycle={m}
            onClick={() => router.push(`/programar/microciclos/${m.id}`)}
            onDelete={() => void handleDelete(m)}
            deleting={deletingId === m.id}
          />
        </li>
      ))}
    </ul>
  );
}

function MicrocycleCard({
  microcycle,
  onClick,
  onDelete,
  deleting,
}: {
  microcycle: MicrocycleRow;
  onClick: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const levelLabel =
    PROGRAM_LEVEL_LABELS[microcycle.level as ProgramLevel] ?? microcycle.level;
  const atr = microcycle.atr_block_hint;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Abrir microciclo ${microcycle.name}`}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-4 rounded-[var(--r-l)] border border-[color:var(--border-subtle)]',
        'bg-[color:var(--surface-card)] p-5 text-left transition-all',
        'hover:border-[color:var(--accent)]/50 hover:bg-[color:var(--surface-container-low)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40',
      )}
    >
      <button
        type="button"
        aria-label={`Borrar ${microcycle.name}`}
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full',
          'text-[color:var(--text-muted)] opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-visible:opacity-100',
          'hover:bg-[color:var(--danger)]/15 hover:text-[color:var(--danger)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40',
          'disabled:opacity-40',
        )}
      >
        <MIcon name={deleting ? 'progress_activity' : 'close'} size={14} aria-hidden />
      </button>

      <div className="flex items-start justify-between gap-3">
        <h3 className="font-headline-md min-w-0 flex-1 text-[color:var(--fg)]">
          <span className="block truncate">{microcycle.name}</span>
        </h3>
        {atr ? (
          <span
            title={atrPhaseLabel(atr)}
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              atrBadgeClass(atr),
            )}
          >
            {atr}
          </span>
        ) : null}
      </div>

      {microcycle.focus ? (
        <p className="line-clamp-2 text-sm text-[color:var(--text-muted)]">
          {microcycle.focus}
        </p>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-muted)]">
        <span className="flex items-center gap-2">
          <span className="rounded bg-[color:var(--surface-container-low)] px-2 py-0.5 text-[color:var(--fg)]">
            {levelLabel}
          </span>
          <span aria-hidden>·</span>
          <span>
            {microcycle.week_count} {microcycle.week_count === 1 ? 'semana' : 'semanas'}
          </span>
        </span>
        <span className="normal-case tracking-normal">
          {formatRelative(microcycle.updated_at)}
        </span>
      </div>
    </div>
  );
}
