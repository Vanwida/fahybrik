'use client';

// La columna izquierda de Mensajes: título, búsqueda, filtros y la bandeja.
// «Por responder» es el filtro por defecto y ordena por la espera más larga.
// Buscando, los filtros ceden el sitio: se busca en TODO (nombres y texto de
// cualquier mensaje) y cada fila enseña el mensaje que casa.

import { forwardRef } from 'react';
import { Inbox, Search, Send, X } from 'lucide-react';
import {
  Button,
  EmptyState,
  ErrorState,
  FilterChip,
  IconButton,
  Input,
  Kbd,
  List,
  SkeletonRows,
} from '@/components/v2/ui';
import type { SnoozeUntil } from '@/components/v2/shared';
import { filterCounts } from '@/lib/dashboard/v2/mensajes-inbox';
import type { MensajesFilter, MensajesThread } from '@/lib/dashboard/v2/mensajes-types';
import { ThreadRow } from './ThreadRow';

export const FILTER_LABEL: Record<MensajesFilter, string> = {
  por_responder: 'Por responder',
  todas: 'Todas',
  sin_leer: 'Sin leer',
  hechas: 'Hechas',
};

const FILTER_ORDER: MensajesFilter[] = ['por_responder', 'todas', 'sin_leer', 'hechas'];

/** Una línea honesta por filtro vacío (con la siguiente acción al lado). */
const EMPTY_LINE: Record<MensajesFilter, string> = {
  por_responder: 'Nadie espera respuesta',
  todas: 'Todavía no hay conversaciones',
  sin_leer: 'Nada sin leer',
  hechas: 'Nada marcado como hecho',
};

export interface ThreadListProps {
  /** Todos los hilos (para los recuentos de los filtros). */
  all: MensajesThread[];
  /** Los que se ven, ya filtrados y en orden. */
  visible: MensajesThread[];
  filter: MensajesFilter;
  onFilter: (f: MensajesFilter) => void;
  q: string;
  onQ: (q: string) => void;
  /** Búsqueda en curso: null = no se busca; threads null = cargando. */
  search: { threads: MensajesThread[] | null; error: string | null } | null;
  onRetrySearch: () => void;
  loadError: string | null;
  onRetryLoad: () => void;
  selectedId: string | null;
  cursorId: string | null;
  now: Date;
  thresholdHours: number;
  onOpen: (t: MensajesThread) => void;
  onDone: (t: MensajesThread) => void;
  onSnooze: (t: MensajesThread, until: SnoozeUntil) => void;
  onMarkUnread: (t: MensajesThread) => void;
  onOpenProfile: (t: MensajesThread) => void;
  onBroadcast: () => void;
}

export const ThreadList = forwardRef<HTMLInputElement, ThreadListProps>(function ThreadList(p, searchRef) {
  const counts = filterCounts(p.all);
  const searching = p.search != null;

  let body: React.ReactNode;
  if (p.loadError && p.all.length === 0) {
    body = (
      <div className="p-4">
        <ErrorState title="No se han podido cargar los mensajes" description={p.loadError} onRetry={p.onRetryLoad} />
      </div>
    );
  } else if (searching && p.search?.error) {
    body = (
      <div className="p-4">
        <ErrorState title="No se ha podido buscar" onRetry={p.onRetrySearch} />
      </div>
    );
  } else if (searching && p.search?.threads == null) {
    body = <SkeletonRows rows={6} />;
  } else if (p.visible.length === 0) {
    body = (
      <div className="px-4 py-3">
        {searching ? (
          <EmptyState icon={Search} title={`Nada con «${p.q.trim()}»`} description="busca por nombre o por algo que se dijo" />
        ) : p.filter === 'todas' ? (
          <EmptyState
            icon={Inbox}
            title={EMPTY_LINE.todas}
            action={
              <Button size="sm" variant="secondary" icon={Send} onClick={p.onBroadcast}>
                Escribir a varios
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title={EMPTY_LINE[p.filter]}
            action={
              p.filter === 'por_responder' && counts.todas > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => p.onFilter('todas')}>
                  Ver todas
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    );
  } else {
    body = (
      <List aria-label={searching ? 'Resultados de la búsqueda' : FILTER_LABEL[p.filter]} className="rounded-none border-0 bg-transparent">
        {p.visible.map((t) => (
          <ThreadRow
            key={t.thread_id}
            thread={t}
            now={p.now}
            thresholdHours={p.thresholdHours}
            selected={t.athlete_id === p.selectedId}
            active={t.athlete_id === p.cursorId}
            onOpen={() => p.onOpen(t)}
            onDone={() => p.onDone(t)}
            onSnooze={(until) => p.onSnooze(t, until)}
            onMarkUnread={() => p.onMarkUnread(t)}
            onOpenProfile={() => p.onOpenProfile(t)}
          />
        ))}
      </List>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-col gap-3 border-b border-v2-border p-3 sm:p-4">
        <div className="flex items-center gap-2">
          <h1 className="t-title text-v2-fg">Mensajes</h1>
          <Button size="sm" variant="secondary" icon={Send} onClick={p.onBroadcast} className="ml-auto">
            Enviar a varios
          </Button>
        </div>
        <Input
          ref={searchRef}
          type="text"
          role="searchbox"
          enterKeyHint="search"
          value={p.q}
          onChange={(e) => p.onQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (p.q) p.onQ('');
              else e.currentTarget.blur();
            }
          }}
          icon={Search}
          trailing={p.q ? undefined : <Kbd>/</Kbd>}
          placeholder="Buscar atleta o mensaje…"
          aria-label="Buscar en los mensajes"
        />
        {searching ? (
          <div className="flex min-h-7 items-center justify-between gap-2 t-body-sm text-v2-muted">
            <span>
              {p.search?.threads == null
                ? 'Buscando…'
                : `${p.visible.length} ${p.visible.length === 1 ? 'conversación' : 'conversaciones'}`}
            </span>
            <IconButton icon={X} label="Quitar la búsqueda" size="sm" onClick={() => p.onQ('')} />
          </div>
        ) : (
          <div role="group" aria-label="Filtrar" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {FILTER_ORDER.map((f) => (
              <FilterChip
                key={f}
                active={p.filter === f}
                // «Todas» no lleva cifra: el total no pide nada. Las demás, solo si hay algo.
                count={f === 'todas' || counts[f] === 0 ? null : counts[f]}
                onClick={() => p.onFilter(f)}
              >
                {FILTER_LABEL[f]}
              </FilterChip>
            ))}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );
});
