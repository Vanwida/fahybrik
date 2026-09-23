'use client';

// El hilo con UN atleta, en un panel lateral (ChatDrawer) o metido en otro sitio
// (ChatThread), sobre el MISMO estado de chat que Mensajes (`useConversation`:
// en vivo, adjuntos, reintentos). Marca leído SOLO el hilo de este atleta, y solo
// mientras está a la vista. ⌘Enter (Ctrl+Enter) envía; Enter hace salto de línea.
//
//   <ChatDrawer open={open} onOpenChange={setOpen} athleteId="11" athleteName="Marc Vidal" />
//   <ChatThread athleteId="11" athleteName="Marc Vidal" className="h-[420px]" />
//   <ChatReplyBox athleteId="11" athleteName="Marc Vidal" onSent={…} />   (solo la caja, sin hilo)

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { ExternalLink, MessageCircle, Send } from 'lucide-react';
import { ChatLiveProvider, useConversation, type UIMessage } from '@/components/v2/chat';
import { ChatBubble } from '@/components/v2/chat/ChatBubble';
import { CHAT_BODY_MAX, sendMessage, type MessageDTO } from '@/lib/chat/client';
import {
  Button,
  EmptyState,
  ErrorState,
  Kbd,
  Sheet,
  Skeleton,
  Textarea,
  buttonVariants,
  useToast,
} from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { apiJson, errorMessage } from './api';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

const PAGE = 50;

interface FirstPage {
  thread_id: string;
  messages: MessageDTO[];
}

/** Primer tramo + id del hilo (la API lo trae; `fetchMessages` lo descarta). */
function useFirstPage(athleteId: string) {
  const [state, setState] = useState<{ data: FirstPage | null; error: string | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    apiJson<FirstPage>(`/api/chat/threads/${encodeURIComponent(athleteId)}/messages?limit=${PAGE}`, {
      signal: ctrl.signal,
    })
      .then((data) =>
        setState({ data: { thread_id: data.thread_id, messages: data.messages.slice().reverse() }, error: null }),
      )
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ data: null, error: errorMessage(err, 'No se ha podido cargar la conversación') });
      });
    return () => ctrl.abort();
  }, [athleteId, attempt]);
  return {
    ...state,
    retry: () => {
      setState({ data: null, error: null });
      setAttempt((a) => a + 1);
    },
  };
}

const DAY_OPTS: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };

/** Caja de escribir: Textarea + Enviar, ⌘Enter envía. */
function Composer({
  onSend,
  placeholder,
  disabled,
  autoFocus,
}: {
  onSend: (body: string) => Promise<boolean>;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    const ok = await onSend(body);
    setSending(false);
    if (ok) setValue('');
  };
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, CHAT_BODY_MAX))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        rows={2}
        aria-label="Mensaje"
        className="max-h-40"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="hidden items-center gap-1 t-meta text-v2-faint sm:inline-flex">
          <Kbd>⌘</Kbd>
          <Kbd>Enter</Kbd> envía
        </span>
        <Button
          size="sm"
          variant="primary"
          icon={Send}
          loading={sending}
          disabled={disabled || value.trim().length === 0}
          onClick={() => void submit()}
          className="ml-auto"
        >
          Enviar
        </Button>
      </div>
    </div>
  );
}

function Messages({
  messages,
  athleteId,
  onRetry,
  onDelete,
}: {
  messages: UIMessage[];
  athleteId: string;
  onRetry: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // El día de cada mensaje, en el huso del club.
  const DAY = zonedFormat(useCoachTimeZone(), 'es-ES', DAY_OPTS);
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const day = DAY.format(new Date(m.created_at));
        const newDay = !prev || DAY.format(new Date(prev.created_at)) !== day;
        return (
          <div key={m.id} className="flex flex-col gap-2">
            {newDay ? (
              <div suppressHydrationWarning className="py-1 text-center t-meta text-v2-faint">
                {day}
              </div>
            ) : null}
            <ChatBubble message={m} athleteId={athleteId} onRetry={onRetry} onDelete={onDelete} />
          </div>
        );
      })}
    </div>
  );
}

function ThreadBody({
  athleteId,
  athleteName,
  first,
  visible,
  autoFocus,
}: {
  athleteId: string;
  athleteName: string;
  first: FirstPage;
  visible: boolean;
  autoFocus?: boolean;
}) {
  const chat = useConversation({ athleteId, threadId: first.thread_id, initialMessages: first.messages, visible });
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);
  const firstName = athleteName.split(/\s+/)[0] ?? athleteName;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        role="log"
        aria-label={`Conversación con ${athleteName}`}
        aria-live="polite"
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {chat.loadFailed ? (
          <ErrorState title="No se ha podido cargar la conversación" onRetry={chat.reload} />
        ) : chat.messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title={`Todavía no os habéis escrito`} description="empieza tú" />
        ) : (
          <Messages
            messages={chat.messages}
            athleteId={athleteId}
            onRetry={(id) => void chat.retry(id)}
            onDelete={(id) => void chat.remove(id)}
          />
        )}
      </div>
      {chat.notice ? <ErrorState title={chat.notice} className="shrink-0" /> : null}
      <div className="shrink-0">
        <Composer
          placeholder={`Escribe a ${firstName}…`}
          autoFocus={autoFocus}
          onSend={async (body) => {
            stick.current = true;
            await chat.send({ body });
            return true;
          }}
        />
      </div>
    </div>
  );
}

/** El hilo metido en cualquier sitio (ocupa la altura que le des). */
export function ChatThread({
  athleteId,
  athleteName,
  visible = true,
  autoFocus,
  className,
}: {
  athleteId: string;
  athleteName: string;
  /** Si está realmente a la vista: lo que no se ve no se marca leído. */
  visible?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const { data, error, retry } = useFirstPage(athleteId);
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {error ? (
        <ErrorState title="No se ha podido cargar la conversación" description={error} onRetry={retry} />
      ) : !data ? (
        <div role="status" aria-label="Cargando la conversación" className="flex flex-col gap-3">
          <Skeleton className="h-9 w-3/5" />
          <Skeleton className="ml-auto h-9 w-1/2" />
          <Skeleton className="h-9 w-2/5" />
        </div>
      ) : (
        <ChatLiveProvider>
          <ThreadBody
            key={data.thread_id}
            athleteId={athleteId}
            athleteName={athleteName}
            first={data}
            visible={visible}
            autoFocus={autoFocus}
          />
        </ChatLiveProvider>
      )}
    </div>
  );
}

/** El hilo en un panel lateral. No modal por defecto: la lista sigue viva detrás. */
export function ChatDrawer({
  open,
  onOpenChange,
  athleteId,
  athleteName,
  modal = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: string;
  athleteName: string;
  modal?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal={modal}
      title={athleteName}
      actions={
        <Link
          href={`/mensajes?hilo=${encodeURIComponent(athleteId)}`}
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          Abrir en Mensajes
          <ExternalLink aria-hidden strokeWidth={1.75} className="opacity-70" />
        </Link>
      }
    >
      {open ? <ChatThread athleteId={athleteId} athleteName={athleteName} autoFocus className="h-full" /> : null}
    </Sheet>
  );
}

/** Solo la caja de responder (el vistazo): envía y avisa; no abre el hilo. */
export function ChatReplyBox({
  athleteId,
  athleteName,
  onSent,
  autoFocus,
}: {
  athleteId: string;
  athleteName: string;
  onSent?: (message: MessageDTO) => void;
  autoFocus?: boolean;
}) {
  const { toast } = useToast();
  const firstName = athleteName.split(/\s+/)[0] ?? athleteName;
  return (
    <Composer
      placeholder={`Responder a ${firstName}…`}
      autoFocus={autoFocus}
      onSend={async (body) => {
        try {
          const saved = await sendMessage(athleteId, { body });
          toast({ title: `Enviado a ${firstName}`, tone: 'ok' });
          onSent?.(saved);
          return true;
        } catch (err) {
          toast({
            title: 'No se ha podido enviar',
            description: err instanceof Error && err.message ? err.message : undefined,
            tone: 'danger',
          });
          return false;
        }
      }}
    />
  );
}
