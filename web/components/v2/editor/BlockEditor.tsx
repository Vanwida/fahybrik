'use client';

// BlockEditor — the right panel of SCREEN 5 (and the block detail of SCREEN 8).
// Edits ONE block: its title, its items (each an exercise + a Prescription), and
// per item the adaptive PrescriptionFields + the "Vista previa atleta" line. A
// block can hold several items (a compromised block = run + wall-balls); we edit
// one item at a time via a compact item tab strip, exactly the domain model
// (each item is its OWN modality/measure/target — never nested).

import { useState } from 'react';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';
import { PrescriptionFields } from './PrescriptionFields';
import { AthletePreviewLine } from './AthletePreviewLine';
import { TextCell } from './fields';

const EMPTY_PRESCRIPTION: Prescription = { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 8 } }] };

export function BlockEditor({
  block,
  athleteName,
  onChange,
  onDuplicate,
  onSave,
  onAddItem,
}: {
  block: EditorBlock;
  athleteName?: string;
  onChange: (next: EditorBlock) => void;
  onDuplicate?: () => void;
  onSave?: () => void;
  onAddItem?: () => void;
}) {
  const [activeItemUid, setActiveItemUid] = useState<string | null>(
    block.items[0]?.uid ?? null,
  );
  const activeItem =
    block.items.find((it) => it.uid === activeItemUid) ?? block.items[0] ?? null;

  const updateItem = (uid: string, patch: Partial<EditorItem>) => {
    onChange({
      ...block,
      items: block.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    });
  };

  const setItemPrescription = (uid: string, prescription: Prescription) =>
    updateItem(uid, { prescription });

  return (
    <div className="flex flex-col gap-4">
      {/* Block header — editable title + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-0 flex-1 space-y-1.5">
          <span className="v2-micro">Nombre del bloque</span>
          <TextCell
            value={block.title}
            ariaLabel="Nombre del bloque"
            maxLength={120}
            placeholder="p. ej. Fuerza · Sentadilla"
            onChange={(title) => onChange({ ...block, title })}
          />
        </label>
        <div className="flex items-center gap-2">
          {onDuplicate ? (
            <button
              type="button"
              onClick={onDuplicate}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="content_copy" size={15} />
              Duplicar
            </button>
          ) : null}
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-2 text-xs font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
            >
              <MIcon name="check" size={15} />
              Guardar bloque
            </button>
          ) : null}
        </div>
      </div>

      {/* Item tabs — one block, multiple items (compromised blocks). */}
      {block.items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {block.items.map((it) => (
            <button
              key={it.uid}
              type="button"
              onClick={() => setActiveItemUid(it.uid)}
              className={cn(
                'v2-focus rounded-[var(--v2-r-pill)] border px-3 py-1 text-xs font-semibold transition-colors',
                it.uid === activeItem?.uid
                  ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                  : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              {it.exercise_name || 'Ejercicio'}
            </button>
          ))}
          {onAddItem ? (
            <button
              type="button"
              onClick={onAddItem}
              aria-label="Añadir ejercicio"
              className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)] px-3 py-1 text-xs font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="add" size={14} />
              ejercicio
            </button>
          ) : null}
        </div>
      ) : null}

      {activeItem ? (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="v2-micro">Ejercicio</span>
            <TextCell
              value={activeItem.exercise_name}
              ariaLabel="Nombre del ejercicio"
              maxLength={200}
              placeholder="p. ej. Sentadilla trasera"
              onChange={(name) => updateItem(activeItem.uid, { exercise_name: name })}
            />
          </label>

          <PrescriptionFields
            value={activeItem.prescription}
            onChange={(p) => setItemPrescription(activeItem.uid, p)}
          />

          <AthletePreviewLine
            prescription={activeItem.prescription}
            exerciseName={activeItem.exercise_name}
            athleteName={athleteName}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--v2-muted)]">
            Este bloque aún no tiene ejercicios.
          </p>
          {onAddItem ? (
            <button
              type="button"
              onClick={onAddItem}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="add" size={16} />
              Añadir ejercicio
            </button>
          ) : (
            // Fallback: seed a first item locally so the coach can author it.
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...block,
                  items: [
                    {
                      uid: `new-item-${Date.now()}`,
                      exercise_id: null,
                      exercise_name: '',
                      prescription: EMPTY_PRESCRIPTION,
                    },
                  ],
                })
              }
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
            >
              <MIcon name="add" size={16} />
              Añadir ejercicio
            </button>
          )}
        </div>
      )}
    </div>
  );
}
