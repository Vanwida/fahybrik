// La conversación entera: historial, mensajes en vivo y caja de escribir.
//
// Es el componente de chat del panel. Mensajes y la ficha del atleta montan este
// mismo componente sobre el mismo estado (`useConversation`), así que no pueden
// divergir. (El ChatDrawer compartido usa el mismo hook y la misma burbuja.)
//
// El scroll baja solo cuando ya estabas abajo: si estás leyendo algo de hace tres
// semanas y entra un mensaje, arrancarte de donde estás es peor que no enseñarlo.

'use client';

import { useCallback, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { CircleAlert, MessageCircle, X } from 'lucide-react';
import { EmptyState, ErrorState, IconButton, Skeleton } from '@/components/v2/ui';
import type { MessageDTO } from '@/lib/chat/client';
import { ChatBubble } from './ChatBubble';
import { ChatComposer } from './ChatComposer';
import { useConversation, type UIMessage } from './useConversation';
import { cn } from '@/lib/utils';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

/** A cuántos píxeles del fondo se sigue considerando que estás "abajo". */
const AT_BOTTOM_SLACK_PX = 80;

const DAY_OPTS: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };

/** Clave estable de día natural en el huso del club, para agrupar por jornada. */
function dayKey(iso: string, tz: string): string {
  return zonedFormat(tz, 'es-ES', DAY_OPTS).format(new Date(iso));
}

function dayLabel(iso: string, tz: string): string {
  const key = dayKey(iso, tz);
  if (key === dayKey(new Date().toISOString(), tz)) return 'Hoy';
  if (key === dayKey(new Date(Date.now() - 86_400_000).toISOString(), tz)) return 'Ayer';
  return key.replace(/\.$/, '');
}

export interface ConversationProps {
  athleteId: string;
  threadId: string;
  /** Primer tramo cargado en el servidor: la conversación aparece ya escrita. */
  initialMessages?: MessageDTO[];
  /** Cada mensaje que se asienta, para que la lista de fuera se ponga al día. */
  onActivity?: (message: MessageDTO) => void;
  /** Si el panel está realmente a la vista (ver useConversation.visible). */
  visible?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Para llevar el foco a la caja de escribir desde fuera. */
  inputRef?: Ref<HTMLTextAreaElement>;
  className?: string;
}

export function Conversation({
  athleteId,
  threadId,
  initialMessages,
  onActivity,
  visible,
  placeholder,
  autoFocus,
  inputRef,
  className,
}: ConversationProps) {
  const chat = useConversation({ athleteId, threadId, initialMessages, onActivity, visible });
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_SLACK_PX;
  }, []);

  // Antes de pintar: el salto al fondo no se ve como un tirón.
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
        <MessageList chat={chat} athleteId={athleteId} />
      </div>

      {shownNotice ? (
        <div role="status" className="flex items-center gap-2 border-t border-v2-border bg-v2-danger-soft px-3 py-1.5 t-body-sm text-v2-fg">
          <CircleAlert aria-hidden strokeWidth={2} className="size-4 shrink-0 text-v2-danger" />
          <span className="min-w-0 flex-1">{shownNotice}</span>
          <IconButton icon={X} label="Descartar el aviso" size="sm" onClick={dismiss} />
        </div>
      ) : null}

      <ChatComposer
        onSend={(input) => {
          stickToBottom.current = true;
          return chat.send(input);
        }}
        disabled={chat.loading || chat.loadFailed}
        placeholder={placeholder}
        onNotice={setNotice}
        autoFocus={autoFocus}
        inputRef={inputRef}
      />
    </div>
  );
}

function MessageList({ chat, athleteId }: { chat: ReturnType<typeof useConversation>; athleteId: string }) {
  const tz = useCoachTimeZone();
  if (chat.loadFailed) {
    return (
      <div className="p-4">
        <ErrorState title="No se ha podido cargar la conversación" onRetry={chat.reload} />
      </div>
    );
  }

  if (chat.loading) {
    return (
      <div role="status" aria-label="Cargando la conversación" className="flex flex-col gap-3 p-4">
        <Skeleton className="h-9 w-3/5 rounded-panel" />
        <Skeleton className="ml-auto h-9 w-1/2 rounded-panel" />
        <Skeleton className="h-14 w-2/5 rounded-panel" />
      </div>
    );
  }

  if (chat.messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState icon={MessageCircle} title="Todavía no os habéis escrito" description="empieza tú" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {chat.messages.map((message: UIMessage, i) => {
        const previous = chat.messages[i - 1];
        const newDay = !previous || dayKey(message.created_at, tz) !== dayKey(previous.created_at, tz);
        return (
          <div key={message.id} className="flex flex-col gap-2">
            {newDay ? (
              // «Hoy»/«Ayer» dependen de «ahora»: servidor y navegador pueden
              // discrepar en el filo de medianoche.
              <div suppressHydrationWarning className="py-1 text-center t-meta text-v2-faint first-letter:uppercase">
                {dayLabel(message.created_at, tz)}
              </div>
            ) : null}
            <ChatBubble message={message} athleteId={athleteId} onRetry={chat.retry} onDelete={chat.remove} />
          </div>
        );
      })}
    </div>
  );
}
