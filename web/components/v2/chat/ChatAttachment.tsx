// Cómo se ve un adjunto dentro de una burbuja de chat.
//
// Cuatro formas, una por tipo, y ninguna es un enlace suelto: una foto de técnica
// se mira, un vídeo se reproduce y una nota de voz se escucha SIN salir de la
// conversación.
//
// Los bytes se piden a `/api/chat/attachments/...`, que comprueba que quien mira
// pertenece al hilo y redirige a una URL firmada de vida corta. `img`, `video` y
// `audio` siguen la redirección solos. Mientras el adjunto está subiendo, la
// misma URL es un object URL local, y también se pinta igual.

// Sin directiva `use client`: se monta desde la burbuja, que ya está del lado del
// cliente.
import { useCallback, useRef, useState } from 'react';
import { Download, File, FileText, Pause, Play } from 'lucide-react';
import { Dialog, IconButton } from '@/components/v2/ui';
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

/** m:ss. Null cuando aún no se sabe la duración: mejor nada que un 0:00 que miente. */
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

/** La miniatura es un ENLACE a la imagen (funciona sin JS y con clic central);
 *  el clic normal la abre en grande sin salir de la conversación. */
function ImageAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const [open, setOpen] = useState(false);
  const meta = metaOf(message);
  const label = attachmentLabel(message);
  // Con las dimensiones conocidas se reserva el hueco exacto y la conversación no
  // pega un salto cuando la imagen termina de cargar.
  const ratio = meta.width && meta.height ? `${meta.width} / ${meta.height}` : undefined;

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          setOpen(true);
        }}
        aria-label="Ver la imagen a tamaño completo"
        className="block overflow-hidden rounded-panel bg-v2-surface-2 outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-bg),0_0_0_4px_var(--v2-accent)]"
        style={{ maxWidth: MEDIA_MAX_WIDTH }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- el proxy de adjuntos
            responde con una redirección firmada de vida corta, que el optimizador de
            imágenes de Next no puede seguir. */}
        <img src={url} alt={label} loading="lazy" className="block h-auto w-full object-cover" style={{ aspectRatio: ratio }} />
      </a>
      <Dialog open={open} onOpenChange={setOpen} title={label} size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- ver arriba. */}
        <img src={url} alt={label} className="mx-auto block max-h-[70dvh] max-w-full rounded-ctl object-contain" />
      </Dialog>
    </>
  );
}

function VideoAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const meta = metaOf(message);
  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      aria-label={attachmentLabel(message)}
      className="block w-full rounded-panel bg-black"
      style={{
        maxWidth: MEDIA_MAX_WIDTH,
        aspectRatio: meta.width && meta.height ? `${meta.width} / ${meta.height}` : undefined,
      }}
    />
  );
}

/**
 * Reproductor compacto propio en vez del `<audio controls>` del navegador (300 px
 * y distinto en cada uno): un botón, una barra que se puede arrastrar o mover con
 * las flechas, y el tiempo.
 */
function VoiceAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const metaDurationMs = metaOf(message).duration_ms;
  const [duration, setDuration] = useState<number | null>(metaDurationMs ? metaDurationMs / 1000 : null);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    el.currentTime = Math.max(0, seconds);
    setElapsed(el.currentTime);
  }, []);

  const max = duration && duration > 0 ? duration : 0;
  const pct = max > 0 ? Math.min(100, (elapsed / max) * 100) : 0;
  const shown = clock(playing || elapsed > 0 ? elapsed : duration);

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (max === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    seekTo(((e.clientX - rect.left) / rect.width) * max);
  };

  return (
    <div className="flex w-[220px] items-center gap-2 rounded-panel bg-v2-surface-2 py-1 pr-3 pl-1">
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
      <IconButton
        icon={playing ? Pause : Play}
        label={playing ? 'Pausar la nota de voz' : 'Escuchar la nota de voz'}
        size="md"
        variant="ghost"
        onClick={toggle}
      />
      <div
        role="slider"
        tabIndex={max === 0 ? -1 : 0}
        aria-label="Posición de la nota de voz"
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(elapsed)}
        aria-valuetext={shown ?? undefined}
        onPointerDown={seekFromPointer}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seekTo(Math.min(max, elapsed + 2));
          else if (e.key === 'ArrowLeft') seekTo(elapsed - 2);
          else return;
          e.preventDefault();
        }}
        className="relative flex h-6 min-w-0 flex-1 cursor-pointer items-center rounded-ctl outline-none focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
      >
        <span className="block h-1 w-full overflow-hidden rounded-full bg-v2-border-strong">
          <span className="block h-full bg-v2-fg" style={{ width: `${pct}%` }} />
        </span>
      </div>
      {shown ? <span className="shrink-0 t-meta text-v2-muted t-tnum">{shown}</span> : null}
    </div>
  );
}

function FileAttachment({ url, message }: { url: string; message: MessageDTO }) {
  const label = attachmentLabel(message);
  const size = metaOf(message).size_bytes;
  const ext = label.includes('.') ? label.split('.').pop()!.toLowerCase() : '';
  const Icon = ['pdf', 'docx', 'txt', 'md'].includes(ext) ? FileText : File;
  return (
    <a
      href={url}
      download={label}
      className="flex max-w-[260px] items-center gap-2.5 rounded-panel border border-v2-border bg-v2-surface px-3 py-2 outline-none transition-colors hover:border-v2-border-strong focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
    >
      <Icon aria-hidden strokeWidth={1.75} className="size-5 shrink-0 text-v2-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-medium text-v2-fg">{label}</span>
        {size ? <span className="block t-meta text-v2-faint t-tnum">{humanBytes(size)}</span> : null}
      </span>
      <Download aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-v2-faint" />
    </a>
  );
}
