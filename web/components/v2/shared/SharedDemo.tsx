'use client';

// Demo de los componentes compartidos con datos reales (/ajustes/sistema/compartidos).
// Solo QA: no es una pantalla del coach. Cada sección monta el componente tal
// como lo montará su pantalla.

import { useEffect, useState } from 'react';
import type { AthleteStatus } from '@fahybrid/shared/domain/coach/athlete-state';
import type { SetupChecklist as SetupChecklistData } from '@/lib/coach/setup-checklist';
import { Avatar, Button, Card, List, ListRow, PageHeader, PanelProviders, SectionHeader } from '@/components/v2/ui';
import { AdherenceMini } from './AdherenceMini';
import { AssignSheet } from './AssignSheet';
import { AthletePeek } from './AthletePeek';
import { AthletePicker, type PickedAthlete } from './AthletePicker';
import { ChatDrawer } from './ChatDrawer';
import { GroupPicker, type PickedGroup } from './GroupPicker';
import { PublishWeekControl } from './PublishWeekControl';
import { ReadinessMini, type ReadinessMiniValue } from './ReadinessMini';
import { SetupChecklist, SetupProgress } from './SetupChecklist';
import { SnoozeMenu } from './SnoozeMenu';
import { SignalBadge, StatusBadgeFor } from './StatusBadgeFor';
import { localToday, mondayOf, plusDays } from './format';

export interface DemoRow {
  athlete_id: string;
  name: string;
  avatar_url: string | null;
  level_label: string | null;
  status: AthleteStatus;
  readiness: ReadinessMiniValue | null;
  adherence_14d: { pct: number | null; due: number; done: number } | null;
}

function Demo({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-3">
      <SectionHeader title={title} variant="title" />
      {children}
    </section>
  );
}

export function SharedDemo({
  rows,
  checklist,
  open,
  focusAthleteId,
}: {
  rows: DemoRow[];
  checklist: SetupChecklistData | null;
  open: string | null;
  focusAthleteId: string | null;
}) {
  const today = localToday();
  const thisMonday = mondayOf(today);
  const focus = rows.find((r) => r.athlete_id === focusAthleteId) ?? rows[0] ?? null;
  const [peekId, setPeekId] = useState<string | null>(null);
  const [assign, setAssign] = useState<null | 'program' | 'group'>(null);
  const [chat, setChat] = useState(false);
  const [athletes, setAthletes] = useState<PickedAthlete[]>([]);
  const [groups, setGroups] = useState<PickedGroup[]>([]);

  // `?abrir=` abre un panel al entrar. En un efecto (no en el estado inicial): el
  // panel necesita el DOM montado para colocarse dentro de `.v2-root`.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open === 'vistazo' && focus) setPeekId(focus.athlete_id);
    if (open === 'asignar') setAssign('program');
    if (open === 'asignar-grupo') setAssign('group');
    if (open === 'chat') setChat(true);
    // solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // J/K recorren la lista con el vistazo abierto (como harán Hoy y Atletas).
  useEffect(() => {
    if (!peekId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'j' && k !== 'k') return;
      const i = rows.findIndex((r) => r.athlete_id === peekId);
      const next = rows[(i + (k === 'j' ? 1 : -1) + rows.length) % rows.length];
      if (next) setPeekId(next.athlete_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekId, rows]);

  const peekRow = rows.find((r) => r.athlete_id === peekId);

  return (
    <PanelProviders>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-10 pb-24">
        <PageHeader
          title="Compartidos"
          subtitle="Componentes entre pantallas con tus datos reales · solo para revisar"
        />

        <Demo id="estado" title="Estado, readiness y adherencia">
          <List aria-label="Muestra de atletas">
            {rows.map((r) => (
              <ListRow
                key={r.athlete_id}
                density="compact"
                active={r.athlete_id === peekId}
                onClick={() => setPeekId(r.athlete_id)}
                leading={<Avatar name={r.name} src={r.avatar_url} size="sm" />}
                title={
                  <span className="flex items-baseline gap-2">
                    {r.name}
                    {r.level_label ? <span className="t-meta text-v2-faint">{r.level_label}</span> : null}
                  </span>
                }
                detail={
                  r.status.signals[0] && r.status.signals[0].severity !== 'info' ? (
                    <SignalBadge signal={r.status.signals[0]} withEvidence size="sm" />
                  ) : (
                    <StatusBadgeFor status={r.status} withReason size="sm" />
                  )
                }
                trailing={
                  <span className="hidden items-center gap-6 md:flex">
                    <StatusBadgeFor status={r.status} size="sm" className="w-28" />
                    <ReadinessMini readiness={r.readiness} today={today} />
                    <AdherenceMini adherence={r.adherence_14d} />
                  </span>
                }
              />
            ))}
          </List>
          <p className="t-meta text-v2-faint">
            Clic en una fila abre el vistazo · J/K cambian de atleta con el vistazo abierto.
          </p>
        </Demo>

        {focus ? (
          <Demo id="acciones" title={`Posponer y publicar · ${focus.name}`}>
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-40 t-meta text-v2-muted">SnoozeMenu</span>
                <SnoozeMenu athleteId={focus.athlete_id} name={focus.name} withDone variant="secondary" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-40 t-meta text-v2-muted">Esta semana</span>
                <PublishWeekControl athleteId={focus.athlete_id} name={focus.name} weekStart={thisMonday} />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-40 t-meta text-v2-muted">La que viene</span>
                <PublishWeekControl
                  athleteId={focus.athlete_id}
                  name={focus.name}
                  weekStart={plusDays(thisMonday, 7)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-40 t-meta text-v2-muted">Varios ({rows.length})</span>
                <PublishWeekControl athleteIds={rows.map((r) => r.athlete_id)} weekStart={plusDays(thisMonday, 7)} />
              </div>
            </Card>
          </Demo>
        ) : null}

        <Demo id="selectores" title="Selectores">
          <Card className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="t-meta text-v2-muted">AthletePicker · busca</span>
              <AthletePicker value={athletes} onValueChange={setAthletes} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="t-meta text-v2-muted">GroupPicker</span>
              <GroupPicker value={groups} onValueChange={setGroups} />
            </div>
          </Card>
        </Demo>

        <Demo id="asignar" title="Asignar programa">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setAssign('program')}>
              Asignar programa 2 a {Math.min(3, rows.length)} atletas…
            </Button>
            <Button onClick={() => setAssign('group')}>Asignar… (desde un grupo, sin programa)</Button>
          </div>
        </Demo>

        {focus ? (
          <Demo id="chat" title="Mensajes">
            <div>
              <Button onClick={() => setChat(true)}>Abrir el hilo de {focus.name}</Button>
            </div>
          </Demo>
        ) : null}

        <Demo id="setup" title="SetupChecklist · SetupProgress">
          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_200px]">
            <SetupChecklist checklist={checklist} />
            <SetupProgress checklist={checklist} />
          </div>
        </Demo>
      </div>

      <AthletePeek
        athleteId={peekId}
        onClose={() => setPeekId(null)}
        initial={
          peekRow ? { name: peekRow.name, avatar_url: peekRow.avatar_url, level_label: peekRow.level_label } : undefined
        }
      />
      <AssignSheet
        open={assign === 'program'}
        onClose={() => setAssign(null)}
        programId="2"
        athleteIds={rows.slice(0, 3).map((r) => r.athlete_id)}
        athletes={rows.slice(0, 3).map((r) => ({ id: r.athlete_id, name: r.name, avatar_url: r.avatar_url }))}
      />
      <AssignSheet open={assign === 'group'} onClose={() => setAssign(null)} groupIds={['1']} />
      {focus ? (
        <ChatDrawer open={chat} onOpenChange={setChat} athleteId={focus.athlete_id} athleteName={focus.name} />
      ) : null}
    </PanelProviders>
  );
}
