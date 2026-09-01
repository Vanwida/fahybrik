'use client';

// BlockEditorDrawer — el SHELL del compositor (rediseño de microciclos): drawer
// lateral derecho min(680px, 94vw) a altura completa, scrim --v2-scrim, entrada
// y salida a 300 ms con la curva de la casa, cierre por X / Escape / scrim.
// El CONTENIDO (BlockEditor y su barra «El atleta ve» + Guardar) es del
// compositor — este fichero solo posiciona, anima y cierra.
//
// Sigue montado en ModalPortal: el editor de día vive dentro de una sección con
// view-transition-name (stacking context) y sin el portal el drawer quedaría
// atrapado bajo la cabecera sticky. El ExercisePicker se abre ENCIMA (censo del
// portal); Escape es suyo mientras esté arriba.

import { useEffect, useState } from 'react';
import type { EditorBlock } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { ModalPortal } from './ModalPortal';
import { BlockEditor } from './BlockEditor';

// Duración de la transición de entrada/salida — la del mock aprobado.
const SLIDE_MS = 300;

export function BlockEditorDrawer({
  block,
  onClose,
  onChange,
  onAddItem,
}: {
  block: EditorBlock;
  onClose: () => void;
  onChange: (next: EditorBlock) => void;
  onAddItem: () => void;
}) {
  // Entra cerrado y se abre en el siguiente frame para que la transición corra;
  // al cerrar, primero desliza y luego desmonta.
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setOpen(false);
  };

  return (
    <ModalPortal onEscape={close}>
      <div
        aria-hidden
        onClick={close}
        className={cn(
          'fixed inset-0 z-50 bg-[color:var(--v2-scrim)] transition-opacity duration-300 motion-reduce:transition-none',
          open ? 'opacity-100' : 'opacity-0',
        )}
      />
      <aside
        role="dialog"
        aria-modal
        aria-label={`Editar bloque ${block.title || 'sin nombre'}`}
        tabIndex={-1}
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[min(680px,94vw)] flex-col border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[color:var(--v2-border)] px-5 py-4">
          <h2 className="v2-display min-w-0 truncate text-xl">
            {block.title || 'Editar bloque'}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="v2-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
          >
            <MIcon name="close" size={20} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Solo el day editor persiste `optional` (editor-serialize.ts) — ver
              el comentario de CompositorHeader.showOptionalToggle. */}
          <BlockEditor block={block} onChange={onChange} onAddItem={onAddItem} showOptionalToggle />
        </div>
      </aside>
    </ModalPortal>
  );
}
