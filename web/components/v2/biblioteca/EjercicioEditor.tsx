'use client';

// EjercicioEditor — crear un ejercicio propio, o editar uno del catálogo POR LAS
// REGLAS DE SU ORIGEN (mig 0132). El editor es donde el modelo se explica solo.
//
// LO QUE TIENE QUE ENTENDER EL COACH, sin leer documentación:
//   • un ejercicio BASE es nuestro y lo tienen todos. Puede ponerle SU nombre, SUS
//     claves, SU descripción y SU vídeo — eso se guarda sólo para él y el ejercicio
//     pasa a ser "Personalizado". Lo que define el MOVIMIENTO (categoría, músculos,
//     material) NO se toca: la app razona con ello y es igual para todos. La salida
//     es crear un ejercicio propio, y aquí es un botón, no una frase.
//   • un ejercicio SUYO es suyo entero: se edita todo.
//
// EL FORK SE DESHACE, LOS CUATRO CAMPOS. Cada campo forkeado enseña su valor base y
// trae "Restaurar": vaciar el campo (→ '' → null en el servidor) borra el override y
// se vuelve a heredar. Un fork sin vuelta atrás sería una trampa.
//   El NOMBRE es simétrico con los otros tres desde 0132, pero su vacío significa
//   cosas distintas según el origen, y por eso lo trata el servidor y no esta
//   pantalla: en un BASE limpia el override (vuelve el nombre base), y en uno PROPIO
//   es un 400 `invalid_name` — no hay base a la que volver y `exercises.name` es NOT
//   NULL. Aquí sólo se evita disparar ese 400: en un propio el campo se valida antes.
//
// SÓLO SE MANDA LO QUE CAMBIÓ (diff contra la fila cargada). Mandar `name` siempre
// convertiría un Base en Personalizado por el mero hecho de abrir y guardar.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ModalPortal } from '@/components/v2/editor/ModalPortal';
import { VideoUrlField, videoUrlDraftInvalid } from '@/components/media/VideoUrlField';
import type { ExerciseCategory } from '@fahybrid/shared/schema/_primitives';
import type { Modality } from '@fahybrid/shared/domain/prescription';
import type { CoachExerciseRow } from '@/lib/exercises/coach-override';
import {
  EXERCISE_CATEGORY_OPTIONS,
  EXERCISE_ORIGIN_META,
  OVERRIDE_FIELD_LABEL,
  resolveModality,
} from '@/lib/dashboard/exercises/catalog-ui';
import {
  MAX_NAME,
  OverrideField,
  OwnIdentity,
  RestoreButton,
  SharedIdentity,
  hintCls,
  inputCls,
  labelCls,
  parseList,
  sameList,
} from '@/components/v2/biblioteca/EjercicioEditorFields';
import { cn } from '@/lib/utils';

/**
 * El movimiento de partida al crear desde "esto no lo puedo cambiar". Lleva la
 * IDENTIDAD del ejercicio del que se sale — y la modalidad es identidad tanto como
 * la categoría, así que viaja con ella. Si no, salir de un "Remo 500m" para hacerse
 * uno propio volvería a pasar por la adivinanza del nombre teniendo la modalidad de
 * verdad delante.
 */
export interface ExerciseSeed {
  name: string;
  category: ExerciseCategory;
  modality: Modality;
}

export function EjercicioEditor({
  ex,
  seed,
  onClose,
  onSaved,
  onCreated,
  onCreateOwn,
}: {
  /** null = crear. */
  ex: CoachExerciseRow | null;
  /** Al crear desde "no puedo cambiar esto" — arranca con el movimiento de partida. */
  seed?: ExerciseSeed | null;
  onClose: () => void;
  onSaved: (row: CoachExerciseRow) => void;
  onCreated: (row: CoachExerciseRow) => void;
  onCreateOwn: (seed: ExerciseSeed) => void;
}) {
  const creating = ex === null;
  // Un ejercicio BASE tiene identidad COMPARTIDA; uno propio es entero del coach.
  const shared = ex !== null && ex.origin !== 'own';

  // El valor de partida de cada campo forkeable: en un Base es el override CRUDO
  // (vacío = heredando); en uno propio, el valor de la fila. Los CUATRO se tratan
  // igual, nombre incluido — así "vacío = heredo" es UNA regla y no cuatro casos.
  const initial = {
    name: (shared ? ex?.override_name : ex?.name) ?? seed?.name ?? '',
    category: ex?.category ?? seed?.category ?? EXERCISE_CATEGORY_OPTIONS[0]!.value,
    cues: (shared ? ex?.override_cues : ex?.cues) ?? '',
    description: (shared ? ex?.override_description : ex?.description) ?? '',
    video: (shared ? ex?.override_video_url : ex?.video_url) ?? '',
    muscles: (ex?.primary_muscle_groups ?? []).join(', '),
    equipment: (ex?.equipment ?? []).join(', '),
  };

  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState<ExerciseCategory>(initial.category);
  // null = "el coach todavía no ha elegido", que NO es lo mismo que un valor: es lo
  // que deja a la sugerencia seguir el nombre mientras lo escribe, y lo que la calla
  // en cuanto elige. Al editar uno propio ya hay valor declarado, así que no hay
  // sugerencia que dar; al crear desde un seed, la modalidad viene del ejercicio de
  // partida, que es un dato real y no una adivinanza.
  const [modality, setModality] = useState<Modality | null>(
    creating ? (seed?.modality ?? null) : (ex?.modality ?? null),
  );
  const [cues, setCues] = useState(initial.cues);
  const [description, setDescription] = useState(initial.description);
  const [video, setVideo] = useState(initial.video);
  const [muscles, setMuscles] = useState(initial.muscles);
  const [equipment, setEquipment] = useState(initial.equipment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sin esto, "Nuevo ejercicio" arranca con el nombre vacío → el botón sale
  // deshabilitado y NADA dice por qué. El error aparece en cuanto el campo se ha
  // tocado, no antes (regañar por un campo que aún no has visitado es peor).
  const [nameTouched, setNameTouched] = useState(false);
  // Guardar a media subida guardaría el vídeo ANTERIOR y tiraría el que se está
  // subiendo, sin decir nada. El campo avisa; aquí se apaga el botón.
  const [videoUploading, setVideoUploading] = useState(false);

  const videoInvalid = videoUrlDraftInvalid(video);
  // El largo lo corta ya el `maxLength` del input (mismo tope que el servidor), así
  // que aquí sólo queda el vacío — y el vacío significa cosas DISTINTAS según el
  // origen: en un BASE es RESTAURAR (vuelve el nombre de la base), o sea legal; en
  // uno PROPIO no hay base a la que volver y `exercises.name` es NOT NULL, así que
  // el servidor responde `invalid_name`. Se dice lo mismo aquí, y antes de mandar.
  const nameError = !shared && name.trim() === '' ? 'Tu ejercicio necesita un nombre.' : null;
  const canSave = !nameError && !videoInvalid && !videoUploading && !saving;

  // El valor que se va a mandar y si sigue siendo sugerencia. Siempre hay valor, así
  // que "modalidad requerida" nunca es un botón apagado sin explicación — el trabajo
  // del coach es mirarla, no rellenarla.
  const { value: modalityValue, suggested: modalitySuggested } = resolveModality(
    modality,
    name,
    category,
  );

  const title = creating ? 'Nuevo ejercicio' : ex.name;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = creating
        ? await fetch('/api/exercises', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: name.trim(),
              category,
              modality: modalityValue,
              ...(video.trim() ? { video_url: video.trim() } : {}),
            }),
          })
        : await patchRequest();

      // Nada que mandar (abrió y cerró sin tocar) → no se molesta a la API con un
      // 400 "no hay campos"; simplemente no había edición.
      if (res === null) {
        onClose();
        return;
      }

      const body = (await res.json().catch(() => null)) as
        | { exercise?: CoachExerciseRow; error?: { message?: string } }
        | null;

      if (!res.ok || !body?.exercise) {
        // El mensaje del servidor VERBATIM: el 409 `shared_identity` ya viene
        // redactado para el coach y nombra qué se negó. Reescribirlo aquí sería
        // perder la única explicación buena que hay.
        setError(body?.error?.message ?? 'No se pudo guardar. Reintenta.');
        setSaving(false);
        return;
      }

      if (creating) onCreated(body.exercise);
      else onSaved(body.exercise);
    } catch {
      setError('Error de red. Reintenta.');
      setSaving(false);
    }
  };

  /** El PATCH, con SÓLO los campos que cambiaron. null = no cambió nada. */
  const patchRequest = async (): Promise<Response | null> => {
    if (!ex) return null;
    const patch: Record<string, unknown> = {};

    // Contra el valor CARGADO, no contra el fusionado: en un Base el campo lleva el
    // override crudo, así que '' distinto de 'Mi nombre' = "bórralo" y manda name:''.
    if (name.trim() !== initial.name) patch.name = name.trim();
    if (cues.trim() !== initial.cues) patch.cues = cues.trim();
    if (description.trim() !== initial.description) patch.description = description.trim();
    if (video.trim() !== initial.video) patch.video_url = video.trim();

    // La identidad sólo viaja en un ejercicio PROPIO. En un Base ni se manda: la
    // API respondería 409 y el formulario ya no la deja tocar. La modalidad es
    // identidad, así que va con la categoría y no con los campos forkeables.
    if (!shared) {
      if (category !== ex.category) patch.category = category;
      if (modalityValue !== ex.modality) patch.modality = modalityValue;
      const m = parseList(muscles);
      const e = parseList(equipment);
      if (!sameList(m, ex.primary_muscle_groups)) patch.primary_muscle_groups = m;
      if (!sameList(e, ex.equipment)) patch.equipment = e;
    }

    if (Object.keys(patch).length === 0) return null;

    return fetch(`/api/exercises/${ex.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
  };

  return (
    // `escapeEnabled={!saving}` ya hace que el portal se COMA el Escape mientras
    // se guarda (sin cerrar nada de debajo), así que onEscape no necesita guardia.
    <ModalPortal onEscape={onClose} escapeEnabled={!saving}>
      <div
        className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[color:var(--v2-scrim)] p-4 py-[6vh] backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={creating ? 'Nuevo ejercicio' : `Editar ${ex.name}`}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          className="v2-focus flex w-full max-w-[560px] flex-col rounded-[var(--v2-r-l)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-elevated)] shadow-[var(--v2-shadow-pop)]"
        >
          {/* ── Cabecera ──────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 border-b border-[color:var(--v2-border)] p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[color:var(--v2-fg)]">{title}</p>
              {ex ? (
                <span
                  className="mt-1 inline-block rounded-[var(--v2-r-pill)] px-2 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em]"
                  style={{
                    background: `var(${EXERCISE_ORIGIN_META[ex.origin].bgVar})`,
                    color: `var(${EXERCISE_ORIGIN_META[ex.origin].fgVar})`,
                  }}
                >
                  {EXERCISE_ORIGIN_META[ex.origin].label}
                </span>
              ) : (
                <p className="mt-0.5 text-xs text-[color:var(--v2-muted)]">
                  Será tuyo — sólo tú lo verás.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="v2-focus -mr-1 -mt-1 shrink-0 rounded-[var(--v2-r-s)] p-1.5 text-[color:var(--v2-faint)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="close" size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4 p-4">
            {/* Qué significa editar un Base — antes de tocar nada. */}
            {shared ? (
              <p className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 py-2.5 text-xs leading-relaxed text-[color:var(--v2-fg)]">
                <b>Este ejercicio es de la base.</b> Lo que escribas aquí se guarda{' '}
                <b>sólo para ti</b> y es lo que verán tus atletas. Lo que dejes vacío se hereda.
              </p>
            ) : null}

            {/* ── Nombre ──────────────────────────────────────────────────── */}
            <div>
              <label className={labelCls} htmlFor="ej-name">
                <span>Nombre</span>
                {shared && name.trim() !== '' ? (
                  <RestoreButton onClick={() => setName('')} />
                ) : null}
              </label>
              <input
                id="ej-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                maxLength={MAX_NAME}
                autoComplete="off"
                placeholder={shared ? ex.base_name : 'Sentadilla búlgara'}
                className={cn(inputCls, nameError && nameTouched && 'border-[color:var(--v2-danger)]')}
                aria-invalid={nameError && nameTouched ? true : undefined}
                aria-describedby={nameError && nameTouched ? 'ej-name-err' : undefined}
              />
              {nameError && nameTouched ? (
                <p id="ej-name-err" className="mt-1 text-label text-[color:var(--v2-danger)]">
                  {nameError}
                </p>
              ) : null}
              {/* Mismo trato que los otros tres campos forkeables: el valor es el
                  override CRUDO, el placeholder es el nombre de la base y vaciarlo
                  la devuelve. Antes el nombre era la excepción rara (no se podía
                  deshacer); build-ejercicios lo arregló en la raíz. */}
              {shared && name.trim() !== '' ? (
                <p className={hintCls}>
                  En la base: <span className="text-[color:var(--v2-muted)]">“{ex.base_name}”</span>
                </p>
              ) : shared ? (
                <p className={hintCls}>Vacío = usas el nombre de la base.</p>
              ) : null}
            </div>

            {/* ── Claves + descripción + vídeo (lo que el coach AUTORA) ───── */}
            <OverrideField
              id="ej-cues"
              label="Claves"
              value={cues}
              onChange={setCues}
              baseValue={shared ? ex.base_cues : null}
              inherits={shared}
              rows={3}
              placeholder="Pecho arriba, rodilla fuera…"
            />

            <OverrideField
              id="ej-desc"
              label="Descripción"
              value={description}
              onChange={setDescription}
              baseValue={shared ? ex.base_description : null}
              inherits={shared}
              rows={3}
              placeholder="Cómo se ejecuta."
            />

            {/* El vídeo SE VE aquí. Antes esto era un `input` y un enlace que abría
                otra pestaña: para comprobar que había pegado lo que creía, el coach
                tenía que salirse del panel. Cuando hereda, lo que se reproduce es el
                de la base, que es exactamente lo que verá el atleta — y el propio
                campo pone el verbo (Restaurar / Quitar) según haya base o no. */}
            <VideoUrlField
              id="ej-video"
              label={OVERRIDE_FIELD_LABEL.video_url}
              value={video}
              onChange={setVideo}
              inheritedUrl={shared ? ex.base_video_url : null}
              exerciseId={ex?.id ?? null}
              onUploadingChange={setVideoUploading}
            />

            {/* ── La identidad: compartida y bloqueada, o del coach ────────── */}
            {shared ? (
              <SharedIdentity
                ex={ex}
                onCreateOwn={() =>
                  onCreateOwn({ name: ex.name, category: ex.category, modality: ex.modality })
                }
              />
            ) : (
              <OwnIdentity
                creating={creating}
                category={category}
                onCategory={setCategory}
                modality={modalityValue}
                onModality={setModality}
                modalitySuggested={modalitySuggested}
                muscles={muscles}
                onMuscles={setMuscles}
                equipment={equipment}
                onEquipment={setEquipment}
              />
            )}

            {error ? (
              <p
                role="alert"
                className="rounded-[var(--v2-r-s)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-xs leading-relaxed text-[color:var(--v2-fg)]"
              >
                {error}
              </p>
            ) : null}
          </div>

          {/* ── Pie ───────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-end gap-2 border-t border-[color:var(--v2-border)] p-4">
            <button
              type="button"
              onClick={onClose}
              className="v2-focus rounded-[var(--v2-r-s)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="v2-focus inline-flex items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-4 py-2 text-sm font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)] disabled:opacity-50"
            >
              {saving ? <MIcon name="progress_activity" size={16} /> : null}
              {saving ? 'Guardando…' : creating ? 'Crear ejercicio' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
