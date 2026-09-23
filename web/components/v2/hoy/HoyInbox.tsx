'use client';

// HOY — la bandeja que tiende a cero (plan §6). Cabecera con la cifra que baja al
// actuar; vistas en `?vista=`; grupos de causa compartida primero; luego Acción y
// Vigilar (el estado del atleta, las palabras de Atletas), una fila por atleta,
// peor primero. Clic o Enter abre el vistazo (no
// modal: la lista sigue viva y J/K lo mueven). Todo es optimista con «Deshacer».

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CircleCheck } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyRow, HoyView, SystemicGroup } from '@/lib/dashboard/hoy/hoy-types';
import type { SetupChecklist as SetupChecklistData } from '@/lib/coach/setup-checklist';
import type { HoyExtras, HoyPerson } from '@/app/[locale]/(v2)/hoy/_data/hoy-extras';
import { Button, EmptyState, PageHeader } from '@/components/v2/ui';
import { AssignSheet, AthletePeek, SetupChecklist } from '@/components/v2/shared';
import { mondayOf } from '@/components/v2/shared/format';
import type { SnoozeUntil } from '@/components/v2/shared/SnoozeMenu';
import { HelpArticle, useShell } from '@/components/v2/shell/ShellContext';
import { GUIA_SLUGS } from '@/components/v2/guia/config';
import { cn } from '@/lib/utils';
import {
  VIGILAR_FOLD,
  accionInGroupsLabel,
  groupInVista,
  intakeQueueHref,
  sortIntakes,
  kindsLabel,
  navOrder,
  nextAfterRemoval,
  needsYouLabel,
  rangeIds,
  rowInVista,
  snoozedTargets,
  step,
  visibleInbox,
  vistaCounts,
  weekVisibilityLabel,
  type HoyVista,
} from './hoy-model';
import { agoLabel, boxToday, nextExpectedLine, untilLabel } from './hoy-format';
import { useHoyActions } from './use-hoy-actions';
import { useHoyKeys } from './use-hoy-keys';
import { SystemicSection } from './SystemicSection';
import { VistaChips } from './VistaChips';
import { PublishConfirmDialog, RemindConfirmDialog } from './HoyConfirmDialogs';
import { RowSection } from './RowSection';
import { AltasList } from './AltasList';
import { HoyFooter, type FooterEntry } from './HoyFooter';
import { HoyBulkBar } from './HoyBulkBar';
import { ShortcutsDialog } from './ShortcutsDialog';

const EMPTY_VISTA: Record<Exclude<HoyVista, 'todo' | 'altas'>, string> = {
  responder: 'Nadie espera respuesta.',
  sesiones: 'Nada que mirar en sus entrenos.',
  fisiologia: 'Nada que mirar en su fisiología.',
  plan: 'Nada pendiente en los planes.',
};

type AssignTarget = { ids: string[]; people: Array<{ id: string; name: string; avatar_url: string | null }> };

export interface HoyInboxProps {
  view: HoyView;
  extras: HoyExtras;
  negocio: boolean;
  setup: SetupChecklistData | null;
  noAthletes: boolean;
  initialVista: HoyVista;
  dateLabel: string;
}

export function HoyInbox({ view, extras, negocio, setup, noAthletes, initialVista, dateLabel }: HoyInboxProps) {
  const { openChat } = useShell();
  const actions = useHoyActions({ generatedAt: view.generated_at });
  const { pending, hiddenGroups, proposals, override, reopen, proposeDeload, remindPayments, publishGroup, broadcast, refresh } =
    actions;

  const [vista, setVista] = useState<HoyVista>(initialVista);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [replyKey, setReplyKey] = useState(0);
  const [vigilarOpen, setVigilarOpen] = useState(false);
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const [confirmGroup, setConfirmGroup] = useState<SystemicGroup | null>(null);
  const [remindGroup, setRemindGroup] = useState<SystemicGroup | null>(null);
  const [help, setHelp] = useState(false);

  const now = useMemo(() => new Date(view.generated_at), [view.generated_at]);
  const today = boxToday(now, view.timezone);
  const weekStart = mondayOf(today);

  const inbox = useMemo(() => visibleInbox(view, pending, hiddenGroups), [view, pending, hiddenGroups]);
  const counts = useMemo(() => vistaCounts(inbox), [inbox]);
  const critico = inbox.critico.filter((r) => rowInVista(r, vista));
  const vigilar = inbox.vigilar.filter((r) => rowInVista(r, vista));
  const systemic = vista === 'altas' ? [] : inbox.systemic.filter((g) => groupInVista(g, vista));
  // Las esperas que aún no son fila solo salen en «Por responder» (como en Mensajes).
  const replies = vista === 'responder' ? inbox.replies : [];
  const order = [...navOrder(critico, vigilar, vigilarOpen), ...replies.map((r) => r.athlete_id)];
  const fullOrder = () => [...navOrder(critico, vigilar, true), ...replies.map((r) => r.athlete_id)];

  const rowsById = useMemo(() => {
    const m = new Map<string, HoyRow>();
    for (const r of [...view.critico, ...view.vigilar, ...view.snoozed_rows, ...view.replies]) m.set(r.athlete_id, r);
    return m;
  }, [view]);
  const peopleById = useMemo(() => new Map(extras.people.map((p) => [p.athlete_id, p])), [extras.people]);
  const peopleOf = useCallback(
    (g: SystemicGroup) => g.athlete_ids.map((id) => peopleById.get(id)).filter((p): p is HoyPerson => p != null),
    [peopleById],
  );
  const intakeGroup = view.systemic.find((g) => g.kind === 'intake_pending') ?? null;
  const intakePeople = intakeGroup ? sortIntakes(peopleOf(intakeGroup)) : [];

  // La vista vive en la URL (?vista=) sin volver a pedir la página.
  const changeVista = (next: HoyVista) => {
    setVista(next);
    setSelected(new Set());
    setAnchor(null);
    setActiveId(null);
    const url = new URL(window.location.href);
    if (next === 'todo') url.searchParams.delete('vista');
    else url.searchParams.set('vista', next);
    window.history.replaceState(window.history.state, '', url);
  };

  // La fila activa, siempre a la vista.
  useEffect(() => {
    if (!activeId) return;
    document.querySelector('[data-hoy-list] [data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  // Lo seleccionado que ya no está (resuelto, pospuesto) sale de la selección.
  const visibleIds = useMemo(
    () => new Set([...inbox.critico, ...inbox.vigilar, ...inbox.replies].map((r) => r.athlete_id)),
    [inbox],
  );
  const selection = [...selected].filter((id) => visibleIds.has(id));
  const selectionRows = selection.map((id) => rowsById.get(id)).filter((r): r is HoyRow => r != null);

  const openPeek = (id: string) => {
    setActiveId(id);
    setPeekId(id);
  };

  const act = async (rows: HoyRow[], kind: 'done' | 'snooze', until: SnoozeUntil = 'signal') => {
    if (rows.length === 0) return;
    const removed = new Set(rows.map((r) => r.athlete_id));
    const next = nextAfterRemoval(order, removed, activeId);
    setActiveId(next);
    if (peekId && removed.has(peekId)) setPeekId(next);
    setSelected((prev) => new Set([...prev].filter((id) => !removed.has(id))));
    await override(rows, kind, until);
  };

  const keyTargets = (): HoyRow[] => {
    if (selectionRows.length > 0) return selectionRows;
    const row = activeId ? rowsById.get(activeId) : null;
    return row && visibleIds.has(row.athlete_id) ? [row] : [];
  };

  const rowAction = (row: HoyRow, action: SignalAction) => {
    switch (action) {
      case 'responder':
      case 'mensaje':
        setPeekId(null);
        openChat({ id: row.athlete_id, name: row.name });
        return;
      case 'proponer_descarga':
        void proposeDeload(row);
        return;
      case 'asignar_programa':
        setAssign({ ids: [row.athlete_id], people: [{ id: row.athlete_id, name: row.name, avatar_url: row.avatar_url }] });
        return;
      default:
        openPeek(row.athlete_id);
    }
  };

  useHoyKeys({
    move: (delta, extend) => {
      let next = step(order, activeId, delta);
      // Bajar desde la última de Vigilar plegado despliega el resto.
      if (delta === 1 && next === activeId && !vigilarOpen && vigilar.length > VIGILAR_FOLD) {
        setVigilarOpen(true);
        next = vigilar[VIGILAR_FOLD]!.athlete_id;
      }
      if (!next) return;
      if (extend) {
        const from = anchor ?? activeId ?? next;
        setAnchor(from);
        setSelected((prev) => new Set([...prev, ...rangeIds(fullOrder(), from, next)]));
      } else {
        setAnchor(null);
      }
      setActiveId(next);
      if (peekId) setPeekId(next);
    },
    toggle: () => {
      if (!activeId) return;
      setAnchor(activeId);
      setSelected((prev) => {
        const s = new Set(prev);
        if (s.has(activeId)) s.delete(activeId);
        else s.add(activeId);
        return s;
      });
    },
    done: () => void act(keyTargets(), 'done'),
    snooze: () => void act(keyTargets(), 'snooze', 'signal'),
    reply: () => {
      const row = activeId ? rowsById.get(activeId) : null;
      if (!row) return;
      if (peekId === row.athlete_id) setReplyKey((k) => k + 1);
      else rowAction(row, 'responder');
    },
    open: () => {
      const id = activeId ?? order[0] ?? null;
      if (id) openPeek(id);
    },
    help: () => setHelp(true),
  });

  const toggleRow = (row: HoyRow, checked: boolean, shift: boolean) => {
    const id = row.athlete_id;
    if (shift && anchor) {
      const ids = rangeIds(fullOrder(), anchor, id);
      setSelected((prev) => new Set([...prev, ...ids]));
    } else {
      setSelected((prev) => {
        const s = new Set(prev);
        if (checked) s.add(id);
        else s.delete(id);
        return s;
      });
      setAnchor(id);
    }
    setActiveId(id);
  };

  // Pie: lo pospuesto y lo resuelto, lo optimista primero.
  const snoozedEntries: FooterEntry[] = [];
  const resolvedEntries: FooterEntry[] = [];
  for (const p of pending.values()) {
    const entry = { athlete_id: p.row.athlete_id, name: p.row.name, avatar_url: p.row.avatar_url, targets: snoozedTargets(p.row) };
    if (p.kind === 'snooze') snoozedEntries.push({ ...entry, detail: `${p.row.primary.label} · ${untilLabel(p.until)}` });
    else resolvedEntries.push({ ...entry, detail: `${p.row.primary.label} · ahora` });
  }
  for (const r of view.snoozed_rows) {
    if (pending.has(r.athlete_id)) continue;
    snoozedEntries.push({
      athlete_id: r.athlete_id,
      name: r.name,
      avatar_url: r.avatar_url,
      detail: `${r.primary.label} · ${untilLabel(r.until)}`,
      targets: snoozedTargets(r),
    });
  }
  for (const r of extras.resolved) {
    if (pending.has(r.athlete_id)) continue;
    resolvedEntries.push({
      athlete_id: r.athlete_id,
      name: r.name,
      avatar_url: r.avatar_url,
      detail: `${kindsLabel(r.kinds)} · ${agoLabel(r.at, now)}`,
      targets: r.kinds.map((k) => ({ athlete_id: r.athlete_id, signal_kind: k })),
    });
  }

  const peekInitial = peekId
    ? (rowsById.get(peekId) ?? peopleById.get(peekId) ?? null)
    : null;
  const anyRows = critico.length + vigilar.length + replies.length > 0;
  const empty = vista !== 'altas' && systemic.length === 0 && !anyRows;

  const subtitle = noAthletes ? (
    <>Aún no tienes atletas · {dateLabel}</>
  ) : (
    <>
      <strong className="font-semibold text-v2-fg t-tnum">{needsYouLabel(inbox.needs_you)}</strong>
      {' · '}
      <span className="t-tnum">{weekVisibilityLabel(view.week_visibility)}</span> · {dateLabel}
    </>
  );

  return (
    <div className={cn('transition-[padding] duration-[var(--v2-dur)] motion-reduce:transition-none', peekId && 'lg:pr-[460px]')}>
      <HelpArticle slug={GUIA_SLUGS.hoy} />
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
        <PageHeader title="Hoy" subtitle={subtitle}>
          {noAthletes ? null : (
            <VistaChips vista={vista} counts={counts} onChange={changeVista} />
          )}
        </PageHeader>

        {noAthletes ? (
          <SetupChecklist checklist={setup} title="Pon en marcha tu panel" />
        ) : (
          <>
            {vista === 'altas' ? (
              <AltasList people={intakePeople} now={now} onOpen={(p) => openPeek(p.athlete_id)} />
            ) : null}

            <SystemicSection
              groups={systemic}
              peopleOf={peopleOf}
              negocio={negocio}
              onPublish={setConfirmGroup}
              onRemind={setRemindGroup}
              onAssign={(g) =>
                setAssign({
                  ids: g.athlete_ids,
                  people: peopleOf(g).map((p) => ({ id: p.athlete_id, name: p.name, avatar_url: p.avatar_url })),
                })
              }
              onOpenAthlete={(p) => openPeek(p.athlete_id)}
              queueHrefOf={(g) => (g.kind === 'intake_pending' ? intakeQueueHref(intakePeople.map((p) => p.athlete_id)) : null)}
            />

            {[
              {
                id: 'hoy-accion',
                title: 'Acción',
                rows: critico,
                fold: null,
                note: vista === 'todo' ? accionInGroupsLabel(view.counts.accion_in_groups) : null,
              },
              { id: 'hoy-vigilar', title: 'Vigilar', rows: vigilar, fold: VIGILAR_FOLD, note: null },
              { id: 'hoy-responder', title: 'Por responder', rows: replies, fold: null, note: null },
            ].map((s) => (
              <RowSection
                key={s.id}
                {...s}
                expanded={vigilarOpen}
                onExpand={setVigilarOpen}
                activeId={activeId}
                selected={selected}
                proposals={proposals}
                negocio={negocio}
                weekStart={weekStart}
                onOpen={(row) => openPeek(row.athlete_id)}
                onToggle={toggleRow}
                onAction={rowAction}
                onSnooze={(row, until) => void act([row], 'snooze', until)}
                onDone={(row) => void act([row], 'done')}
                onChange={refresh}
              />
            ))}

            {empty && vista === 'todo' ? (
              <div className="flex flex-col gap-6">
                <EmptyState
                  variant="page"
                  icon={CircleCheck}
                  title="Todo al día."
                  description={nextExpectedLine({
                    today,
                    auto_publish_days: extras.auto_publish_days,
                    snoozed_until: view.snoozed_rows.map((r) => r.until),
                  })}
                  className="py-12"
                />
                {setup ? <SetupChecklist checklist={setup} /> : null}
              </div>
            ) : empty ? (
              <EmptyState
                title={EMPTY_VISTA[vista as keyof typeof EMPTY_VISTA]}
                action={
                  <Button size="sm" variant="ghost" onClick={() => changeVista('todo')}>
                    Ver todo
                  </Button>
                }
              />
            ) : null}

            {extras.activity_today != null ? (
              <p className="flex items-center gap-2 t-body-sm text-v2-muted">
                <Activity aria-hidden className="size-4 shrink-0 text-v2-faint" strokeWidth={1.75} />
                {extras.activity_today === 0 ? (
                  'Nadie ha registrado un entreno hoy todavía.'
                ) : (
                  <span>
                    <span className="t-tnum">{extras.activity_today}</span>{' '}
                    {extras.activity_today === 1 ? 'entreno registrado hoy' : 'entrenos registrados hoy'} ·{' '}
                    <Link href="/atletas?estado=todos&orden=ultimo_entreno" className="font-medium text-v2-fg underline-offset-2 hover:underline">
                      ver
                    </Link>
                  </span>
                )}
              </p>
            ) : null}

            <HoyFooter
              resolvedCount={inbox.resolved_today}
              snoozedCount={inbox.snoozed}
              resolved={resolvedEntries}
              snoozed={snoozedEntries}
              onReopen={(e) => void reopen(e.targets, e.name)}
              onHelp={() => setHelp(true)}
            />
          </>
        )}
      </div>

      <HoyBulkBar
        count={selectionRows.length}
        names={selectionRows.map((r) => r.name)}
        onClear={() => setSelected(new Set())}
        onDone={() => void act(selectionRows, 'done')}
        onSnooze={(until) => void act(selectionRows, 'snooze', until)}
        onAssign={() =>
          setAssign({
            ids: selectionRows.map((r) => r.athlete_id),
            people: selectionRows.map((r) => ({ id: r.athlete_id, name: r.name, avatar_url: r.avatar_url })),
          })
        }
        onBroadcast={async (body) => {
          const ok = await broadcast(selectionRows.map((r) => r.athlete_id), body);
          if (ok) setSelected(new Set());
          return ok;
        }}
      />

      <AthletePeek
        athleteId={peekId}
        onClose={() => setPeekId(null)}
        initial={peekInitial ? { name: peekInitial.name, avatar_url: peekInitial.avatar_url, level_label: peekInitial.level_label } : undefined}
        onChange={refresh}
        replyFocusKey={replyKey}
        onAction={(action, data) => {
          if (action !== 'proponer_descarga') return false;
          void proposeDeload({ athlete_id: data.athlete_id, name: data.name });
          return true;
        }}
      />

      <AssignSheet
        open={assign != null}
        onClose={() => setAssign(null)}
        athleteIds={assign?.ids ?? []}
        athletes={assign?.people}
        onAssigned={() => refresh()}
      />

      <PublishConfirmDialog
        group={confirmGroup}
        onCancel={() => setConfirmGroup(null)}
        onConfirm={(g) => {
          setConfirmGroup(null);
          void publishGroup(g);
        }}
      />

      <RemindConfirmDialog
        group={remindGroup}
        names={remindGroup ? peopleOf(remindGroup).map((p) => p.name) : []}
        onCancel={() => setRemindGroup(null)}
        onConfirm={(g) => {
          setRemindGroup(null);
          void remindPayments(peopleOf(g).map((p) => ({ athlete_id: p.athlete_id, name: p.name })));
        }}
      />

      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
}
