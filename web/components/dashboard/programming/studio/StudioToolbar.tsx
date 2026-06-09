'use client';

import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { UndoRedoControls } from '@/components/dashboard/programming/studio/UndoRedoControls';

interface StudioToolbarProps {
  name: string;
  level: string;
  phaseHint?: string | null;
  dirty: boolean;
  saving: boolean;
  savedFlash?: boolean;
  saveError?: string | null;
  onClear: () => void;
  onSave: () => void;
  /** Abre el modal Pablo IA para generar la semana entera. */
  onPabloIAWeek?: () => void;
  // F11 — undo/redo del board.
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

function saveStatusLabel({
  dirty,
  saving,
  savedFlash,
  saveError,
}: Pick<StudioToolbarProps, 'dirty' | 'saving' | 'savedFlash' | 'saveError'>) {
  if (saving) return { text: 'Guardando…', tone: 'pending' as const };
  if (saveError) return { text: 'Error al guardar', tone: 'error' as const };
  if (savedFlash) return { text: 'Guardado', tone: 'ok' as const };
  if (dirty) return { text: 'Cambios pendientes', tone: 'pending' as const };
  return { text: 'Sincronizado', tone: 'ok' as const };
}

export function StudioToolbar({
  name,
  level,
  phaseHint,
  dirty,
  saving,
  savedFlash = false,
  saveError = null,
  onClear,
  onSave,
  onPabloIAWeek,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: StudioToolbarProps) {
  const status = saveStatusLabel({ dirty, saving, savedFlash, saveError });

  return (
    <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-5 py-2 lg:h-16 lg:flex-nowrap lg:py-0">
      <div className="min-w-0">
        <h1 className="truncate font-display text-[22px] font-bold italic uppercase leading-none tracking-tight text-[color:var(--fg)]">
          {name}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
          {phaseHint ? (
            <span className="micro-label tracking-[0.1em]">Fase {phaseHint}</span>
          ) : null}
          {phaseHint ? (
            <span className="h-1 w-1 rounded-full bg-[color:var(--border-subtle)]" />
          ) : null}
          <span className="micro-label tracking-[0.1em]">{level}</span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--border-subtle)]" />
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em]',
              status.tone === 'ok' && 'text-[color:var(--status-success)]',
              status.tone === 'pending' && 'text-[color:var(--status-warning)]',
              status.tone === 'error' && 'text-[color:var(--danger)]',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status.tone === 'ok' && 'bg-[color:var(--status-success)]',
                status.tone === 'pending' && 'bg-[color:var(--status-warning)] animate-pulse',
                status.tone === 'error' && 'bg-[color:var(--danger)]',
              )}
            />
            {status.text}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/programar"
          className="mr-1 hidden text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] hover:text-[color:var(--primary-container)] sm:inline"
        >
          ← Programar
        </Link>
        {onUndo && onRedo ? (
          <UndoRedoControls
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        ) : null}
        {onPabloIAWeek ? (
          <button
            type="button"
            onClick={onPabloIAWeek}
            title="Pablo IA · generar semana"
            className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[color:var(--accent)]/40 bg-transparent px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent)] transition-colors hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/10"
          >
            <svg
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              className="h-2.5 w-2.5"
            >
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="6" cy="6" r="1.6" fill="currentColor" />
            </svg>
            <span>Pablo IA · Semana</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClear}
          className="rounded-[var(--r-sm)] border border-[color:var(--border-subtle)] px-3 py-2 text-[11px] font-bold uppercase text-[color:var(--fg)] transition-colors hover:bg-[color:var(--surface-container-highest)]"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="focus-ring rounded-[var(--r-sm)] bg-[color:var(--accent)] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[color:var(--accent-on)] shadow-[0_6px_18px_-8px_rgba(240,106,42,0.6)] transition-[filter,box-shadow] hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
        >
          {saving ? 'Guardando…' : dirty ? 'Guardar ahora' : 'Guardado'}
        </button>
      </div>
    </header>
  );
}
