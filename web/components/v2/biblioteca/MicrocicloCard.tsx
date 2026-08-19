'use client';

// MicrocicloCard — one microcycle template in the Biblioteca › Microciclos index.
// The card body is a stretched LINK opening the editor at /v2/microciclos/[id]; a
// real "Duplicar" button sits above it (the link is pointer-events-none behind, the
// button is the only interactive child), so the whole card navigates while the
// action stays keyboard-reachable and click-isolated. "Duplicar" deep-copies the
// microciclo (independent weeks — editing the copy never touches the original) and
// refreshes the list so the "(copia)" appears.

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import { cn } from '@/lib/utils';
import type { V2MicrocicloItem } from '@/lib/dashboard/v2/biblioteca-data';

export function MicrocicloCard({
  microciclo,
  index,
}: {
  microciclo: V2MicrocicloItem;
  index: number;
}) {
  const router = useRouter();
  const weeks = microciclo.week_count;
  const [duplicating, setDuplicating] = useState(false);
  const [duplicateError, setDuplicateError] = useState(false);

  const duplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    setDuplicateError(false);
    try {
      const res = await fetch(`/api/coach/program-months/${microciclo.id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        setDuplicateError(true);
        return;
      }
      // Refresh the server-rendered list so the new "(copia)" card appears in place.
      router.refresh();
    } catch {
      setDuplicateError(true);
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div
      className={cn(
        'v2-stagger group relative flex flex-col rounded-[var(--v2-r-card)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-4',
        'shadow-[var(--v2-shadow-card)] transition-colors hover:border-[color:var(--v2-border-strong)]',
      )}
      style={{ ['--v2-stagger-i' as string]: index }}
    >
      {/* Stretched link — the whole card opens the editor. */}
      <Link
        href={`/microciclos/${microciclo.id}`}
        aria-label={`Editar microciclo ${microciclo.name}`}
        className="v2-focus absolute inset-0 z-0 rounded-[var(--v2-r-card)]"
      />

      {/* Title + actions. The row ignores pointer events so clicks fall through to
          the stretched link; only the Duplicar button re-enables them. */}
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        <h3 className="v2-display min-w-0 text-[15.5px] text-[color:var(--v2-fg)]">
          {microciclo.name}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={duplicate}
            disabled={duplicating}
            aria-label={`Duplicar ${microciclo.name}`}
            title="Crea una copia independiente de este microciclo"
            className="pointer-events-auto v2-focus inline-flex h-6 w-6 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] disabled:opacity-60"
          >
            <MIcon
              name={duplicating ? 'progress_activity' : 'content_copy'}
              size={15}
              className={duplicating ? 'animate-spin' : undefined}
              aria-hidden
            />
          </button>
          <span className="text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-fg)]">
            <MIcon name="chevron_right" size={18} aria-hidden />
          </span>
        </div>
      </div>

      {/* Level + weeks */}
      <div className="pointer-events-none relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
        <Pill tone="neutral" variant="outline" className="capitalize">
          {microciclo.level}
        </Pill>
        <span className="inline-flex items-center gap-1 text-xs text-[color:var(--v2-muted)]">
          <MIcon name="date_range" size={14} aria-hidden />
          <span className="v2-num">{weeks}</span>
          {weeks === 1 ? 'semana' : 'semanas'}
        </span>
      </div>

      {duplicateError ? (
        <p className="relative z-10 mt-2 text-label font-semibold text-[color:var(--v2-danger)]">
          No se pudo duplicar el microciclo. Inténtalo de nuevo.
        </p>
      ) : null}
    </div>
  );
}
