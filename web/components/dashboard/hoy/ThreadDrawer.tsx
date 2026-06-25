'use client';

// ThreadDrawer — the inline conversation + reply for a /hoy MESSAGE line. This is
// "cómo se responde": it rides on the non-modal DetailSidePanel so the triage
// queue stays visible behind it, and a reply NEVER leaves /hoy.
//
// Single-thread by design: each message line in the unified queue owns its own
// thread, so the drawer takes ONE thread at a time (no list/inbox mode — the
// queue IS the inbox). On open it lazily loads the full thread (ASC, day
// dividers, coach bubbles right/accent-tinted, athlete bubbles left), marks it
// read (clears the unread badge + the message_unanswered signal), and polls every
// 3s for new athlete messages. The composer is an autogrow textarea: Enter sends,
// Shift+Enter newlines, optimistic append with retry on failure, 2000-char guard.
// On mark-read (open) the line's unread clears; on a successful reply the line
// leaves the queue (the queue trends to zero).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { DetailSidePanel, ErrorState, SkeletonRow, useToast } from '@/components/dashboard/ui';
import { MIcon } from '@/components/dashboard/MIcon';
import { COACH_MESSAGE_BODY_MAX, sendCoachMessageSchema } from '@/lib/dashboard/chat/schema';
import type { CoachChatMessage } from '@/lib/dashboard/chat/service';
import { cn } from '@/lib/utils';
import type { TriageMessageItem } from './triage-types';

/** Light poll cadence for new athlete messages while the drawer is open (ms). */
const POLL_INTERVAL_MS = 3000;
/** Autogrow ceiling for the composer textarea (px) before it scrolls internally. */
const COMPOSER_MAX_HEIGHT_PX = 160;

export interface ThreadDrawerProps {
  /** The message line whose thread is open, or null when closed. */
  item: TriageMessageItem | null;
  open: boolean;
  onClose: () => void;
  /** Called once the thread is marked read on open — clears its unread badge. */
  onRead: (item: TriageMessageItem) => void;
  /** Called after a successful reply — the line leaves the queue. */
  onReplied: (item: TriageMessageItem) => void;
}

export function ThreadDrawer({ item, open, onClose, onRead, onReplied }: ThreadDrawerProps) {
  return (
    <DetailSidePanel
      open={open}
      onClose={onClose}
      eyebrow="Mensaje"
      title={item?.athlete_name ?? 'Conversación'}
      width="md"
      headerAction={
        item ? (
          <Link
            href={`/atletas/${item.athlete_id}`}
            className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-[var(--r-s)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)] hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]"
          >
            Ver ficha
            <MIcon name="open_in_new" size={13} />
          </Link>
        ) : null
      }
    >
      {/* Remount per thread (key) so internal state never leaks between athletes. */}
      {item ? (
        <Conversation key={item.thread_id} item={item} onRead={onRead} onReplied={onReplied} />
      ) : null}
    </DetailSidePanel>
  );
}

// ── Conversation: messages + composer ────────────────────────────────────────

type OptimisticMessage = CoachChatMessage & { pending?: boolean; failed?: boolean };

function Conversation({
  item,
  onRead,
  onReplied,
}: {
  item: TriageMessageItem;
  onRead: (item: TriageMessageItem) => void;
  onReplied: (item: TriageMessageItem) => void;
}) {
  const threadId = item.thread_id;
  const toast = useToast();
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Bump to force the loader effect to re-run (retry after a load failure).
  const [reloadKey, setReloadKey] = useState(0);
  // True once we've reported at least one successful reply, so we don't fire
  // onReplied repeatedly (the line only needs to leave the queue once).
  const repliedRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Latest server timestamp, used as the poll cursor (`since`).
  const cursorRef = useRef<string | null>(null);
  const didMarkReadRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Initial load (lazy, on open) + mark-read. All setState lives inside the async
  // callbacks (never synchronously in the effect body) — the codebase idiom that
  // avoids the cascading-render the synchronous form triggers
  // (react-hooks/set-state-in-effect, see AthleteSidePanel).
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
        requestAnimationFrame(() => scrollToBottom('auto'));
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    })();

    // Mark the thread read once on open (clears the unread badge + signal).
    if (!didMarkReadRef.current) {
      didMarkReadRef.current = true;
      void fetch(`/api/coach/chat/threads/${threadId}/read`, {
        method: 'POST',
        credentials: 'include',
      })
        .then((r) => {
          if (r.ok && !cancelled) onRead(item);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
    // onRead/item are stable for a given thread (the drawer remounts per thread);
    // re-running on their identity would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, reloadKey, scrollToBottom]);

  // Light poll for new messages (3s cadence, same as the rest of the app).
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
        requestAnimationFrame(() => scrollToBottom('smooth'));
      } catch {
        // Transient poll failure is non-fatal; next tick retries.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [threadId, scrollToBottom]);

  const send = useCallback(async () => {
    const parsed = sendCoachMessageSchema.safeParse({ body: draft });
    if (!parsed.success) return;
    const body = parsed.data.body;

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
    setDraft('');
    setSending(true);
    requestAnimationFrame(() => scrollToBottom('smooth'));

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
      // First successful reply clears this line from the queue.
      if (!repliedRef.current) {
        repliedRef.current = true;
        onReplied(item);
      }
    } catch {
      // Keep the draft recoverable: mark the bubble failed + offer retry.
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      toast.show('No se pudo enviar el mensaje.', {
        tone: 'error',
        action: {
          label: 'Reintentar',
          onClick: () => {
            setMessages((prev) => prev.filter((m) => m.id !== tempId));
            setDraft(body);
          },
        },
      });
    } finally {
      setSending(false);
    }
  }, [draft, threadId, scrollToBottom, toast, item, onReplied]);

  if (loadError) {
    return (
      <ErrorState
        inline
        title="No se pudo cargar la conversación."
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {loading ? (
          <div className="pt-2">
            <SkeletonRow count={2} />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--text-muted)]">
            Aún no hay mensajes en esta conversación.
          </p>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      <Composer value={draft} onChange={setDraft} onSend={send} sending={sending} />
    </div>
  );
}

// ── Message list with day dividers + bubbles ─────────────────────────────────

function MessageList({ messages }: { messages: OptimisticMessage[] }) {
  return (
    <ol className="flex flex-col gap-2 py-2">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const showDivider = !prev || !sameDay(prev.created_at, m.created_at);
        return (
          <li key={m.id} className="flex flex-col">
            {showDivider ? (
              <div className="my-2 flex items-center justify-center">
                <span className="micro-label rounded-full bg-[color:var(--surface-container)] px-2.5 py-0.5 text-[color:var(--text-muted)]">
                  {dayDividerLabel(m.created_at)}
                </span>
              </div>
            ) : null}
            <MessageBubble message={m} />
          </li>
        );
      })}
    </ol>
  );
}

function MessageBubble({ message }: { message: OptimisticMessage }) {
  const isCoach = message.sender_role === 'coach';
  return (
    <div className={isCoach ? 'flex justify-end' : 'flex justify-start'}>
      <div className="flex max-w-[82%] flex-col gap-0.5">
        <div
          className={cn(
            'rounded-[var(--r-m)] px-3 py-2 text-[13.5px] leading-snug text-[color:var(--fg)]',
            isCoach
              ? 'bg-[color:color-mix(in_srgb,var(--accent)_18%,var(--surface-container))]'
              : 'bg-[color:var(--surface-container)]',
            message.failed && 'opacity-60 ring-1 ring-[color:var(--danger)]',
            message.pending && 'opacity-70',
          )}
        >
          <span className="whitespace-pre-wrap break-words">{message.body}</span>
        </div>
        <span
          className={cn(
            'px-1 text-[10.5px] text-[color:var(--text-muted)]',
            isCoach ? 'text-right' : 'text-left',
          )}
        >
          {message.failed
            ? 'No enviado'
            : message.pending
              ? 'Enviando…'
              : timeOfDay(message.created_at)}
        </span>
      </div>
    </div>
  );
}

// ── Composer: autogrow textarea, Enter to send, Shift+Enter newline ──────────

function Composer({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmedLen = value.trim().length;
  const overLimit = value.length > COACH_MESSAGE_BODY_MAX;
  const canSend = trimmedLen > 0 && !overLimit && !sending;

  // Autogrow up to a max height, then scroll inside the textarea.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  }, [value]);

  return (
    <div className="mt-2 border-t border-[color:var(--border-subtle)] pt-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          rows={1}
          maxLength={COACH_MESSAGE_BODY_MAX + 200}
          placeholder="Escribe una respuesta…"
          aria-label="Escribe una respuesta"
          className="focus-ring max-h-40 min-h-[40px] flex-1 resize-none rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3 py-2 text-[13.5px] leading-snug text-[color:var(--fg)] placeholder:text-[color:var(--text-muted)]"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Enviar mensaje"
          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-m)] bg-[color:var(--accent)] text-[color:var(--accent-on)] transition-colors hover:bg-[color:var(--accent-press)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MIcon name="send" size={18} filled />
        </button>
      </div>
      {overLimit ? (
        <p className="mt-1 px-1 text-[11px] text-[color:var(--danger)]" role="alert">
          Máx. {COACH_MESSAGE_BODY_MAX} caracteres ({value.length}).
        </p>
      ) : null}
    </div>
  );
}

// ── Date helpers (es-ES, box-local) ───────────────────────────────────────────

function sameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toDateString() === db.toDateString();
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function dayDividerLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
