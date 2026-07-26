// Mensajes — las tres columnas: lista, hilo abierto y contexto del atleta.
//
// Aquí se abre EL canal en vivo de la pantalla (`ChatLiveProvider`), uno solo
// para todo lo que se ve. La lista de la izquierda escucha ese mismo canal, así
// que un mensaje que entra en una conversación que no tienes abierta sube a lo
// alto de la lista con su contador, sin recargar nada. Antes solo se refrescaba
// el hilo abierto: cualquier otra conversación se enteraba al recargar la página.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { ChatLiveProvider, useChatLiveMessages } from '@/components/v2/chat';
import { ConversationList, type ConvFilter } from './ConversationList';
import { ThreadPanel } from './ThreadPanel';
import { ContextPanel } from './ContextPanel';
import type { MessageDTO } from '@/lib/chat/client';
import type { MensajesData, MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { PushBanner } from '@/components/v2/push/PushNotifications';
import { attachmentPreview } from '@/lib/chat/schema';
import { clearAppBadge } from '@/lib/push/client';
import { cn } from '@/lib/utils';

/** Espera mínima entre relecturas del servidor cuando aparece una conversación
 *  que no estaba en la lista. Sin este freno, un atleta escribiendo seguido en su
 *  primer minuto dispararía una recarga por mensaje. */
const UNKNOWN_THREAD_REFRESH_MS = 10_000;

/** La vista previa de un mensaje en la lista: el texto, o la etiqueta humana
 *  del adjunto — la MISMA que usa el push y la que pinta la lista al cargar. */
function previewOf(message: MessageDTO): string {
  if (message.body && message.body.trim().length > 0) return message.body;
  return attachmentPreview(message.attachment_kind ?? null);
}

export function MensajesScreen({
  data,
  initialThreadId,
}: {
  data: MensajesData;
  coach_name?: string;
  /** Hilo a abrir al llegar (deeplink `?hilo=` de un aviso push). */
  initialThreadId?: string | null;
}) {
  return (
    <ChatLiveProvider>
      <MensajesBody data={data} initialThreadId={initialThreadId} />
    </ChatLiveProvider>
  );
}

function MensajesBody({
  data,
  initialThreadId,
}: {
  data: MensajesData;
  initialThreadId?: string | null;
}) {
  const router = useRouter();
  // Copia local y mutable: abrir un hilo, responder o recibir algo se refleja al
  // instante sin volver al servidor.
  const [threads, setThreads] = useState<MensajesThread[]>(data.threads);
  const [filter, setFilter] = useState<ConvFilter>(data.unread_threads > 0 ? 'unread' : 'all');
  const [activeId, setActiveId] = useState<string | null>(() => {
    // El deeplink manda: un tap en el aviso del móvil aterriza en SU hilo.
    const linked = initialThreadId
      ? data.threads.find((t) => t.thread_id === initialThreadId)
      : undefined;
    const firstUnread = data.threads.find((t) => t.unread_count > 0);
    return (linked ?? firstUnread ?? data.threads[0])?.thread_id ?? null;
  });

  // Estás mirando los mensajes: el globito del icono instalado ya no aplica.
  useEffect(() => {
    clearAppBadge();
  }, []);
  const [contextOpen, setContextOpen] = useState(false);

  // El servidor manda: cuando la página se revalida, la lista se rehace con lo
  // suyo. Se ajusta DURANTE el render comparando con lo último que llegó, que es
  // la forma que React recomienda para sincronizar estado con props — un efecto
  // aquí pintaría un fotograma con la lista vieja.
  const [serverThreads, setServerThreads] = useState(data.threads);
  if (serverThreads !== data.threads) {
    setServerThreads(data.threads);
    setThreads(data.threads);
  }

  // Cuál es el hilo abierto, legible desde el oyente del canal sin re-suscribirlo
  // cada vez que cambia la selección.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  });
  const lastRefreshRef = useRef(0);

  const unreadCount = useMemo(() => threads.filter((t) => t.unread_count > 0).length, [threads]);
  const active = useMemo(
    () => threads.find((t) => t.thread_id === activeId) ?? null,
    [threads, activeId],
  );

  /** Sube un hilo a lo alto con su nueva vista previa. `incoming` marca si el
   *  mensaje es del atleta y hay que sumarlo al contador. */
  const bump = useCallback((message: MessageDTO, incoming: boolean) => {
    setThreads((prev) => {
      const index = prev.findIndex((t) => t.thread_id === message.thread_id);
      if (index === -1) return prev;
      const current = prev[index]!;
      const isActive = activeIdRef.current === message.thread_id;
      const updated: MensajesThread = {
        ...current,
        last_message_body: previewOf(message),
        last_message_at: message.created_at,
        // Leyéndolo delante no hay nada sin leer: la conversación abierta manda
        // el acuse de lectura en cuanto entra el mensaje.
        unread_count: incoming && !isActive ? current.unread_count + 1 : 0,
      };
      const next = prev.slice();
      next.splice(index, 1);
      return [updated, ...next];
    });
  }, []);

  // Todo lo que entra por el canal, sea del hilo abierto o no.
  useChatLiveMessages((message) => {
    const known = threads.some((t) => t.thread_id === message.thread_id);
    if (!known) {
      // Una conversación que aún no estaba en la lista: es el primer mensaje de
      // un atleta y su hilo acaba de nacer. Aquí no está ni su nombre ni su
      // contexto, así que se recarga del servidor en vez de inventarlos.
      const now = Date.now();
      if (now - lastRefreshRef.current > UNKNOWN_THREAD_REFRESH_MS) {
        lastRefreshRef.current = now;
        router.refresh();
      }
      return;
    }
    bump(message, message.sender_role === 'athlete');
  });

  const handleSelect = useCallback((thread: MensajesThread) => {
    setActiveId(thread.thread_id);
    setContextOpen(false);
    // Abrirlo ya es leerlo: la conversación manda el acuse al montarse.
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === thread.thread_id ? { ...t, unread_count: 0 } : t)),
    );
  }, []);

  const handleActivity = useCallback(
    (message: MessageDTO) => bump(message, message.sender_role === 'athlete'),
    [bump],
  );

  if (threads.length === 0) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem-2rem)] items-center justify-center sm:h-[calc(100dvh-3.5rem-3rem)]">
        <EmptyState
          icon="forum"
          title="Sin conversaciones"
          description="Cuando tus atletas escriban, sus conversaciones aparecerán aquí."
          className="max-w-sm"
        />
      </div>
    );
  }

  return (
    <div className="-m-4 sm:-m-6">
      <div
        className={cn(
          'grid h-[calc(100dvh-3.5rem)] grid-cols-1 overflow-hidden border-t border-[color:var(--v2-border)]',
          'md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_248px]',
        )}
      >
        <div
          className={cn(
            'flex min-h-0 flex-col border-r border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
            active ? 'hidden md:flex' : 'flex',
          )}
        >
          <div className="shrink-0 empty:hidden p-2 pb-0">
            <PushBanner />
          </div>
          <div className="min-h-0 flex-1">
            <ConversationList
              threads={threads}
              activeId={activeId}
              filter={filter}
              unreadCount={unreadCount}
              onSelect={handleSelect}
              onFilterChange={setFilter}
            />
          </div>
        </div>

        <div className={cn('min-h-0 bg-[color:var(--v2-bg)]', active ? 'block' : 'hidden md:block')}>
          {active ? (
            <ThreadPanel
              key={active.thread_id}
              thread={active}
              onActivity={handleActivity}
              onOpenContext={() => setContextOpen(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon="chat"
                title="Elige una conversación"
                description="Selecciona un atleta de la lista para abrir el hilo."
              />
            </div>
          )}
        </div>

        <ContextPanel thread={active} />
      </div>

      {contextOpen && active ? (
        <div className="fixed inset-0 z-30 xl:hidden" role="dialog" aria-label="Contexto del atleta">
          <button
            type="button"
            aria-label="Cerrar contexto"
            onClick={() => setContextOpen(false)}
            className="absolute inset-0 bg-[color:color-mix(in_srgb,var(--v2-bg)_70%,transparent)] backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 right-0 w-[280px] max-w-[85vw] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]">
            <ContextPanelMobile thread={active} onClose={() => setContextOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Envoltorio de móvil: fuerza visible el ContextPanel (que es solo-xl) dentro del
// cajón y añade el cierre. El panel es xl:flex/hidden, así que se re-expone aquí
// sin tocar el componente compartido.
function ContextPanelMobile({
  thread,
  onClose,
}: {
  thread: MensajesThread;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col [&>aside]:flex [&>aside]:border-l-0">
      <div className="flex shrink-0 items-center justify-end border-b border-[color:var(--v2-border)] px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="close" size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <ContextPanel thread={thread} />
      </div>
    </div>
  );
}
