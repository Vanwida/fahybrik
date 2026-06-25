// MensajesScreen — the client orchestrator for the 3-column Mensajes screen.
// Owns: the selected conversation, the list filter (sin leer / todas), and the
// LOCAL thread list (so opening a thread clears its unread badge and a sent reply
// bumps the preview + reorders the list without a full reload). The three columns:
//   • ConversationList (left, 300px)  — list + filter.
//   • ThreadPanel      (center, flex) — the live thread; remounts per thread.
//   • ContextPanel     (right, 248px) — athlete context for the active thread.
// Fills the v2 main viewport height (the shell already pads the page); the columns
// scroll independently, the chrome stays put.

'use client';

import { useCallback, useMemo, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { ConversationList, type ConvFilter } from './ConversationList';
import { ThreadPanel } from './ThreadPanel';
import { ContextPanel } from './ContextPanel';
import type { MensajesData, MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { cn } from '@/lib/utils';

export function MensajesScreen({
  data,
}: {
  data: MensajesData;
  /** Coach name (from the session) — accepted for API symmetry with the other
   *  v2 screens; the persistent name lives in the shell top bar, not here. */
  coach_name?: string;
}) {
  // Local, mutable copy so unread-clear + preview-bump are instant (no reload).
  const [threads, setThreads] = useState<MensajesThread[]>(data.threads);
  const [filter, setFilter] = useState<ConvFilter>(
    data.unread_threads > 0 ? 'unread' : 'all',
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    // Default selection: first unread, else first thread.
    const firstUnread = data.threads.find((t) => t.unread_count > 0);
    return (firstUnread ?? data.threads[0])?.thread_id ?? null;
  });
  // Mobile drawer for the context panel (hidden on small viewports otherwise).
  const [contextOpen, setContextOpen] = useState(false);

  const unreadCount = useMemo(
    () => threads.filter((t) => t.unread_count > 0).length,
    [threads],
  );

  const active = useMemo(
    () => threads.find((t) => t.thread_id === activeId) ?? null,
    [threads, activeId],
  );

  const handleSelect = useCallback((thread: MensajesThread) => {
    setActiveId(thread.thread_id);
    setContextOpen(false);
  }, []);

  // Clear a thread's unread badge once it's marked read on open.
  const handleRead = useCallback((thread: MensajesThread) => {
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === thread.thread_id ? { ...t, unread_count: 0 } : t)),
    );
  }, []);

  // After a successful send, bump the preview + move the thread to the top.
  const handleSent = useCallback((thread: MensajesThread, body: string) => {
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.thread_id === thread.thread_id);
      if (idx === -1) return prev;
      const updated: MensajesThread = {
        ...prev[idx]!,
        last_message_body: body,
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      };
      const next = prev.slice();
      next.splice(idx, 1);
      return [updated, ...next];
    });
  }, []);

  // Whole-screen empty state (no threads at all).
  if (threads.length === 0) {
    // Padded main is still in effect here (top bar 3.5rem + p-4=2rem / sm:p-6=3rem).
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
          // list (fixed) · thread (flex) · context (fixed) on wide screens.
          'md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_248px]',
        )}
      >
        {/* Left — conversation list. Hidden on mobile when a thread is open. */}
        <div
          className={cn(
            'min-h-0 border-r border-[color:var(--v2-border)] bg-[color:var(--v2-surface)]',
            active ? 'hidden md:block' : 'block',
          )}
        >
          <ConversationList
            threads={threads}
            activeId={activeId}
            filter={filter}
            unreadCount={unreadCount}
            onSelect={handleSelect}
            onFilterChange={setFilter}
          />
        </div>

        {/* Center — the live thread. */}
        <div className={cn('min-h-0 bg-[color:var(--v2-bg)]', active ? 'block' : 'hidden md:block')}>
          {active ? (
            <ThreadPanel
              key={active.thread_id}
              thread={active}
              onRead={handleRead}
              onSent={handleSent}
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

        {/* Right — context panel (xl+ inline). */}
        <ContextPanel thread={active} />
      </div>

      {/* Mobile/tablet context drawer (below xl, where the panel is hidden inline). */}
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

// Mobile wrapper: forces the (normally xl-only) ContextPanel visible inside the
// drawer + adds a close affordance. The panel itself is xl:flex/hidden, so we
// re-expose it here without touching the shared component.
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
