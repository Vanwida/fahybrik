// ConversationList — the left column (300px) of the Mensajes screen: a header,
// a "Sin leer · N / Todas" filter, and the list of conversation rows. The active
// row carries an accent left-border; unread rows show a dot + bolder preview.
// Pure presentational: selection + filter live in the parent screen.

'use client';

import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Pill } from '@/components/v2/Pill';
import { EmptyState } from '@/components/v2/EmptyState';
import { humanPreview } from '@/lib/chat/schema';
import type { MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { cn } from '@/lib/utils';

export type ConvFilter = 'unread' | 'all';

const TIME_FMT = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Madrid',
});
const DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Madrid',
});

/** Relative-ish timestamp: time today, "ayer", else short date. */
function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return TIME_FMT.format(d);
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'ayer';
  return DATE_FMT.format(d).replace(/\.$/, '');
}

export function ConversationList({
  threads,
  activeId,
  filter,
  unreadCount,
  onSelect,
  onFilterChange,
}: {
  threads: MensajesThread[];
  activeId: string | null;
  filter: ConvFilter;
  unreadCount: number;
  onSelect: (thread: MensajesThread) => void;
  onFilterChange: (f: ConvFilter) => void;
}) {
  const visible = filter === 'unread' ? threads.filter((t) => t.unread_count > 0) : threads;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--v2-border)] px-4 py-3">
        <h2 className="v2-display text-lg text-[color:var(--v2-fg)]">Conversaciones</h2>
        <span className="v2-num text-xs text-[color:var(--v2-faint)]">{threads.length}</span>
      </div>

      {/* Filter */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--v2-border)] px-4 py-2.5">
        <FilterChip
          active={filter === 'unread'}
          onClick={() => onFilterChange('unread')}
          label="Sin leer"
          count={unreadCount}
        />
        <FilterChip active={filter === 'all'} onClick={() => onFilterChange('all')} label="Todas" />
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Conversaciones">
        {visible.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={filter === 'unread' ? 'mark_chat_read' : 'forum'}
              title={filter === 'unread' ? 'Todo al día' : 'Sin conversaciones'}
              description={
                filter === 'unread'
                  ? 'No hay mensajes sin responder.'
                  : 'Aún no tienes ninguna conversación con tus atletas.'
              }
            />
          </div>
        ) : (
          visible.map((t) => (
            <ConversationRow
              key={t.thread_id}
              thread={t}
              active={t.thread_id === activeId}
              onSelect={() => onSelect(t)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="v2-focus rounded-[var(--v2-r-pill)]"
    >
      <Pill tone={active ? 'accent' : 'neutral'} variant={active ? 'soft' : 'outline'}>
        {label}
        {count != null && count > 0 ? (
          <>
            {' '}
            ·&nbsp;<span className="v2-num">{count}</span>
          </>
        ) : null}
      </Pill>
    </button>
  );
}

function ConversationRow({
  thread,
  active,
  onSelect,
}: {
  thread: MensajesThread;
  active: boolean;
  onSelect: () => void;
}) {
  const unread = thread.unread_count > 0;
  return (
    <button
      type="button"
      role="listitem"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'v2-focus flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors',
        active
          ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
          : 'border-transparent hover:bg-[color:var(--v2-surface-2)]',
      )}
    >
      <AthleteAvatar name={thread.athlete_name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'truncate text-sm text-[color:var(--v2-fg)]',
              unread ? 'font-bold' : 'font-semibold',
            )}
          >
            {thread.athlete_name}
          </span>
          <span className="v2-num shrink-0 text-[10px] text-[color:var(--v2-faint)]">
            {listTime(thread.last_message_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-xs',
              unread
                ? 'font-medium text-[color:var(--v2-fg)]'
                : 'text-[color:var(--v2-muted)]',
            )}
          >
            {thread.last_message_body != null
              ? humanPreview(thread.last_message_body)
              : 'Sin mensajes todavía'}
          </span>
          {unread ? (
            <span
              aria-label={`${thread.unread_count} sin leer`}
              className="v2-num inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--v2-accent)] px-1 text-[10px] font-bold text-[color:var(--v2-accent-fg)]"
            >
              {thread.unread_count}
            </span>
          ) : (
            <MIcon
              name="done"
              size={14}
              className="shrink-0 text-[color:var(--v2-faint)]"
            />
          )}
        </div>
      </div>
    </button>
  );
}
