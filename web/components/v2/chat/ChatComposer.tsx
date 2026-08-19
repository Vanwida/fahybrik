// La caja de escribir: texto, adjunto y nota de voz.
//
// Antes el clip existía como botón pero nadie le pasaba el manejador, así que el
// coach literalmente no podía mandar una foto ni un archivo. Ahora hay tres vías
// —elegir fichero, pegar del portapapeles y grabar voz— y todas terminan en el
// mismo sitio: un adjunto pendiente que SE VE antes de salir y se puede descartar.
// Enviar algo a ciegas es de las pocas cosas que no se pueden deshacer bien.
//
// El envío se delega entero: aquí no se sabe qué es un hilo ni cómo se sube un
// fichero. Eso vive en `useConversation`.

'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import {
  ChatError,
  prepareAttachment,
  CHAT_BODY_MAX,
  type PendingAttachment,
} from '@/lib/chat/client';
import { canRecordVoice, VoiceRecorder, VoiceRecordingError } from './voice-recorder';
import { cn } from '@/lib/utils';

/** Alto máximo de la caja antes de que empiece a hacer scroll (~5 líneas). */
const TEXTAREA_MAX_HEIGHT = 120;
/** Cada cuánto se refresca el contador mientras se graba, en ms. */
const TIMER_TICK_MS = 200;

/**
 * ¿Se puede grabar en este navegador? El servidor no lo sabe —no hay `window`—,
 * así que responde que no y el cliente corrige tras montar.
 *
 * Va por `useSyncExternalStore` y no por un estado con efecto porque es
 * exactamente para lo que existe: leer durante el render algo que solo el cliente
 * conoce, con una respuesta declarada para el servidor. Preguntarlo a pelo
 * pintaba el micro en el cliente y no en el HTML del servidor, y React tiraba
 * toda la caja de escribir por no cuadrar la hidratación.
 */
function useCanRecordVoice(): boolean {
  return useSyncExternalStore(
    // La capacidad no cambia mientras la página vive: no hay a qué suscribirse.
    () => () => undefined,
    () => canRecordVoice(),
    () => false,
  );
}

export interface ChatComposerProps {
  onSend: (input: { body?: string; attachment?: PendingAttachment }) => Promise<void> | void;
  /** Deshabilita todo (el hilo aún está cargando o falló). */
  disabled?: boolean;
  placeholder?: string;
  /** Avisos que el componente no puede enseñar por su cuenta (adjunto rechazado,
   *  micrófono denegado) suben aquí para que la pantalla los muestre en un sitio. */
  onNotice?: (message: string) => void;
  className?: string;
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = 'Escribe un mensaje…',
  onNotice,
  className,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [recorder, setRecorder] = useState<VoiceRecorder | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const canRecord = useCanRecordVoice();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const canSend = (trimmed.length > 0 || attachment != null) && !sending && !disabled;

  const notify = useCallback(
    (message: string) => {
      onNotice?.(message);
    },
    [onNotice],
  );

  /** El object URL de la vista previa se revoca cuando el adjunto deja de estar en
   *  pantalla; si no, cada foto descartada se queda ocupando memoria hasta que se
   *  recargue la página. */
  const replaceAttachment = useCallback((next: PendingAttachment | null) => {
    setAttachment((prev) => {
      if (prev && prev.preview_url !== next?.preview_url) URL.revokeObjectURL(prev.preview_url);
      return next;
    });
  }, []);

  const acceptFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      try {
        replaceAttachment(prepareAttachment(file));
      } catch (err) {
        notify(err instanceof ChatError ? err.message : 'No se pudo adjuntar el archivo.');
      }
    },
    [notify, replaceAttachment],
  );

  // Pegar una captura directamente en la conversación. Es la vía natural cuando
  // el coach está mirando una gráfica en otra pestaña.
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const file = Array.from(event.clipboardData.files)[0];
      if (!file) return;
      event.preventDefault();
      acceptFile(file);
    },
    [acceptFile],
  );

  const submit = useCallback(async () => {
    if (!canSend) return;
    const body = trimmed.length > 0 ? trimmed : undefined;
    const outgoing = attachment ?? undefined;
    setSending(true);
    setValue('');
    // La vista previa la hereda la burbuja optimista, así que aquí se suelta la
    // referencia SIN revocar la URL: revocarla dejaría la burbuja en blanco.
    setAttachment(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      await onSend({ body, attachment: outgoing });
    } finally {
      setSending(false);
    }
  }, [canSend, trimmed, attachment, onSend]);

  // ── Nota de voz ────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    const next = new VoiceRecorder();
    try {
      await next.start();
      setRecordedSeconds(0);
      setRecorder(next);
    } catch (err) {
      notify(
        err instanceof VoiceRecordingError ? err.message : 'No se pudo iniciar la grabación.',
      );
    }
  }, [notify]);

  const stopRecording = useCallback(async () => {
    if (!recorder) return;
    setRecorder(null);
    const result = await recorder.stop();
    if (!result) return; // pulsación fugaz: nada que enviar
    try {
      const pending = prepareAttachment(result.file);
      pending.meta.duration_ms = result.duration_ms;
      replaceAttachment(pending);
    } catch (err) {
      notify(err instanceof ChatError ? err.message : 'La nota de voz salió demasiado larga.');
    }
  }, [recorder, replaceAttachment, notify]);

  const cancelRecording = useCallback(() => {
    recorder?.cancel();
    setRecorder(null);
  }, [recorder]);

  // Contador de la grabación. Se para solo al desmontar o al cortar.
  useEffect(() => {
    if (!recorder) return;
    const id = setInterval(() => setRecordedSeconds(recorder.elapsedSeconds), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [recorder]);

  // Si la pantalla se cierra en mitad de una grabación, soltar el micrófono: el
  // piloto de la pestaña se quedaría encendido.
  useEffect(() => () => recorder?.cancel(), [recorder]);

  if (recorder) {
    return (
      <RecordingBar
        seconds={recordedSeconds}
        onCancel={cancelRecording}
        onStop={() => void stopRecording()}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5',
        className,
      )}
    >
      {attachment ? (
        <AttachmentPreview attachment={attachment} onDiscard={() => replaceAttachment(null)} />
      ) : null}

      {/* Un único pill: el texto entra por la izquierda y las acciones (adjuntar,
          grabar, enviar) se apoyan a la derecha, como en el resto de la app. */}
      <div className="flex items-end gap-2.5 rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] py-1.5 pl-4 pr-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          onChange={(e) => {
            acceptFile(e.target.files?.[0]);
            // Permite volver a elegir el MISMO fichero después de descartarlo.
            e.target.value = '';
          }}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.slice(0, CHAT_BODY_MAX));
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Mensaje"
          className={cn(
            'v2-focus min-h-6 flex-1 resize-none self-center bg-transparent py-1 text-body',
            'text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)]',
            'disabled:opacity-50',
          )}
        />

        <IconButton
          icon="attach_file"
          label="Adjuntar un archivo"
          disabled={disabled || sending}
          onClick={() => fileInputRef.current?.click()}
        />
        {canRecord ? (
          <IconButton
            icon="mic"
            label="Grabar una nota de voz"
            disabled={disabled || sending}
            onClick={() => void startRecording()}
          />
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSend}
          aria-label="Enviar"
          title="Enviar"
          className={cn(
            'v2-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <MIcon name="send" size={16} filled />
        </button>
      </div>
    </div>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'v2-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
        'text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]',
        'disabled:opacity-50',
      )}
    >
      <MIcon name={icon} size={19} />
    </button>
  );
}

/** Lo que se va a enviar, antes de enviarlo. Una imagen se ve; lo demás se
 *  nombra. Sin esto no hay forma de saber si adjuntaste la foto correcta. */
function AttachmentPreview({
  attachment,
  onDiscard,
}: {
  attachment: PendingAttachment;
  onDiscard: () => void;
}) {
  const isImage = attachment.kind === 'image';
  const isVoice = attachment.kind === 'voice';
  const duration = attachment.meta.duration_ms
    ? `${Math.floor(attachment.meta.duration_ms / 60000)}:${String(
        Math.round((attachment.meta.duration_ms % 60000) / 1000),
      ).padStart(2, '0')}`
    : null;

  return (
    <div className="flex items-center gap-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-bg)] p-2">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL local.
        <img
          src={attachment.preview_url}
          alt=""
          className="h-11 w-11 shrink-0 rounded-[var(--v2-r-xs)] object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--v2-r-xs)] bg-[color:var(--v2-surface-2)]">
          <MIcon
            name={attachment.kind === 'video' ? 'movie' : isVoice ? 'graphic_eq' : 'description'}
            size={20}
            className="text-[color:var(--v2-muted)]"
          />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-[color:var(--v2-fg)]">
          {isVoice ? 'Nota de voz' : attachment.file.name}
        </span>
        <span className="v2-num block text-label text-[color:var(--v2-faint)]">
          {duration ?? `${Math.max(1, Math.round(attachment.file.size / 1024))} KB`}
        </span>
      </span>
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Descartar el adjunto"
        className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="close" size={17} />
      </button>
    </div>
  );
}

/** Mientras se graba, la caja de escribir cede el sitio: no se puede escribir y
 *  grabar a la vez, y dejar los dos controles a la vez solo confunde. */
function RecordingBar({
  seconds,
  onCancel,
  onStop,
  className,
}: {
  seconds: number;
  onCancel: () => void;
  onStop: () => void;
  className?: string;
}) {
  const label = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2.5',
        className,
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[color:var(--v2-danger)] motion-reduce:animate-none"
        aria-hidden
      />
      <span className="text-body font-medium text-[color:var(--v2-fg)]">Grabando</span>
      <span className="v2-num text-body tabular-nums text-[color:var(--v2-muted)]" role="timer">
        {label}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        onClick={onCancel}
        className="v2-focus rounded-[var(--v2-r-s)] px-2.5 py-1.5 text-body font-semibold text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={onStop}
        className="v2-focus flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-body font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
      >
        <MIcon name="stop" size={16} filled />
        Listo
      </button>
    </div>
  );
}
