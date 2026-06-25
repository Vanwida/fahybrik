'use client';

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

interface UndoRedoControlsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Botones undo/redo del studio (F11). Anuncian el atajo en el `title` y un
 * `aria-label` descriptivo para lectores de pantalla. Se deshabilitan (y se
 * anuncian como tal) cuando no hay nada que deshacer/rehacer.
 */
export function UndoRedoControls({ canUndo, canRedo, onUndo, onRedo }: UndoRedoControlsProps) {
  return (
    <div
      className="flex items-center overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--border-subtle)]"
      role="group"
      aria-label="Deshacer y rehacer"
    >
      <UndoRedoButton
        icon="undo"
        label="Deshacer"
        shortcut="⌘Z"
        disabled={!canUndo}
        onClick={onUndo}
      />
      <span aria-hidden className="h-5 w-px bg-[color:var(--border-subtle)]" />
      <UndoRedoButton
        icon="redo"
        label="Rehacer"
        shortcut="⌘⇧Z"
        disabled={!canRedo}
        onClick={onRedo}
      />
    </div>
  );
}

function UndoRedoButton({
  icon,
  label,
  shortcut,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${shortcut})`}
      aria-label={`${label} (${shortcut})`}
      aria-disabled={disabled}
      className={cn(
        'focus-ring flex h-9 w-9 items-center justify-center text-[color:var(--fg)] transition-colors',
        'hover:bg-[color:var(--surface-container-highest)]',
        'disabled:cursor-not-allowed disabled:text-[color:var(--text-muted)] disabled:opacity-40 disabled:hover:bg-transparent',
      )}
    >
      <MIcon name={icon} size={17} />
    </button>
  );
}
