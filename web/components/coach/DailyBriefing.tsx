'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Beaker,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Flag,
  MessageSquare,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { BriefingLine, BriefingPayload } from '@/lib/coach/types';

const ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  'alert-triangle': AlertTriangle,
  video: Video,
  'message-square': MessageSquare,
  'flask-conical': FlaskConical,
  beaker: Beaker,
  'bar-chart-3': BarChart3,
  flag: Flag,
};

interface DailyBriefingProps {
  briefing: BriefingPayload;
  onLineClick?: (line: BriefingLine) => void;
}

export function DailyBriefing({ briefing, onLineClick }: DailyBriefingProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (briefing.is_first_time) {
    return (
      <section
        aria-label="Bienvenida"
        className="rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-6"
      >
        <p className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Bienvenida
        </p>
        <h2 className="mt-2 font-display italic font-black text-2xl text-[color:var(--fg)]">
          Aún no tienes atletas.
        </h2>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Invita tu primer atleta para empezar a entrenar.
        </p>
      </section>
    );
  }

  if (collapsed) {
    return (
      <section
        aria-label="Briefing diario"
        className="flex items-center justify-between rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-2.5"
      >
        <p className="text-xs text-[color:var(--muted)] tabular-nums">
          {briefing.lines.map((l, i) => (
            <span key={l.id}>
              {i > 0 ? ' · ' : ''}
              <span className="text-[color:var(--fg)]">{shortLine(l)}</span>
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expandir briefing"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
        >
          expandir
          <ChevronDown className="size-3" aria-hidden strokeWidth={1.5} />
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Briefing diario"
      className="relative overflow-hidden rounded-xl border border-[color:var(--hairline)] bg-[color:var(--surface)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.025] to-transparent"
      />
      <div className="relative flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h1 className="font-display italic font-black text-3xl tracking-tight leading-tight text-[color:var(--fg)] sm:text-4xl">
            {briefing.greeting}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
            <span>{briefing.date_label}</span>
            <span className="mx-2 text-[color:var(--hairline)]">·</span>
            <span className="tabular-nums text-[color:var(--fg)]">
              {briefing.active_athlete_count}
            </span>{' '}
            atletas activos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Colapsar briefing"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-[color:var(--muted)] hover:bg-[color:var(--surface-elevated)] hover:text-[color:var(--fg)]"
        >
          <ChevronUp className="size-3" aria-hidden strokeWidth={1.5} />
        </button>
      </div>

      <ul className="mt-4 divide-y divide-[color:var(--hairline)] border-t border-[color:var(--hairline)]">
        {briefing.is_quiet_day && briefing.lines.length === 0 ? (
          <li className="px-5 py-4 text-sm text-[color:var(--muted)]">
            Todo nominal · 0 alertas · todos sincronizados últimas 6h
          </li>
        ) : (
          briefing.lines.map((line) => (
            <BriefingRow key={line.id} line={line} onClick={onLineClick} />
          ))
        )}
      </ul>
    </section>
  );
}

function BriefingRow({
  line,
  onClick,
}: {
  line: BriefingLine;
  onClick?: (line: BriefingLine) => void;
}) {
  const Icon = ICON_MAP[line.icon] ?? Activity;
  const tone =
    line.emphasis === 'critical'
      ? 'text-[color:var(--accent)]'
      : line.emphasis === 'warning'
        ? 'text-[color:var(--warning)]'
        : 'text-[color:var(--muted)]';

  return (
    <li>
      <button
        type="button"
        onClick={() => onClick?.(line)}
        className="group flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[color:var(--surface-elevated)]"
      >
        <Icon
          className={`size-4 shrink-0 ${tone}`}
          aria-hidden
          strokeWidth={1.5}
        />
        <div className="flex flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm text-[color:var(--fg)] tabular-nums">{line.primary}</span>
          {line.secondary && (
            <span className="text-xs text-[color:var(--muted)]">· {line.secondary}</span>
          )}
        </div>
        <span
          className={`opacity-0 group-hover:opacity-100 text-[10px] uppercase tracking-[0.16em] ${tone}`}
          aria-hidden
        >
          ver →
        </span>
      </button>
    </li>
  );
}

function shortLine(line: BriefingLine): string {
  switch (line.id) {
    case 'sessions':
      return line.primary.replace(' programadas', '');
    case 'alerts':
      return line.primary;
    case 'video_reviews':
      return line.primary.replace(' pendientes', ' videos');
    case 'messages':
      return line.primary;
    case 'transitions':
      return `${line.primary.split(' ')[0]} transiciones`;
    case 'tests':
      return line.primary;
    case 'polarization':
      return 'Pol cohort';
    case 'event':
      return line.primary;
    default:
      return line.primary;
  }
}
