'use client';

// Los campos del editor de ejercicio + el vocabulario visual del formulario.
// Viven aparte de `EjercicioEditor` sólo por tamaño: allí queda la lógica (qué se
// manda y por las reglas de qué origen), aquí la forma de cada campo.
//
// Las dos piezas que llevan el modelo encima son `OverrideField` (heredar / forkear
// / restaurar) y `SharedIdentity` (lo que no se toca y por qué).

import { useId, type ReactNode } from 'react';
import { Lock, Plus, Undo2 } from 'lucide-react';
import { Button, Input, Select, StatusBadge, Textarea } from '@/components/v2/ui';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import {
  EXERCISE_CATEGORY_OPTIONS,
  MODALITY_LABELS,
  MODALITY_OPTIONS,
  equipmentLabel,
  muscleLabel,
} from '@/lib/dashboard/exercises/catalog-ui';
import { EXERCISE_CATEGORY_LABELS } from '@/lib/dashboard/exercises/filter-chips';

// Los topes del servidor (create/updateExerciseSchema). Se repiten en cliente para
// que el coach vea el error ANTES de mandar, no después.
export const MAX_NAME = 120;
export const MAX_TEXT = 2000;

/**
 * Etiqueta + control + línea de ayuda del formulario de ejercicio. `aside` va a la
 * derecha de la etiqueta (Restaurar, «Sugerida»). El control recibe el id.
 */
export function FormRow({
  id,
  label,
  aside,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <label htmlFor={id} className="t-meta text-v2-muted">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-err`} className="t-meta text-v2-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="t-meta text-v2-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Texto separado por comas ↔ array (músculos / material). */
export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/** "Restaurar" — vaciar el campo = borrar el override = volver a heredar. */
export function RestoreButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" icon={Undo2} onClick={onClick} className="-my-1">
      Restaurar
    </Button>
  );
}

/**
 * Un campo de texto que puede HEREDAR. En un Base el valor es el override CRUDO
 * (vacío = heredando), el placeholder es lo que trae la base, y "Restaurar" lo
 * vacía → el servidor borra el override → se vuelve a heredar.
 */
export function OverrideField({
  id,
  label,
  value,
  onChange,
  baseValue,
  inherits,
  rows,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  baseValue: string | null;
  /** true = es un ejercicio de la base, así que vaciar significa heredar. */
  inherits: boolean;
  rows: number;
  placeholder: string;
}) {
  const overriding = inherits && value.trim() !== '';
  // La promesa de herencia sólo se hace si HAY algo que heredar: en un Base sin
  // claves, "vacío = usas lo de la base" no significaría nada.
  const hint =
    overriding && baseValue ? (
      <>
        En la base: <span className="text-v2-muted">“{baseValue}”</span>
      </>
    ) : inherits && baseValue ? (
      'Vacío = usas lo de la base.'
    ) : null;
  return (
    <FormRow id={id} label={label} aside={overriding ? <RestoreButton onClick={() => onChange('')} /> : null} hint={hint}>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={MAX_TEXT}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inherits && baseValue ? baseValue : placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
    </FormRow>
  );
}

/**
 * La identidad de un ejercicio BASE: se ENSEÑA y no se toca. Esconderla dejaría al
 * coach sin entender por qué su ejercicio propio sí se edita entero; enseñarla
 * apagada y sin explicar sería peor. La salida (crear uno propio) es un botón — la
 * misma que nombra el 409 del servidor, pero que se puede pulsar.
 */
export function SharedIdentity({
  ex,
  onCreateOwn,
}: {
  ex: CoachExerciseRow;
  onCreateOwn: () => void;
}) {
  // Traducido, como en la fila: aquí sólo se LEE. (En un ejercicio propio estos
  // mismos campos se editan en crudo — ahí el texto vuelve a la base tal cual, así
  // que traducirlo lo corrompería.)
  // La MODALIDAD va aquí y no entre los campos editables: en un Base es identidad
  // compartida igual que la categoría (el PATCH la responde con 409 `shared_identity`,
  // que la nombra). Enseñarla es lo que hace entendible el 409 — y esconderla dejaría
  // al coach sin ver con qué se compara su ejercicio en las analíticas.
  const facts: Array<[string, string]> = [
    ['Categoría', EXERCISE_CATEGORY_LABELS[ex.category]],
    ['Modalidad', MODALITY_LABELS[ex.modality]],
    ['Músculos', ex.primary_muscle_groups.map(muscleLabel).join(', ') || '—'],
    ['Material', ex.equipment.map(equipmentLabel).join(', ') || '—'],
  ];
  return (
    <div className="rounded-panel bg-v2-surface-2 p-3">
      <p className="flex items-center gap-1.5 t-label text-v2-faint">
        <Lock aria-hidden strokeWidth={2} className="size-3" />
        Esto define el movimiento
      </p>
      <dl className="mt-2 flex flex-col gap-1">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-2 t-body-sm">
            <dt className="w-20 shrink-0 text-v2-faint">{k}</dt>
            <dd className="min-w-0 flex-1 text-v2-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 t-body-sm text-v2-muted">
        Es igual para todos: la app cuenta con ello para las analíticas y para adaptar el entreno.
      </p>
      <Button size="sm" icon={Plus} onClick={onCreateOwn} className="mt-2">
        Crear un ejercicio propio
      </Button>
    </div>
  );
}

/**
 * "Sugerida" — la etiqueta que convierte una adivinanza en una propuesta. Va pegada
 * al label y desaparece en cuanto el coach elige: mientras esté, dice que ese valor
 * lo pusimos nosotros y que mirarlo es su trabajo.
 */
function SuggestedTag() {
  return <StatusBadge tone="info" size="sm" label="Sugerida" />;
}

/** La identidad de un ejercicio del coach: suya entera, así que se edita. */
export function OwnIdentity({
  creating,
  category,
  onCategory,
  modality,
  onModality,
  modalitySuggested,
  muscles,
  onMuscles,
  equipment,
  onEquipment,
}: {
  creating: boolean;
  category: ExerciseCategory;
  onCategory: (c: ExerciseCategory) => void;
  modality: Modality;
  onModality: (m: Modality) => void;
  /** true = el valor lo pusimos nosotros y el coach aún no lo ha tocado. */
  modalitySuggested: boolean;
  muscles: string;
  onMuscles: (v: string) => void;
  equipment: string;
  onEquipment: (v: string) => void;
}) {
  const uid = useId();
  const catId = `${uid}-cat`;
  const modId = `${uid}-mod`;
  return (
    <div className="flex flex-col gap-4">
      <FormRow id={catId} label="Categoría" hint="Cómo se ordena y se busca en tu catálogo.">
        <Select
          id={catId}
          size="lg"
          options={EXERCISE_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={category}
          onValueChange={onCategory}
          className="w-full"
        />
      </FormRow>

      {/* La MODALIDAD se declara, no se adivina. Antes salía del nombre con regex en
          inglés, así que un "Remo 500m" entraba como `other` y las analíticas que
          enrutan por modalidad se rompían sin decir nada. Se pre-selecciona una
          sugerencia — pero se ve, y quien acaba de escribir el movimiento sabe lo que
          es. Ver `suggestModality` y create-exercise.ts. */}
      <FormRow
        id={modId}
        label="Modalidad"
        aside={modalitySuggested ? <SuggestedTag /> : null}
        hint={
          modalitySuggested
            ? 'Deducida del nombre y la categoría. Compruébala: es con lo que se compara en las analíticas.'
            : 'Con qué se compara y cómo cuenta en las analíticas.'
        }
      >
        <Select
          id={modId}
          size="lg"
          options={MODALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={modality}
          onValueChange={onModality}
          className="w-full"
        />
      </FormRow>

      {/* Al CREAR sólo se pide lo imprescindible: la API de crear sólo acepta
          nombre + categoría + modalidad + vídeo. Músculos y material se editan
          después, ya con la fila creada. */}
      {creating ? null : (
        <>
          <FormRow id="ej-muscles" label="Músculos" hint="Sepáralos con comas.">
            <Input
              id="ej-muscles"
              size="lg"
              value={muscles}
              onChange={(e) => onMuscles(e.target.value)}
              placeholder="cuádriceps, glúteo"
              aria-describedby="ej-muscles-hint"
            />
          </FormRow>
          <FormRow id="ej-equip" label="Material" hint="Sepáralos con comas.">
            <Input
              id="ej-equip"
              size="lg"
              value={equipment}
              onChange={(e) => onEquipment(e.target.value)}
              placeholder="barra, banco"
              aria-describedby="ej-equip-hint"
            />
          </FormRow>
        </>
      )}
    </div>
  );
}
