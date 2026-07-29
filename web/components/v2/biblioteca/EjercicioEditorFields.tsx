'use client';

// Los campos del editor de ejercicio + el vocabulario visual del formulario.
// Viven aparte de `EjercicioEditor` sólo por tamaño: allí queda la lógica (qué se
// manda y por las reglas de qué origen), aquí la forma de cada campo.
//
// Las dos piezas que llevan el modelo encima son `OverrideField` (heredar / forkear
// / restaurar) y `SharedIdentity` (lo que no se toca y por qué).

import { MIcon } from '@/components/ui/MIcon';
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
import { cn } from '@/lib/utils';

// Los topes del servidor (create/updateExerciseSchema). Se repiten en cliente para
// que el coach vea el error ANTES de mandar, no después.
export const MAX_NAME = 120;
export const MAX_TEXT = 2000;

export const inputCls =
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2.5 py-2 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]';
export const labelCls =
  'mb-1 flex items-center justify-between gap-2 text-label font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]';
export const hintCls = 'mt-1 text-label leading-relaxed text-[color:var(--v2-faint)]';

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
    <button
      type="button"
      onClick={onClick}
      className="v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-xs)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
    >
      <MIcon name="undo" size={12} />
      Restaurar
    </button>
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
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        <span>{label}</span>
        {overriding ? <RestoreButton onClick={() => onChange('')} /> : null}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={MAX_TEXT}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inherits && baseValue ? baseValue : placeholder}
        className={cn(inputCls, 'resize-y leading-relaxed')}
      />
      {/* La promesa de herencia sólo se hace si HAY algo que heredar: en un Base
          sin claves, "vacío = usas lo de la base" no significaría nada. */}
      {overriding && baseValue ? (
        <p className={hintCls}>
          En la base: <span className="text-[color:var(--v2-muted)]">“{baseValue}”</span>
        </p>
      ) : inherits && baseValue ? (
        <p className={hintCls}>Vacío = usas lo de la base.</p>
      ) : null}
    </div>
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
    <div className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <p className="flex items-center gap-1.5 text-label font-semibold uppercase tracking-[0.08em] text-[color:var(--v2-muted)]">
        <MIcon name="lock" size={13} />
        Esto define el movimiento
      </p>
      <dl className="mt-2 flex flex-col gap-1.5">
        {facts.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-xs">
            <dt className="w-[72px] shrink-0 text-[color:var(--v2-faint)]">{k}</dt>
            <dd className="min-w-0 flex-1 text-[color:var(--v2-fg)]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-label leading-relaxed text-[color:var(--v2-muted)]">
        Es igual para todos y no se cambia: la app cuenta con ello para las analíticas y para
        adaptar el entreno. ¿Necesitas otro movimiento?
      </p>
      <button
        type="button"
        onClick={onCreateOwn}
        className="v2-focus mt-2 inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:bg-[color:var(--v2-elevated)]"
      >
        <MIcon name="add" size={14} />
        Crear un ejercicio propio
      </button>
    </div>
  );
}

/**
 * "Sugerida" — la etiqueta que convierte una adivinanza en una propuesta. Va pegada
 * al label y desaparece en cuanto el coach elige: mientras esté, dice que ese valor
 * lo pusimos nosotros y que mirarlo es su trabajo.
 */
function SuggestedTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-info-soft)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-info)]">
      <MIcon name="lightbulb" size={11} />
      Sugerida
    </span>
  );
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
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelCls} htmlFor="ej-cat">
          <span>Categoría</span>
        </label>
        <select
          id="ej-cat"
          value={category}
          onChange={(e) => onCategory(e.target.value as ExerciseCategory)}
          className={cn(inputCls, 'h-[38px] py-0')}
        >
          {EXERCISE_CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className={hintCls}>Cómo se ordena y se busca en tu catálogo.</p>
      </div>

      {/* La MODALIDAD se declara, no se adivina. Antes salía del nombre con regex en
          inglés, así que un "Remo 500m" entraba como `other` y las analíticas que
          enrutan por modalidad se rompían sin decir nada. Se pre-selecciona una
          sugerencia — pero se ve, y quien acaba de escribir el movimiento sabe lo que
          es. Ver `suggestModality` y create-exercise.ts. */}
      <div>
        <label className={labelCls} htmlFor="ej-mod">
          <span>Modalidad</span>
          {modalitySuggested ? <SuggestedTag /> : null}
        </label>
        <select
          id="ej-mod"
          value={modality}
          onChange={(e) => onModality(e.target.value as Modality)}
          className={cn(inputCls, 'h-[38px] py-0')}
          aria-describedby="ej-mod-hint"
        >
          {MODALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p id="ej-mod-hint" className={hintCls}>
          {modalitySuggested
            ? 'Lo hemos deducido del nombre y la categoría. Compruébalo: es con lo que se compara en las analíticas.'
            : 'Con qué se compara y cómo cuenta en las analíticas.'}
        </p>
      </div>

      {/* Al CREAR sólo se pide lo imprescindible: la API de crear sólo acepta
          nombre + categoría + modalidad + vídeo. Músculos y material se editan
          después, ya con la fila creada — pedirlos aquí sería pedir algo que no se
          puede guardar. */}
      {creating ? null : (
        <>
          <div>
            <label className={labelCls} htmlFor="ej-muscles">
              <span>Músculos</span>
            </label>
            <input
              id="ej-muscles"
              value={muscles}
              onChange={(e) => onMuscles(e.target.value)}
              placeholder="cuádriceps, glúteo"
              className={inputCls}
            />
            <p className={hintCls}>Sepáralos con comas.</p>
          </div>
          <div>
            <label className={labelCls} htmlFor="ej-equip">
              <span>Material</span>
            </label>
            <input
              id="ej-equip"
              value={equipment}
              onChange={(e) => onEquipment(e.target.value)}
              placeholder="barra, banco"
              className={inputCls}
            />
            <p className={hintCls}>Sepáralos con comas.</p>
          </div>
        </>
      )}
    </div>
  );
}
