'use client';

// Descripción del bloque + técnica de cada línea. Las dos notas que el
// atleta lee EN ESE bloque (no solo al empezar el entreno). Un solo sitio
// para el editor de día (tarjeta) y el compositor (BlockEditor).

import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { BLOCK_NOTE_MAX, ITEM_NOTES_MAX } from '@fahybrid/shared/schema/program-templates';
import { NoteField } from './fields';
import { fetchTextSuggestions } from './ai-text-suggest';

const BLOCK_NOTE_HINT = 'La ve el atleta en este bloque, no solo al empezar.';
const LINE_NOTE_HINT =
  'Es solo para este día. Lo que vale siempre va en la ficha del ejercicio de tu biblioteca.';

export function BlockProseFields({
  block,
  showDescription = true,
  onChangeCoachNote,
  onChangeItemNote,
}: {
  block: EditorBlock;
  /** La biblioteca de bloques usa `blocks.description`, no esta prosa por pieza. */
  showDescription?: boolean;
  onChangeCoachNote: (note: string) => void;
  onChangeItemNote: (uid: string, notes: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {showDescription ? (
        <NoteField
          id={`block-desc-${block.uid}`}
          label="Descripción"
          hint={BLOCK_NOTE_HINT}
          value={block.coach_note ?? ''}
          placeholder="Qué es este bloque y cómo se siente."
          maxLength={BLOCK_NOTE_MAX}
          onChange={onChangeCoachNote}
        />
      ) : null}
      {block.items.length > 0 ? (
        <LineNotes
          items={block.items}
          blockTitle={block.title}
          onChangeNote={onChangeItemNote}
        />
      ) : null}
    </div>
  );
}

function LineNotes({
  items,
  blockTitle,
  onChangeNote,
}: {
  items: EditorItem[];
  blockTitle: string;
  onChangeNote: (uid: string, notes: string) => void;
}) {
  const single = items.length === 1;
  const suggestFor = (item: EditorItem) => () =>
    fetchTextSuggestions({
      surface: 'item_note',
      context: {
        ...(item.exercise_name ? { exercise_name: item.exercise_name } : {}),
        ...(blockTitle ? { block_title: blockTitle } : {}),
        prescription: item.prescription,
      },
    });
  return (
    <section className="space-y-2.5">
      {single ? null : (
        <div className="space-y-0.5">
          <span className="v2-micro block">Técnica</span>
          <p className="text-label leading-relaxed text-[color:var(--v2-faint)]">
            La ve al abrir cada ejercicio en el móvil. {LINE_NOTE_HINT}
          </p>
        </div>
      )}
      {items.map((it) => (
        <NoteField
          key={it.uid}
          id={`item-note-${it.uid}`}
          label={single ? 'Técnica' : it.exercise_name || 'Técnica de la línea sin ejercicio'}
          hint={single ? `La ve al abrir este ejercicio en el móvil. ${LINE_NOTE_HINT}` : undefined}
          value={it.notes ?? ''}
          placeholder="Baja la carga, vienes de la tirada del domingo."
          maxLength={ITEM_NOTES_MAX}
          onChange={(v) => onChangeNote(it.uid, v)}
          onSuggest={suggestFor(it)}
        />
      ))}
    </section>
  );
}
