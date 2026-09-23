'use client';

// El hilo abierto: quién es, en qué estado está la espera y la conversación.
// Las acciones de la espera viven aquí también (en el móvil, SOLO aquí):
// Hecho · Posponer ▾ · ··· (Marcar sin leer, Abrir ficha).
//
// El primer tramo se pide por ATLETA (`/api/chat/threads/:atleta/messages`), que
// devuelve también el id del hilo y lo crea si aún no existía: así un enlace
// `?hilo=` a un atleta que nunca ha escrito abre su hilo vacío, listo para
// escribirle. Un atleta que no es del coach da «no encontrado», nunca otro hilo.

import { useEffect, useState, type Ref } from 'react';
import { Link } from '@/i18n/navigation';
import { Check, ChevronDown, ChevronLeft, Clock, MailOpen, MoreHorizontal, PanelRight, UserRound } from 'lucide-react';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Menu,
  Skeleton,
  StatusBadge,
  Tag,
  buttonVariants,
} from '@/components/v2/ui';
import { apiJson, errorMessage, PanelApiError } from '@/components/v2/shared/api';
import type { SnoozeUntil } from '@/components/v2/shared';
import { weekdayDate } from '@/components/v2/shared/format';
import { Conversation } from '@/components/v2/chat';
import type { MessageDTO } from '@/lib/chat/client';
import { waitLabel, waitTone } from '@/lib/dashboard/v2/mensajes-inbox';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { SNOOZE_CHOICES } from './ThreadRow';
import { cn } from '@/lib/utils';
import { useCoachTimeZone, zonedFormat } from '@/lib/coach/coach-timezone-context';

const PAGE = 50;

type FirstPage =
  | { state: 'loading' }
  | { state: 'ready'; thread_id: string; messages: MessageDTO[] }
  | { state: 'error'; message: string; notFound: boolean };

function useFirstPage(athleteId: string) {
  const [page, setPage] = useState<FirstPage>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    apiJson<{ thread_id: string; messages: MessageDTO[] }>(
      `/api/chat/threads/${encodeURIComponent(athleteId)}/messages?limit=${PAGE}`,
      { signal: ctrl.signal },
    )
      .then((d) => setPage({ state: 'ready', thread_id: d.thread_id, messages: d.messages.slice().reverse() }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const notFound = err instanceof PanelApiError && err.status === 404;
        setPage({ state: 'error', notFound, message: errorMessage(err, 'No se ha podido cargar la conversación') });
      });
    return () => ctrl.abort();
  }, [athleteId, attempt]);
  return {
    page,
    retry: () => {
      setPage({ state: 'loading' });
      setAttempt((a) => a + 1);
    },
  };
}

/** La línea de estado bajo el nombre: la espera con su color, o qué se hizo con ella. */
function StateLine({ thread, now, thresholdHours }: { thread: MensajesThread | null; now: Date; thresholdHours: number }) {
  const DAY = zonedFormat(useCoachTimeZone(), 'en-CA', {});
  if (!thread) return null;
  if (thread.state === 'por_responder' && thread.waiting) {
    const tone = waitTone(thread.waiting.since, now, thresholdHours);
    const n = thread.waiting.count;
    return (
      <StatusBadge
        size="sm"
        tone={tone === 'neutral' ? 'info' : tone}
        icon={Clock}
        label={`Por responder · ${waitLabel(thread.waiting.since, now)}${n > 1 ? ` · ${n} mensajes` : ''}`}
      />
    );
  }
  if (thread.state === 'hecho') return <StatusBadge size="sm" tone="neutral" icon={Check} label="Hecho · no requiere respuesta" />;
  if (thread.state === 'pospuesto') {
    return (
      <StatusBadge
        size="sm"
        tone="neutral"
        icon={Clock}
        label={
          thread.snoozed_until
            ? `Pospuesto hasta el ${weekdayDate(DAY.format(new Date(thread.snoozed_until)))}`
            : 'Pospuesto hasta que vuelva a escribir'
        }
      />
    );
  }
  return <span className="t-meta text-v2-faint">Al día</span>;
}

export function ThreadPane({
  athleteId,
  thread,
  fallbackName,
  now,
  thresholdHours,
  visible,
  onBack,
  onToggleContext,
  onActivity,
  onDone,
  onSnooze,
  onMarkUnread,
  composerRef,
}: {
  athleteId: string;
  /** La fila de la bandeja, si el hilo está en ella. */
  thread: MensajesThread | null;
  /** Nombre cuando el hilo aún no está en la bandeja (enlace a quien no ha escrito). */
  fallbackName: string | null;
  now: Date;
  thresholdHours: number;
  /** Si está realmente a la vista: lo que no se ve no se marca leído. */
  visible: boolean;
  /** Volver a la bandeja (solo se ve en el móvil). */
  onBack: () => void;
  /** Abre el contexto en un panel (solo donde no cabe la tercera columna). */
  onToggleContext: () => void;
  onActivity: (m: MessageDTO) => void;
  onDone: () => void;
  onSnooze: (until: SnoozeUntil) => void;
  onMarkUnread: () => void;
  composerRef?: Ref<HTMLTextAreaElement>;
}) {
  const { page, retry } = useFirstPage(athleteId);
  const name = thread?.athlete_name ?? fallbackName ?? '';
  const pending = thread?.state === 'por_responder' || thread?.state === 'pospuesto';
  const firstName = name.split(/\s+/)[0] || 'tu atleta';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-v2-border px-2 py-2 sm:gap-3 sm:px-4">
        <IconButton icon={ChevronLeft} label="Volver a la bandeja" size="lg" onClick={onBack} className="md:hidden" />
        {name ? <Avatar name={name} src={thread?.avatar_url} size="lg" /> : <Skeleton className="size-8 rounded-full" />}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {name ? (
              <span className="truncate t-title-sm text-v2-fg">{name}</span>
            ) : (
              <Skeleton className="h-4 w-32" />
            )}
            {thread?.level_label ? <Tag>{thread.level_label}</Tag> : null}
          </div>
          <div className="flex min-w-0 items-center overflow-hidden">
            <StateLine thread={thread} now={now} thresholdHours={thresholdHours} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {pending ? (
            <>
              <Button size="sm" variant="secondary" icon={Check} onClick={onDone} className="hidden sm:inline-flex">
                Hecho
              </Button>
              <span className="hidden sm:inline-flex">
                <Menu
                  align="end"
                  width="min-w-56"
                  trigger={
                    <Button size="sm" variant="ghost" icon={Clock} iconEnd={ChevronDown}>
                      Posponer
                    </Button>
                  }
                  items={SNOOZE_CHOICES.map((c) => ({
                    label: c.label,
                    shortcut: c.until === 'signal' ? 'H' : undefined,
                    onSelect: () => onSnooze(c.until),
                  }))}
                />
              </span>
            </>
          ) : null}
          <IconButton
            icon={PanelRight}
            label="Ver su contexto"
            size="md"
            onClick={onToggleContext}
            className="min-[85rem]:hidden"
          />
          <Menu
            align="end"
            width="min-w-56"
            trigger={<IconButton icon={MoreHorizontal} label="Más acciones" size="md" />}
            items={[
              ...(pending
                ? [
                    { label: 'Hecho · no requiere respuesta', icon: Check, shortcut: 'E', onSelect: onDone },
                    { type: 'label' as const, label: 'Posponer' },
                    ...SNOOZE_CHOICES.map((c) => ({ label: c.label, onSelect: () => onSnooze(c.until) })),
                    { type: 'separator' as const },
                  ]
                : []),
              {
                label: 'Marcar sin leer',
                icon: MailOpen,
                shortcut: 'U',
                onSelect: onMarkUnread,
              },
            ]}
          />
          <Link
            href={`/atletas/${encodeURIComponent(athleteId)}`}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden md:inline-flex')}
          >
            <UserRound aria-hidden strokeWidth={1.75} />
            Ficha
          </Link>
        </div>
      </div>

      {page.state === 'error' ? (
        <div className="p-4">
          {page.notFound ? (
            <EmptyState title="Esta conversación no está en tu lista" description="el atleta ya no es tuyo o no existe" />
          ) : (
            <ErrorState title="No se ha podido cargar la conversación" description={page.message} onRetry={retry} />
          )}
        </div>
      ) : page.state === 'loading' ? (
        <div role="status" aria-label="Cargando la conversación" className="flex flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-9 w-3/5 rounded-panel" />
          <Skeleton className="ml-auto h-9 w-1/2 rounded-panel" />
          <Skeleton className="h-14 w-2/5 rounded-panel" />
        </div>
      ) : (
        <Conversation
          key={page.thread_id}
          athleteId={athleteId}
          threadId={page.thread_id}
          initialMessages={page.messages}
          onActivity={onActivity}
          visible={visible}
          placeholder={`Escribe a ${firstName}…`}
          inputRef={composerRef}
          className="min-h-0 flex-1"
        />
      )}
    </div>
  );
}
