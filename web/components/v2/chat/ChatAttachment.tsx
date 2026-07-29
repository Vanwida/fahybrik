// Cómo se ve un adjunto dentro de una burbuja de chat.
//
// Cuatro formas, una por tipo, y ninguna es un enlace suelto: una foto de técnica
// se mira, un vídeo se reproduce y una nota de voz se escucha SIN salir de la
// conversación. Hasta el 26-jul el dashboard no leía siquiera las columnas del
// adjunto, así que la foto que mandaba el atleta llegaba como una burbuja vacía.
//
// Los bytes se piden a `/api/chat/attachments/...`, que comprueba que quien mira
// pertenece al hilo y redirige a una URL firmada de vida corta. `img`, `video` y
// `audio` siguen la redirección solos, así que aquí no hay nada especial que
// hacer: la URL del mensaje se usa tal cual. Mientras el adjunto está subiendo, la
// misma URL es un object URL local, y también se pinta igual.

// Sin directiva `use client`: se monta desde la burbuja, que ya está del lado del
// cliente.
import { useCallback, useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { attachmentLabel, type MessageDTO } from '@/lib/chat/client';

/** Ancho máximo de una imagen o un vídeo en la conversación. Lo bastante grande
 *  para juzgar una sentadilla de un vistazo, sin comerse la columna. */
const MEDIA_MAX_WIDTH = 260;

interface AttachmentMeta {
  duration_ms?: number;
  size_bytes?: number;
  mime_type?: string;
  width?: number;
  height?: number;
}

function metaOf(message: MessageDTO): AttachmentMeta {
  return (message.attachment_meta ?? {}) as AttachmentMeta;
}

/** m:ss a partir de segundos. Devuelve null cuando aún no se sabe la duración
 *  (el navegador todavía no ha leído los metadatos): mejor no poner nada que
 *  poner un 0:00 que miente. */
function clock(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ChatAttachment({ message }: { message: MessageDTO }) {
  const url = message.attachment_url;
  if (!url || !message.attachment_kind) return null;
  switch (message.attachment_kind) {
    case 'image':
      return <ImageAttachment url={url} message={message} />;
    case 'video':
      return <VideoAttachment url={url} message={message} />;
    case 'voice':
      return <VoiceAttachment url={url} message={message} />;
    case 'file':
      return <FileAttachment url={url} message={message} />;
    default:
      return null;
  }
}

// -----------------------------------------------------------------------------
// Imagen
// -----------------------------------------------------------------------------

function ImageAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const [open, setOpen] = useState(false);
  const meta = metaOf(message);
  // Con las dimensiones conocidas se reserva el hueco exacto y la conversación no
  // pega un salto cuando la imagen termina de cargar.
  const ratio = meta.width && meta.height ? `${meta.width} / ${meta.height}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver la imagen a tamaño completo"
        className="v2-focus block overflow-hidden rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)]"
        style={{ maxWidth: MEDIA_MAX_WIDTH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- el proxy de adjuntos
            responde con una redirección firmada de vida corta, que el optimizador de
            imágenes de Next no puede seguir. */}
        <img
          src={url}
          alt={attachmentLabel(message)}
          loading="lazy"
          className="block h-auto w-full object-cover"
          style={{ aspectRatio: ratio }}
        />
      </button>
      {open ? (
        <Lightbox url={url} label={attachmentLabel(message)} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** La imagen a pantalla completa. Se cierra con Escape, con el botón o pinchando
 *  fuera, y devuelve el foco a donde estaba al abrirla. */
function Lightbox({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--v2-scrim)] backdrop-blur-sm"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- ver ImageAttachment. */}
      <img
        src={url}
        alt={label}
        className="relative max-h-full max-w-full rounded-[var(--v2-r-m)] object-contain shadow-[var(--v2-shadow-pop)]"
      />
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="v2-focus absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--v2-surface)] text-[color:var(--v2-fg)] shadow-[var(--v2-shadow-pop)]"
      >
        <MIcon name="close" size={18} />
      </button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Vídeo
// -----------------------------------------------------------------------------

function VideoAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const meta = metaOf(message);
  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      aria-label={attachmentLabel(message)}
      className="block w-full rounded-[var(--v2-r-m)] bg-black"
      style={{
        maxWidth: MEDIA_MAX_WIDTH,
        aspectRatio: meta.width && meta.height ? `${meta.width} / ${meta.height}` : undefined,
      }}
    />
  );
}

// -----------------------------------------------------------------------------
// Nota de voz
// -----------------------------------------------------------------------------

/**
 * Reproductor compacto propio en vez del `<audio controls>` del navegador: ese
 * mide 300px, cambia de aspecto en cada navegador y rompe la conversación. Aquí
 * son un botón, una barra y el tiempo — que es todo lo que una nota de voz pide.
 */
function VoiceAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const metaDurationMs = metaOf(message).duration_ms;
  const [duration, setDuration] = useState<number | null>(
    metaDurationMs ? metaDurationMs / 1000 : null,
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Number(event.target.value);
    setElapsed(el.currentTime);
  }, []);

  const progressMax = duration && duration > 0 ? duration : 0;
  const remaining = clock(playing || elapsed > 0 ? elapsed : duration);

  return (
    <div className="flex w-[210px] items-center gap-2.5">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setElapsed(0);
        }}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar la nota de voz' : 'Reproducir la nota de voz'}
        className="v2-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)]"
      >
        <MIcon name={playing ? 'pause' : 'play_arrow'} size={18} filled />
      </button>
      <input
        type="range"
        min={0}
        max={progressMax}
        step={0.1}
        value={Math.min(elapsed, progressMax)}
        onChange={seek}
        disabled={progressMax === 0}
        aria-label="Posición de la nota de voz"
        className="v2-focus h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[color:var(--v2-border-strong)] accent-[color:var(--v2-accent)]"
      />
      {remaining ? (
        <span className="v2-num shrink-0 text-label tabular-nums text-[color:var(--v2-muted)]">
          {remaining}
        </span>
      ) : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Archivo
// -----------------------------------------------------------------------------

const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  pdf: 'picture_as_pdf',
  docx: 'description',
  txt: 'description',
  md: 'description',
};

function FileAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const label = attachmentLabel(message);
  const size = metaOf(message).size_bytes;
  const ext = label.includes('.') ? label.split('.').pop()!.toLowerCase() : '';
  return (
    <a
      href={url}
      download={label}
      className="v2-focus flex max-w-[260px] items-center gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 py-2 transition-colors hover:border-[color:var(--v2-border-strong)]"
    >
      <MIcon
        name={FILE_ICON_BY_EXTENSION[ext] ?? 'attach_file'}
        size={20}
        className="shrink-0 text-[color:var(--v2-muted)]"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-[color:var(--v2-fg)]">
          {label}
        </span>
        {size ? (
          <span className="v2-num block text-label text-[color:var(--v2-faint)]">
            {humanBytes(size)}
          </span>
        ) : null}
      </span>
      <MIcon name="download" size={16} className="shrink-0 text-[color:var(--v2-faint)]" />
    </a>
  );
}
