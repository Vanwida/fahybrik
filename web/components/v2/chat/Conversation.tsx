// La conversación entera: historial, mensajes en vivo y caja de escribir.
//
// Es el ÚNICO componente de chat del dashboard. Las dos pantallas que lo enseñan
// —Mensajes y la pestaña de la ficha del atleta— montan este mismo componente, y
// por eso ya no pueden divergir: hasta el 26-jul una refrescaba cada 3s y la otra
// no refrescaba nunca, porque cada una traía su propio código.
//
// El scroll no se comporta igual siempre a propósito: baja solo cuando ya estabas
// abajo. Si estás leyendo algo de hace tres semanas y entra un mensaje, arrancarte
// de donde estás es peor que no enseñarte el mensaje.

'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import type { MessageDTO } from '@/lib/chat/client';
import { ChatBubble } from './ChatBubble';
import { ChatComposer } from './ChatComposer';
import { useConversation, type UIMessage } from './useConversation';
import { cn } from '@/lib/utils';

/** A cuántos píxeles del fondo se sigue considerando que estás "abajo". Da margen
 *  para el rebote del scroll y para la última línea a medio ver. */
const AT_BOTTOM_SLACK_PX = 80;

const DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Madrid',
});

/** Clave estable de día natural en Madrid, para agrupar por jornada. */
function dayKey(iso: string): string {
  return DAY_FMT.format(new Date(iso));
}

function dayLabel(iso: string): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date().toISOString())) return 'Hoy';
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString())) return 'Ayer';
  return key.replace(/\.$/, '');
}

export interface ConversationProps {
  athleteId: string;
  threadId: string;
  /** Primer tramo cargado en el servidor: la conversación aparece ya escrita. */
  initialMessages?: MessageDTO[];
  /** Cada mensaje que se asienta, para que la lista de fuera se ponga al día. */
  onActivity?: (message: MessageDTO) => void;
  placeholder?: string;
  className?: string;
}

export function Conversation({
  athleteId,
  threadId,
  initialMessages,
  onActivity,
  placeholder,
  className,
}: ConversationProps) {
  const chat = useConversation({ athleteId, threadId, initialMessages, onActivity });
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_SLACK_PX;
  }, []);

  // useLayoutEffect: se ajusta ANTES de pintar, así que el salto al fondo no se
  // ve como un tirón.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  const shownNotice = notice ?? chat.notice;
  const dismiss = useCallback(() => {
    setNotice(null);
    chat.dismissNotice();
  }, [chat]);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-label="Conversación"
        aria-live="polite"
      >
        <MessageList chat={chat} />
      </div>

      {shownNotice ? <Notice message={shownNotice} onDismiss={dismiss} /> : null}

      <ChatComposer
        onSend={chat.send}
        disabled={chat.loading || chat.loadFailed}
        placeholder={placeholder}
        onNotice={setNotice}
      />
    </div>
  );
}

function MessageList({ chat }: { chat: ReturnType<typeof useConversation> }) {
  if (chat.loadFailed) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon="error"
          title="No se pudo cargar la conversación"
          description="Comprueba tu conexión e inténtalo de nuevo."
          action={
            <button
              type="button"
              onClick={chat.reload}
              className="v2-focus rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
            >
              Reintentar
            </button>
          }
        />
      </div>
    );
  }

  if (chat.loading) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')} aria-hidden>
            <span className="h-9 w-44 animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)] motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    );
  }

  if (chat.messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon="forum"
          title="Sin mensajes todavía"
          description="Escribe abajo para iniciar la conversación."
          className="border-none"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {chat.messages.map((message: UIMessage, i) => {
        const previous = chat.messages[i - 1];
        const newDay = !previous || dayKey(message.created_at) !== dayKey(previous.created_at);
        return (
          <div key={message.id} className="flex flex-col gap-2">
            {newDay ? (
              <div className="my-1 flex items-center justify-center">
                <span className="v2-micro rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2.5 py-0.5">
                  {dayLabel(message.created_at)}
                </span>
              </div>
            ) : null}
            <ChatBubble message={message} onRetry={chat.retry} onDelete={chat.remove} />
          </div>
        );
      })}
    </div>
  );
}

function Notice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 border-t border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] px-3 py-2 text-[12px] text-[color:var(--v2-fg)]"
    >
      <MIcon name="error" size={15} className="mt-px shrink-0 text-[color:var(--v2-danger)]" />
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar el aviso"
        className="v2-focus shrink-0 rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="close" size={15} />
      </button>
    </div>
  );
}
