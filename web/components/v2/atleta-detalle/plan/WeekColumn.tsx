'use client';

// La columna «Semana» de cada fila del calendario: Visible / Oculta al atleta (una
// sola pareja de palabras en todo el panel, P7), la carga planificada por día
// (los minutos que ESCRIBE la prescripción; nunca inventados) y el menú de la
// semana: publicar / retener, copiar, desplazar, reducir volumen, descarga y
// evaluar (P13 — antes repartido en tres pestañas).

import { useState } from 'react';
import {
  ArrowLeftRight,
  ClipboardCheck,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  MoreHorizontal,
  Send,
  ArrowUpDown,
  Waves,
} from 'lucide-react';
import { IconButton, Menu, StatusBadge, Tooltip, useToast, type MenuEntry } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { weekStateLine } from '@/components/v2/shared';
import type { WeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import type { CalWeek } from '@/lib/dashboard/v2/atleta-detalle-types';
import { dayLoads } from '@/lib/dashboard/v2/ficha-calendar-model';
import { formatMinutes, weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { useFicha } from '../FichaContext';

export function LoadBars({ week, max }: { week: CalWeek; max: number }) {
  const loads = dayLoads(week);
  const any = loads.some((m) => m != null);
  const total = week.planned_min;
  const label = !any
    ? 'Sin minutos escritos en la prescripción'
    : `${week.planned_open > 0 ? 'Al menos ' : ''}${formatMinutes(total)} planificados`;
  if (!any) {
    return (
      <Tooltip content="Los entrenos no escriben su duración: no hay carga que sumar">
        <span className="t-meta text-v2-faint">sin minutos</span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label}>
      <span className="inline-flex items-end gap-2" aria-label={label} role="img">
        <span aria-hidden className="flex h-5 items-end gap-[2px]">
          {loads.map((m, i) => (
            <i
              key={i}
              className="block w-[5px] rounded-t-[2px] bg-v2-muted"
              style={{
                height: m != null && max > 0 ? `${Math.max(12, Math.round((m / max) * 100))}%` : '2px',
                opacity: m != null ? 0.7 : 0.25,
              }}
            />
          ))}
        </span>
        <span className="t-meta text-v2-faint t-tnum">
          {any ? `${week.planned_open > 0 ? '≥ ' : ''}${formatMinutes(total)}` : '—'}
        </span>
      </span>
    </Tooltip>
  );
}

export function WeekColumn({ week, max, today }: { week: CalWeek; max: number; today: string }) {
  const { shell, openWeekTool, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const st = week.state;
  const sunday = week.days[6]!.date;
  const past = sunday < today;
  const range = weekRangeLabel(week.week_start);
  const base = `/api/coach/athletes/${shell.athlete_id}/weeks/${week.week_start}`;
  const hasSessions = week.days.some((d) => d.sessions.length > 0);

  const act = async (kind: 'publish' | 'hold' | 'release') => {
    setBusy(true);
    try {
      const res =
        kind === 'publish'
          ? await apiJson<WeekPublishResult>(`${base}/publish`, { method: 'POST' })
          : await apiJson<WeekPublishResult>(`${base}/hold`, { method: 'POST', body: { held: kind === 'hold' } });
      toast({
        title:
          kind === 'publish'
            ? `Semana ${range} visible`
            : kind === 'hold'
              ? `Semana ${range} retenida`
              : `Semana ${range} vuelve a publicarse sola`,
        description: kind === 'hold' ? 'Oculta al atleta; no se publica sola.' : weekStateLine(res.week, today),
        tone: kind === 'publish' ? 'ok' : 'neutral',
        undo:
          kind === 'publish' && st.held
            ? async () => {
                await apiJson(`${base}/hold`, { method: 'POST', body: { held: true } }).catch(() => undefined);
                bumpCalendar();
              }
            : undefined,
      });
      bumpCalendar();
    } catch (err) {
      toast({ title: 'No se ha podido cambiar la semana', description: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const items: MenuEntry[] = [];
  if (!past) {
    if (!st.visible && hasSessions) items.push({ label: 'Publicar ya', icon: Send, onSelect: () => void act('publish') });
    if (st.held) items.push({ label: 'Soltar: que se publique sola', icon: LockOpen, onSelect: () => void act('release') });
    else items.push({ label: st.visible ? 'Ocultar y retener' : 'Retener: no publicar sola', icon: Lock, onSelect: () => void act('hold') });
    items.push({ type: 'separator' });
  }
  items.push({ label: 'Copiar semana a…', icon: Copy, onSelect: () => openWeekTool('copy', week.week_start), disabled: !hasSessions });
  if (!past) {
    items.push(
      { label: 'Desplazar días…', icon: ArrowLeftRight, onSelect: () => openWeekTool('shift', week.week_start), disabled: !hasSessions },
      { label: 'Escalar volumen…', icon: ArrowUpDown, onSelect: () => openWeekTool('scale', week.week_start), disabled: !hasSessions },
      { label: 'Descarga', icon: Waves, onSelect: () => openWeekTool('deload', week.week_start), disabled: !hasSessions },
    );
  }
  items.push({ label: 'Evaluar semana', icon: ClipboardCheck, onSelect: () => openWeekTool('evaluar', week.week_start) });

  const tip = st.visible ? 'La ve en su app' : st.held ? 'Retenida: no se publica sola' : weekStateLine(st, today);

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <div className="flex w-full items-center justify-between gap-1">
        {hasSessions ? (
          <Tooltip content={tip}>
            <span>
              <StatusBadge
                tone={st.visible ? 'ok' : st.held ? 'warn' : 'neutral'}
                icon={st.visible ? Eye : st.held ? Lock : EyeOff}
                label={st.visible ? 'Visible' : 'Oculta'}
                variant="soft"
                size="sm"
              />
            </span>
          </Tooltip>
        ) : (
          <span className="t-meta text-v2-faint">Sin entrenos</span>
        )}
        <Menu
          trigger={<IconButton icon={MoreHorizontal} label={`Semana ${range}`} size="sm" loading={busy} />}
          items={items}
          width="min-w-56"
        />
      </div>
      {hasSessions ? <LoadBars week={week} max={max} /> : null}
    </div>
  );
}
