'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  PROGRAM_LEVELS,
  PROGRAM_LEVEL_LABELS,
  type ProgramLevel,
} from '@/lib/dashboard/constants/program-levels';
import { ATR_PHASE_LABEL } from '@/lib/dashboard/constants/atr-phases';
import { cn } from '@/lib/utils';
import { PabloIAInput } from '@/components/dashboard/pablo-ia/PabloIAInput';

interface NewMicrocycleWizardProps {
  open: boolean;
  onClose: () => void;
}

type AtrHint = '' | 'ACC' | 'TRANS' | 'REAL';

export function NewMicrocycleWizard({ open, onClose }: NewMicrocycleWizardProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<ProgramLevel>('pro');
  const [atrHint, setAtrHint] = useState<AtrHint>('');
  const [focus, setFocus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al cerrar para que abra limpio la próxima vez. Patrón "ajustar estado
  // en render" (comparando el `open` previo) en vez de setState-en-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setName('');
      setLevel('pro');
      setAtrHint('');
      setFocus('');
      setError(null);
      setSubmitting(false);
    }
  }

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/coach/program-months/create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          level,
          atr_block_hint: atrHint || null,
          focus: focus.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? 'Error al crear el microciclo');
      }

      const json = (await res.json()) as { id: string };
      onClose();
      router.push(`/programar/microciclos/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el microciclo');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-microcycle-title"
    >
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/70"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="relative z-10 w-full max-w-md rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-6 shadow-xl"
      >
        <h2
          id="new-microcycle-title"
          className="font-heading text-[color:var(--fg)]"
        >
          Nuevo microciclo
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Se creará un bloque de 4 semanas vacías. Podrás editarlas en el editor.
        </p>

        <div className="mt-5 space-y-4">
          <div className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Nombre
            </span>
            <div className="mt-1">
              <PabloIAInput
                autoFocus
                value={name}
                onChange={(v) => setName(v)}
                surface="week_name"
                context={{
                  level,
                  atr_block: atrHint || undefined,
                  focus: focus || undefined,
                }}
                placeholder="Ej. Base HYROX Pro · ACC"
              />
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Nivel
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as ProgramLevel)}
              className="mt-1 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
            >
              {PROGRAM_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {PROGRAM_LEVEL_LABELS[l]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Fase ATR (opcional)
            </span>
            <select
              value={atrHint}
              onChange={(e) => setAtrHint(e.target.value as AtrHint)}
              className="mt-1 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
            >
              <option value="">— Sin fase</option>
              {(['ACC', 'TRANS', 'REAL'] as const).map((key) => (
                <option key={key} value={key}>
                  {ATR_PHASE_LABEL[key]} ({key})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Objetivo (opcional)
            </span>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              placeholder="Ej. Volumen aeróbico, base técnica HYROX"
              className="mt-1 w-full resize-none rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--fg)] outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-[var(--r-sm)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--fg)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--accent-on)]',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            {submitting ? 'Creando…' : 'Crear y abrir editor'}
          </button>
        </div>
      </form>
    </div>
  );
}
