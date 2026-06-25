'use client';

// Alta rápida de una sesión en un día del calendario del atleta ("+ sesión").
// Sustituye al alta del antiguo DaySessionModal: nombre (con sugerencia IA) +
// notas opcionales → POST a la API existente de sesiones de día.

import { useState, useTransition } from 'react';
import type { PlanDay } from '@/lib/dashboard/coach/athlete-plan';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import { TextAiSuggestButton } from '@/components/dashboard/TextAiSuggestButton';
import { MIcon } from '@/components/ui/MIcon';

interface SessionCreateDialogProps {
  athleteId: string;
  day: PlanDay;
  currentBlock: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function SessionCreateDialog({
  athleteId,
  day,
  currentBlock,
  onClose,
  onCreated,
}: SessionCreateDialogProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dayName = DAY_LABELS_FULL[day.day_of_week - 1] ?? day.label;

  const create = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Ponle nombre a la sesión.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/coach/athletes/${athleteId}/sessions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            iso_date: day.iso_date,
            display_title: trimmed,
            notes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setError(json?.error?.message ?? 'No se pudo crear la sesión — reintenta.');
          return;
        }
        onCreated();
      } catch {
        setError('Error de red — reintenta.');
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Nueva sesión — ${dayName} ${day.iso_date}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--scrim)] p-4 sm:items-center"
    >
      <div className="w-full max-w-md rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container-lowest)] shadow-[var(--shadow-modal)]">
        <header className="flex items-start justify-between gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3">
          <div>
            <p className="micro-label">
              {dayName} · {day.iso_date}
            </p>
            <h2 className="font-heading mt-0.5 text-[color:var(--fg)]">Nueva sesión</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar alta de sesión"
            className="focus-ring rounded-[var(--r-s)] p-1.5 text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container-high)] hover:text-[color:var(--fg)]"
          >
            <MIcon name="close" size={17} aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="new-session-title" className="micro-label">
                Nombre de la sesión
              </label>
              <input
                id="new-session-title"
                value={title}
                maxLength={200}
                autoFocus
                placeholder="P. ej. Tren inferior + Ergos"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') create();
                }}
                className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-2 text-sm font-semibold text-[color:var(--fg)] placeholder:font-normal placeholder:text-[color:var(--text-muted)]"
              />
            </div>
            <TextAiSuggestButton
              surface="workout_name"
              context={{ atr_block: currentBlock }}
              onSelect={setTitle}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-session-notes" className="micro-label">
              Notas del coach (opcional)
            </label>
            <textarea
              id="new-session-notes"
              value={notes}
              rows={2}
              maxLength={2000}
              onChange={(e) => setNotes(e.target.value)}
              className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2.5 py-2 text-xs text-[color:var(--fg)]"
            />
          </div>

          {error ? (
            <p role="alert" className="text-xs text-[color:var(--danger)]">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[color:var(--border-subtle)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring rounded-[var(--r-m)] border border-[color:var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={create}
            className="focus-ring rounded-[var(--r-m)] bg-[color:var(--accent)] px-4 py-1.5 text-xs font-semibold text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:opacity-50"
          >
            {pending ? 'Creando…' : 'Crear sesión'}
          </button>
        </footer>
      </div>
    </div>
  );
}
