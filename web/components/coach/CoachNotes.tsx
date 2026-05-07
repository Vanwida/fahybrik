'use client';

import { useState, useTransition } from 'react';
import { Lock, Plus, AlertCircle } from 'lucide-react';
import type { CoachNote } from '@/lib/coach/deep-dive-types';

interface CoachNotesProps {
  athlete_id: string;
  initial_notes: CoachNote[];
  is_demo: boolean;
}

export function CoachNotes({ athlete_id, initial_notes, is_demo }: CoachNotesProps) {
  const [notes, setNotes] = useState<CoachNote[]>(initial_notes);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const body = draft.trim();
    if (body.length === 0) {
      setError('La nota no puede estar vacía');
      return;
    }
    setError(null);
    startTransition(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/coach/athletes/${athlete_id}/notes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body }),
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            setError(json?.error?.message ?? 'Error al guardar la nota');
            return;
          }
          const json = (await res.json()) as { note: CoachNote };
          setNotes((prev) => [json.note, ...prev]);
          setDraft('');
          setOpen(false);
        } catch {
          setError('Error de red al guardar la nota');
        }
      })();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setDraft('');
      setError(null);
    }
  }

  return (
    <section
      aria-label="Notas del coach (privado)"
      className="rounded-[var(--r-l)] border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3"
    >
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          <Lock className="size-3" aria-hidden strokeWidth={1.5} />
          Notas Pablo · privado
        </h3>
        {!is_demo ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-[var(--r-s)] px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          >
            <Plus className="size-3" aria-hidden strokeWidth={2} />
            nueva nota
          </button>
        ) : null}
      </header>

      {open ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Observación, hallazgo, ajuste para próxima sesión…"
            className="min-h-[64px] resize-y rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-[color:var(--bg)] px-3 py-2 text-[13px] text-[color:var(--fg)] focus:border-[color:var(--accent)] focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]"
          />
          {error ? (
            <p className="flex items-center gap-1 text-[11px] text-[color:var(--danger)]">
              <AlertCircle className="size-3" aria-hidden strokeWidth={2} />
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--muted)]">⌘ + Enter</span>
            <button
              type="button"
              onClick={() => { setOpen(false); setDraft(''); setError(null); }}
              className="rounded-[var(--r-s)] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[color:var(--muted)] hover:text-[color:var(--fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-[var(--r-s)] bg-[color:var(--accent)] px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-[color:var(--accent-on)] hover:bg-[color:var(--accent-press)] disabled:opacity-60"
            >
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : null}

      {notes.length === 0 ? (
        <p className="mt-3 text-[11px] italic text-[color:var(--muted)]/80">
          Sin notas. Escribe lo que observas para no perderlo.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-[color:var(--hairline)]/60">
          {notes.map((n) => (
            <li key={n.id} className="grid grid-cols-[68px_1fr] items-baseline gap-3 py-1.5 text-[12px]">
              <span className="font-mono text-[11px] tabular-nums text-[color:var(--muted)]">{n.date_label}</span>
              <span className="text-[color:var(--fg)]">{n.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
