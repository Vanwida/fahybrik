'use client';

// El VISTAZO de un atleta: panel lateral NO modal que abren Hoy y Atletas (fila →
// Enter/clic). La lista sigue viva detrás: J/K de la lista cambian `athleteId` y el
// panel le sigue; Escape lo cierra. Contesta, sin abrir la ficha: ¿por qué está
// aquí?, ¿cómo está (readiness vs su base, su semana, adherencia)?, ¿qué me dijo?,
// y ¿qué hago? (la acción de su señal · Posponer · Hecho · Abrir ficha).
//
//   <AthletePeek
//     athleteId={peekId}                       // null = cerrado
//     onClose={() => setPeekId(null)}
//     initial={{ name: row.name, avatar_url: row.avatar_url, level_label: row.level_label }}  // cabecera al instante
//     onChange={() => router.refresh()}        // tras posponer / hecho / publicar / asignar
//     onAction={(action, a) => false}          // opcional: la pantalla intercepta una acción (true = hecho)
//     replyFocusKey={n}                        // opcional: súbelo (R en Hoy) para llevar el foco a «Responder»
//   />
//
// Datos: `fetchAthletePeek` (acción de servidor sobre lib/coach/athlete-peek.ts).
// Necesita <PanelProviders> por encima.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { ArrowUpRight, MessageCircle } from 'lucide-react';
import type { SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import type { AthletePeekData } from '@/lib/coach/athlete-peek';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  Kbd,
  Sheet,
  Skeleton,
  Tag,
  buttonVariants,
  useToast,
} from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { apiJson, errorMessage } from './api';
import { AdherenceMini } from './AdherenceMini';
import { AssignSheet } from './AssignSheet';
import { ChatReplyBox, ChatThread } from './ChatDrawer';
import { countdown, relativeDayLabel, weekdayDate } from './format';
import { fetchAthletePeek } from './peek-action';
import { PublishWeekControl } from './PublishWeekControl';
import { ReadinessMini } from './ReadinessMini';
import { SnoozeMenu } from './SnoozeMenu';
import { SIGNAL_ACTION_LABEL, SignalBadge, StatusBadgeFor } from './StatusBadgeFor';
import { WeekDots, weekDueSummary } from './WeekDots';

export interface AthletePeekProps {
  athleteId: string | null;
  onClose: () => void;
  /** Lo que la fila ya sabe: la cabecera sale sin esperar. */
  initial?: { name: string; avatar_url?: string | null; level_label?: string | null };
  onChange?: () => void;
  /** Devuelve true si la pantalla se ocupa de la acción (no se hace la de serie). */
  onAction?: (action: SignalAction, athlete: AthletePeekData) => boolean | void;
  replyFocusKey?: number;
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; data: AthletePeekData }
  | { state: 'error'; message: string; notFound: boolean };

function usePeek(athleteId: string | null) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const shownId = useRef<string | null>(null);
  useEffect(() => {
    if (!athleteId) return;
    const mine = ++seq.current;
    // Otro atleta → esqueleto; el mismo (recarga tras una acción) → se queda lo que hay.
    if (shownId.current !== athleteId) setLoad({ state: 'loading' });
    fetchAthletePeek(athleteId)
      .then((res) => {
        if (mine !== seq.current) return;
        shownId.current = athleteId;
        setLoad(
          res.ok
            ? { state: 'ready', data: res.data }
            : { state: 'error', message: res.message, notFound: res.code === 'not_found' },
        );
      })
      .catch(() => {
        if (mine !== seq.current) return;
        setLoad({ state: 'error', message: 'No se ha podido cargar el atleta.', notFound: false });
      });
  }, [athleteId, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { load, reload };
}

function Section({
  label,
  aside,
  children,
  className,
}: {
  label: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="t-label text-v2-faint">{label}</h3>
        {aside ? <span className="t-meta text-v2-faint">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

function PeekSkeleton() {
  return (
    <div role="status" aria-label="Cargando el atleta" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-64" />
        <div className="mt-1 flex gap-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="size-6" />
        ))}
      </div>
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/** Semana objetivo de «Publicar semana»: la actual si está oculta, si no la siguiente. */
function publishTarget(d: AthletePeekData): string {
  if (!d.week.visible) return d.week.week_start;
  const next = new Date(`${d.week.week_start}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString().slice(0, 10);
}

function PeekBody({
  data,
  onChange,
  onAction,
  replyFocusKey,
  reload,
}: {
  data: AthletePeekData;
  onChange?: () => void;
  onAction?: AthletePeekProps['onAction'];
  replyFocusKey?: number;
  reload: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [assignOpen, setAssignOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [replyKey, setReplyKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const changed = useCallback(() => {
    reload();
    onChange?.();
  }, [reload, onChange]);

  // La caja se remonta (y toma el foco) con «Responder» aquí o con R desde la lista.
  const replyMount = `${replyKey}-${replyFocusKey ?? 0}`;
  const replyFocus = replyKey > 0 || (replyFocusKey ?? 0) > 0;

  const primary = data.status.signals.find((s) => s.severity !== 'info') ?? null;
  const others = data.status.signals.filter((s) => s !== primary && s.severity !== 'info').slice(0, 3);
  const due = weekDueSummary(data.week.days, data.week.today);

  const act = async (action: SignalAction) => {
    if (onAction?.(action, data) === true) return;
    switch (action) {
      case 'responder':
      case 'mensaje':
        setThreadOpen(false);
        setReplyKey((k) => k + 1);
        return;
      case 'asignar_programa':
        setAssignOpen(true);
        return;
      case 'publicar_semana': {
        const week = publishTarget(data);
        setBusy(true);
        try {
          await apiJson(`/api/coach/athletes/${data.athlete_id}/weeks/${week}/publish`, { method: 'POST' });
          toast({ title: `${data.name} · semana del ${weekdayDate(week)} publicada`, tone: 'ok' });
          changed();
        } catch (err) {
          toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
        } finally {
          setBusy(false);
        }
        return;
      }
      case 'recordar_pago':
        router.push('/negocio/cobros');
        return;
      default:
        router.push(`/atletas/${data.athlete_id}`);
    }
  };

  const message = data.last_message;
  const checkin = data.last_checkin;
  // Lo más reciente que dijo el atleta: su mensaje o su check-in con nota.
  const showCheckin =
    checkin?.notes != null && (!message || message.from !== 'athlete' || checkin.recorded_at > message.created_at);

  return (
    <div className="flex flex-col gap-6">
      {/* Por qué está aquí + qué hago */}
      <section className="flex flex-col gap-3">
        <StatusBadgeFor status={data.status} variant="soft" />
        {primary ? (
          <div className="flex flex-col gap-1.5">
            <SignalBadge signal={primary} withEvidence />
            {others.map((s) => (
              <SignalBadge key={s.dedupe_key} signal={s} withEvidence size="sm" />
            ))}
          </div>
        ) : data.status.reason ? (
          <p className="t-body-sm text-v2-muted">{data.status.reason}</p>
        ) : null}
        {data.status.snoozed_until ? (
          <p className="t-meta text-v2-faint">
            Pospuesto hasta el {weekdayDate(data.status.snoozed_until.slice(0, 10))}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {primary ? (
            <Button variant="primary" size="sm" loading={busy} onClick={() => void act(primary.action)}>
              {SIGNAL_ACTION_LABEL[primary.action]}
            </Button>
          ) : data.status.key === 'sin_plan' ? (
            <Button variant="primary" size="sm" onClick={() => void act('asignar_programa')}>
              Asignar programa
            </Button>
          ) : null}
          {primary ? (
            <SnoozeMenu athleteId={data.athlete_id} name={data.name} onChange={changed} withDone variant="secondary" />
          ) : null}
        </div>
      </section>

      {data.readiness ? (
        <ReadinessMini readiness={data.readiness} today={data.week.today} size="panel" />
      ) : (
        <Section label="Readiness · 14 días">
          <EmptyState title="Sin lecturas de readiness" description="todavía no lo sabemos" />
        </Section>
      )}

      <Section
        label="Esta semana"
        aside={due.due > 0 ? `${due.done} de ${due.due} ${due.due === 1 ? 'debida' : 'debidas'}` : undefined}
      >
        <WeekDots days={data.week.days} />
        <PublishWeekControl
          athleteId={data.athlete_id}
          name={data.name}
          weekStart={data.week.week_start}
          week={{
            week_start: data.week.week_start,
            visible: data.week.visible,
            held: data.week.held,
            status: null,
            opens_on: data.week.opens_on,
            sessions: data.week.days.reduce((n, d) => n + d.sessions.length, 0),
          }}
          onChange={changed}
        />
      </Section>

      <Section label={`Adherencia · ${data.adherence?.window_days ?? 14} días`}>
        <AdherenceMini adherence={data.adherence} windowDays={data.adherence?.window_days ?? 14} detail width={96} />
      </Section>

      <Section
        label={showCheckin ? 'Último check-in' : 'Mensajes'}
        aside={data.awaiting_reply ? 'Por responder' : undefined}
      >
        {showCheckin && checkin ? (
          <blockquote className="rounded-panel bg-v2-surface-2 px-3 py-2.5">
            <p className="t-body text-v2-fg">«{checkin.notes}»</p>
            <p className="mt-1 t-meta text-v2-faint">
              Check-in · {relativeDayLabel(checkin.on, data.week.today)} · {checkin.score}/100
            </p>
          </blockquote>
        ) : message ? (
          <blockquote className="rounded-panel bg-v2-surface-2 px-3 py-2.5">
            <p className="line-clamp-4 t-body text-v2-fg">{message.body ? `«${message.body}»` : 'Adjunto'}</p>
            <p className="mt-1 t-meta text-v2-faint">
              {message.from === 'athlete' ? data.name.split(' ')[0] : 'Tú'} ·{' '}
              {relativeDayLabel(message.created_at.slice(0, 10), data.week.today)}
            </p>
          </blockquote>
        ) : (
          <EmptyState icon={MessageCircle} title="Todavía no os habéis escrito" />
        )}
        {threadOpen ? (
          <ChatThread athleteId={data.athlete_id} athleteName={data.name} className="h-[360px]" autoFocus />
        ) : (
          <>
            <ChatReplyBox
              key={replyMount}
              athleteId={data.athlete_id}
              athleteName={data.name}
              autoFocus={replyFocus}
              onSent={changed}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={MessageCircle}
              onClick={() => setThreadOpen(true)}
              className="-ml-2 w-fit"
            >
              Ver conversación
            </Button>
          </>
        )}
      </Section>

      {data.program ? (
        <p className="t-body-sm text-v2-muted">
          <span className="text-v2-fg">{data.program.name}</span> · semana {data.program.week} de {data.program.weeks}
        </p>
      ) : null}

      <AssignSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        athleteIds={[data.athlete_id]}
        athletes={[{ id: data.athlete_id, name: data.name, avatar_url: data.avatar_url }]}
        onAssigned={() => changed()}
      />
    </div>
  );
}

export function AthletePeek({ athleteId, onClose, initial, onChange, onAction, replyFocusKey }: AthletePeekProps) {
  const { load, reload } = usePeek(athleteId);
  const data = load.state === 'ready' && load.data.athlete_id === athleteId ? load.data : null;
  const name = data?.name ?? initial?.name ?? '';
  const meta = data
    ? [
        data.level?.label,
        data.group?.name,
        data.race ? `${data.race.name} en ${countdown(data.race.days, data.race.date)}` : null,
      ].filter(Boolean)
    : [initial?.level_label].filter(Boolean);

  return (
    <Sheet
      open={athleteId != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
      title={
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={name || '·'} src={data?.avatar_url ?? initial?.avatar_url ?? null} size="lg" />
          <span className="min-w-0 truncate">{name || 'Atleta'}</span>
        </span>
      }
      description={
        meta.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {meta.map((m, i) => (i === 0 && data?.level ? <Tag key={m}>{m}</Tag> : <span key={m as string}>{m}</span>))}
          </span>
        ) : undefined
      }
      footer={
        athleteId ? (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="hidden items-center gap-1.5 t-meta text-v2-faint sm:inline-flex">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> otro atleta · <Kbd>Esc</Kbd> cerrar
            </span>
            <Link
              href={`/atletas/${athleteId}`}
              className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'ml-auto')}
            >
              Abrir ficha
              <ArrowUpRight aria-hidden strokeWidth={1.75} />
            </Link>
          </div>
        ) : null
      }
    >
      {athleteId == null ? null : load.state === 'error' ? (
        load.notFound ? (
          <EmptyState title="Este atleta ya no está en tu lista" />
        ) : (
          <ErrorState title="No se ha podido cargar el atleta" description={load.message} onRetry={reload} />
        )
      ) : data ? (
        <PeekBody
          key={data.athlete_id}
          data={data}
          onChange={onChange}
          onAction={onAction}
          replyFocusKey={replyFocusKey}
          reload={reload}
        />
      ) : (
        <PeekSkeleton />
      )}
    </Sheet>
  );
}
