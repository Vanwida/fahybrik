'use client';

import { useEffect, useId, useState } from 'react';
import type { AthleteModality } from '@/lib/dashboard/athletes/list';
import { cn } from '@/lib/utils';

interface AddAthleteModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create so the parent can refresh the roster. */
  onCreated: () => void;
}

const MODALITY_OPTIONS: ReadonlyArray<{ value: AthleteModality; label: string }> = [
  { value: 'individual', label: 'Individual' },
  { value: 'dobles', label: 'Dobles' },
  { value: 'pro_elite', label: 'Pro' },
];

const INPUT_CLASS = cn(
  'mt-1 w-full rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]',
  'bg-[color:var(--surface-container-lowest)] px-3 py-2.5 text-sm text-[color:var(--fg)]',
  'outline-none transition-colors focus:border-[color:var(--accent)]',
  'focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]',
);

const LABEL_CLASS =
  'text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]';

export function AddAthleteModal({ open, onClose, onCreated }: AddAthleteModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [modality, setModality] = useState<AthleteModality>('individual');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const nameId = useId();
  const emailId = useId();
  const modalityId = useId();

  // Reset del formulario al cerrar: sincronización legítima al cambio de `open`,
  // no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setFullName('');
      setEmail('');
      setModality('individual');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!mail) {
      setError('El email es obligatorio.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/coach/athletes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: name, email: mail, modality }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        // 409 (email_in_use / athlete_other_coach) and 400 surface their message.
        throw new Error(body.error?.message ?? `Error (${res.status})`);
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo añadir el atleta.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
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
        <h2 id={titleId} className="font-heading text-[color:var(--fg)]">
          Añadir atleta
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-muted)]">
          Crea una cuenta de cortesía con acceso completo a la app y sin cobro.
          El atleta entrará al firmar con Apple usando este email.
        </p>

        <div className="mt-5 space-y-4">
          <label htmlFor={nameId} className="block">
            <span className={LABEL_CLASS}>Nombre completo</span>
            <input
              id={nameId}
              type="text"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              placeholder="Ej. Alex Solé"
              className={INPUT_CLASS}
            />
          </label>

          <label htmlFor={emailId} className="block">
            <span className={LABEL_CLASS}>Email</span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atleta@email.com"
              autoComplete="off"
              className={INPUT_CLASS}
            />
          </label>

          <label htmlFor={modalityId} className="block">
            <span className={LABEL_CLASS}>Modalidad</span>
            <select
              id={modalityId}
              value={modality}
              onChange={(e) => setModality(e.target.value as AthleteModality)}
              className={INPUT_CLASS}
            >
              {MODALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
            className="rounded-[var(--r-sm)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'rounded-[var(--r-sm)] bg-[color:var(--accent)] px-5 py-2 text-xs font-bold uppercase tracking-wider text-[color:var(--accent-on)]',
              'transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] disabled:opacity-50',
            )}
          >
            {submitting ? 'Añadiendo…' : 'Añadir atleta'}
          </button>
        </div>
      </form>
    </div>
  );
}
