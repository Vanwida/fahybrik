'use client';

// ExerciseCreateForm — el "crear ejercicio" de dentro del ExercisePicker: el coach
// está montando una sesión, no encuentra el movimiento, y lo crea sin salir de aquí.
// Sale de ExercisePicker.tsx (ya por encima del tope de 500 líneas del repo) al ganar
// el campo de modalidad, y aterriza junto a su hermano ExerciseEditForm.tsx.
//
// LA MODALIDAD SE DECLARA, NO SE ADIVINA. Antes la derivaba el servidor del nombre
// con regex en inglés (`like '%row%'`), así que un "Remo 500m" entraba como `other` y
// las analíticas que enrutan por modalidad se rompían EN SILENCIO — nadie se enteraba
// hasta mirar un gráfico vacío. Ahora `createExerciseSchema` la exige.
//
// Se PRE-SELECCIONA una sugerencia (`suggestModality`, sacada del nombre y la
// categoría) porque en mitad de una sesión nadie quiere un desplegable más — pero se
// enseña marcada como sugerencia y a un clic de cambiarla. Quien acaba de escribir el
// movimiento sabe lo que es; la diferencia con la regla vieja no es acertar más, es
// que ahora se VE.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import { MODALITY_OPTIONS, resolveModality } from '@/lib/dashboard/exercises/catalog-ui';
import {
  CATEGORY_OPTIONS,
  FilterChip,
  YouTubeField,
  extractApiErrorMessage,
  toCatalogRow,
  videoFieldState,
  type ApiExercise,
  type CatalogRow,
} from './exercise-catalog';

export function CreateExerciseForm({
  seedName,
  defaultCategory,
  onCancel,
  onCreated,
}: {
  seedName: string;
  defaultCategory: ExerciseCategory;
  onCancel: () => void;
  onCreated: (ex: CatalogRow) => void;
}) {
  const [name, setName] = useState(seedName);
  const [category, setCategory] = useState<ExerciseCategory>(defaultCategory);
  // null = el coach aún no ha elegido. Es lo que deja a la sugerencia seguir el
  // nombre mientras lo escribe y lo que la calla en cuanto elige — sin esto, teclear
  // "Remo con barra" después de marcar Fuerza devolvería el campo a Remo solo.
  const [modality, setModality] = useState<Modality | null>(null);
  const [video, setVideo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoState = videoFieldState(video);
  const canSave = name.trim().length > 0 && videoState !== 'invalid' && !saving;
  // Siempre hay valor, así que el campo requerido nunca apaga el botón sin decir por
  // qué: el trabajo del coach es mirar la modalidad, no rellenarla.
  const { value: modalityValue, suggested: modalitySuggested } = resolveModality(
    modality,
    name,
    category,
  );

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          modality: modalityValue,
          ...(video.trim() ? { video_url: video.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(
          (await extractApiErrorMessage(res)) ?? 'No se pudo crear el ejercicio. Reintenta.',
        );
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { exercise: ApiExercise };
      onCreated(toCatalogRow(data.exercise));
    } catch {
      setError('No se pudo crear el ejercicio. Reintenta.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 overflow-y-auto p-5">
      <label className="block space-y-1.5">
        <span className="v2-micro">Nombre</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={120}
          placeholder="p. ej. Zancada búlgara con mancuerna"
          aria-label="Nombre del ejercicio"
          className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-accent)]"
        />
      </label>

      <ChipField
        label="Tipo"
        aside="(de qué movimiento es)"
        hint="Cómo se ordena y se busca en tu catálogo."
      >
        {CATEGORY_OPTIONS.map((c) => (
          <FilterChip
            key={c.value}
            label={c.label}
            active={category === c.value}
            onClick={() => setCategory(c.value)}
          />
        ))}
      </ChipField>

      <ChipField
        label="Modalidad"
        suggested={modalitySuggested}
        hint={
          modalitySuggested
            ? 'La hemos deducido del nombre. Compruébala: es con lo que se compara en las analíticas.'
            : 'Con lo que se compara y cómo cuenta en las analíticas.'
        }
      >
        {MODALITY_OPTIONS.map((m) => (
          <FilterChip
            key={m.value}
            label={m.label}
            active={modalityValue === m.value}
            onClick={() => setModality(m.value)}
          />
        ))}
      </ChipField>

      <YouTubeField value={video} onChange={setVideo} state={videoState} />

      <div className="flex items-start gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5">
        <MIcon name="info" size={15} className="mt-px shrink-0 text-[color:var(--v2-accent)]" />
        <p className="text-xs leading-snug text-[color:var(--v2-fg)]">
          Se añade a tu catálogo y queda disponible para cualquier sesión. Será tuyo — sólo tú lo
          verás.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-xs text-[color:var(--v2-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-[color:var(--v2-border)] pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
        >
          <MIcon name={saving ? 'progress_activity' : 'add'} size={16} />
          {saving ? 'Creando…' : 'Crear y usar'}
        </button>
      </div>
    </div>
  );
}

/**
 * Un grupo de chips de elección única, con su etiqueta y su pista. `role="group"` +
 * `aria-label`: son botones sueltos con `aria-pressed`, así que sin la agrupación un
 * lector de pantalla los leería como nueve botones sin decir de qué campo son.
 *
 * "Sugerida" sólo aparece mientras el valor lo hayamos puesto nosotros: es lo que
 * convierte una adivinanza en una propuesta y lo que le dice al coach que ese campo
 * es suyo de mirar.
 */
function ChipField({
  label,
  aside,
  suggested = false,
  hint,
  children,
}: {
  label: string;
  aside?: string;
  suggested?: boolean;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="v2-micro flex items-center gap-1.5">
        {label}
        {aside ? <span className="text-[color:var(--v2-faint)]">{aside}</span> : null}
        {suggested ? (
          <span className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-info-soft)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-info)]">
            <MIcon name="lightbulb" size={11} />
            Sugerida
          </span>
        ) : null}
      </span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {children}
      </div>
      <p className="text-label text-[color:var(--v2-faint)]">{hint}</p>
    </div>
  );
}
