// La caja de escribir: texto, adjunto y nota de voz.
//
// Tres vías para adjuntar —elegir fichero, pegar del portapapeles y grabar voz—
// y todas terminan en el mismo sitio: un adjunto pendiente que SE VE antes de
// salir y se puede descartar. Enviar algo a ciegas es de las pocas cosas que no
// se pueden deshacer bien.
//
// Teclado: ⌘Enter (Ctrl+Enter) envía; Enter es salto de línea, como en el
// ChatDrawer — un coach escribe párrafos y un Enter suelto no debe dispararlos.
//
// El envío se delega entero: aquí no se sabe qué es un hilo ni cómo se sube un
// fichero. Eso vive en `useConversation`.

'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Ref } from 'react';
import { AudioLines, File, Film, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { Button, IconButton, Kbd, Textarea } from '@/components/v2/ui';
import { ChatError, prepareAttachment, CHAT_BODY_MAX, type PendingAttachment } from '@/lib/chat/client';
import { canRecordVoice, VoiceRecorder, VoiceRecordingError } from './voice-recorder';
import { cn } from '@/lib/utils';

/** Cada cuánto se refresca el contador mientras se graba, en ms. */
const TIMER_TICK_MS = 200;

/**
 * ¿Se puede grabar en este navegador? El servidor no lo sabe (no hay `window`),
 * así que responde que no y el cliente corrige tras montar, sin desajustar la
 * hidratación.
 */
function useCanRecordVoice(): boolean {
  return useSyncExternalStore(
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
  autoFocus?: boolean;
  /** Para llevar el foco a la caja desde fuera (atajo R de la bandeja). */
  inputRef?: Ref<HTMLTextAreaElement>;
  className?: string;
}

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = 'Escribe un mensaje…',
  onNotice,
  autoFocus,
  inputRef,
  className,
}: ChatComposerProps) {
  const [value, setValue] = useState('');
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const [sending, setSending] = useState(false);
  const [recorder, setRecorder] = useState<VoiceRecorder | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const canRecord = useCanRecordVoice();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim();
  const canSend = (trimmed.length > 0 || attachment != null) && !sending && !disabled;

  const notify = useCallback((message: string) => onNotice?.(message), [onNotice]);

  /** El object URL de la vista previa se revoca cuando el adjunto deja de estar en
   *  pantalla; si no, cada foto descartada se queda en memoria. */
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

  const submit = useCallback(async () => {
    if (!canSend) return;
    const body = trimmed.length > 0 ? trimmed : undefined;
    const outgoing = attachment ?? undefined;
    setSending(true);
    setValue('');
    // La vista previa la hereda la burbuja optimista: se suelta SIN revocar.
    setAttachment(null);
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
      notify(err instanceof VoiceRecordingError ? err.message : 'No se pudo iniciar la grabación.');
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

  useEffect(() => {
    if (!recorder) return;
    const id = setInterval(() => setRecordedSeconds(recorder.elapsedSeconds), TIMER_TICK_MS);
    return () => clearInterval(id);
  }, [recorder]);

  // Si la pantalla se cierra en mitad de una grabación, soltar el micrófono.
  useEffect(() => () => recorder?.cancel(), [recorder]);

  if (recorder) {
    const label = `${Math.floor(recordedSeconds / 60)}:${String(Math.floor(recordedSeconds % 60)).padStart(2, '0')}`;
    return (
      <div className={cn('flex items-center gap-3 border-t border-v2-border px-3 py-2.5', className)}>
        <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-v2-danger motion-reduce:animate-none" />
        <span className="t-body font-medium text-v2-fg">Grabando</span>
        <span role="timer" className="t-body text-v2-muted t-tnum">
          {label}
        </span>
        <span className="flex-1" />
        <Button size="md" variant="ghost" onClick={cancelRecording}>
          Descartar
        </Button>
        <Button size="md" variant="secondary" icon={Square} onClick={() => void stopRecording()}>
          Listo
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2 border-t border-v2-border px-3 py-2.5', className)}>
      {attachment ? <AttachmentPreview attachment={attachment} onDiscard={() => replaceAttachment(null)} /> : null}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          // Permite volver a elegir el MISMO fichero después de descartarlo.
          e.target.value = '';
        }}
      />

      <Textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, CHAT_BODY_MAX))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        onPaste={(e) => {
          // Pegar una captura directamente: la vía natural si el coach está
          // mirando una gráfica en otra pestaña.
          const file = Array.from(e.clipboardData.files)[0];
          if (!file) return;
          e.preventDefault();
          acceptFile(file);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label="Mensaje"
        className="max-h-40 min-h-10 resize-none"
      />

      <div className="flex items-center gap-1">
        <IconButton
          icon={Paperclip}
          label="Adjuntar un archivo"
          disabled={disabled || sending}
          onClick={() => fileInputRef.current?.click()}
        />
        {canRecord ? (
          <IconButton
            icon={Mic}
            label="Grabar una nota de voz"
            disabled={disabled || sending}
            onClick={() => void startRecording()}
          />
        ) : null}
        <span className="ml-auto hidden items-center gap-1 t-meta text-v2-faint pointer-fine:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>Enter</Kbd>
        </span>
        <Button
          size="md"
          variant="primary"
          icon={Send}
          loading={sending}
          disabled={!canSend}
          onClick={() => void submit()}
          className="ml-2 pointer-coarse:ml-auto"
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}

/** Lo que se va a enviar, antes de enviarlo. Una imagen se ve; lo demás se nombra. */
function AttachmentPreview({ attachment, onDiscard }: { attachment: PendingAttachment; onDiscard: () => void }) {
  const isImage = attachment.kind === 'image';
  const isVoice = attachment.kind === 'voice';
  const Icon = attachment.kind === 'video' ? Film : isVoice ? AudioLines : File;
  const duration = attachment.meta.duration_ms
    ? `${Math.floor(attachment.meta.duration_ms / 60000)}:${String(
        Math.round((attachment.meta.duration_ms % 60000) / 1000),
      ).padStart(2, '0')}`
    : null;

  return (
    <div className="flex items-center gap-2.5 rounded-ctl border border-v2-border bg-v2-bg p-2">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- object URL local.
        <img src={attachment.preview_url} alt="" className="size-11 shrink-0 rounded-[4px] object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[4px] bg-v2-surface-2">
          <Icon aria-hidden strokeWidth={1.75} className="size-5 text-v2-muted" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-medium text-v2-fg">
          {isVoice ? 'Nota de voz' : attachment.file.name}
        </span>
        <span className="block t-meta text-v2-faint t-tnum">
          {duration ?? `${Math.max(1, Math.round(attachment.file.size / 1024))} KB`}
        </span>
      </span>
      <IconButton icon={X} label="Descartar el adjunto" onClick={onDiscard} />
    </div>
  );
}
