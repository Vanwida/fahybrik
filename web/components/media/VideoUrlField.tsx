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
// al alojamiento (`lib/exercises/video-upload-client.ts`) y lo que se guarda en la
// columna es el localizador; la columna sigue siendo UNA y el tipo se deriva de ella.
//
// LOS ESTADOS SE CUENTAN COMO SON, sin adelantar acontecimientos: SUBIENDO (los bytes
// van hacia el alojamiento), PROCESANDO (ya están allí, pero el vídeo todavía no se
// reproduce), LISTO (y sólo entonces hay localizador en el campo) y ERROR CON MOTIVO.
// Decir «ya está» al terminar de subir sería mentir: el atleta abriría el ejercicio y
// vería un rectángulo negro.
//
// HEREDAR ES PARTE DEL CAMPO, no un caso especial de quien lo llama. Un ejercicio
// de la base trae su vídeo; el coach puede poner el suyo encima o dejar el campo
// vacío para seguir usando el de la base. Cuando hereda, lo que se previsualiza es
// el vídeo de la base — porque es el que verá el atleta, que es la única pregunta
// que este campo tiene que contestar.

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CirclePlay, Film, Info, LoaderCircle, Undo2, Upload, X } from 'lucide-react';
import { Button, Input } from '@/components/v2/ui';
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
  type ExerciseVideoUploadPhase,
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

const HINT_CLS = 'flex items-start gap-1.5 t-body-sm';
const HINT_ICON = 'mt-0.5 size-3.5 shrink-0';

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
   *  el servidor reserva igual (el vídeo se anota a SU sesión, no a nada que mande
   *  el cliente). */
  exerciseId?: string | null;
  /** Mientras sube o procesa, quien monta el campo apaga Guardar: guardar a medias
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
  const ownIsUploaded = own !== null && parseExerciseVideo(own)?.kind === 'stream';
  // Un heredado de YouTube se enseña como marca de agua de la caja (es un enlace
  // que se puede leer); uno propio es code + uid y no le dice nada a nadie.
  const inheritedLink = inherited && parseExerciseVideo(inherited)?.kind === 'youtube';
  const hintId = `${id}-hint`;

  const fileRef = useRef<HTMLInputElement>(null);
  // null = no hay subida en curso. Mientras la hay, en qué paso va y cuánto lleva.
  const [fase, setFase] = useState<ExerciseVideoUploadPhase | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploading = fase !== null;

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
    setFase({ phase: 'subiendo', pct: 0 });
    try {
      // Sólo vuelve cuando el vídeo SE PUEDE VER, no cuando terminan de subir los
      // bytes: hasta entonces no hay nada que guardar en el ejercicio.
      const locator = await uploadExerciseVideo(file, { exerciseId, onPhase: setFase });
      onChange(locator);
    } catch (err) {
      setUploadError(
        err instanceof ExerciseVideoUploadError
          ? err.message
          : 'No se pudo subir el vídeo. Inténtalo otra vez.',
      );
    } finally {
      setFase(null);
      // Sin esto, volver a elegir EL MISMO fichero no dispara el evento.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        {/* La etiqueta sólo apunta a la caja de texto cuando la caja existe: con un
            vídeo ya subido no hay enlace que pegar y el `htmlFor` quedaría
            colgando de un id inexistente. */}
        {ownIsUploaded || uploading ? (
          <span className="t-meta text-v2-muted">{label}</span>
        ) : (
          <label htmlFor={id} className="t-meta text-v2-muted">
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
        hidden
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {fase ? (
        <UploadProgress fase={fase} />
      ) : ownIsUploaded ? (
        <UploadedStrip onReplace={pickFile} />
      ) : (
        <div className="flex items-start gap-2">
          <Input
            id={id}
            type="url"
            inputMode="url"
            value={value}
            maxLength={EXERCISE_VIDEO_URL_MAX}
            onChange={(e) => onChange(e.target.value)}
            placeholder={(inheritedLink ? inherited : placeholder) ?? undefined}
            invalid={invalid}
            aria-describedby={hintId}
            className="min-w-0 flex-1"
          />
          <Button icon={Upload} onClick={pickFile} className="shrink-0">
            Subir vídeo
          </Button>
        </div>
      )}

      {uploadError ? (
        <p role="alert" className={cn(HINT_CLS, 'text-v2-danger')}>
          <CircleAlert className={HINT_ICON} aria-hidden />
          {uploadError}
        </p>
      ) : null}

      <Hint
        id={hintId}
        invalid={invalid}
        hasOwn={own !== null}
        inherits={inherited !== null}
        fase={fase}
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
    <Button variant="ghost" size="sm" icon={restores ? Undo2 : X} onClick={onClick}>
      {restores ? 'Restaurar' : 'Quitar'}
    </Button>
  );
}

/** LISTO: el vídeo ya se puede ver. Aquí no hay enlace que pegar, hay un vídeo que
 *  cambiar; la caja de texto sobraría y sólo enseñaría un identificador interno. */
function UploadedStrip({ onReplace }: { onReplace: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[var(--v2-r-s)] border border-v2-border-strong bg-v2-surface-2 px-3 py-1.5">
      <span className="t-body flex min-w-0 items-center gap-2 text-v2-fg">
        <Film className="size-4 shrink-0 text-v2-muted" aria-hidden />
        Vídeo listo
      </span>
      <Button icon={Upload} onClick={onReplace}>
        Cambiar
      </Button>
    </div>
  );
}

/** Cómo se llama cada paso en la pantalla. SUBIENDO son los bytes saliendo de aquí;
 *  PROCESANDO es el vídeo ya entregado, preparándose para poder verse. Son dos esperas
 *  distintas y contarlas como una sola dejaría la barra clavada en el 100% sin
 *  explicación. */
const FASE_LABEL: Record<ExerciseVideoUploadPhase['phase'], string> = {
  subiendo: 'Subiendo el vídeo',
  procesando: 'Procesando el vídeo',
};

/** En marcha: qué paso y cuánto lleva, en números y en barra. Un vídeo de 120 MB sin
 *  barra parece la app colgada. */
function UploadProgress({ fase }: { fase: ExerciseVideoUploadPhase }) {
  const pct = Math.round(fase.pct);
  return (
    <div
      className="space-y-1.5 rounded-[var(--v2-r-s)] border border-v2-border-strong bg-v2-surface-2 px-3 py-2"
      aria-busy
    >
      <p className="t-body flex items-center gap-2 text-v2-fg">
        <LoaderCircle className="size-4 shrink-0 animate-spin text-v2-muted" aria-hidden />
        {FASE_LABEL[fase.phase]}… <span className="t-tnum">{pct}%</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={FASE_LABEL[fase.phase]}
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
  fase,
}: {
  id: string;
  invalid: boolean;
  hasOwn: boolean;
  inherits: boolean;
  fase: ExerciseVideoUploadPhase | null;
}) {
  if (fase) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-v2-faint')}>
        <Info className={HINT_ICON} aria-hidden />
        {fase.phase === 'subiendo'
          ? 'No cierres esta ventana hasta que termine.'
          : 'Ya lo tenemos. Lo estamos dejando listo para que tu atleta lo vea en cualquier móvil.'}
      </p>
    );
  }
  if (invalid) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-v2-danger')}>
        <CircleAlert className={HINT_ICON} aria-hidden />
        {EXERCISE_VIDEO_REJECTION}
      </p>
    );
  }
  if (hasOwn) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-v2-ok')}>
        <CirclePlay className={HINT_ICON} aria-hidden />
        Así lo verá tu atleta al abrir el ejercicio.
      </p>
    );
  }
  return (
    <p id={id} className={cn(HINT_CLS, 'text-v2-faint')}>
      <Info className={HINT_ICON} aria-hidden />
      {inherits
        ? 'Vacío: tu atleta seguirá viendo el vídeo de la base.'
        : 'Sin vídeo. Sube el tuyo o pega un enlace de YouTube y tu atleta lo verá al abrir el ejercicio.'}
    </p>
  );
}
