'use client';

// Cabecera de la ficha: quién es (avatar, nombre, nivel con el nombre del eje del
// coach, división, carrera objetivo con cuenta atrás) y las acciones: Mensaje (con
// lo que tiene sin leer), Comunicado…, Publicar la semana oculta y ··· (pausa /
// baja). En el móvil ocupa una fila: nombre + Mensaje + ···, y solo esa se pega.

import { useState, type ReactNode } from 'react';
import { GitBranch, MessageCircle, Megaphone, MoreHorizontal, Send, Undo2 } from 'lucide-react';
import { Avatar, Button, IconButton, Menu, Tag, useToast, type MenuEntry } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { WeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import { raceCountdown, weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';
import { useLifecycleMenu } from '../lifecycle/LifecycleControl';
import { PersonalizarPlanModal } from '../PersonalizarPlanModal';
import { VolverPeriodizacionModal } from '../VolverPeriodizacionModal';

function UnreadCount({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={`${n} sin leer`}
      className={cn(
        'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-v2-info px-1 text-[11px] font-semibold leading-none text-v2-bg t-tnum',
        className,
      )}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

function PublishButton() {
  const { shell, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const target = shell.publish_target;
  if (!target || shell.lifecycle.status !== 'activo') return null;
  const range = weekRangeLabel(target.week_start);
  const publish = async () => {
    setBusy(true);
    try {
      const res = await apiJson<WeekPublishResult>(
        `/api/coach/athletes/${shell.athlete_id}/weeks/${target.week_start}/publish`,
        { method: 'POST' },
      );
      toast({
        title: `Semana ${range} visible`,
        description: res.notified ? `${shell.name.split(' ')[0]} ya la tiene en su app.` : undefined,
        tone: 'ok',
      });
      bumpCalendar();
    } catch (err) {
      toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="primary" icon={Send} loading={busy} onClick={() => void publish()}>
      <span className="hidden xl:inline">Publicar {range}</span>
      <span className="xl:hidden">Publicar semana</span>
    </Button>
  );
}

export function FichaHeader({ nav }: { nav: ReactNode }) {
  const { shell, openChat, openComposer } = useFicha();
  const lifecycle = useLifecycleMenu(shell.athlete_id, shell.lifecycle);
  const [planDialog, setPlanDialog] = useState<null | 'personalizar' | 'volver'>(null);
  const pp = shell.personal_plan;

  const meta = [
    shell.division_label,
    shell.race ? `${shell.race.name} ${raceCountdown(shell.race.days, shell.race.date)}` : null,
  ].filter((p): p is string => Boolean(p));

  const menu: MenuEntry[] = [
    { label: 'Comunicado…', icon: Megaphone, onSelect: openComposer },
    ...(pp && !pp.is_personal
      ? [{ label: 'Personalizar su plan…', icon: GitBranch, onSelect: () => setPlanDialog('personalizar') }]
      : []),
    ...(pp?.can_revert ? [{ label: 'Volver al plan de su grupo…', icon: Undo2, onSelect: () => setPlanDialog('volver') }] : []),
    { type: 'separator' },
    ...lifecycle.items,
  ];

  return (
    <header className="sticky top-[var(--v2-topbar-h,3rem)] z-[5] -mx-4 flex flex-col gap-1 bg-v2-bg px-4 py-2 sm:static sm:mx-0 sm:px-0 sm:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={shell.name} src={shell.avatar_url} size="xl" className="hidden sm:inline-flex" />
        <Avatar name={shell.name} src={shell.avatar_url} size="lg" className="sm:hidden" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate t-title text-v2-fg">{shell.name}</h1>
            {shell.level ? <Tag className="shrink-0">{shell.level.label}</Tag> : null}
          </div>
          {meta.length > 0 ? (
            <p className="hidden truncate t-body-sm text-v2-muted sm:block">{meta.join(' · ')}</p>
          ) : null}
        </div>

        <div className="hidden shrink-0 items-center gap-1 lg:flex">{nav}</div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            icon={MessageCircle}
            onClick={openChat}
            className="hidden sm:inline-flex"
            aria-label={shell.unread > 0 ? `Mensaje, ${shell.unread} sin leer` : 'Mensaje'}
          >
            Mensaje
            <UnreadCount n={shell.unread} />
          </Button>
          <span className="relative sm:hidden">
            <IconButton icon={MessageCircle} label="Mensaje" variant="secondary" onClick={openChat} />
            <UnreadCount n={shell.unread} className="pointer-events-none absolute -top-1 -right-1" />
          </span>
          <Button variant="secondary" icon={Megaphone} onClick={openComposer} className="hidden md:inline-flex">
            Comunicado…
          </Button>
          <span className="hidden sm:inline-flex">
            <PublishButton />
          </span>
          <Menu trigger={<IconButton icon={MoreHorizontal} label="Más acciones" variant="secondary" />} items={menu} />
        </div>
      </div>
      {lifecycle.error ? <p role="alert" className="t-body-sm text-v2-danger">{lifecycle.error}</p> : null}
      {lifecycle.dialogs}
      {planDialog === 'personalizar' && pp ? (
        <PersonalizarPlanModal
          athleteId={shell.athlete_id}
          athleteName={shell.name}
          currentBlockName={pp.current_name}
          currentWeek={shell.program?.week ?? null}
          onClose={() => setPlanDialog(null)}
        />
      ) : null}
      {planDialog === 'volver' && pp ? (
        <VolverPeriodizacionModal
          athleteId={shell.athlete_id}
          athleteName={shell.name}
          personalPlanName={pp.current_name}
          onClose={() => setPlanDialog(null)}
        />
      ) : null}
    </header>
  );
}
