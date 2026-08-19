'use client';

// BlockEditor — el COMPOSITOR de dosis (rediseño del editor de microciclos):
// el contenido del drawer del día y el panel derecho de los editores de
// biblioteca. Edita UN bloque: cabecera con contexto + título grande + tag de
// modalidad derivado del ejercicio (compositor-chrome), el formulario a medida
// del arquetipo (ArchetypeBlockForm) o los tres ejes por línea como último
// recurso, la NOTA de cada línea (lo que el atleta lee al abrir ese ejercicio en
// el móvil) y al pie la barra fija «El atleta ve» con el Guardar bloque
// (AthleteSeesBar). Un bloque puede tener varias líneas (bloque comprometido =
// carrera + wall balls); la vía legacy las edita una a una con su tira de
// pestañas — exactamente el modelo de dominio (cada línea con SU modalidad/
// medida/objetivo, nunca anidadas).

import { useState } from 'react';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { undosedLines, type UndosedLine } from '@/lib/dashboard/v2/block-dose';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { ITEM_NOTES_MAX } from '@fahybrid/shared/schema/program-templates';
import { patternForBlock } from '@/lib/dashboard/v2/archetypes';
import { isStrengthModality } from '@/lib/dashboard/v2/editor-axes';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import { NoteField } from './fields';
import { fetchTextSuggestions } from './ai-text-suggest';
import { PrescriptionFields } from './PrescriptionFields';
import { ArchetypeBlockForm } from './ArchetypeBlockForm';
import { AthleteSeesBar } from './AthletePreviewLine';
import {
  CompositorHeader,
  exerciseFixedModality,
  QuickDoseLine,
} from './compositor-chrome';
import { ExercisePickerField } from './ExercisePickerField';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';

const EMPTY_PRESCRIPTION: Prescription = { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 8 } }] };

export function BlockEditor({
  block,
  athleteName,
  onChange,
  onDuplicate,
  onSave,
  onAddItem,
  proposedPaths,
  showOptionalToggle,
}: {
  block: EditorBlock;
  athleteName?: string;
  onChange: (next: EditorBlock) => void;
  onDuplicate?: () => void;
  onSave?: () => void;
  onAddItem?: () => void;
  /**
   * Por línea, las rutas de su prescripción cuyo valor puso el IMPORTADOR y no el
   * coach. La pasa solo la revisión de una importación: sin ella este editor se
   * comporta exactamente como siempre y no sabe que existen las importaciones.
   */
  proposedPaths?: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Ver CompositorHeader — solo el day editor lo pasa (fase 2). */
  showOptionalToggle?: boolean;
}) {
  const [activeItemUid, setActiveItemUid] = useState<string | null>(
    block.items[0]?.uid ?? null,
  );
  const activeItem =
    block.items.find((it) => it.uid === activeItemUid) ?? block.items[0] ?? null;

  // The archetype-first tailored form is the DEFAULT when the block resolves to a
  // pattern (explicit archetype_id or a known format). Only legacy/unknown blocks
  // with items fall back to the per-item axes editor.
  const pattern = patternForBlock(block.archetype_id, block.format);
  const hasArchetypeForm = block.items.length > 0 && pattern !== null;

  const undosed = undosedLines(block);

  // Una propuesta se marca EN SU CAMPO solo si ese campo se está pintando: el
  // compositor de fuerza de la línea ACTIVA. Las demás (otra pestaña, una
  // línea de cardio cuyo descanso se edita a nivel de bloque, un formulario de
  // arquetipo) no tienen dónde, y esas las dice la tira. Ninguna se calla.
  const stripLines = (block.items ?? [])
    .map((it) => {
      const labels = proposedPaths?.get(it.uid);
      if (!labels || labels.size === 0) return null;
      const markedInline =
        !hasArchetypeForm &&
        it.uid === activeItem?.uid &&
        isStrengthModality(it.prescription.modality);
      return markedInline
        ? null
        : { uid: it.uid, name: it.exercise_name, labels: [...labels.values()] };
    })
    .filter((l): l is { uid: string; name: string; labels: string[] } => l !== null);

  const updateItem = (uid: string, patch: Partial<EditorItem>) => {
    onChange({
      ...block,
      items: block.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    });
  };

  const setItemPrescription = (uid: string, prescription: Prescription) =>
    updateItem(uid, { prescription });

  // La quickline vive donde hay UN ejercicio de fuerza al que aplicar la dosis:
  // el patrón de fuerza (sets_table) o la línea activa de la vía legacy. En una
  // superserie o un circuito no está claro a qué ejercicio iría, así que no se
  // enseña (los controles por ejercicio ya están delante).
  const quickTarget: EditorItem | null =
    pattern === 'sets_table'
      ? block.items[0] ?? null
      : !hasArchetypeForm && activeItem && isStrengthModality(activeItem.prescription.modality)
        ? activeItem
        : null;

  const applyQuickDose = (item: EditorItem, parsed: Prescription) => {
    const next: Prescription = {
      ...item.prescription,
      scheme: item.prescription.scheme === 'superset' ? 'superset' : 'sets',
      sets: (parsed.sets ?? []).map((s) => ({ ...s })),
    };
    setItemPrescription(item.uid, next);
  };

  return (
    <div className="flex min-h-full flex-col gap-4">
      <CompositorHeader
        block={block}
        onChange={onChange}
        onDuplicate={onDuplicate}
        showOptionalToggle={showOptionalToggle}
      />

      {/* QUÉ falta, encima del formulario que lo arregla. Va AQUÍ y no dentro de
          ArchetypeBlockForm porque este componente pinta DOS vías (la de arquetipo
          y la legacy por-item): puesto dentro de una, la otra se quedaba sin marcar
          — y los bloques importados del coach caen en la legacy más de lo que
          parece (un `plyometric` no resuelve a arquetipo). Desaparece solo en
          cuanto entra la dosis. */}
      {undosed.length > 0 ? <UndosedNotice lines={undosed} /> : null}

      {/* Lo propuesto por el importador se marca EN SU CAMPO cuando ese campo
          existe, que es el compositor de fuerza. Un formulario de arquetipo
          o una línea de cardio no tienen dónde: su descanso se edita a nivel de
          bloque y el importador nunca toca ese. Ahí lo dice esta tira, para que
          ninguna de las dos vías se calle una propuesta. */}
      {stripLines.length > 0 ? <ProposedStrip lines={stripLines} /> : null}

      {quickTarget ? (
        <QuickDoseLine
          exerciseName={quickTarget.exercise_name}
          onApply={(parsed) => applyQuickDose(quickTarget, parsed)}
        />
      ) : null}

      {/* DEFAULT — the archetype-first tailored form (the simple input). It owns
          the exercise name, the type-specific fields AND the "Ajuste avanzado"
          hatch (the full axes, reused). */}
      {hasArchetypeForm ? (
        <ArchetypeBlockForm block={block} onChange={onChange} />
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
                    ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent-text)]'
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
                proposedPaths={proposedPaths?.get(activeItem.uid)}
                lockedModality={exerciseFixedModality(activeItem)}
                onChange={(p) => setItemPrescription(activeItem.uid, p)}
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

      {/* La nota de cada línea, donde se pone su dosis: el ajuste de HOY para ese
          ejercicio. Va aquí y no dentro de cada formulario de arquetipo porque es
          del ITEM, no de la prescripción — así hay UN solo sitio donde escribirla
          y las dos vías del compositor (arquetipo y legacy) la tienen igual. */}
      {block.items.length > 0 ? (
        <LineNotes
          items={block.items}
          blockTitle={block.title}
          onChangeNote={(uid, notes) => updateItem(uid, { notes })}
        />
      ) : null}

      {/* La barra fija del pie: «El atleta ve» en vivo + Guardar bloque. */}
      <AthleteSeesBar block={block} athleteName={athleteName} onSave={onSave} />
    </div>
  );
}

/**
 * La NOTA por línea prescrita — texto libre que el atleta lee al abrir ESE
 * ejercicio en su móvil. Es el ajuste del día («baja la carga, vienes de la
 * tirada del domingo»), NO la descripción ni las claves permanentes del
 * ejercicio: eso se escribe una vez en la Biblioteca y vale para siempre. La
 * pista bajo el campo lo dice, para que el coach no confunda las dos.
 *
 * Con una sola línea (casi todo el material del coach) el campo se titula solo y
 * no hace falta encabezar la sección: el ejercicio es el que tiene delante. Con
 * varias, la sección se encabeza una vez y cada campo lleva SU ejercicio.
 */
const LINE_NOTE_HINT =
  'Es solo para este día. Lo que vale siempre va en la ficha del ejercicio de tu biblioteca.';

function LineNotes({
  items,
  blockTitle,
  onChangeNote,
}: {
  items: EditorItem[];
  /** Sitúa el ejercicio dentro del entreno cuando se piden borradores. */
  blockTitle: string;
  onChangeNote: (uid: string, notes: string) => void;
}) {
  const single = items.length === 1;
  // El contexto de esta ayuda es LA LÍNEA, no la sesión: ese ejercicio y SU
  // dosis. Pedir borradores de «baja la carga» con el entreno entero delante
  // devolvería consejos del entreno, no del movimiento que se está dosificando.
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
          <span className="v2-micro block">Notas para el atleta</span>
          <p className="text-label leading-relaxed text-[color:var(--v2-faint)]">
            Las ve al abrir cada ejercicio en el móvil. {LINE_NOTE_HINT}
          </p>
        </div>
      )}
      {items.map((it) => (
        <NoteField
          key={it.uid}
          id={`item-note-${it.uid}`}
          label={
            single
              ? 'Nota para el atleta'
              : it.exercise_name || 'Nota de la línea sin ejercicio'
          }
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

/**
 * Lo que puso el importador en líneas cuyo campo NO se está pintando: otra
 * pestaña, una línea de cardio (su descanso se edita a nivel de bloque) o un
 * formulario de arquetipo. Mismo lenguaje que la marca del campo — trazo
 * discontinuo ámbar — para que se lean como lo mismo, que lo son.
 */
function ProposedStrip({
  lines,
}: {
  lines: Array<{ uid: string; name: string; labels: string[] }>;
}) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line.uid} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-label font-semibold text-[color:var(--v2-fg)]">
            {line.name || 'Línea sin ejercicio'}
          </span>
          {line.labels.map((label) => (
            <span
              key={label}
              className="v2-num inline-flex items-center rounded-[var(--v2-r-xs)] border border-dashed border-[color:var(--v2-warn)] px-2 py-0.5 text-nano text-[color:var(--v2-warn)]"
            >
              {label} · propuesto
            </span>
          ))}
        </li>
      ))}
    </ul>
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
