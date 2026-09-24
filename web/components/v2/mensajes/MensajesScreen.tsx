'use client';

// Mensajes — la bandeja organizada por «Por responder» (plan §6).
//
//   escritorio ≥ 1360   lista · hilo · contexto (85rem)
//   tableta / portátil  lista · hilo (el contexto, en un panel lateral)
//   móvil               lista → hilo, dos pantallas con «volver» (el botón atrás
//                       del navegador también vuelve a la lista)
//
// Reglas que esta pantalla no rompe (informe B, H7/H9/M1):
//   · NADA se abre solo. Sin `?hilo=` no hay hilo abierto: abrir marca leído,
//     y marcar leído el hilo de otro atleta era el fallo.
//   · `?hilo=<id de atleta>` abre ESE atleta (el mismo enlace que usa el
//     ChatDrawer compartido); si no es del coach, «no está en tu lista».
//   · Abrir un hilo marca leído SOLO ese hilo (lo hace la conversación).
//
// Teclado: J/K moverse · Enter abrir · E hecho · H posponer hasta que escriba ·
// U marcar sin leer · R responder · / buscar · Esc volver (móvil).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Keyboard, MessagesSquare } from 'lucide-react';
import { EmptyState, Kbd, Sheet, useToast } from '@/components/v2/ui';
import { useSnooze, type SnoozeUntil } from '@/components/v2/shared';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { isTypingTarget } from '@/components/v2/shell/use-shell-shortcuts';
import { PushBanner } from '@/components/v2/push/PushNotifications';
import { ChatLiveProvider, useChatLiveMessages } from '@/components/v2/chat';
import { attachmentPreview } from '@/lib/chat/schema';
import type { MessageDTO } from '@/lib/chat/client';
import { clearAppBadge } from '@/lib/push/client';
import { applyIncoming, filterThreads } from '@/lib/dashboard/v2/mensajes-inbox';
import {
  MENSAJES_FILTERS,
  type MensajesFilter,
  type MensajesInbox,
  type MensajesThread,
} from '@/lib/dashboard/v2/mensajes-types';
import { cn } from '@/lib/utils';
import { BroadcastDialog } from './BroadcastDialog';
import { ContextPane } from './ContextPane';
import { nextAfterSend, useSendAndNext } from './send-and-next';
import { ThreadList } from './ThreadList';
import { ThreadPane } from './ThreadPane';
import { useInbox } from './use-inbox';
import { useThreadContext } from './use-thread-context';

/** A partir de aquí caben las tres columnas sin estrujar el hilo. */
const WIDE_QUERY = '(min-width: 85rem)';
const MD_QUERY = '(min-width: 768px)';

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"][data-open], [role="menu"][data-open], [role="listbox"][data-open]') !== null;
}

function previewOf(m: MessageDTO): string {
  if (m.body && m.body.trim().length > 0) return m.body;
  return attachmentPreview(m.attachment_kind ?? null);
}

/** La URL con estos valores (lo demás de la query se conserva). */
function urlWith(next: { hilo?: string | null; filtro?: MensajesFilter; q?: string }): string {
  const url = new URL(window.location.href);
  const set = (k: string, v: string | null | undefined, def?: string) => {
    if (v === undefined) return;
    if (v === null || v === '' || v === def) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  };
  set('hilo', next.hilo);
  set('filtro', next.filtro, 'por_responder');
  set('q', next.q);
  return `${url.pathname}${url.search}`;
}

export interface MensajesScreenProps {
  initial: MensajesInbox | null;
  initialHilo: string | null;
  initialFilter: MensajesFilter;
  initialQ: string;
}

export function MensajesScreen(props: MensajesScreenProps) {
  return (
    <ChatLiveProvider>
      <MensajesBody {...props} />
    </ChatLiveProvider>
  );
}

function MensajesBody({ initial, initialHilo, initialFilter, initialQ }: MensajesScreenProps) {
  const router = useRouter();
  const { toast } = useToast();
  const inbox = useInbox(initial, initialQ);
  const [filter, setFilter] = useState<MensajesFilter>(initialFilter);
  const [selectedId, setSelectedId] = useState<string | null>(initialHilo);
  const [cursorId, setCursorId] = useState<string | null>(initialHilo);
  const [contextOpen, setContextOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wide = useMedia(WIDE_QUERY);
  const mdUp = useMedia(MD_QUERY);

  // «Ahora» se fija al del servidor para hidratar igual y avanza cada minuto.
  const [now, setNow] = useState(() => new Date(initial?.generated_at ?? Date.now()));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Estás mirando los mensajes: el globito del icono instalado ya no aplica.
  useEffect(() => {
    clearAppBadge();
  }, []);

  const all = useMemo(() => (inbox.load.status === 'ready' ? inbox.load.inbox.threads : []), [inbox.load]);
  const thresholdHours = inbox.load.status === 'ready' ? inbox.load.inbox.threshold_hours : 12;
  const visible = useMemo(() => {
    if (inbox.search) return inbox.search.threads ?? [];
    return filterThreads(all, filter);
  }, [inbox.search, all, filter]);
  const byAthlete = useMemo(() => new Map(all.map((t) => [t.athlete_id, t])), [all]);
  const selected = selectedId ? (byAthlete.get(selectedId) ?? null) : null;
  const context = useThreadContext(selectedId);
  const fallbackName = context.load.state === 'ready' ? context.load.data.name : null;

  // ── URL ⇄ estado ───────────────────────────────────────────────────────────
  const pushedThread = useRef(false);
  useEffect(() => {
    const onPop = () => {
      const params = new URL(window.location.href).searchParams;
      const hilo = params.get('hilo');
      setSelectedId(hilo && /^\d{1,18}$/.test(hilo) ? hilo : null);
      const f = params.get('filtro') as MensajesFilter | null;
      setFilter(f && MENSAJES_FILTERS.includes(f) ? f : 'por_responder');
      pushedThread.current = false;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openThread = useCallback(
    (t: Pick<MensajesThread, 'athlete_id'>) => {
      setSelectedId(t.athlete_id);
      setCursorId(t.athlete_id);
      setContextOpen(false);
      // Abrirlo es leerlo (la conversación manda el acuse): la fila lo refleja ya.
      inbox.patch(t.athlete_id, (x) => ({ ...x, unread: 0 }));
      const href = urlWith({ hilo: t.athlete_id });
      if (!mdUp && !pushedThread.current) {
        // En el móvil, abrir es «entrar»: el botón atrás del navegador vuelve a la lista.
        window.history.pushState({ mensajesHilo: true }, '', href);
        pushedThread.current = true;
      } else {
        window.history.replaceState(window.history.state, '', href);
      }
    },
    [inbox, mdUp],
  );

  const closeThread = useCallback(() => {
    if (pushedThread.current) {
      window.history.back();
      return;
    }
    setSelectedId(null);
    window.history.replaceState(window.history.state, '', urlWith({ hilo: null }));
  }, []);

  const changeFilter = useCallback((f: MensajesFilter) => {
    setFilter(f);
    window.history.replaceState(window.history.state, '', urlWith({ filtro: f }));
  }, []);

  const changeQ = useCallback(
    (q: string) => {
      inbox.setQ(q);
      window.history.replaceState(window.history.state, '', urlWith({ q: q.trim() }));
    },
    [inbox],
  );

  // ── Acciones ──────────────────────────────────────────────────────────────
  const { done, snooze } = useSnooze(() => void inbox.refresh());

  /** Al despachar la fila del cursor, el cursor pasa a la siguiente. */
  const advanceCursorFrom = useCallback(
    (athleteId: string) => {
      const i = visible.findIndex((t) => t.athlete_id === athleteId);
      if (i === -1) return;
      const next = visible[i + 1] ?? visible[i - 1] ?? null;
      setCursorId((c) => (c === athleteId ? (next?.athlete_id ?? null) : c));
    },
    [visible],
  );

  const markDone = useCallback(
    (t: MensajesThread) => {
      if (filter === 'por_responder' && !inbox.search) advanceCursorFrom(t.athlete_id);
      inbox.patch(t.athlete_id, (x) => (x.waiting ? { ...x, state: 'hecho', snoozed_until: null } : x));
      void done({ athleteId: t.athlete_id, name: t.athlete_name, signalKind: 'message_unanswered' });
    },
    [advanceCursorFrom, done, filter, inbox],
  );

  const markSnoozed = useCallback(
    (t: MensajesThread, until: SnoozeUntil) => {
      if (filter === 'por_responder' && !inbox.search) advanceCursorFrom(t.athlete_id);
      inbox.patch(t.athlete_id, (x) => (x.waiting ? { ...x, state: 'pospuesto', snoozed_until: null } : x));
      void snooze({ athleteId: t.athlete_id, name: t.athlete_name, signalKind: 'message_unanswered', until });
    },
    [advanceCursorFrom, filter, inbox, snooze],
  );

  const markUnread = useCallback(
    async (t: MensajesThread) => {
      // Si está abierto se cierra: si no, la conversación lo volvería a leer.
      if (selectedId === t.athlete_id) closeThread();
      inbox.patch(t.athlete_id, (x) => ({ ...x, unread: Math.max(1, x.unread) }));
      try {
        await apiJson(`/api/coach/messages/threads/${encodeURIComponent(t.athlete_id)}/unread`, { method: 'POST' });
        toast({ title: `${t.athlete_name} · sin leer` });
      } catch (err) {
        toast({ title: 'No se ha podido marcar sin leer', description: errorMessage(err), tone: 'danger' });
      }
      void inbox.refresh();
    },
    [closeThread, inbox, selectedId, toast],
  );

  const openProfile = useCallback((t: MensajesThread) => router.push(`/atletas/${t.athlete_id}`), [router]);

  // ── En vivo ───────────────────────────────────────────────────────────────
  // «Enviar y siguiente»: en «Por responder», contestar abre el siguiente que
  // espera. Una vez por mensaje (el eco del canal en vivo trae el mismo id).
  const [sendAndNext, setSendAndNext] = useSendAndNext();
  const advancedFor = useRef<string | null>(null);
  const onActivity = useCallback(
    (m: MessageDTO) => {
      if (!selectedId) return;
      const current = byAthlete.get(selectedId) ?? null;
      inbox.patch(selectedId, (x) =>
        x.thread_id === m.thread_id
          ? applyIncoming(x, { thread_id: m.thread_id, from: m.sender_role, preview: previewOf(m), at: m.created_at }, { open: true, now: new Date() })
          : x,
      );
      inbox.refreshSoon();
      const answered =
        m.sender_role === 'coach' && current?.thread_id === m.thread_id && current.state === 'por_responder';
      if (!answered || !sendAndNext || filter !== 'por_responder' || inbox.search) return;
      if (advancedFor.current === String(m.id)) return;
      advancedFor.current = String(m.id);
      const next = nextAfterSend(visible, selectedId);
      if (next) {
        openThread(next);
        toast({ title: `Enviado a ${current.athlete_name}`, description: `Ahora: ${next.athlete_name}` });
      } else {
        toast({ title: `Enviado a ${current.athlete_name}`, description: 'Nadie más espera respuesta' });
      }
    },
    [byAthlete, filter, inbox, openThread, selectedId, sendAndNext, toast, visible],
  );

  useChatLiveMessages((m) => {
    // El hilo abierto lo cuenta su conversación (onActivity); aquí, el resto.
    if (selected && selected.thread_id === m.thread_id) return;
    const t = all.find((x) => x.thread_id === m.thread_id);
    if (t) {
      inbox.patch(t.athlete_id, (x) =>
        applyIncoming(x, { thread_id: m.thread_id, from: m.sender_role, preview: previewOf(m), at: m.created_at }, { open: false, now: new Date() }),
      );
    }
    inbox.refreshSoon();
  });

  // ── Teclado ───────────────────────────────────────────────────────────────
  const keys = useRef({ visible, cursorId, selected, openThread, markDone, markSnoozed, markUnread, closeThread, mdUp });
  useEffect(() => {
    keys.current = { visible, cursorId, selected, openThread, markDone, markSnoozed, markUnread, closeThread, mdUp };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || overlayOpen()) return;
      const k = keys.current;
      const key = e.key.toLowerCase();
      const idx = k.visible.findIndex((t) => t.athlete_id === k.cursorId);
      const target = (k.cursorId ? k.visible[idx] : null) ?? k.selected ?? null;
      if (key === 'j' || key === 'k') {
        e.preventDefault();
        const next = k.visible[Math.max(0, Math.min(k.visible.length - 1, idx + (key === 'j' ? 1 : -1)))] ?? k.visible[0];
        if (next) setCursorId(next.athlete_id);
      } else if (e.key === 'Enter' && k.cursorId && idx !== -1) {
        e.preventDefault();
        k.openThread(k.visible[idx]!);
      } else if (key === 'e' && target && (target.state === 'por_responder' || target.state === 'pospuesto')) {
        e.preventDefault();
        k.markDone(target);
      } else if (key === 'h' && target && target.state === 'por_responder') {
        e.preventDefault();
        k.markSnoozed(target, 'signal');
      } else if (key === 'u' && target) {
        e.preventDefault();
        void k.markUnread(target);
      } else if (key === 'r' && k.selected) {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !k.mdUp && k.selected) {
        k.closeThread();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // La fila del cursor, siempre a la vista.
  useEffect(() => {
    document.querySelector('[data-list] [data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  const loadError = inbox.load.status === 'error' ? inbox.load.message : null;

  return (
    <div
      className={cn(
        // Cancela el acolchado de <main> (V2Shell) y ocupa el alto útil exacto.
        '-mx-4 -mt-4 -mb-24 sm:-mx-6 sm:-mt-6 sm:-mb-24 lg:-mb-6',
        'h-[calc(100dvh-var(--v2-topbar-h,3rem)-var(--v2-tabbar-h,0px))] lg:h-[calc(100dvh-var(--v2-topbar-h,3rem))]',
        'grid grid-cols-1 overflow-hidden bg-v2-bg',
        // Todo en rem: mezclar px y rem en los min-* deja el orden de las reglas al azar.
        'md:grid-cols-[21rem_minmax(0,1fr)] lg:grid-cols-[24.5rem_minmax(0,1fr)]',
        // La tercera columna solo existe con un hilo abierto: sin él no hay de quién hablar.
        selectedId && 'min-[85rem]:grid-cols-[24.5rem_minmax(0,1fr)_18rem]',
      )}
    >
      <section
        aria-label="Bandeja"
        className={cn(
          'min-h-0 flex-col border-v2-border bg-v2-surface md:flex md:border-r',
          selectedId ? 'hidden' : 'flex',
        )}
      >
        <div className="min-h-0 flex-1" data-list>
          <ThreadList
            ref={searchRef}
            all={all}
            visible={visible}
            filter={filter}
            onFilter={changeFilter}
            q={inbox.q}
            onQ={changeQ}
            search={inbox.search}
            onRetrySearch={inbox.retrySearch}
            loadError={loadError}
            onRetryLoad={() => void inbox.refresh()}
            selectedId={selectedId}
            cursorId={cursorId}
            now={now}
            thresholdHours={thresholdHours}
            onOpen={openThread}
            onDone={markDone}
            onSnooze={markSnoozed}
            onMarkUnread={(t) => void markUnread(t)}
            onOpenProfile={openProfile}
            onBroadcast={() => setBroadcastOpen(true)}
            sendAndNext={sendAndNext}
            onSendAndNext={setSendAndNext}
          />
        </div>
        <div className="shrink-0 p-3 empty:hidden">
          <PushBanner />
        </div>
      </section>

      <section
        aria-label="Conversación"
        className={cn('min-h-0 min-w-0 flex-col bg-v2-surface md:flex', selectedId ? 'flex' : 'hidden')}
      >
        {selectedId ? (
          <ThreadPane
            key={selectedId}
            athleteId={selectedId}
            thread={selected}
            fallbackName={fallbackName}
            now={now}
            thresholdHours={thresholdHours}
            visible
            onBack={closeThread}
            onToggleContext={() => setContextOpen((o) => !o)}
            onActivity={onActivity}
            onDone={() => selected && markDone(selected)}
            onSnooze={(until) => selected && markSnoozed(selected, until)}
            onMarkUnread={() => {
              if (selected) void markUnread(selected);
            }}
            composerRef={composerRef}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
            <EmptyState variant="page" icon={MessagesSquare} title="Elige una conversación" />
            <p className="hidden items-center gap-1.5 t-meta text-v2-faint pointer-fine:flex">
              <Keyboard aria-hidden strokeWidth={1.75} className="size-3.5" />
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> moverse · <Kbd>Enter</Kbd> abrir · <Kbd>E</Kbd> hecho · <Kbd>H</Kbd> posponer · <Kbd>/</Kbd> buscar
            </p>
          </div>
        )}
      </section>

      {selectedId ? (
        <aside
          aria-label="Contexto del atleta"
          className="hidden min-h-0 overflow-y-auto border-l border-v2-border bg-v2-surface min-[85rem]:block"
        >
          <ContextPane load={context.load} athleteId={selectedId} onRetry={context.reload} />
        </aside>
      ) : null}

      {!wide && selectedId ? (
        <Sheet
          open={contextOpen}
          onOpenChange={setContextOpen}
          modal={!mdUp}
          size="sm"
          title={selected?.athlete_name ?? fallbackName ?? 'Contexto'}
          description="Su contexto"
        >
          <ContextPane load={context.load} athleteId={selectedId} onRetry={context.reload} className="p-0" />
        </Sheet>
      ) : null}

      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} onSent={() => void inbox.refresh()} />
    </div>
  );
}
