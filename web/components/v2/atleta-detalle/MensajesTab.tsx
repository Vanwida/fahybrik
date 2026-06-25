'use client';

// MENSAJES (subtab) — the embedded conversation panel for the athlete detail
// screen. Reuses the shared v2 chat primitives (ChatThread + ChatComposer) and
// the same send endpoint as the full Mensajes screen, so the conversation is
// identical wherever it's opened. Loads its initial messages server-side (passed
// in as `initial`) then sends optimistically via POST /api/chat/threads/[id]/
// messages, appending the confirmed message on success and rolling back on error.

import { useCallback, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { ChatThread, type ChatThreadMessage } from '@/components/v2/chat/ChatThread';
import { ChatComposer } from '@/components/v2/chat/ChatComposer';
import { EmptyState } from '@/components/v2/EmptyState';
import type { DetalleChatMessage } from '@/lib/dashboard/v2/atleta-detalle-types';

function toThreadMessage(m: DetalleChatMessage): ChatThreadMessage {
  return {
    id: m.id,
    sender_role: m.sender_role,
    body: m.body,
    created_at: m.created_at,
  };
}

export function MensajesTab({
  athlete_id,
  athlete_name,
  chat,
  phase_label,
}: {
  athlete_id: string;
  athlete_name: string;
  chat: { thread_id: string; messages: DetalleChatMessage[] } | null;
  phase_label: string | null;
}) {
  const [messages, setMessages] = useState<ChatThreadMessage[]>(
    () => (chat?.messages ?? []).map(toThreadMessage),
  );

  const send = useCallback(
    async (body: string) => {
      const tempId = `temp-${Date.now()}`;
      const optimistic: ChatThreadMessage = {
        id: tempId,
        sender_role: 'coach',
        body,
        created_at: new Date().toISOString(),
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/chat/threads/${athlete_id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error(`send_failed_${res.status}`);
        const json = (await res.json()) as { message?: { id?: string; created_at?: string } };
        const confirmed = json.message;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId
              ? {
                  ...m,
                  id: confirmed?.id ?? m.id,
                  created_at: confirmed?.created_at ?? m.created_at,
                  pending: false,
                }
              : m,
          ),
        );
      } catch {
        // Roll back the optimistic bubble on failure.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    },
    [athlete_id],
  );

  if (!chat) {
    return (
      <EmptyState
        icon="forum"
        title="No se pudo cargar la conversación"
        description="Vuelve a intentarlo en unos segundos o abre el chat completo."
        action={
          <Link
            href="/v2/mensajes"
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-[13px] font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
          >
            Abrir en Mensajes
            <MIcon name="arrow_forward" size={16} />
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex h-[62vh] min-h-[420px] flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <AthleteAvatar name={athlete_name} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
              {athlete_name}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-[color:var(--v2-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--v2-ok)]" aria-hidden />
              en línea{phase_label ? ` · ${phase_label}` : ''}
            </span>
          </div>
        </div>
        <Link
          href="/v2/mensajes"
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          Abrir en Mensajes
          <MIcon name="open_in_full" size={14} />
        </Link>
      </header>

      {/* Thread */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--v2-bg)]">
        <ChatThread messages={messages} />
      </div>

      {/* Composer */}
      <ChatComposer onSend={send} placeholder={`Escribe a ${athlete_name.split(/\s+/)[0]}…`} />
    </div>
  );
}
