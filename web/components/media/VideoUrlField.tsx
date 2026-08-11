'use client';

// EL campo de vídeo del panel. Uno solo: se sube o se pega, y SE VE, aquí mismo.
//
// Antes había dos campos distintos para lo mismo (uno en el editor de la
// Biblioteca, otro en las hojas del ExercisePicker), cada uno con su copy y su
// validación, y NINGUNO enseñaba el vídeo: para comprobar que había pegado lo que
// creía, el coach tenía que abrir otra pestaña. Este es el único, y valida con
// `lib/exercises/video-source.ts`, que es lo mismo que aplica el servidor al guardar.
//
// DOS ORÍGENES, UN CAMPO. El vídeo de técnica es contenido del coach: o lo tiene en
// YouTube o lo tiene en el móvil. Obligarle a abrirse un canal para poder enseñar
// una sentadilla sería ponerle una barrera a lo que ya ha grabado. Se sube directo
// al almacén (`lib/exercises/video-upload-client.ts`) y lo que se guarda en la
// columna es el localizador; la columna sigue siendo UNA y el tipo se deriva de ella.
//
// HEREDAR ES PARTE DEL CAMPO, no un caso especial de quien lo llama. Un ejercicio
// de la base trae su vídeo; el coach puede poner el suyo encima o dejar el campo
// vacío para seguir usando el de la base. Cuando hereda, lo que se previsualiza es
// el vídeo de la base — porque es el que verá el atleta, que es la única pregunta
// que este campo tiene que contestar.

import { useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import {
  EXERCISE_VIDEO_REJECTION,
  EXERCISE_VIDEO_URL_MAX,
  isValidExerciseVideo,
  parseExerciseVideo,
} from '@/lib/exercises/video-source';
import {
  EXERCISE_VIDEO_ACCEPT_ATTR,
  ExerciseVideoUploadError,
  uploadExerciseVideo,
} from '@/lib/exercises/video-upload-client';
import { ExerciseVideoPreview } from './ExerciseVideoPreview';
import { cn } from '@/lib/utils';

/**
 * Si lo escrito impide guardar. Un borrador VACÍO es legal (ese movimiento no
 * tiene vídeo y punto); lo que no se entiende, no. Lo comparten el campo y los
 * formularios que lo montan, para que "puedo guardar" y "el campo está en rojo"
 * no puedan decir cosas distintas.
 */
export function videoUrlDraftInvalid(draft: string): boolean {
  const v = draft.trim();
  return v !== '' && !isValidExerciseVideo(v);
}

const INPUT_CLS =
  'v2-focus w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)]';

const HINT_CLS = 'flex items-start gap-1.5 text-label leading-snug';

const BTN_CLS =
  'v2-focus inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-accent)] disabled:opacity-50';

export function VideoUrlField({
  id,
  label = 'Vídeo',
  value,
  onChange,
  placeholder = 'Pega un enlace de YouTube…',
  inheritedUrl = null,
  exerciseId = null,
  onUploadingChange,
  className,
}: {
  id: string;
  label?: string;
  /** El borrador EN CRUDO. Quien lo monta decide qué hace con uno inválido. */
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  /** El vídeo que se usa si el campo queda vacío (el de la base). Se previsualiza. */
  inheritedUrl?: string | null;
  /** El ejercicio al que se le cuelga, si ya existe. En el alta todavía no hay id:
   *  el servidor firma igual (la carpeta sale de su sesión, no del cliente). */
  exerciseId?: string | null;
  /** Mientras sube, quien monta el campo apaga Guardar: guardar a media subida
   *  perdería el vídeo sin decir nada. */
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
}) {
  const draft = value.trim();
  const invalid = videoUrlDraftInvalid(value);
  const inherited = (inheritedUrl ?? '').trim() || null;
  const own = !invalid && draft !== '' ? draft : null;
  // Lo que se previsualiza es LO QUE VERÁ EL ATLETA: el vídeo del coach si lo ha
  // puesto, y si no el heredado, que es lo que se queda al dejar el campo vacío.
  const preview = own ?? (draft === '' ? inherited : null);
  const ownIsFile = own !== null && parseExerciseVideo(own)?.kind === 'subido';
  // Un heredado de YouTube se enseña como marca de agua de la caja (es un enlace
  // que se puede leer); uno subido es una ruta interna y no dice nada.
  const inheritedLink = inherited && parseExerciseVideo(inherited)?.kind === 'youtube';
  const hintId = `${id}-hint`;

  const fileRef = useRef<HTMLInputElement>(null);
  // null = no hay subida en curso. 0..100 mientras sube.
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploading = progress !== null;

  // Se avisa SÓLO cuando cambia de verdad: quien monta el campo suele pasar una
  // función nueva en cada render, y avisar en cada uno sería un bucle de estado.
  const avisado = useRef(false);
  useEffect(() => {
    if (avisado.current === uploading) return;
    avisado.current = uploading;
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const pickFile = () => {
    setUploadError(null);
    fileRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setProgress(0);
    try {
      const locator = await uploadExerciseVideo(file, {
        exerciseId,
        onProgress: setProgress,
      });
      onChange(locator);
    } catch (err) {
      setUploadError(
        err instanceof ExerciseVideoUploadError
          ? err.message
          : 'No se pudo subir el vídeo. Inténtalo otra vez.',
      );
    } finally {
      setProgress(null);
      // Sin esto, volver a elegir EL MISMO fichero no dispara el evento.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        {/* La etiqueta sólo apunta a la caja de texto cuando la caja existe: con un
            fichero ya subido no hay enlace que pegar y el `htmlFor` quedaría
            colgando de un id inexistente. */}
        {ownIsFile || uploading ? (
          <span className="v2-micro">{label}</span>
        ) : (
          <label htmlFor={id} className="v2-micro">
            {label}
          </label>
        )}
        {/* Vaciar el campo significa dos cosas distintas y por eso lo dice con dos
            verbos: si hay algo que heredar, vaciar es VOLVER al vídeo de la base;
            si no, es quedarse sin vídeo. El verbo lo decide el modelo, no quien
            monta el campo, para que no acabe habiendo dos criterios. */}
        {draft !== '' && !uploading ? (
          <ClearButton onClick={() => onChange('')} restores={inherited !== null} />
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={EXERCISE_VIDEO_ACCEPT_ATTR}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {uploading ? (
        <UploadProgress pct={progress} />
      ) : ownIsFile ? (
        <UploadedStrip onReplace={pickFile} />
      ) : (
        <div className="flex items-start gap-2">
          <input
            id={id}
            type="url"
            inputMode="url"
            value={value}
            maxLength={EXERCISE_VIDEO_URL_MAX}
            onChange={(e) => onChange(e.target.value)}
            placeholder={inheritedLink ? inherited : placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={hintId}
            className={cn(
              INPUT_CLS,
              invalid
                ? 'border-[color:var(--v2-danger)]'
                : 'border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)]',
            )}
          />
          <button type="button" onClick={pickFile} className={BTN_CLS}>
            <MIcon name="upload" size={15} />
            Subir vídeo
          </button>
        </div>
      )}

      {uploadError ? (
        <p role="alert" className={cn(HINT_CLS, 'text-[color:var(--v2-danger)]')}>
          <MIcon name="error" size={13} className="mt-px shrink-0" />
          {uploadError}
        </p>
      ) : null}

      <Hint
        id={hintId}
        invalid={invalid}
        hasOwn={own !== null}
        inherits={inherited !== null}
        uploading={uploading}
      />

      {preview && !uploading ? (
        <div className="pt-0.5">
          <ExerciseVideoPreview url={preview} title={label} />
        </div>
      ) : null}
    </div>
  );
}

/** Vaciar el campo: "Restaurar" si eso devuelve el vídeo de la base, "Quitar" si no. */
function ClearButton({ onClick, restores }: { onClick: () => void; restores: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-xs)] px-1.5 py-0.5 text-eyebrow font-bold uppercase tracking-[0.04em] text-[color:var(--v2-muted)] transition-colors',
        restores ? 'hover:text-[color:var(--v2-fg)]' : 'hover:text-[color:var(--v2-danger)]',
      )}
    >
      <MIcon name={restores ? 'undo' : 'close'} size={12} />
      {restores ? 'Restaurar' : 'Quitar'}
    </button>
  );
}

/** El vídeo ya está subido: aquí no hay enlace que pegar, hay un fichero que
 *  cambiar. La caja de texto sobraría y sólo enseñaría una ruta interna. */
function UploadedStrip({ onReplace }: { onReplace: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm text-[color:var(--v2-fg)]">
        <MIcon name="movie" size={15} className="shrink-0 text-[color:var(--v2-accent)]" />
        Vídeo subido
      </span>
      <button type="button" onClick={onReplace} className={BTN_CLS}>
        <MIcon name="upload" size={15} />
        Cambiar
      </button>
    </div>
  );
}

/** Subiendo: cuánto va, en números y en barra. Un vídeo de 120 MB sin barra parece
 *  la app colgada. */
function UploadProgress({ pct }: { pct: number }) {
  return (
    <div
      className="space-y-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2"
      aria-busy
    >
      <p className="flex items-center gap-2 text-sm text-[color:var(--v2-fg)]">
        <MIcon
          name="progress_activity"
          size={15}
          className="shrink-0 animate-spin text-[color:var(--v2-accent)]"
        />
        Subiendo el vídeo… {pct}%
      </p>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de la subida"
        className="h-1 w-full overflow-hidden rounded-[var(--v2-r-pill)] bg-[color:var(--v2-border-strong)]"
      >
        <div
          className="h-full bg-[color:var(--v2-accent)] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Qué está pasando con este campo, en una línea y siempre presente. */
function Hint({
  id,
  invalid,
  hasOwn,
  inherits,
  uploading,
}: {
  id: string;
  invalid: boolean;
  hasOwn: boolean;
  inherits: boolean;
  uploading: boolean;
}) {
  if (uploading) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-[color:var(--v2-faint)]')}>
        <MIcon name="info" size={13} className="mt-px shrink-0" />
        No cierres esta ventana hasta que termine.
      </p>
    );
  }
  if (invalid) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-[color:var(--v2-danger)]')}>
        <MIcon name="error" size={13} className="mt-px shrink-0" />
        {EXERCISE_VIDEO_REJECTION}
      </p>
    );
  }
  if (hasOwn) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-[color:var(--v2-ok)]')}>
        <MIcon name="play_circle" size={13} className="mt-px shrink-0" />
        Así lo verá tu atleta al abrir el ejercicio.
      </p>
    );
  }
  return (
    <p id={id} className={cn(HINT_CLS, 'text-[color:var(--v2-faint)]')}>
      <MIcon name="info" size={13} className="mt-px shrink-0" />
      {inherits
        ? 'Vacío: tu atleta seguirá viendo el vídeo de la base.'
        : 'Sin vídeo. Sube el tuyo o pega un enlace de YouTube y tu atleta lo verá al abrir el ejercicio.'}
    </p>
  );
}
