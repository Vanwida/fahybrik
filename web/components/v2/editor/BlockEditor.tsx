'use client';

// BlockEditor — the right panel of SCREEN 5 (and the block detail of SCREEN 8).
// Edits ONE block: its title, its items (each an exercise + a Prescription), and
// per item the adaptive PrescriptionFields + the "Vista previa atleta" line. A
// block can hold several items (a compromised block = run + wall-balls); we edit
// one item at a time via a compact item tab strip, exactly the domain model
// (each item is its OWN modality/measure/target — never nested).

import { useState } from 'react';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { undosedLines, type UndosedLine } from '@/lib/dashboard/v2/block-dose';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { patternForBlock } from '@/lib/dashboard/v2/archetypes';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { PrescriptionFields } from './PrescriptionFields';
import { ArchetypeBlockForm } from './ArchetypeBlockForm';
import { AthletePreviewLine } from './AthletePreviewLine';
import { ExercisePickerField } from './ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
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

  // The archetype-first tailored form is the DEFAULT when the block resolves to a
  // pattern (explicit archetype_id or a known format). Only legacy/unknown blocks
  // with items fall back to the per-item axes editor.
  const hasArchetypeForm =
    block.items.length > 0 && patternForBlock(block.archetype_id, block.format) !== null;

  const undosed = undosedLines(block);

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

      {/* QUÉ falta, encima del formulario que lo arregla. Va AQUÍ y no dentro de
          ArchetypeBlockForm porque este componente pinta DOS vías (la de arquetipo
          y la legacy por-item): puesto dentro de una, la otra se quedaba sin marcar
          — y los bloques importados del coach caen en la legacy más de lo que
          parece (un `plyometric` no resuelve a arquetipo). Desaparece solo en
          cuanto entra la dosis. */}
      {undosed.length > 0 ? <UndosedNotice lines={undosed} /> : null}

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

/**
 * El aviso de dosis: dice QUÉ línea falla y POR QUÉ, con las palabras del gate.
 *
 * Los motivos van verbatim (`blockingReasons`) porque ya están escritos para el
 * coach y en español — reescribirlos aquí sería una segunda voz que se desincroniza
 * del gate que le bloquea el Confirmar.
 *
 * Con una sola línea (117 de las 119 piezas del coach) no se nombra el ejercicio:
 * es el que tiene delante, y decírselo sería ruido.
 */
function UndosedNotice({ lines }: { lines: UndosedLine[] }) {
  const one = lines.length === 1;
  return (
    <div
      className="flex gap-2 rounded-[var(--v2-r-m)] px-3 py-2"
      style={{ background: 'var(--v2-warn-soft)' }}
    >
      <span className="shrink-0" style={{ color: 'var(--v2-warn)' }}>
        <MIcon name="edit_note" size={16} aria-hidden />
      </span>
      <div className="min-w-0 text-xs leading-relaxed">
        <p className="font-semibold" style={{ color: 'var(--v2-warn)' }}>
          {one ? 'Dice el ejercicio pero no cuánto trabajo' : `${lines.length} líneas sin dosis`}
        </p>
        <ul className="mt-0.5 space-y-0.5 text-[color:var(--v2-muted)]">
          {lines.map((l) => (
            <li key={l.uid}>
              {one ? null : <b>{l.exercise_name || 'Ejercicio'}: </b>}
              {l.reasons.join(' ')}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[color:var(--v2-faint)]">
          Rellénalo aquí y queda arreglado para todos los días que usen este bloque.
        </p>
      </div>
    </div>
  );
}
