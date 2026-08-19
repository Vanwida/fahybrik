'use client';

// ChatPeek — la conversación con el atleta como PANEL lateral sobre la ficha
// (mismo patrón peek que el detalle de sesión): sin velo, la ficha sigue viva
// detrás, X y Escape cierran. Sustituye a la antigua vista `?tab=mensajes` a
// pantalla de pestaña, que no tenía pestaña propia ni cierre y dejaba al coach
// atrapado (solo salía con el atrás del navegador). Señalado por Alex en el QA.
//
// Monta el MISMO componente que la pantalla de Mensajes (Conversation), así que
// se comporta igual por construcción: en vivo, con adjuntos y acuse de lectura.
// Trae su propio proveedor del canal porque aquí no hay pantalla de chat encima.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { ChatLiveProvider, Conversation } from '@/components/v2/chat';
import { EmptyState } from '@/components/v2/EmptyState';
import type { MessageDTO } from '@/lib/chat/client';

export function ChatPeek({
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
  const router = useRouter();
  const close = () => router.replace(`/atletas/${athlete_id}?tab=resumen`);

  // Peek: ancla en sitio para localizar el .v2-root; el contenido va al portal
  // (un fixed renderizado en sitio caería dentro del wrapper animado de la ficha).
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalTarget(anchorRef.current?.closest<HTMLElement>('.v2-root') ?? document.body);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // close es estable a efectos prácticos (router + id); no re-suscribir por render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athlete_id]);

  const firstName = athlete_name.split(/\s+/)[0];

  return (
    <span ref={anchorRef} hidden>
      {portalTarget
        ? createPortal(
            <aside
              role="dialog"
              aria-label={`Chat con ${athlete_name}`}
              className="fixed inset-y-0 right-0 z-40 flex w-[min(560px,94vw)] flex-col border-l border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-pop)]"
            >
              <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-4 py-3">
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
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href="/mensajes"
                    className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-2.5 text-xs font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)]"
                  >
                    Abrir en Mensajes
                    <MIcon name="open_in_full" size={14} />
                  </Link>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Cerrar chat"
                    className="v2-focus flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--v2-muted)] transition-colors hover:bg-[color:var(--v2-surface-2)] hover:text-[color:var(--v2-fg)]"
                  >
                    <MIcon name="close" size={18} />
                  </button>
                </div>
              </header>

              {chat ? (
                <ChatLiveProvider>
                  <Conversation
                    athleteId={athlete_id}
                    threadId={chat.thread_id}
                    initialMessages={chat.messages}
                    placeholder={`Escribe a ${firstName}…`}
                    className="min-h-0 flex-1 bg-[color:var(--v2-bg)]"
                  />
                </ChatLiveProvider>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6">
                  <EmptyState
                    icon="forum"
                    title="No se pudo cargar la conversación"
                    description="Vuelve a intentarlo en unos segundos o abre el chat completo."
                    className="max-w-sm"
                  />
                </div>
              )}
            </aside>,
            portalTarget,
          )
        : null}
    </span>
  );
}
