'use client';

// ExerciseEditForm — the ✎ "editar ejercicio" sheet inside ExercisePicker. Split
// out of ExercisePicker.tsx (already over the repo's 500-line file cap) once this
// form grew a THIRD editable field (name, migration 0132) plus origin-aware
// prefill logic — a coherent standalone piece, not a line-count dodge.
//
// TWO DIFFERENT WRITE SEMANTICS hide behind one form, keyed off `exercise.origin`
// (see lib/exercises/coach-override.ts for the server-side rule this mirrors):
//
//   • origin 'base' | 'customized' — editing FORKS: each field prefills with the
//     coach's raw OVERRIDE (empty if none), the BASE value shows as a
//     placeholder, and an empty field on save CLEARS the override (falls back to
//     base). This is the override_* / base_* split on CatalogRow.
//
//   • origin 'own' — the coach's own row. There is NO override layer: for an own
//     exercise, override_* is null and base_* === the merged value BY
//     CONSTRUCTION (the API never creates an override row for a coach's own
//     exercise — coach-override.ts: "own → direct, base → override, never
//     both"). Prefilling from override_* here would show an EMPTY field
//     regardless of the exercise's actual content, and saving that empty field
//     would WIPE it (trim() → '' → the null-clearing transform, but applied to a
//     DIRECT row write, not an override that falls back to something). So 'own'
//     prefills from the CURRENT value instead — an empty field on save is then a
//     deliberate "clear this content", not an accidental one.
//
// `name` follows the SAME empty-clears convention as the other three fields
// (update-exercise.ts normalizes '' → null for all four forkable fields — the
// old asymmetry, where name alone couldn't be cleared, was the bug: a fork you
// can't undo is a trap). The two write paths read that null differently:
//   • base/customized — '' clears the coach's name override; the base name is
//     inherited again.
//   • own — there is no base to fall back to and exercises.name is NOT NULL, so
//     the writer REFUSES a null name with 400 `invalid_name`. Rather than let
//     the coach trigger that from the picker, `canSave` blocks submission when
//     origin is 'own' and the name field is empty (see the inline message
//     below, in the server's own words).

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Input, Textarea } from '@/components/v2/ui';
import { modalityColorSlug } from '@/lib/dashboard/v2/editor-axes';
import { VideoUrlField, videoUrlDraftInvalid } from '@/components/media/VideoUrlField';
import {
  CATEGORY_LABEL,
  ORIGIN_LABEL,
  extractApiErrorMessage,
  toCatalogRow,
  type ApiExercise,
  type CatalogRow,
} from './exercise-catalog';

export function EditExerciseForm({
  exercise,
  onCancel,
  onEdited,
}: {
  exercise: CatalogRow;
  onCancel: () => void;
  onEdited: (ex: CatalogRow) => void;
}) {
  const isOwn = exercise.origin === 'own';

  const [name, setName] = useState(isOwn ? exercise.name : (exercise.override_name ?? ''));
  const [cues, setCues] = useState(isOwn ? (exercise.cues ?? '') : (exercise.override_cues ?? ''));
  const [description, setDescription] = useState(
    isOwn ? (exercise.description ?? '') : (exercise.override_description ?? ''),
  );
  const [video, setVideo] = useState(
    isOwn ? (exercise.video_url ?? '') : (exercise.override_video_url ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guardar a media subida guardaría el vídeo ANTERIOR y tiraría el que se está
  // subiendo, sin decir nada. El campo avisa; aquí se apaga el botón.
  const [videoUploading, setVideoUploading] = useState(false);

  const videoInvalid = videoUrlDraftInvalid(video);
  // Own rows have no base to fall back to if name is blanked — required, like
  // the create form. Base/customized rows may leave name untouched (see header).
  const canSave = !videoInvalid && !videoUploading && !saving && (!isOwn || name.trim().length > 0);

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    // name is symmetric with the other three now (see file header) — always
    // sent trimmed, including '' to clear a base/customized name override. For
    // 'own', canSave already refuses to submit an empty name, so this is never
    // sent blank on that path.
    const body: Record<string, string> = {
      name: name.trim(),
      cues: cues.trim(),
      description: description.trim(),
      video_url: video.trim(),
    };

    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // This form only ever sends forkable fields, so the 409 shared_identity
        // refusal shouldn't fire here — but surface whatever the server says
        // rather than a canned line that could misdescribe a real refusal.
        setError((await extractApiErrorMessage(res)) ?? 'No se pudo guardar. Reintenta.');
        setSaving(false);
        return;
      }
      const data = (await res.json()) as { exercise: ApiExercise };
      onEdited(toCatalogRow(data.exercise));
    } catch {
      setError('No se pudo guardar. Reintenta.');
      setSaving(false);
    }
  };

  const slug = modalityColorSlug(exercise.modality);
  const originLabel = ORIGIN_LABEL[exercise.origin];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--v2-mod-${slug})` }} />
        <div className="min-w-0">
          <p className="truncate t-body font-medium text-v2-fg">{exercise.name}</p>
          <p className="t-meta text-v2-faint">
            {CATEGORY_LABEL[exercise.category]}
            {originLabel ? ` · ${originLabel}` : ''}
          </p>
        </div>
      </div>

      <p className="t-body-sm text-v2-muted">
        {isOwn ? (
          <>
            <span className="font-medium text-v2-fg">Tu ejercicio.</span> Lo que edites aquí lo ven tus atletas
            directamente: no hay una versión base a la que volver.
          </>
        ) : (
          <>
            <span className="font-medium text-v2-fg">Tu versión.</span> Es lo que verán tus atletas en este
            ejercicio. Lo que dejes vacío se hereda del contenido base.
          </>
        )}
      </p>

      <label className="block space-y-1.5">
        <span className="t-meta text-v2-muted">Nombre</span>
        <Input
          type="text"
          size="lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          placeholder={isOwn ? undefined : exercise.base_name}
          aria-label="Nombre del ejercicio"
          invalid={isOwn && name.trim().length === 0}
        />
        {isOwn ? (
          // Same message the server would give (invalid_name) — validated here
          // too so the coach sees it before Guardar disables itself, not after.
          name.trim().length === 0 ? <p className="t-meta text-v2-danger">Tu ejercicio necesita un nombre.</p> : null
        ) : (
          <p className="t-meta text-v2-faint">Vacío = tus atletas verán el nombre base ({exercise.base_name}).</p>
        )}
      </label>

      <OverrideTextField
        label="Indicaciones (cues)"
        value={cues}
        onChange={setCues}
        baseValue={isOwn ? null : exercise.base_cues}
        rows={3}
      />

      <OverrideTextField
        label="Descripción"
        value={description}
        onChange={setDescription}
        baseValue={isOwn ? null : exercise.base_description}
        rows={3}
      />

      {/* El vídeo de la base hereda igual que las claves y la descripción (mismo
          `base_*`), así que el campo lo enseña y lo reproduce mientras el coach no
          ponga el suyo. */}
      <VideoUrlField
        id="editar-ej-video"
        label="Vídeo"
        value={video}
        onChange={setVideo}
        inheritedUrl={isOwn ? null : exercise.base_video_url}
        exerciseId={exercise.id}
        onUploadingChange={setVideoUploading}
      />

      {error ? (
        <p role="alert" className="t-body-sm text-v2-danger">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-v2-border pt-3">
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" icon={Save} loading={saving} disabled={!canSave} onClick={submit}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

// A multi-line field: prefilled per the caller's convention (override for
// base/customized, current value for own — see file header), the BASE value
// shown as placeholder when there is one, with an honest hint about what an
// empty field means for THIS origin.
function OverrideTextField({
  label,
  value,
  onChange,
  baseValue,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  baseValue: string | null;
  rows: number;
}) {
  const base = baseValue?.trim() || null;
  return (
    <label className="block space-y-1.5">
      <span className="t-meta text-v2-muted">{label}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={2000}
        placeholder={base ?? 'Sin contenido: escribe el tuyo…'}
      />
      <p className="t-meta text-v2-faint">
        {base ? 'Vacío = tus atletas verán el contenido base (el del ejemplo).' : 'Vacío = no se mostrará nada.'}
      </p>
    </label>
  );
}
