// Un mensaje de la conversación.
//
// El lado lo decide `sender_role`, que es una columna real y no una deducción a
// partir de quién escribió: en la cuenta donde el coach es también su propio
// atleta, el id de usuario es el mismo por los dos lados y no distingue nada.
//
// Un mensaje puede llevar texto, un adjunto, o las dos cosas. El adjunto se pinta
// SIN la caja de la burbuja —una foto ya tiene su propio borde— y el texto, si lo
// hay, va debajo en su burbuja.
//
// Color: neutro. Lo del coach en tinta invertida, lo del atleta sobre la
// superficie; el acento del club no pinta burbujas (plan §3: solo botón
// primario, anillo de foco y logo).
//
// El pie cuenta la verdad del mensaje: la hora, o que está saliendo, o que no
// salió y se puede reintentar. Un mensaje propio ya leído lleva el doble check.

// Sin directiva `use client` a propósito: siempre se monta desde un componente
// que ya es de cliente (la conversación), así que hereda ese lado.
import { useState } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, ChevronRight, CircleAlert, RotateCcw, Trash2 } from 'lucide-react';
import { Button, IconButton } from '@/components/v2/ui';
import { ChatAttachment } from './ChatAttachment';
import type { UIMessage } from './useConversation';
import { cn } from '@/lib/utils';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

export function ChatBubble({
  message,
  athleteId,
  onRetry,
  onDelete,
}: {
  message: UIMessage;
  /** De quién es el hilo — hace falta para llevar a SU sesión. */
  athleteId?: string;
  /** Reintentar un envío fallido. */
  onRetry?: (id: string) => void;
  /** Borrar un mensaje PROPIO. Sin esto no se ofrece la acción. */
  onDelete?: (id: string) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isCoach = message.sender_role === 'coach';
  const hasText = !!message.body && message.body.trim().length > 0;
  const hasAttachment = !!message.attachment_url && !!message.attachment_kind;

  return (
    <div className={cn('group/msg flex w-full gap-1.5', isCoach ? 'justify-end' : 'justify-start')}>
      {/* Las acciones van por fuera de la burbuja, del lado de dentro, para que no
          tapen el texto ni desplacen nada al aparecer. */}
      {isCoach && onDelete && !message.pending ? (
        <div
          className={cn(
            // En táctil no hay «pasar por encima»: el borrado se queda para el escritorio.
            'flex items-center transition-opacity pointer-coarse:hidden',
            confirmingDelete ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/msg:opacity-100',
          )}
        >
          {confirmingDelete ? (
            <span className="flex items-center gap-1">
              <Button size="sm" variant="destructive" onClick={() => onDelete(message.id)}>
                Borrar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <IconButton icon={Trash2} label="Borrar el mensaje" size="sm" onClick={() => setConfirmingDelete(true)} />
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex max-w-[78%] min-w-0 flex-col gap-1',
          isCoach ? 'items-end' : 'items-start',
          message.pending && 'opacity-70',
        )}
      >
        {message.context ? (
          <SobreQue
            label={message.context.label}
            preview={message.context.preview}
            // Solo lleva a algún sitio una SESIÓN que siga existiendo.
            href={
              message.context.kind === 'session' && message.context.exists && athleteId
                ? `/atletas/${athleteId}?tab=plan&sesion=${message.context.ref}`
                : null
            }
          />
        ) : null}

        {hasAttachment ? <ChatAttachment message={message} /> : null}

        {hasText ? (
          <span
            className={cn(
              'whitespace-pre-wrap break-words rounded-panel px-3 py-2 t-body',
              isCoach ? 'rounded-br-[4px] bg-v2-fg text-v2-bg' : 'rounded-bl-[4px] bg-v2-surface-2 text-v2-fg',
            )}
          >
            {message.body}
          </span>
        ) : null}

        <Footer message={message} isCoach={isCoach} onRetry={onRetry} />
      </div>
    </div>
  );
}

/**
 * SOBRE QUÉ va el mensaje (una sesión, un ejercicio, una carrera). La etiqueta
 * la redacta el servidor (`lib/chat/context.ts`); `preview` es el dato de HOY de
 * esa cosa. Solo es enlace cuando hay a dónde ir de verdad.
 */
function SobreQue({ label, preview, href }: { label: string; preview?: string | null; href?: string | null }) {
  const cuerpo = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="t-label text-v2-faint">Sobre</span>
        <span className="break-words t-body-sm font-medium text-v2-fg">{label}</span>
        {preview ? <span className="break-words t-meta text-v2-muted">{preview}</span> : null}
      </span>
      {href ? <ChevronRight aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-v2-faint" /> : null}
    </>
  );
  const marco = 'flex max-w-full items-center gap-1.5 rounded-ctl border border-v2-border bg-v2-surface px-2 py-1.5';
  if (!href) return <span className={marco}>{cuerpo}</span>;
  return (
    <Link
      href={href}
      className={cn(
        marco,
        'outline-none transition-colors hover:border-v2-border-strong focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]',
      )}
    >
      {cuerpo}
    </Link>
  );
}

function Footer({
  message,
  isCoach,
  onRetry,
}: {
  message: UIMessage;
  isCoach: boolean;
  onRetry?: (id: string) => void;
}) {
  const TIME_FMT = zonedFormat(useCoachTimeZone(), 'es-ES', TIME_OPTS);
  if (message.failed) {
    return (
      <span className="flex items-center gap-1.5 px-1 t-meta text-v2-danger">
        <CircleAlert aria-hidden strokeWidth={2} className="size-3.5" />
        No se envió
        {onRetry ? (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => onRetry(message.id)}>
            Reintentar
          </Button>
        ) : null}
      </span>
    );
  }

  if (message.pending) {
    return <span className="px-1 t-meta text-v2-faint">enviando…</span>;
  }

  const ReadIcon = message.read_at ? CheckCheck : Check;
  return (
    <span suppressHydrationWarning className="flex items-center gap-1 px-1 t-meta text-v2-faint t-tnum">
      {TIME_FMT.format(new Date(message.created_at))}
      {isCoach ? (
        <ReadIcon
          strokeWidth={2}
          className={cn('size-3.5', message.read_at && 'text-v2-info')}
          aria-label={message.read_at ? 'Leído' : 'Enviado'}
        />
      ) : null}
    </span>
  );
}
