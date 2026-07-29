// MENSAJES (pestaña) — la conversación dentro de la ficha del atleta.
//
// Monta el MISMO componente que la pantalla de Mensajes, así que se comporta
// igual por construcción: en vivo, con adjuntos y con acuse de lectura. Antes
// tenía su propio código, no refrescaba nunca y ponía un "en línea" con punto
// verde que era decorativo — no había ninguna señal de presencia detrás.
//
// Trae su propio proveedor del canal en vivo porque aquí no hay pantalla de chat
// por encima que lo abra.

'use client';

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { ChatLiveProvider, Conversation } from '@/components/v2/chat';
import { EmptyState } from '@/components/v2/EmptyState';
import type { MessageDTO } from '@/lib/chat/client';

export function MensajesTab({
  athlete_id,
  athlete_name,
  chat,
  phase_label,
}: {
  athlete_id: string;
  athlete_name: string;
  chat: { thread_id: string; messages: MessageDTO[] } | null;
  phase_label: string | null;
}) {
  if (!chat) {
    return (
      <EmptyState
        icon="forum"
        title="No se pudo cargar la conversación"
        description="Vuelve a intentarlo en unos segundos o abre el chat completo."
        action={
          <Link
            href="/mensajes"
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-body font-semibold text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]"
          >
            Abrir en Mensajes
            <MIcon name="arrow_forward" size={16} />
          </Link>
        }
      />
    );
  }

  const firstName = athlete_name.split(/\s+/)[0];

  return (
    <div className="flex h-[62vh] min-h-[420px] flex-col overflow-hidden rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-card)]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <AthleteAvatar name={athlete_name} size="sm" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
              {athlete_name}
            </span>
            {phase_label ? (
              <span className="truncate text-label text-[color:var(--v2-muted)]">
                {phase_label}
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href="/mensajes"
          className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
        >
          Abrir en Mensajes
          <MIcon name="open_in_full" size={14} />
        </Link>
      </header>

      <ChatLiveProvider>
        <Conversation
          athleteId={athlete_id}
          threadId={chat.thread_id}
          initialMessages={chat.messages}
          placeholder={`Escribe a ${firstName}…`}
          className="min-h-0 flex-1 bg-[color:var(--v2-bg)]"
        />
      </ChatLiveProvider>
    </div>
  );
}
