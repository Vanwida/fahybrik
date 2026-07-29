// Un mensaje de la conversación.
//
// El lado lo decide `sender_role`, que es una columna real y no una deducción a
// partir de quién escribió: en la cuenta donde el coach es también su propio
// atleta, el id de usuario es el mismo por los dos lados y no distingue nada.
//
// Un mensaje puede llevar texto, un adjunto, o las dos cosas. El adjunto se pinta
// SIN la caja de la burbuja —una foto ya tiene su propio borde— y el texto, si lo
// hay, va debajo en su burbuja. Envolver una imagen en un rectángulo de color
// solo consigue que se vea más pequeña.
//
// El pie cuenta la verdad del mensaje: la hora, o que está saliendo, o que no
// salió y se puede reintentar. Un mensaje propio ya leído se marca con el doble
// check, que es la pregunta que el coach se hace de verdad.

// Sin directiva `use client` a propósito: siempre se monta desde un componente
// que ya es de cliente (la conversación), así que hereda ese lado. Ponérsela lo
// convertiría en punto de entrada del bundle de cliente y Next exigiría que sus
// props fueran serializables — cosa que un `onRetry` no es.
import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { ChatAttachment } from './ChatAttachment';
import type { UIMessage } from './useConversation';
import { cn } from '@/lib/utils';

const TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

export function ChatBubble({
  message,
  onRetry,
  onDelete,
}: {
  message: UIMessage;
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
      {isCoach && onDelete ? (
        <div className="flex items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/msg:opacity-100">
          {confirmingDelete ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="v2-focus rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label font-bold text-[color:var(--v2-danger)] hover:bg-[color:var(--v2-danger-soft)]"
              >
                Borrar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="v2-focus rounded-[var(--v2-r-s)] px-1.5 py-0.5 text-label text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)]"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Borrar el mensaje"
              className="v2-focus flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-faint)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
            >
              <MIcon name="delete" size={15} />
            </button>
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex max-w-[78%] flex-col gap-1',
          isCoach ? 'items-end' : 'items-start',
          message.pending && 'opacity-70',
        )}
      >
        {hasAttachment ? <ChatAttachment message={message} /> : null}

        {hasText ? (
          <span
            className={cn(
              'whitespace-pre-wrap break-words rounded-[var(--v2-r-m)] px-3 py-2 text-body leading-relaxed',
              isCoach
                ? 'rounded-br-[var(--v2-r-xs)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-fg)]'
                : 'rounded-bl-[var(--v2-r-xs)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-fg)]',
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

function Footer({
  message,
  isCoach,
  onRetry,
}: {
  message: UIMessage;
  isCoach: boolean;
  onRetry?: (id: string) => void;
}) {
  if (message.failed) {
    return (
      <span className="flex items-center gap-1.5 px-1 text-eyebrow text-[color:var(--v2-danger)]">
        <MIcon name="error" size={12} />
        No se envió
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(message.id)}
            className="v2-focus rounded-[var(--v2-r-s)] font-bold underline underline-offset-2"
          >
            Reintentar
          </button>
        ) : null}
      </span>
    );
  }

  if (message.pending) {
    return <span className="px-1 text-eyebrow text-[color:var(--v2-faint)]">enviando…</span>;
  }

  return (
    <span className="v2-num flex items-center gap-1 px-1 text-eyebrow text-[color:var(--v2-faint)]">
      {TIME_FMT.format(new Date(message.created_at))}
      {isCoach ? (
        <MIcon
          name={message.read_at ? 'done_all' : 'done'}
          size={13}
          className={message.read_at ? 'text-[color:var(--v2-accent)]' : undefined}
          aria-label={message.read_at ? 'Leído' : 'Enviado'}
        />
      ) : null}
    </span>
  );
}
