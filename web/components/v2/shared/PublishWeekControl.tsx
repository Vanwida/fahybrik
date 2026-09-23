'use client';

// Visible / Oculta de una semana (§4.7) — para UN atleta o para VARIOS.
//
//   UN atleta:  <PublishWeekControl athleteId="11" weekStart="2026-09-28" />
//     «◉ Oculta · Se publica sola el sáb 26»  [Publicar ya]  [···  Retener / Soltar]
//     Carga su estado de GET /athletes/[id]/weeks si no le pasas `week`.
//   VARIOS:     <PublishWeekControl athleteIds={ids} weekStart="2026-09-28" />
//     [Publicar semana a 12]  → POST /api/coach/weeks/publish
//
// Una semana retenida no se abre sola nunca (draft + manual); soltarla la
// devuelve a lo automático y, si ya tocaba verla, se publica en el acto. Toda la
// visibilidad pasa por la única puerta (`weekly_plans`, DECISIONS 2026-08-18).

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock, LockOpen, MoreHorizontal, Send } from 'lucide-react';
import type {
  AthleteWeekState,
  BulkWeekPublishResult,
  WeekPublishResult,
} from '@fahybrid/shared/schema/week-publishing';
import {
  Button,
  ErrorState,
  IconButton,
  Menu,
  Skeleton,
  StatusBadge,
  useToast,
  type ButtonSize,
} from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { apiJson, errorMessage } from './api';
import { localToday, plusDays, weekdayDate } from './format';
import { weekStateLine } from './logic';

export { weekStateLine };

export type { AthleteWeekState };

function weekUrl(athleteId: string, weekStart: string, action: 'publish' | 'hold') {
  return `/api/coach/athletes/${encodeURIComponent(athleteId)}/weeks/${weekStart}/${action}`;
}

type SingleProps = {
  athleteId: string;
  athleteIds?: never;
  /** Nombre para los avisos. */
  name?: string;
  /** Estado ya cargado (la ficha lo trae para 3 semanas): evita una petición. */
  week?: AthleteWeekState | null;
};
type BulkProps = {
  athleteIds: string[];
  athleteId?: never;
  name?: never;
  week?: never;
};

export type PublishWeekControlProps = (SingleProps | BulkProps) & {
  /** Lunes de la semana (YYYY-MM-DD). */
  weekStart: string;
  /** Tras cada cambio confirmado (con el estado nuevo si es un atleta). */
  onChange?: (week: AthleteWeekState | null) => void;
  size?: ButtonSize;
  /** `compact` = solo badge + acciones (filas de semana de la ficha). */
  layout?: 'full' | 'compact';
  className?: string;
};

export function PublishWeekControl(props: PublishWeekControlProps) {
  if (props.athleteIds) return <BulkPublish {...props} athleteIds={props.athleteIds} />;
  return <SinglePublish {...(props as SingleProps & PublishWeekControlProps)} />;
}

function SinglePublish({
  athleteId,
  name,
  week: given,
  weekStart,
  onChange,
  size = 'sm',
  layout = 'full',
  className,
}: SingleProps & PublishWeekControlProps) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState<AthleteWeekState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'publish' | 'hold'>(null);
  const week = loaded ?? given ?? null;
  const today = localToday();

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (given !== undefined) return;
    const ctrl = new AbortController();
    apiJson<{ weeks: AthleteWeekState[] }>(
      `/api/coach/athletes/${encodeURIComponent(athleteId)}/weeks?from=${weekStart}&to=${weekStart}`,
      { signal: ctrl.signal },
    )
      .then((res) => {
        setLoaded(res.weeks[0] ?? null);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(errorMessage(err, 'No se ha podido cargar la semana'));
      });
    return () => ctrl.abort();
  }, [given, athleteId, weekStart, attempt]);
  const retry = () => {
    setError(null);
    setAttempt((a) => a + 1);
  };

  /** Vuelve la semana al estado `prev` (deshacer exacto: retenida, visible o automática). */
  const restore = async (prev: AthleteWeekState) => {
    try {
      const res = prev.held
        ? await apiJson<WeekPublishResult>(weekUrl(athleteId, weekStart, 'hold'), {
            method: 'POST',
            body: { held: true },
          })
        : prev.visible
          ? await apiJson<WeekPublishResult>(weekUrl(athleteId, weekStart, 'publish'), { method: 'POST' })
          : await apiJson<WeekPublishResult>(weekUrl(athleteId, weekStart, 'hold'), {
              method: 'POST',
              body: { held: false },
            });
      setLoaded(res.week);
      onChange?.(res.week);
    } catch (err) {
      toast({ title: 'No se ha podido deshacer', description: errorMessage(err), tone: 'danger' });
    }
  };

  const setHeld = async (held: boolean) => {
    const prev = week;
    setBusy('hold');
    try {
      const res = await apiJson<WeekPublishResult>(weekUrl(athleteId, weekStart, 'hold'), {
        method: 'POST',
        body: { held },
      });
      setLoaded(res.week);
      onChange?.(res.week);
      toast({
        title: held
          ? `Semana del ${weekdayDate(weekStart)} retenida`
          : res.week.visible
            ? `Semana del ${weekdayDate(weekStart)} visible`
            : `Semana del ${weekdayDate(weekStart)} vuelve a lo automático`,
        description: held ? 'Oculta al atleta; no se publica sola.' : weekStateLine(res.week, today),
        undo: prev ? () => restore(prev) : undefined,
      });
    } catch (err) {
      toast({ title: 'No se ha podido cambiar la semana', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const prev = week;
    setBusy('publish');
    try {
      const res = await apiJson<WeekPublishResult>(weekUrl(athleteId, weekStart, 'publish'), { method: 'POST' });
      setLoaded(res.week);
      onChange?.(res.week);
      toast({
        title: `${name ? `${name} · ` : ''}semana del ${weekdayDate(weekStart)} publicada`,
        description: res.notified ? 'Le hemos avisado.' : undefined,
        tone: 'ok',
        // Deshacer solo si deja las cosas EXACTAMENTE como estaban: una retenida
        // vuelve a retenida. Una automática ya avisada no se «despublica».
        undo: prev?.held ? () => restore(prev) : undefined,
      });
    } catch (err) {
      toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState title="No se ha podido cargar la semana" onRetry={retry} className={className} />;
  if (!week) {
    return (
      <span role="status" aria-label="Cargando la semana" className={cn('inline-flex items-center gap-2', className)}>
        <Skeleton className="h-5 w-20" />
        {layout === 'full' ? <Skeleton className="h-3 w-40" /> : null}
      </span>
    );
  }

  const past = plusDays(week.week_start, 6) < today;
  const menuItems = week.held
    ? [{ label: 'Soltar: que se publique sola', icon: LockOpen, onSelect: () => void setHeld(false) }]
    : [
        {
          label: week.visible ? 'Ocultar y retener' : 'Retener: no publicar sola',
          icon: Lock,
          onSelect: () => void setHeld(true),
          disabled: past,
        },
      ];

  return (
    <span className={cn('inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      <span className="inline-flex min-w-0 items-center gap-2">
        <StatusBadge
          tone={week.visible ? 'ok' : week.held ? 'warn' : 'neutral'}
          icon={week.visible ? Eye : week.held ? Lock : EyeOff}
          label={week.visible ? 'Visible' : 'Oculta'}
          variant="soft"
          size="sm"
        />
        {layout === 'full' ? (
          <span className="truncate t-body-sm text-v2-muted">{weekStateLine(week, today)}</span>
        ) : null}
      </span>
      <span className="inline-flex items-center gap-1">
        {!week.visible && week.sessions > 0 ? (
          <Button
            size={size}
            variant="secondary"
            icon={Send}
            loading={busy === 'publish'}
            onClick={() => void publish()}
          >
            Publicar ya
          </Button>
        ) : null}
        {!past ? (
          <Menu
            align="end"
            trigger={
              <IconButton
                icon={MoreHorizontal}
                label="Más opciones de la semana"
                size={size}
                loading={busy === 'hold'}
              />
            }
            items={menuItems}
          />
        ) : null}
      </span>
    </span>
  );
}

function BulkPublish({ athleteIds, weekStart, onChange, size = 'md', className }: BulkProps & PublishWeekControlProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const count = athleteIds.length;
  const publish = async () => {
    setBusy(true);
    try {
      const res = await apiJson<BulkWeekPublishResult>('/api/coach/weeks/publish', {
        method: 'POST',
        body: { athlete_ids: athleteIds, week_start: weekStart },
      });
      onChange?.(null);
      toast({
        title:
          res.published === 0
            ? `Ya la veían los ${count}`
            : `Semana del ${weekdayDate(weekStart)} publicada a ${res.published}`,
        description: res.already_visible > 0 && res.published > 0 ? `${res.already_visible} ya la veían.` : undefined,
        tone: res.published > 0 ? 'ok' : 'neutral',
      });
    } catch (err) {
      toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size={size}
      variant="secondary"
      icon={Send}
      loading={busy}
      disabled={count === 0}
      onClick={() => void publish()}
      className={className}
    >
      {count === 1 ? 'Publicar semana' : `Publicar semana a ${count}`}
    </Button>
  );
}
