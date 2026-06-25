'use client';

// NuevoMicrocicloModal — creates a microciclo from scratch in V2. The coach picks
// only what is AGNOSTIC + meaningful at the microciclo level: a NAME and a NUMBER
// OF WEEKS. Level (legacy program_level enum) and phase (ATR) are NOT surfaced —
// a microciclo's placement in the nivel × días matrix and its phase label are
// assigned downstream in Periodización → Secuencias, never on the microciclo
// itself. So this modal stays deliberately minimal.
//
// On submit it POSTs to the EXISTING create endpoint (/api/coach/program-months/
// create), which transactionally inserts the program_month_template + its N empty
// weeks, then opens the real V2 editor at /v2/microciclos/[id]. No V1 imports.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  MICROCYCLE_WEEKS_MIN,
  MICROCYCLE_WEEKS_MAX,
  MICROCYCLE_WEEKS_DEFAULT,
} from '@fahybrid/shared/domain/coach/program-months';

const WEEK_OPTIONS: number[] = Array.from(
  { length: MICROCYCLE_WEEKS_MAX - MICROCYCLE_WEEKS_MIN + 1 },
  (_, i) => MICROCYCLE_WEEKS_MIN + i,
);

export function NuevoMicrocicloModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState<number>(MICROCYCLE_WEEKS_DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus the name field on mount; Escape closes (unless mid-submit).
  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Ponle un nombre al microciclo.');
      nameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/program-months/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, weeks }),
      });
      if (!res.ok) {
        setError('No se pudo crear el microciclo · Reintenta.');
        setSubmitting(false);
        return;
      }
      const json = (await res.json()) as { id?: string };
      if (!json.id) {
        setError('No se pudo crear el microciclo · Reintenta.');
        setSubmitting(false);
        return;
      }
      // Leave the modal open (submitting) while we navigate so it never flashes
      // back to the empty form before the editor mounts.
      router.push(`/microciclos/${json.id}`);
    } catch {
      setError('No se pudo crear el microciclo · Reintenta.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="presentation"
    >
      <form
        ref={dialogRef as unknown as React.RefObject<HTMLFormElement>}
        role="dialog"
        aria-modal
        aria-labelledby="nuevo-microciclo-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="v2-focus flex w-full max-w-md flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 id="nuevo-microciclo-title" className="v2-display text-xl">
              Nuevo microciclo
            </h2>
            <p className="v2-micro mt-0.5">
              Una estructura de varias semanas — la unidad que vivirá tu atleta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] disabled:opacity-50"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-col gap-5 px-5 py-5">
          {/* Name */}
          <label className="block space-y-1.5">
            <span className="v2-micro font-bold uppercase tracking-wider text-[color:var(--v2-muted)]">
              Nombre
            </span>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              maxLength={200}
              placeholder="Ej. Base aeróbica · Bloque 1"
              aria-label="Nombre del microciclo"
              className={cn(
                'v2-focus h-10 w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm',
                'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)]',
              )}
            />
          </label>

          {/* Weeks */}
          <div className="space-y-1.5">
            <span className="v2-micro font-bold uppercase tracking-wider text-[color:var(--v2-muted)]">
              Semanas
            </span>
            <div
              role="radiogroup"
              aria-label="Número de semanas"
              className="flex flex-wrap gap-1.5"
            >
              {WEEK_OPTIONS.map((n) => {
                const active = n === weeks;
                return (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setWeeks(n)}
                    className={cn(
                      'v2-focus v2-num flex h-10 w-10 items-center justify-center rounded-[var(--v2-r-s)] border text-sm font-bold transition-colors',
                      active
                        ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]'
                        : 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="v2-micro text-[color:var(--v2-faint)]">
              Se crearán {weeks} {weeks === 1 ? 'semana' : 'semanas'} vacías. Las editas en el
              editor; el nivel y la fase se asignan en Secuencias.
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] px-3 py-2.5 text-[12.5px]"
              style={{
                background: 'var(--v2-danger-soft)',
                color: 'var(--v2-danger)',
                border: '1px solid color-mix(in srgb, var(--v2-danger) 30%, transparent)',
              }}
            >
              <MIcon name="error" size={16} />
              <span className="flex-1">{error}</span>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--v2-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="v2-focus rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-4 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-surface-2)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
          >
            {submitting ? 'Creando…' : 'Crear y abrir editor'}
            {!submitting ? <MIcon name="arrow_forward" size={16} /> : null}
          </button>
        </div>
      </form>
    </div>
  );
}
