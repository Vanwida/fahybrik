'use client';

// EL campo de vídeo del panel. Uno solo: se pega el enlace y SE VE, aquí mismo.
//
// Antes había dos campos distintos para lo mismo (uno en el editor de la
// Biblioteca, otro en las hojas del ExercisePicker), cada uno con su copy y su
// validación, y NINGUNO enseñaba el vídeo: para comprobar que había pegado lo que
// creía, el coach tenía que abrir otra pestaña. Este es el único, y valida con
// `shared/youtube.ts`, que es lo mismo que aplica el servidor al guardar.
//
// HEREDAR ES PARTE DEL CAMPO, no un caso especial de quien lo llama. Un ejercicio
// de la base trae su vídeo; el coach puede poner el suyo encima o dejar el campo
// vacío para seguir usando el de la base. Cuando hereda, lo que se previsualiza es
// el vídeo de la base — porque es el que verá el atleta, que es la única pregunta
// que este campo tiene que contestar.

import { MIcon } from '@/components/ui/MIcon';
import { isValidYouTubeUrl } from '@fahybrid/shared/youtube';
import { YouTubeEmbed } from './YouTubeEmbed';
import { cn } from '@/lib/utils';

/**
 * Si lo escrito impide guardar. Un borrador VACÍO es legal (ese movimiento no
 * tiene vídeo y punto); lo que no se entiende, no. Lo comparten el campo y los
 * formularios que lo montan, para que "puedo guardar" y "el campo está en rojo"
 * no puedan decir cosas distintas.
 */
export function videoUrlDraftInvalid(draft: string): boolean {
  const v = draft.trim();
  return v !== '' && !isValidYouTubeUrl(v);
}

const INPUT_CLS =
  'v2-focus w-full rounded-[var(--v2-r-s)] border bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)]';

const HINT_CLS = 'flex items-start gap-1.5 text-label leading-snug';

export function VideoUrlField({
  id,
  label = 'Vídeo (YouTube)',
  value,
  onChange,
  placeholder = 'Pega el enlace de YouTube…',
  inheritedUrl = null,
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
  className?: string;
}) {
  const draft = value.trim();
  const invalid = videoUrlDraftInvalid(value);
  const inherited = (inheritedUrl ?? '').trim() || null;
  const own = !invalid && draft !== '' ? draft : null;
  // Lo que se previsualiza es LO QUE VERÁ EL ATLETA: el vídeo del coach si lo ha
  // puesto, y si no el heredado, que es lo que se queda al dejar el campo vacío.
  const preview = own ?? (draft === '' ? inherited : null);
  const hintId = `${id}-hint`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="v2-micro">
          {label}
        </label>
        {/* Vaciar el campo significa dos cosas distintas y por eso lo dice con dos
            verbos: si hay algo que heredar, vaciar es VOLVER al vídeo de la base;
            si no, es quedarse sin vídeo. El verbo lo decide el modelo, no quien
            monta el campo, para que no acabe habiendo dos criterios. */}
        {draft !== '' ? (
          <ClearButton onClick={() => onChange('')} restores={inherited !== null} />
        ) : null}
      </div>

      <input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inherited ?? placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        className={cn(
          INPUT_CLS,
          invalid
            ? 'border-[color:var(--v2-danger)]'
            : 'border-[color:var(--v2-border-strong)] focus:border-[color:var(--v2-accent)]',
        )}
      />

      <Hint id={hintId} invalid={invalid} hasOwn={own !== null} inherits={inherited !== null} />

      {preview ? (
        <div className="pt-0.5">
          <YouTubeEmbed url={preview} title={label} />
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

/** Qué está pasando con este campo, en una línea y siempre presente. */
function Hint({
  id,
  invalid,
  hasOwn,
  inherits,
}: {
  id: string;
  invalid: boolean;
  hasOwn: boolean;
  inherits: boolean;
}) {
  if (invalid) {
    return (
      <p id={id} className={cn(HINT_CLS, 'text-[color:var(--v2-danger)]')}>
        <MIcon name="error" size={13} className="mt-px shrink-0" />
        Eso no es un enlace de YouTube.
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
        : 'Sin vídeo. Pega un enlace de YouTube y tu atleta lo verá al abrir el ejercicio.'}
    </p>
  );
}
