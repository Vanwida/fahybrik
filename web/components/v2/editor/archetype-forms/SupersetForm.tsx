'use client';

// SupersetForm — el patrón SUPERSERIE. Un bloque `superset` ALTERNA sus ejercicios
// (A1 → A2 → A1 → A2) en vez de correrlos en series rectas, y esa rotación es lo
// ÚNICO que lo separa de un bloque de fuerza (docs/DECISIONS.md 2026-08-05). Así
// que aquí no se inventa nada nuevo: se reutiliza la MISMA tabla de series por
// ejercicio (SetsTableForm) y se añaden solo las dos cosas que la superserie sí
// tiene y la fuerza no:
//   · más de un ejercicio en el bloque, en el orden en que se alternan;
//   · UN descanso, el de la vuelta, en vez de uno por serie.
//
// POR QUÉ EL DESCANSO VIVE ARRIBA: encadenar las series sin parar es justo lo que
// define una superserie, así que un descanso por serie contradiría el formato. El
// único que existe es el de después de cerrar la vuelta, y por eso se edita una
// sola vez y se guarda en todos los items del bloque (el mismo criterio que
// ComponentsForm usa con los campos de bloque: la forma persistida queda coherente
// mire quien mire).
//
// La tira de arriba enseña la rotación con los nombres reales de los ejercicios,
// para que la diferencia con un bloque de fuerza se vea sin leer nada.

import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { getArchetype, seedArchetype } from '@/lib/dashboard/v2/archetypes';
import { defaultCategoryForModality } from '@/lib/dashboard/v2/pick-exercise';
import { MIcon } from '@/components/ui/MIcon';
import { ExercisePickerField } from '../ExercisePickerField';
import { RestChips, STRENGTH_REST_VALUES } from '../dose-controls';
import { SetsTableForm } from './SetsTableForm';
import { Field } from './form-controls';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button, IconButton } from '@/components/v2/ui';

/** Dos es el mínimo que hace que algo sea una superserie. */
const MIN_EXERCISES = 2;
/** Por encima de cuatro ya no es una superserie: es un circuito, y tiene su propio
 *  tipo de bloque con su reloj. */
const MAX_EXERCISES = 4;

/** El tono del bloque sale del propio arquetipo, no de un color suelto. */
const TONE = getArchetype('superset').modalitySlug;

/** La letra con la que el coach escribe una superserie: A1, A2, A3. */
function letterFor(index: number): string {
  return `A${index + 1}`;
}

export function SupersetForm({
  block,
  onChange,
}: {
  block: EditorBlock;
  onChange: (next: EditorBlock) => void;
}) {
  const items = block.items;
  // El descanso de la vuelta es del BLOQUE: se lee del primero y se escribe en
  // todos, así ningún item queda con un valor distinto al de al lado.
  const restS = items[0]?.prescription.rest_s ?? null;

  const applyRest = (seconds: number | null) =>
    onChange({
      ...block,
      items: items.map((it) => {
        const prescription = { ...it.prescription, scheme: 'superset' as const };
        if (seconds == null) delete prescription.rest_s;
        else prescription.rest_s = seconds;
        return { ...it, prescription };
      }),
    });

  const updateItem = (uid: string, patch: Partial<EditorItem>) =>
    onChange({
      ...block,
      items: items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    });

  const addExercise = () => {
    if (items.length >= MAX_EXERCISES) return;
    const prescription = seedArchetype('superset');
    // El nuevo entra con el descanso de vuelta que ya tenga el bloque.
    if (restS == null) delete prescription.rest_s;
    else prescription.rest_s = restS;
    const next: EditorItem = {
      uid: `sup-${Date.now()}`,
      exercise_id: null,
      exercise_name: '',
      prescription,
    };
    onChange({ ...block, items: [...items, next] });
  };

  const removeExercise = (uid: string) => {
    if (items.length <= MIN_EXERCISES) return;
    onChange({ ...block, items: items.filter((it) => it.uid !== uid) });
  };

  const moveExercise = (uid: string, dir: -1 | 1) => {
    const idx = items.findIndex((it) => it.uid === uid);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = items.slice();
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    onChange({ ...block, items: next });
  };

  return (
    <div className="space-y-4">
      <RotationStrip items={items} />

      <Field label="Descanso entre vueltas" hint="al terminar una serie de cada ejercicio">
        {/* Chips frecuentes + «—» honesto (sin descanso marcado) + «otro» de teclado. */}
        <RestChips
          seconds={restS}
          values={STRENGTH_REST_VALUES}
          allowNone
          ariaLabel="Descanso entre vueltas"
          onChange={(s) => applyRest(s)}
        />
      </Field>

      <div className="space-y-2.5">
        {items.map((it, i) => (
          <ExerciseCard
            key={it.uid}
            item={it}
            index={i}
            count={items.length}
            onChange={(patch) => updateItem(it.uid, patch)}
            onRemove={items.length > MIN_EXERCISES ? () => removeExercise(it.uid) : undefined}
            onMove={(dir) => moveExercise(it.uid, dir)}
          />
        ))}
      </div>

      {items.length < MAX_EXERCISES ? (
        <Button size="sm" icon={Plus} onClick={addExercise} className="self-start">
          Añadir ejercicio
        </Button>
      ) : (
        <p className="t-body-sm text-v2-muted">
          Con más de {MAX_EXERCISES} ejercicios ya es un circuito. Cambia el tipo de bloque.
        </p>
      )}
    </div>
  );
}

/** La rotación, con los nombres reales: A1 va a A2, y al cerrar se vuelve a A1. */
function RotationStrip({ items }: { items: EditorItem[] }) {
  return (
    <div className="rounded-panel border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <span className="t-meta text-v2-muted">Cómo se ejecuta</span>
      <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {items.map((it, i) => (
          <li key={it.uid} className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-ctl px-2 py-1"
              style={{ background: `var(--v2-mod-${TONE}-soft)` }}
            >
              <span
                className="t-tnum t-meta font-semibold"
                style={{ color: `var(--v2-mod-${TONE})` }}
              >
                {letterFor(i)}
              </span>
              <span className="text-xs font-semibold text-[color:var(--v2-fg)]">
                {it.exercise_name || 'Sin elegir'}
              </span>
            </span>
            {i < items.length - 1 ? (
              <MIcon
                name="arrow_forward"
                size={14}
                className="text-[color:var(--v2-faint)]"
              />
            ) : null}
          </li>
        ))}
        <li className="flex items-center gap-1 text-xs font-semibold text-[color:var(--v2-muted)]">
          <MIcon name="replay" size={14} />
          vuelta a empezar
        </li>
      </ol>
      <p className="mt-2 text-xs leading-snug text-[color:var(--v2-muted)]">
        Una serie de cada ejercicio, encadenadas y sin parar. Al cerrar la vuelta descansas y
        vuelves a empezar.
      </p>
    </div>
  );
}

/** Un ejercicio de la superserie: su letra, su ejercicio y su tabla de series. */
function ExerciseCard({
  item,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  item: EditorItem;
  index: number;
  count: number;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove?: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const letter = letterFor(index);

  return (
    <div className="space-y-3 rounded-panel border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="t-tnum inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl text-xs font-semibold"
          style={{
            background: `var(--v2-mod-${TONE}-soft)`,
            color: `var(--v2-mod-${TONE})`,
          }}
        >
          {letter}
        </span>
        <div className="min-w-0 flex-1">
          <ExercisePickerField
            item={item}
            destinationLabel={`Ejercicio ${letter}`}
            defaultCategory={defaultCategoryForModality(item.prescription.modality)}
            onChange={onChange}
            compact
          />
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton icon={ChevronUp} size="sm" label={`Subir el ejercicio ${letter}`} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton
            icon={ChevronDown}
            size="sm"
            label={`Bajar el ejercicio ${letter}`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          />
          {onRemove ? (
            <IconButton icon={X} size="sm" label={`Quitar el ejercicio ${letter}`} onClick={onRemove} className="hover:text-v2-danger" />
          ) : null}
        </div>
      </div>

      {/* La misma tabla que la fuerza, sin la columna de descanso: en una
          superserie el descanso es el de la vuelta, y vive arriba una sola vez. */}
      <SetsTableForm
        value={item.prescription}
        onChange={(prescription) => onChange({ prescription })}
        scheme="superset"
        showRest={false}
      />
    </div>
  );
}
