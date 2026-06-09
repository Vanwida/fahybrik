'use client';

// "+ Nueva sesión" — alta mínima (spec §3a): UN solo campo obligatorio
// (nombre, con sugerencia de Pablo IA). Formato / fase ATR / nivel / grupo son
// tags opcionales que se editan después en el propio drawer. Sustituye al
// wizard de 6 campos.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PabloIAInput } from '@/components/dashboard/pablo-ia/PabloIAInput';

// Defaults técnicos del POST (templateCreateSchema exige format): un entreno
// recién creado nace como bloque de fuerza sin fase ni nivel; el coach lo
// re-etiqueta en el drawer.
const NEW_SESSION_DEFAULTS = {
  format: 'strength_block',
  target_block: 'any',
  target_level: null,
  is_draft: false,
  segments: [],
} as const;

export function NewSessionModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Sesión creada — el caller abre su drawer y refresca el grid. */
  onCreated: (template_id: string) => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset al cerrar (ajuste en render comparando open previo — patrón repo).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setName('');
      setError(null);
      setSubmitting(false);
    }
  }

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
      const res = await fetch('/api/coach/templates', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, ...NEW_SESSION_DEFAULTS }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(err.error?.message ?? 'No se pudo crear la sesión');
      }
      const json = (await res.json()) as { id: string };
      onCreated(json.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sesión');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-session-title"
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
        <h2 id="new-session-title" className="font-heading text-[color:var(--fg)]">
          Nueva sesión
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Solo necesita un nombre. El resto (formato, fase, nivel, grupo) lo
          etiquetas después en la propia sesión.
        </p>

        <div className="mt-5 block">
          <span className="micro-label">Nombre</span>
          <div className="mt-1">
            <PabloIAInput
              autoFocus
              value={name}
              onChange={setName}
              surface="workout_name"
              context={{}}
              placeholder="Ej. Tren inferior A — Sentadilla + bisagra"
            />
          </div>
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
            className="focus-ring rounded-[var(--r-sm)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--fg)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'focus-ring rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--accent-on)]',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            {submitting ? 'Creando…' : 'Crear y abrir'}
          </button>
        </div>
      </form>
    </div>
  );
}
