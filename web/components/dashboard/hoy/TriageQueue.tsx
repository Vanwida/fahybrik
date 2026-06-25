'use client';

// TriageQueue — the /hoy orchestrator (SPEC §4). It composes the F2 primitives
// over the F1 backbone: LensTabs (?lens= URL state), the CRÍTICO→VIGILAR groups,
// the collapsed AutoResolvedDrawer, multi-select + BulkActionBar, the keyboard
// layer, the non-modal AthleteSidePanel, the ⌘K CommandPalette and the Toast
// provider. Resolve/snooze are OPTIMISTIC with a 5s undo window (UndoToast)
// before the real endpoint commits:
//   • signals  → POST /api/coach/inbox/{snooze,bulk} (athlete_id, signal_kind)
//   • decisions→ the existing approve endpoints (week-adjustment / monthly-block)
// Intake decisions are review-only (no approve endpoint) — they leave the queue
// via the deep-link, not Resolver.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import {
  LensTabs,
  BulkActionBar,
  EmptyState,
  ToastProvider,
  useToast,
  UndoToast,
  CommandPalette,
  type Lens,
  type CommandItem,
  type AthleteSearchResult,
  type AthleteAction,
} from '@/components/dashboard/ui';
import { MIcon } from '@/components/dashboard/MIcon';
import { TriageCard } from './TriageCard';
import { AthleteSidePanel } from './AthleteSidePanel';
import { ThreadDrawer } from './ThreadDrawer';
import { GroupMessageComposer } from './GroupMessageComposer';
import { useQueueKeyboard } from './use-queue-keyboard';
import { presentSignal, type TriageLens } from './triage-presentation';
import {
  SNOOZE_PRESETS,
  type SnoozePreset,
  type TriageData,
  type TriageItem,
  type TriageMessageItem,
} from './triage-types';

// ── Lens catalogue (SPEC §4 zone 1) ──────────────────────────────────────────

const LENS_KEYS: readonly TriageLens[] = ['all', 'missed', 'microcycle', 'unanswered', 'readiness'];

const LENS_LABEL: Record<TriageLens, string> = {
  all: 'Todo',
  missed: 'Sesiones perdidas',
  microcycle: 'Microciclo acaba',
  unanswered: 'Sin responder',
  readiness: 'Readiness',
};

function parseLens(raw: string | null): TriageLens {
  return (LENS_KEYS as readonly string[]).includes(raw ?? '') ? (raw as TriageLens) : 'all';
}

/** Which lens an item belongs to (decisions map by payload type; signals via presentation). */
function itemLens(item: TriageItem): Exclude<TriageLens, 'all'> | null {
  if (item.kind === 'decision') {
    if (item.payload.type === 'week_adjustment' || item.payload.type === 'monthly_block') {
      return 'microcycle';
    }
    return null;
  }
  // A waiting message belongs to the "Sin responder" lens.
  if (item.kind === 'message') return 'unanswered';
  return presentSignal(item.signal_kind).lens;
}

// ── Optimistic action bookkeeping ─────────────────────────────────────────────

interface PendingAction {
  /** Items being committed (so they hide from the queue while the window runs). */
  ids: string[];
  /** The deferred commit (fires on undo timeout). */
  commit: () => Promise<void>;
  message: string;
}

export interface TriageQueueProps {
  data: TriageData;
}

// ── Endpoint fetchers (client-side; the endpoints are fixed contracts) ────────

async function searchAthletes(query: string): Promise<AthleteSearchResult[]> {
  const res = await fetch(`/api/coach/search?q=${encodeURIComponent(query)}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: AthleteSearchResult[] };
  return body.results ?? [];
}

async function fetchDeepDive(
  athleteId: string,
): Promise<{ score: number | null; contributors: { label: string; score: number | null }[] } | null> {
  const res = await fetch(`/api/coach/athletes/${athleteId}/readiness-breakdown`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return (await res.json()) as {
    score: number | null;
    contributors: { label: string; score: number | null }[];
  };
}

/** Fan one message out to N athletes (server-side broadcast). Throws on HTTP fail. */
async function broadcastMessage(
  athleteIds: string[],
  body: string,
): Promise<{ sent: number; failed: number; failed_ids: string[] }> {
  const res = await fetch('/api/coach/messages/broadcast', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ athlete_ids: athleteIds, body }),
  });
  if (!res.ok) throw new Error(`broadcast ${res.status}`);
  const json = (await res.json()) as { sent: number; failed: number; failed_ids: string[] };
  return json;
}

export function TriageQueue(props: TriageQueueProps) {
  // Toast provider mounts HERE (not in AppShell — out of F3 scope) so /hoy gets
  // the aria-live region + undo toasts without touching the shared layout.
  return (
    <ToastProvider>
      <TriageQueueInner {...props} />
    </ToastProvider>
  );
}

function TriageQueueInner({ data }: TriageQueueProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const activeLens = parseLens(searchParams.get('lens'));

  // Locally resolved/snoozed ids hide immediately (optimistic), then commit.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The readiness side panel is signal/decision-only (messages open the drawer).
  const [panelItem, setPanelItem] = useState<Exclude<TriageItem, { kind: 'message' }> | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // Inline message reply (ThreadDrawer) — separate from the readiness side panel.
  const [drawerItem, setDrawerItem] = useState<TriageMessageItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Group-message composer (cohort broadcast over the current selection).
  const [composerOpen, setComposerOpen] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allItems = useMemo(() => [...data.critico, ...data.vigilar], [data]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  // Visible after optimistic removals + lens filter.
  const visible = useMemo(() => {
    return allItems.filter((i) => {
      if (removedIds.has(i.id)) return false;
      if (activeLens === 'all') return true;
      return itemLens(i) === activeLens;
    });
  }, [allItems, removedIds, activeLens]);

  const critico = visible.filter((i) => i.tier === 'critico');
  const vigilar = visible.filter((i) => i.tier === 'vigilar');
  const orderedIds = useMemo(() => visible.map((i) => i.id), [visible]);

  // Per-lens counts (over non-removed items, ignoring the active filter).
  const lensCounts = useMemo(() => {
    const live = allItems.filter((i) => !removedIds.has(i.id));
    const counts: Record<TriageLens, number> = {
      all: live.length,
      missed: 0,
      microcycle: 0,
      unanswered: 0,
      readiness: 0,
    };
    for (const i of live) {
      const l = itemLens(i);
      if (l) counts[l] += 1;
    }
    return counts;
  }, [allItems, removedIds]);

  const lenses: Lens<TriageLens>[] = LENS_KEYS.map((key) => ({
    key,
    label: LENS_LABEL[key],
    count: lensCounts[key],
  }));

  // ── URL lens state ──────────────────────────────────────────────────────────
  const setLens = useCallback(
    (key: TriageLens) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === 'all') params.delete('lens');
      else params.set('lens', key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // ── Optimistic commit helpers ────────────────────────────────────────────────

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  // Schedules an optimistic action: hides ids now, shows the UndoToast, commits
  // on elapse. A new action commits any in-flight one first (FIFO, no loss).
  const schedule = useCallback(
    (ids: string[], message: string, commit: () => Promise<void>) => {
      setRemovedIds((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      setPending((prevPending) => {
        // Commit a prior pending action immediately so we never drop it.
        if (prevPending) void prevPending.commit();
        return { ids, commit, message };
      });
      clearUndoTimer();
    },
    [clearUndoTimer],
  );

  const handleUndo = useCallback(() => {
    clearUndoTimer();
    setPending((p) => {
      if (p) setRemovedIds((prev) => new Set([...prev].filter((id) => !p.ids.includes(id))));
      return null;
    });
  }, [clearUndoTimer]);

  const handleElapsed = useCallback(() => {
    setPending((p) => {
      if (p) {
        void p.commit().catch(() => {
          // Restore on failure + persistent error toast (SPEC §4 error de acción).
          setRemovedIds((prev) => new Set([...prev].filter((id) => !p.ids.includes(id))));
          toast.show('No se pudo aplicar la acción. Inténtalo de nuevo.', { tone: 'error' });
        });
      }
      return null;
    });
  }, [toast]);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  // ── Endpoint callers ─────────────────────────────────────────────────────────

  const commitResolve = useCallback(async (items: TriageItem[]) => {
    // Decisions with an approve endpoint → POST each. Signals → bulk resolve.
    // Messages can't be "replied" in bulk, so a bulk Resolve dismisses them via
    // their `message_unanswered` override (resurface_on_new_signal=true → the
    // line comes back only if the athlete writes again — never a silent loss).
    const signalKeys = items
      .map((i) =>
        i.kind === 'signal'
          ? { athlete_id: i.athlete_id, signal_kind: i.signal_kind }
          : i.kind === 'message'
            ? { athlete_id: i.athlete_id, signal_kind: 'message_unanswered' }
            : null,
      )
      .filter((k): k is { athlete_id: string; signal_kind: string } => k != null);
    const decisions = items.filter(
      (i): i is Extract<TriageItem, { kind: 'decision' }> => i.kind === 'decision' && i.approve_endpoint != null,
    );

    const calls: Promise<Response>[] = [];
    if (signalKeys.length > 0) {
      calls.push(
        fetch('/api/coach/inbox/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'resolve',
            items: signalKeys,
          }),
        }),
      );
    }
    for (const d of decisions) {
      calls.push(fetch(d.approve_endpoint!, { method: 'POST', credentials: 'include' }));
    }
    const results = await Promise.all(calls);
    if (results.some((r) => !r.ok)) throw new Error('commit failed');
    router.refresh();
  }, [router]);

  const commitSnooze = useCallback(
    async (items: TriageItem[], hours: number) => {
      // Both signals and messages snooze through the override store: a message
      // maps to its underlying `message_unanswered` signal (the kind dropped from
      // the queue render), so posponing a message hides it for the window exactly
      // like any other signal. Decisions are not snoozable server-side — they just
      // hide locally for the window (their proposal stays pending).
      const snoozeKeys = items
        .map((i) =>
          i.kind === 'signal'
            ? { athlete_id: i.athlete_id, signal_kind: i.signal_kind }
            : i.kind === 'message'
              ? { athlete_id: i.athlete_id, signal_kind: 'message_unanswered' }
              : null,
        )
        .filter((k): k is { athlete_id: string; signal_kind: string } => k != null);
      if (snoozeKeys.length === 0) {
        router.refresh();
        return;
      }
      const snoozeUntil = new Date(Date.now() + hours * 3_600_000).toISOString();
      const res = await fetch('/api/coach/inbox/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'snooze',
          snooze_until: snoozeUntil,
          items: snoozeKeys,
        }),
      });
      if (!res.ok) throw new Error('commit failed');
      router.refresh();
    },
    [router],
  );

  // ── Single-item actions ────────────────────────────────────────────────────

  const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

  // Explicit reply intent (Responder button / glyph click on a message line).
  const replyItem = useCallback((item: TriageMessageItem) => {
    setDrawerItem(item);
    setDrawerOpen(true);
  }, []);

  const resolveItem = useCallback(
    (item: TriageItem) => {
      // Messages have no resolve/approve endpoint — they leave the queue only via
      // a reply, so "resolve" (R / Responder) opens the inline drawer instead.
      if (item.kind === 'message') {
        replyItem(item);
        return;
      }
      // Intake = review-only: there is no resolve endpoint, so deep-link instead.
      if (item.kind === 'decision' && item.payload.type === 'intake_pending') {
        router.push(`/atletas/${item.athlete_id}/intake`);
        return;
      }
      const verb = item.kind === 'decision' ? 'Aprobado' : 'Resuelto';
      schedule([item.id], `${verb} — ${firstName(item.athlete_name)}`, () => commitResolve([item]));
    },
    [schedule, commitResolve, router, replyItem],
  );

  const snoozeItem = useCallback(
    (item: TriageItem, preset: SnoozePreset) => {
      schedule([item.id], `Pospuesto ${preset.label.toLowerCase()} — ${firstName(item.athlete_name)}`, () =>
        commitSnooze([item], preset.hours),
      );
    },
    [schedule, commitSnooze],
  );

  const dismissItem = useCallback(
    (item: TriageItem) => {
      // A message has nothing to "dismiss" server-side (it stays unanswered until
      // replied); E/Backspace on a message posts a snooze so it hides for the
      // window instead of silently looking resolved.
      if (item.kind === 'message') {
        schedule(
          [item.id],
          `Pospuesto ${SNOOZE_PRESETS[1]!.label.toLowerCase()} — ${firstName(item.athlete_name)}`,
          () => commitSnooze([item], SNOOZE_PRESETS[1]!.hours),
        );
        return;
      }
      schedule([item.id], `Descartado — ${firstName(item.athlete_name)}`, () => commitResolve([item]));
    },
    [schedule, commitResolve, commitSnooze],
  );

  const openItem = useCallback(
    (item: TriageItem) => {
      // Message lines open the inline thread drawer (reply); everything else
      // opens the readiness side panel.
      if (item.kind === 'message') {
        setDrawerItem(item);
        setDrawerOpen(true);
        return;
      }
      setPanelItem(item);
      setPanelOpen(true);
    },
    [],
  );

  // The drawer marks the thread read on open and reports a successful reply; both
  // mean the line no longer needs the coach, so we remove it (no undo — the
  // server action already committed). Idempotent: a set add for an absent id is
  // a no-op, so read-then-reply on the same thread removes once.
  const clearMessageLine = useCallback((item: TriageMessageItem) => {
    setRemovedIds((prev) => (prev.has(item.id) ? prev : new Set([...prev, item.id])));
  }, []);

  const toggleSelect = useCallback((item: TriageItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  // Add a single id to the selection (idempotent — used by Shift+J/K range).
  const selectId = useCallback((id: string) => {
    setSelected((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  // Select EVERY id in `ids` (⌘A / "Seleccionar los N…"); union with current so
  // it never clears an existing selection. Toggles off when all are already in.
  const selectMany = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allIn = ids.length > 0 && ids.every((id) => prev.has(id));
      if (allIn) {
        // Re-issuing select-all when everything's already selected clears just
        // those ids (toggle), so the affordance reads as a switch.
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      }
      return new Set([...prev, ...ids]);
    });
  }, []);

  // ── Keyboard layer ─────────────────────────────────────────────────────────

  const keyboard = useQueueKeyboard(
    orderedIds,
    useMemo(
      () => ({
        onOpen: (id) => { const it = byId.get(id); if (it) openItem(it); },
        onResolve: (id) => { const it = byId.get(id); if (it) resolveItem(it); },
        onSnooze: (id) => { const it = byId.get(id); if (it) snoozeItem(it, SNOOZE_PRESETS[1]!); },
        onDismiss: (id) => { const it = byId.get(id); if (it) dismissItem(it); },
        onToggleSelect: (id) => { const it = byId.get(id); if (it) toggleSelect(it); },
        onSelectId: selectId,
        onSelectAll: () => selectMany(orderedIds),
        onClearSelection: () => setSelected(new Set()),
      }),
      [byId, openItem, resolveItem, snoozeItem, dismissItem, toggleSelect, selectId, selectMany, orderedIds],
    ),
    !paletteOpen && !panelOpen && !drawerOpen && !composerOpen,
  );

  // ⌘K opens the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Listen for the header's ⌘K button (custom event so the header stays dumb).
  useEffect(() => {
    const open = () => setPaletteOpen(true);
    window.addEventListener('hoy:open-palette', open);
    return () => window.removeEventListener('hoy:open-palette', open);
  }, []);

  // ── Bulk actions ─────────────────────────────────────────────────────────────

  const selectedItems = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter((i): i is TriageItem => i != null),
    [selected, byId],
  );

  const bulkResolve = () => {
    if (selectedItems.length === 0) return;
    schedule(
      selectedItems.map((i) => i.id),
      `${selectedItems.length} resueltos`,
      () => commitResolve(selectedItems),
    );
  };
  const bulkSnooze = (preset: SnoozePreset) => {
    if (selectedItems.length === 0) return;
    schedule(
      selectedItems.map((i) => i.id),
      `${selectedItems.length} pospuestos ${preset.label.toLowerCase()}`,
      () => commitSnooze(selectedItems, preset.hours),
    );
  };

  // Distinct athletes across the selection (a message reaches each ONCE even when
  // an athlete has two selected lines — a signal + an unanswered message).
  const broadcastRecipients = useMemo(() => {
    const seen = new Set<string>();
    const out: { athlete_id: string; athlete_name: string }[] = [];
    for (const i of selectedItems) {
      if (seen.has(i.athlete_id)) continue;
      seen.add(i.athlete_id);
      out.push({ athlete_id: i.athlete_id, athlete_name: i.athlete_name });
    }
    return out;
  }, [selectedItems]);

  // Cohort broadcast: one message → each recipient's own thread. The composer
  // owns the draft; here we send, toast the outcome and (unlike resolve) keep the
  // lines selected — a message is not a resolution. Selection clears on success.
  const handleBroadcast = useCallback(
    async (body: string) => {
      const ids = broadcastRecipients.map((r) => r.athlete_id);
      if (ids.length === 0) return;
      setBroadcasting(true);
      try {
        const result = await broadcastMessage(ids, body);
        setComposerOpen(false);
        setSelected(new Set());
        if (result.failed === 0) {
          toast.show(`Enviado a ${result.sent} ${result.sent === 1 ? 'atleta' : 'atletas'}.`, {
            tone: 'success',
          });
        } else {
          toast.show(
            `Enviado a ${result.sent}. No se pudo enviar a ${result.failed}.`,
            { tone: 'error' },
          );
        }
      } catch {
        toast.show('No se pudo enviar el mensaje al grupo. Inténtalo de nuevo.', { tone: 'error' });
      } finally {
        setBroadcasting(false);
      }
    },
    [broadcastRecipients, toast],
  );

  // ── Command palette commands (lenses + actions) ──────────────────────────────

  const commands: CommandItem[] = useMemo(
    () => [
      ...LENS_KEYS.map((key) => ({
        id: `lens-${key}`,
        group: 'Lentes',
        icon: 'filter_list',
        label: `Ver: ${LENS_LABEL[key]}`,
        onSelect: () => setLens(key),
      })),
      {
        id: 'goto-roster',
        group: 'Acciones',
        icon: 'groups',
        label: 'Ir al roster',
        onSelect: () => router.push('/atletas'),
      },
    ],
    [setLens, router],
  );

  // Per-athlete quick actions on the ⌘K typeahead (Enter still = go to ficha):
  // open the conversation thread (the athlete ficha holds chat) and jump into the
  // block-assignment flow (the macro/calendar view where AssignFlow lives).
  const athleteActions: AthleteAction[] = useMemo(
    () => [
      {
        key: 'conversation',
        icon: 'forum',
        label: 'Abrir conversación',
        run: (a) => router.push(`/atletas/${a.id}`),
      },
      {
        key: 'assign-block',
        icon: 'calendar_add_on',
        label: 'Asignar bloque',
        run: (a) => router.push(`/atletas/${a.id}?view=macro`),
      },
    ],
    [router],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const isFiltered = activeLens !== 'all';
  const nothingVisible = visible.length === 0;

  // Are all visible (current-lens) lines already selected? Drives the toggle copy.
  const allVisibleSelected =
    orderedIds.length > 0 && orderedIds.every((id) => selected.has(id));

  return (
    <div className="flex flex-col gap-5">
      <LensTabs lenses={lenses} activeLens={activeLens} onLensChange={setLens} />

      {/* Select-all-in-lens affordance: one gesture selects every visible line
          (the cohort scale lever's entry point). Hidden when nothing's visible. */}
      {!nothingVisible ? (
        <div className="-mt-2 flex items-center px-1">
          <button
            type="button"
            onClick={() => selectMany(orderedIds)}
            aria-pressed={allVisibleSelected}
            className="focus-ring inline-flex items-center gap-1.5 rounded-[var(--r-s)] px-1 py-1 text-[12px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          >
            <MIcon name={allVisibleSelected ? 'check_box' : 'check_box_outline_blank'} size={16} />
            {allVisibleSelected
              ? 'Quitar selección'
              : `Seleccionar ${orderedIds.length === 1 ? 'el atleta' : `los ${orderedIds.length}`}${isFiltered ? ' de esta lente' : ''}`}
          </button>
        </div>
      ) : null}

      {nothingVisible ? (
        isFiltered ? (
          <EmptyState
            variant="filtered"
            description="Ningún atleta entra en esta lente ahora mismo."
            action={{ label: 'Quitar filtro', onClick: () => setLens('all'), icon: 'filter_alt_off' }}
          />
        ) : (
          <EmptyState
            variant="inbox-zero"
            description="Sin decisiones pendientes. Tu equipo está en verde."
          />
        )
      ) : (
        <div className="flex flex-col gap-6">
          {critico.length > 0 ? (
            <QueueGroup
              label="Crítico"
              count={critico.length}
              items={critico}
              selected={selected}
              focusedId={keyboard.focusedId}
              onResolve={resolveItem}
              onSnooze={snoozeItem}
              onOpen={openItem}
              onReply={replyItem}
              onToggleSelect={toggleSelect}
              onSelectGroup={() => selectMany(critico.map((i) => i.id))}
              onFocus={keyboard.setFocusedId}
            />
          ) : null}
          {vigilar.length > 0 ? (
            <QueueGroup
              label="Vigilar"
              count={vigilar.length}
              items={vigilar}
              selected={selected}
              focusedId={keyboard.focusedId}
              onResolve={resolveItem}
              onSnooze={snoozeItem}
              onOpen={openItem}
              onReply={replyItem}
              onToggleSelect={toggleSelect}
              onSelectGroup={() => selectMany(vigilar.map((i) => i.id))}
              onFocus={keyboard.setFocusedId}
            />
          ) : null}

          {data.overflow > 0 ? (
            <p className="px-1 text-[12.5px] text-[color:var(--text-muted)]">
              +{data.overflow} {data.overflow === 1 ? 'atleta' : 'atletas'} más fuera de la cola
              priorizada.
            </p>
          ) : null}
        </div>
      )}

      {/* Auto-resuelto hoy (N) — collapsed drawer (SPEC §4 zone 2). */}
      {data.auto_resolved_count > 0 ? <AutoResolvedDrawer count={data.auto_resolved_count} /> : null}

      {/* Multi-select bulk bar (SPEC §4 zone) — the cohort scale lever. */}
      <BulkActionBar
        count={selected.size}
        onClearSelection={() => setSelected(new Set())}
        actions={[
          { key: 'resolve', label: 'Resolver', icon: 'check', variant: 'primary', onClick: bulkResolve },
          {
            key: 'snooze',
            label: 'Posponer',
            icon: 'schedule',
            menu: SNOOZE_PRESETS.map((p) => ({
              key: p.key,
              label: p.label,
              onClick: () => bulkSnooze(p),
            })),
          },
          {
            key: 'message',
            label: 'Mensaje al grupo',
            icon: 'forum',
            onClick: () => setComposerOpen(true),
          },
        ]}
      />

      {/* Undo toast (SPEC §4 zone 5 + §6 5s window). */}
      {pending ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-md">
            <UndoToast message={pending.message} onElapsed={handleElapsed} onUndo={handleUndo} />
          </div>
        </div>
      ) : null}

      <AthleteSidePanel
        item={panelItem}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onResolve={resolveItem}
        fetchDeepDive={fetchDeepDive}
      />

      <ThreadDrawer
        item={drawerItem}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRead={clearMessageLine}
        onReplied={clearMessageLine}
      />

      <GroupMessageComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        recipients={broadcastRecipients}
        onSend={handleBroadcast}
        sending={broadcasting}
      />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        onSearchAthletes={searchAthletes}
        onSelectAthlete={(a) => router.push(`/atletas/${a.id}`)}
        athleteActions={athleteActions}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface QueueGroupProps {
  label: string;
  count: number;
  items: TriageItem[];
  selected: ReadonlySet<string>;
  focusedId: string | null;
  onResolve: (item: TriageItem) => void;
  onSnooze: (item: TriageItem, preset: SnoozePreset) => void;
  onOpen: (item: TriageItem) => void;
  onReply: (item: TriageMessageItem) => void;
  onToggleSelect: (item: TriageItem) => void;
  /** Toggle-select every item in this tier (the per-tier scale lever). */
  onSelectGroup: () => void;
  onFocus: (id: string) => void;
}

function QueueGroup({
  label,
  count,
  items,
  selected,
  focusedId,
  onResolve,
  onSnooze,
  onOpen,
  onReply,
  onToggleSelect,
  onSelectGroup,
  onFocus,
}: QueueGroupProps) {
  const headingId = `grupo-${label.toLowerCase()}`;
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2 id={headingId} className="micro-label flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onSelectGroup}
          aria-pressed={allSelected}
          aria-label={`${allSelected ? 'Quitar selección de' : 'Seleccionar'} ${label} (${count})`}
          className="focus-ring -m-0.5 inline-flex items-center rounded-[var(--r-s)] p-0.5 text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
        >
          <MIcon name={allSelected ? 'check_box' : 'check_box_outline_blank'} size={15} />
        </button>
        {label}{' '}
        <span className="metric-num font-bold text-[color:var(--surface-variant)]">{count}</span>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--border-subtle)]" />
      </h2>
      {items.map((item) => (
        <TriageCard
          key={item.id}
          item={item}
          selected={selected.has(item.id)}
          focused={focusedId === item.id}
          onResolve={onResolve}
          onSnooze={onSnooze}
          onOpen={onOpen}
          onReply={onReply}
          onToggleSelect={onToggleSelect}
          onFocus={onFocus}
        />
      ))}
    </section>
  );
}

function AutoResolvedDrawer({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring inline-flex items-center gap-2 rounded-[var(--r-s)] px-1 py-1 text-[12.5px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
      >
        <MIcon name={open ? 'expand_less' : 'expand_more'} size={16} />
        Auto-resuelto hoy{' '}
        <span className="metric-num font-bold text-[color:var(--fg)]">{count}</span>
      </button>
      {open ? (
        <p className="mt-2 max-w-[60ch] text-[12.5px] leading-relaxed text-[color:var(--text-muted)]">
          {count} {count === 1 ? 'atleta resolvió' : 'atletas resolvieron'} su señal sin necesitarte:
          sincronizaron, completaron su sesión o su readiness volvió a verde. No requieren acción.
        </p>
      ) : null}
    </div>
  );
}
