'use client';

// Las piezas de una fila del roster, iguales en la tabla, las tarjetas y la
// lista del móvil: quién es, su estado con el motivo, su semana, readiness,
// adherencia, último y próximo entreno, carrera y si hay algo por responder.
// Cada dato ausente se dice («—», «sin datos»), nunca un 0 inventado.

import { MessageCircle } from 'lucide-react';
import type { RosterRow } from '@/lib/dashboard/athletes/roster';
import { Avatar, StatusBadge, Tag, type StatusTone } from '@/components/v2/ui';
import { StatusBadgeFor } from '@/components/v2/shared/StatusBadgeFor';
import { countdown, shortDate, weekdayShort } from '@/components/v2/shared/format';
import { ageLabel } from '@fahybrid/shared/domain/coach/athlete-state';
import { cn } from '@/lib/utils';
import { WEEK_LABEL, type WeekVisibility } from './roster-query';

const WEEK_TONE: Record<WeekVisibility, StatusTone> = {
  visible: 'ok',
  oculta: 'warn',
  sin_plan: 'neutral',
  terminado: 'neutral',
};

const WEEK_TITLE: Record<WeekVisibility, string> = {
  visible: 'Ve su semana',
  oculta: 'Su semana está oculta: todavía no la ve',
  sin_plan: 'No tiene nada programado esta semana',
  terminado: 'Su programa terminó y no tiene siguiente',
};

export function WeekChip({ week, size = 'sm' }: { week: WeekVisibility; size?: 'sm' | 'md' }) {
  return (
    <span title={WEEK_TITLE[week]} className="inline-flex">
      <StatusBadge tone={WEEK_TONE[week]} label={WEEK_LABEL[week]} variant="soft" size={size} />
    </span>
  );
}

export function AthleteCell({ row }: { row: RosterRow }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={row.name} src={row.avatar_url} size="sm" />
      <span className="min-w-0 truncate font-medium text-v2-fg">{row.name}</span>
      {row.level ? <Tag className="shrink-0">{row.level.label}</Tag> : null}
    </span>
  );
}

export function StatusCell({ row }: { row: RosterRow }) {
  return <StatusBadgeFor status={row.status} withReason size="sm" className="max-w-full" />;
}

/** «hoy», «ayer», «hace 3 d», «22 sept». */
export function lastSessionLabel(iso: string | null, today: string): string | null {
  if (!iso) return null;
  const day = iso.slice(0, 10);
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 14) return `hace ${days} d`;
  return shortDate(day);
}

export function LastSessionCell({ row, today }: { row: RosterRow; today: string }) {
  const label = lastSessionLabel(row.last_session_at, today);
  if (!label) return <Dash title="Ningún entreno registrado" />;
  return <span className="t-body-sm text-v2-muted t-tnum">{label}</span>;
}

export function nextSessionLabel(next: RosterRow['next_session'], today: string): string | null {
  if (!next) return null;
  const when = next.date === today ? 'hoy' : weekdayShort(next.date);
  return `${when} · ${next.title}`;
}

export function NextSessionCell({ row, today }: { row: RosterRow; today: string }) {
  const label = nextSessionLabel(row.next_session, today);
  if (!label || !row.next_session) return <Dash title="Nada programado" />;
  return (
    <span className="block truncate t-body-sm text-v2-muted" title={`${shortDate(row.next_session.date)} · ${row.next_session.title}`}>
      {label}
    </span>
  );
}

export function RaceCell({ row }: { row: RosterRow }) {
  if (!row.race) return <Dash title="Sin carrera objetivo" />;
  return (
    <span className="block truncate t-body-sm text-v2-muted t-tnum" title={`${row.race.name} · ${shortDate(row.race.date)}`}>
      {countdown(row.race.days, row.race.date)}
    </span>
  );
}

/** Desde cuándo espera (la señal de «por responder» trae la hora del mensaje). */
function waitingSince(row: RosterRow): string | null {
  const s = row.status.signals.find((x) => x.kind === 'message_unanswered');
  return s?.observed_at ?? null;
}

export function ReplyCell({ row, now }: { row: RosterRow; now: Date }) {
  if (!row.awaiting_reply) return <Dash title="Nada por responder" />;
  const since = waitingSince(row);
  return (
    <span title={since ? `Por responder desde hace ${ageLabel(since, now)}` : 'Por responder'} className="inline-flex max-w-full">
      <StatusBadge tone="info" icon={MessageCircle} size="sm" label={since ? ageLabel(since, now) : 'Sí'} />
    </span>
  );
}

export function Dash({ title, className }: { title: string; className?: string }) {
  return (
    <span className={cn('t-body-sm text-v2-faint', className)} title={title}>
      <span aria-hidden>—</span>
      <span className="sr-only">{title}</span>
    </span>
  );
}
