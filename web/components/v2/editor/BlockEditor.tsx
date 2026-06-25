'use client';

// BlockEditor — the right panel of SCREEN 5 (and the block detail of SCREEN 8).
// Edits ONE block: its title, its items (each an exercise + a Prescription), and
// per item the adaptive PrescriptionFields + the "Vista previa atleta" line. A
// block can hold several items (a compromised block = run + wall-balls); we edit
// one item at a time via a compact item tab strip, exactly the domain model
// (each item is its OWN modality/measure/target — never nested).

import { useState, useEffect } from 'react';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { patternForBlock } from '@/lib/dashboard/v2/archetypes';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { PrescriptionFields } from './PrescriptionFields';
import { ArchetypeBlockForm } from './ArchetypeBlockForm';
import { AthletePreviewLine } from './AthletePreviewLine';
import { ExercisePickerField } from './ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { TextCell, v2SelectCell } from './fields';

const DAYS_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '3 días' },
  { value: 4, label: '4 días' },
  { value: 5, label: '5 días' },
  { value: 6, label: '6 días' },
];

interface LevelOption {
  id: string;
  name: string;
  label: string;
}

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

  // The archetype-first tailored form is the DEFAULT when the block resolves to a
  // pattern (explicit archetype_id or a known format). Only legacy/unknown blocks
  // with items fall back to the per-item axes editor.
  const hasArchetypeForm =
    block.items.length > 0 && patternForBlock(block.archetype_id, block.format) !== null;

  const [levels, setLevels] = useState<LevelOption[]>([]);
  useEffect(() => {
    fetch('/api/coach/levels', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { levels: LevelOption[] } | null) => {
        if (data?.levels) setLevels(data.levels);
      })
      .catch(() => {
        // Degraded gracefully — pickers render without options
      });
  }, []);

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

      {/* Level range + days/week — optional block-level tags (migration 0057). */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[120px] flex-1 space-y-1.5">
          <span className="v2-micro">Level mínimo</span>
          <select
            aria-label="Level mínimo"
            value={block.min_level_id ?? ''}
            onChange={(e) =>
              onChange({
                ...block,
                min_level_id: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={cn(v2SelectCell, 'w-full')}
          >
            <option value="">Cualquier nivel</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[120px] flex-1 space-y-1.5">
          <span className="v2-micro">Level máximo</span>
          <select
            aria-label="Level máximo"
            value={block.max_level_id ?? ''}
            onChange={(e) =>
              onChange({
                ...block,
                max_level_id: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={cn(v2SelectCell, 'w-full')}
          >
            <option value="">Mismo que mínimo</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[100px] flex-1 space-y-1.5">
          <span className="v2-micro">Días / semana</span>
          <select
            aria-label="Días por semana"
            value={block.days_per_week ?? ''}
            onChange={(e) =>
              onChange({
                ...block,
                days_per_week: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={cn(v2SelectCell, 'w-full')}
          >
            <option value="">Cualquiera</option>
            {DAYS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* DEFAULT — the archetype-first tailored form (the simple input). It owns
          the exercise name, the type-specific fields, the phase tag, the athlete
          preview AND the "Ajuste avanzado" hatch (the full axes, reused). */}
      {hasArchetypeForm ? (
        <ArchetypeBlockForm
          block={block}
          athleteName={athleteName}
          onChange={onChange}
        />
      ) : block.items.length > 0 ? (
        // Legacy / unknown-format block — keep the per-item axes editor as fallback.
        <>
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

          {activeItem ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <span className="v2-micro">Ejercicio</span>
                <ExercisePickerField
                  item={activeItem}
                  destinationLabel={block.title || 'Ejercicio'}
                  defaultCategory={defaultCategoryForModality(activeItem.prescription.modality)}
                  onChange={(patch) => updateItem(activeItem.uid, patch)}
                />
              </div>

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
          ) : null}
        </>
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
