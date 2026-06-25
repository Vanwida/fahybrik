// ThreadPanel — the center column of the Mensajes screen: the active thread's
// header + message list + composer. Owns the live lifecycle for ONE thread:
//   • lazy GET the last 50 messages on mount, then mark the thread read.
//   • poll every 3s with `?since=<cursor>` for new athlete messages.
//   • optimistic send (POST), reconcile with the server message, retry on fail.
// Reuses the shared chat primitives (ChatThread bubbles + day dividers,
// ChatComposer). The parent remounts this per thread (key=thread_id) so state
// never leaks between athletes — same idiom as the v1 ThreadDrawer.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { LevelBadge } from '@/components/v2/LevelBadge';
import { ChatThread, type ChatThreadMessage } from '@/components/v2/chat/ChatThread';
import { ChatComposer } from '@/components/v2/chat/ChatComposer';
import { EmptyState } from '@/components/v2/EmptyState';
import type { CoachChatMessage } from '@/lib/dashboard/chat/service';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';

/** Light poll cadence for new athlete messages while a thread is open (ms). */
const POLL_INTERVAL_MS = 3000;
const ATHLETE_ROUTE = '/v2/atletas';

type OptimisticMessage = CoachChatMessage & { pending?: boolean; failed?: boolean };

function toThreadMessage(m: OptimisticMessage): ChatThreadMessage {
  return {
    id: m.id,
    sender_role: m.sender_role,
    body: m.body,
    created_at: m.created_at,
    pending: m.pending,
  };
}

export function ThreadPanel({
  thread,
  onRead,
  onSent,
  onOpenContext,
}: {
  thread: MensajesThread;
  /** Fired once the thread is marked read on open — clears its unread badge. */
  onRead: (thread: MensajesThread) => void;
  /** Fired after a successful send — bumps the list preview/order. */
  onSent: (thread: MensajesThread, body: string) => void;
  /** Mobile-only: opens the context panel (hidden on small screens). */
  onOpenContext?: () => void;
}) {
  const threadId = thread.thread_id;
  const ctx = thread.context;

  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Latest server timestamp — the poll cursor (`since`).
  const cursorRef = useRef<string | null>(null);
  const didMarkReadRef = useRef(false);

  // Initial load + mark-read. setState only inside the async callbacks (codebase
  // idiom that avoids the cascading-render the synchronous form triggers).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const res = await fetch(`/api/coach/chat/threads/${threadId}/messages?limit=50`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`load ${res.status}`);
        const body = (await res.json()) as { messages: CoachChatMessage[] };
        if (cancelled) return;
        setMessages(body.messages);
        const last = body.messages[body.messages.length - 1];
        cursorRef.current = last ? last.created_at : null;
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    })();

    if (!didMarkReadRef.current) {
      didMarkReadRef.current = true;
      void fetch(`/api/coach/chat/threads/${threadId}/read`, {
        method: 'POST',
        credentials: 'include',
      })
        .then((r) => {
          if (r.ok && !cancelled) onRead(thread);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
    // thread/onRead are stable for a given thread (parent remounts per thread);
    // re-running on their identity would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, reloadKey]);

  // Light poll for new athlete messages (3s cadence — same as the rest of the app).
  useEffect(() => {
    const id = setInterval(async () => {
      const since = cursorRef.current;
      if (!since) return;
      try {
        const res = await fetch(
          `/api/coach/chat/threads/${threadId}/messages?since=${encodeURIComponent(since)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { messages: CoachChatMessage[] };
        if (body.messages.length === 0) return;
        cursorRef.current = body.messages[body.messages.length - 1]!.created_at;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = body.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        // Transient poll failure is non-fatal; next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [threadId]);

  const send = useCallback(
    async (body: string) => {
      const tempId = `optimistic-${Date.now()}`;
      const optimistic: OptimisticMessage = {
        id: tempId,
        thread_id: threadId,
        sender_role: 'coach',
        sender_user_id: 'self',
        body,
        created_at: new Date().toISOString(),
        read_at: null,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/coach/chat/threads/${threadId}/messages`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(`send ${res.status}`);
        const data = (await res.json()) as { message: CoachChatMessage };
        cursorRef.current = data.message.created_at;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
        onSent(thread, body);
      } catch {
        // Keep the failed bubble visible so the coach knows it didn't go through.
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
        );
      }
    },
    [threadId, thread, onSent],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[color:var(--v2-border)] px-4 py-2.5">
        <AthleteAvatar name={thread.athlete_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-[color:var(--v2-fg)]">
              {thread.athlete_name}
            </span>
            {ctx ? <LevelBadge level={ctx.level} /> : null}
          </div>
          <span className="truncate text-xs text-[color:var(--v2-muted)]">
            {ctx?.phase_label ?? 'Sin plan activo'}
          </span>
        </div>
        {onOpenContext ? (
          <button
            type="button"
            onClick={onOpenContext}
            aria-label="Ver contexto del atleta"
            className="v2-focus flex h-8 w-8 items-center justify-center rounded-[var(--v2-r-s)] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)] xl:hidden"
          >
            <MIcon name="info" size={18} />
          </button>
        ) : null}
        <Link
          href={`${ATHLETE_ROUTE}/${thread.athlete_id}`}
          className="v2-focus inline-flex shrink-0 items-center gap-1 rounded-[var(--v2-r-s)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
        >
          Ver perfil
          <MIcon name="open_in_new" size={13} />
        </Link>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon="error"
              title="No se pudo cargar la conversación"
              description="Comprueba tu conexión e inténtalo de nuevo."
              action={
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="v2-focus rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
                >
                  Reintentar
                </button>
              }
            />
          </div>
        ) : (
          <ChatThread loading={loading} messages={messages.map(toThreadMessage)} />
        )}
      </div>

      {/* Composer */}
      <ChatComposer onSend={send} disabled={loading || loadError} placeholder="Escribe una respuesta…" />
    </div>
  );
}
