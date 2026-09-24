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
import { Plus } from 'lucide-react';
import { Button, Input, StatusBadge } from '@/components/v2/ui';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import { MODALITY_OPTIONS, resolveModality } from '@/lib/dashboard/exercises/catalog-ui';
import { VideoUrlField, videoUrlDraftInvalid } from '@/components/media/VideoUrlField';
import {
  CATEGORY_OPTIONS,
  extractApiErrorMessage,
  toCatalogRow,
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
  // Crear a media subida crearía el ejercicio sin el vídeo que se está subiendo, y
  // sin decir nada. El campo avisa; aquí se apaga el botón.
  const [videoUploading, setVideoUploading] = useState(false);

  const videoInvalid = videoUrlDraftInvalid(video);
  const canSave = name.trim().length > 0 && !videoInvalid && !videoUploading && !saving;
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
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="t-meta text-v2-muted">Nombre</span>
        <Input
          type="text"
          size="lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={120}
          placeholder="p. ej. Zancada búlgara con mancuerna"
          aria-label="Nombre del ejercicio"
        />
      </label>

      <ChipField label="Tipo" aside="de qué movimiento es" hint="Cómo se ordena y se busca en tu catálogo.">
        <ChipGroup
          mono={false}
          ariaLabel="Tipo"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={setCategory}
        />
      </ChipField>

      <ChipField
        label="Modalidad"
        suggested={modalitySuggested}
        hint={
          modalitySuggested
            ? 'Deducida del nombre. Compruébala: es con lo que se compara en las analíticas.'
            : 'Con lo que se compara y cómo cuenta en las analíticas.'
        }
      >
        <ChipGroup
          mono={false}
          ariaLabel="Modalidad"
          options={MODALITY_OPTIONS}
          value={modalityValue}
          onChange={setModality}
        />
      </ChipField>

      {/* Sin `exerciseId`: el ejercicio todavía no existe. La subida se firma igual
          (la carpeta sale de la sesión del coach) y el localizador viaja con el POST. */}
      <VideoUrlField
        id="nuevo-ej-video"
        label="Vídeo (opcional)"
        value={video}
        onChange={setVideo}
        onUploadingChange={setVideoUploading}
      />

      <p className="t-body-sm text-v2-muted">Se añade a tu catálogo y será solo tuyo.</p>

      {error ? (
        <p role="alert" className="t-body-sm text-v2-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-v2-border pt-3">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={Plus} loading={saving} disabled={!canSave} onClick={submit}>
          {saving ? 'Creando…' : 'Crear y usar'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Un grupo de elección única con su etiqueta y su pista. "Sugerida" sólo aparece
 * mientras el valor lo hayamos puesto nosotros: es lo que convierte una adivinanza
 * en una propuesta y lo que le dice al coach que ese campo es suyo de mirar.
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
      <span className="flex items-center gap-2 t-meta text-v2-muted">
        {label}
        {aside ? <span className="font-normal text-v2-faint">({aside})</span> : null}
        {suggested ? <StatusBadge size="sm" tone="info" label="Sugerida" /> : null}
      </span>
      {children}
      <p className="t-meta text-v2-faint">{hint}</p>
    </div>
  );
}
