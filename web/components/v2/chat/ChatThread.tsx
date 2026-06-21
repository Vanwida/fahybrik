// ChatThread — renders an ordered list of chat messages as bubbles, grouped by
// calendar day with a sticky-feel date divider between groups. Alignment is
// driven by each message's `sender_role` (coach → right, athlete → left). The
// caller passes messages already in ascending chronological order (the chat
// service returns them ASC). Handles empty + loading states inline so every
// embedding surface (athlete-detalle Mensajes subtab, Mensajes screen) is
// consistent. Auto-scrolls to the newest message on mount + when it changes.

'use client';

import { useEffect, useRef } from 'react';
import { EmptyState } from '@/components/v2/EmptyState';
import { ChatBubble } from '@/components/v2/chat/ChatBubble';
import { cn } from '@/lib/utils';

/** Minimal message shape the thread renders — a structural subset of
 *  `CoachChatMessage` so callers can pass the service DTO directly. */
export interface ChatThreadMessage {
  id: string;
  sender_role: 'coach' | 'athlete';
  body: string | null;
  created_at: string;
  /** Optional attachment marker — when true the bubble renders as a dashed chip. */
  is_attachment?: boolean;
  attachment_label?: string | null;
  attachment_icon?: string;
  /** Optimistic in-flight flag. */
  pending?: boolean;
}

const TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});

const DAY_FMT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Madrid',
});

/** Stable day key (YYYY-MM-DD in Madrid) so messages bucket by calendar day. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  // Use the formatted day string as the bucket key — stable + locale-correct.
  return DAY_FMT.format(d);
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = dayKey(new Date().toISOString());
  const yest = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const k = dayKey(iso);
  if (k === today) return 'Hoy';
  if (k === yest) return 'Ayer';
  return DAY_FMT.format(d).replace(/\.$/, '');
}

export function ChatThread({
  messages,
  loading = false,
  className,
}: {
  messages: ChatThreadMessage[];
  loading?: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-3 p-4', className)} aria-busy>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}
            aria-hidden
          >
            <span
              className="h-9 w-44 animate-pulse rounded-[var(--v2-r-m)] bg-[color:var(--v2-surface-2)]"
            />
          </div>
        ))}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn('flex flex-1 items-center justify-center p-6', className)}>
        <EmptyState
          icon="forum"
          title="Sin mensajes todavía"
          description="Escribe abajo para iniciar la conversación."
          className="border-none"
        />
      </div>
    );
  }

  // Group consecutive messages by calendar day for dividers.
  let lastDay = '';

  return (
    <div className={cn('flex flex-col gap-2 p-4', className)}>
      {messages.map((m) => {
        const k = dayKey(m.created_at);
        const showDivider = k !== lastDay;
        lastDay = k;
        return (
          <div key={m.id} className="flex flex-col gap-2">
            {showDivider && (
              <div className="my-1 flex items-center justify-center">
                <span className="v2-micro rounded-[var(--v2-r-pill)] bg-[color:var(--v2-surface-2)] px-2.5 py-0.5">
                  {dayLabel(m.created_at)}
                </span>
              </div>
            )}
            <ChatBubble
              role={m.sender_role}
              body={m.is_attachment ? m.attachment_label ?? 'Adjunto' : m.body ?? ''}
              variant={m.is_attachment ? 'attachment' : 'text'}
              attachment_icon={m.attachment_icon}
              time={TIME_FMT.format(new Date(m.created_at))}
              pending={m.pending}
            />
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
