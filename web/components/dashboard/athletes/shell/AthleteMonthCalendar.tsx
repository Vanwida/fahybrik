'use client';

// Zoom MES del calendario del atleta (UX redesign §2b): grid mensual del
// microciclo asignado, sesiones como pills compactas y % de cumplimiento de
// cada semana al margen. Misma data que Semana, distinta densidad. Click en
// pill → SessionDrawer (lo monta el padre).

import type { PlanDay, PlanSession, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import {
  SESSION_STATUS_COLOR,
  SESSION_STATUS_LABEL,
} from '@/lib/dashboard/constants/session-status';
import { DAY_LABELS } from '@/lib/dashboard/constants/calendar';
import { cn } from '@/lib/utils';

const MAX_PILLS_PER_DAY = 2;

interface AthleteMonthCalendarProps {
  weeks: PlanWeekRow[];
  /** ISO de hoy (yyyy-mm-dd) para decidir qué semanas ya tienen % honesto. */
  todayIso: string;
  onSelectSession: (day: PlanDay, session: PlanSession) => void;
  className?: string;
}

export function weekCompliancePct(week: PlanWeekRow): number | null {
  const scheduled = week.days.reduce((n, d) => n + d.sessions.length, 0);
  if (scheduled === 0) return null;
  const done = week.days.reduce(
    (n, d) => n + d.sessions.filter((s) => s.status === 'completed').length,
    0,
  );
  return Math.round((done / scheduled) * 100);
}

function complianceTone(pct: number): string {
  if (pct >= 80) return 'text-[color:var(--status-success)]';
  if (pct >= 50) return 'text-[color:var(--status-warning)]';
  return 'text-[color:var(--danger)]';
}

function shortRange(week: PlanWeekRow): string {
  return `${week.week_start.slice(8)}/${week.week_start.slice(5, 7)}`;
}

export function AthleteMonthCalendar({
  weeks,
  todayIso,
  onSelectSession,
  className,
}: AthleteMonthCalendarProps) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]',
        className,
      )}
    >
      <table className="w-full min-w-[760px] border-collapse" aria-label="Calendario mensual">
        <thead>
          <tr className="border-b border-[color:var(--border-subtle)]">
            <th scope="col" className="w-20 px-3 py-2 text-left">
              <span className="micro-label">Semana</span>
            </th>
            {DAY_LABELS.map((label) => (
              <th key={label} scope="col" className="px-2 py-2 text-left">
                <span className="micro-label">{label}</span>
              </th>
            ))}
            <th scope="col" className="w-16 px-3 py-2 text-right">
              <span className="micro-label">Cumpl.</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const started = week.week_start <= todayIso;
            const pct = started ? weekCompliancePct(week) : null;
            const isCurrent = week.days.some((d) => d.is_today);
            return (
              <tr
                key={week.week_start}
                className={cn(
                  'border-b border-[color:var(--border-subtle)] align-top last:border-b-0',
                  isCurrent && 'bg-[color:color-mix(in_srgb,var(--accent)_4%,transparent)]',
                )}
              >
                <th scope="row" className="px-3 py-2.5 text-left align-top">
                  <span
                    className={cn(
                      'metric-num text-xs font-semibold',
                      isCurrent ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]',
                    )}
                  >
                    {shortRange(week)}
                  </span>
                  {isCurrent ? (
                    <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                      Actual
                    </span>
                  ) : null}
                </th>
                {week.days.map((day) => (
                  <td key={day.iso_date} className="px-2 py-2.5 align-top">
                    <DayPills day={day} onSelectSession={onSelectSession} />
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right align-top">
                  {pct != null ? (
                    <span className={cn('metric-num text-xs font-semibold', complianceTone(pct))}>
                      {pct}%
                    </span>
                  ) : (
                    <span className="text-xs text-[color:var(--text-muted)]" aria-label="Sin datos">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DayPills({
  day,
  onSelectSession,
}: {
  day: PlanDay;
  onSelectSession: (day: PlanDay, session: PlanSession) => void;
}) {
  if (day.sessions.length === 0) {
    return <span aria-hidden className="block h-1 w-3 rounded bg-[color:var(--surface-variant)] opacity-40" />;
  }
  const visible = day.sessions.slice(0, MAX_PILLS_PER_DAY);
  const overflow = day.sessions.length - visible.length;
  return (
    <div className="flex flex-col gap-1">
      {visible.map((session) => (
        <button
          key={session.assignment_id}
          type="button"
          onClick={() => onSelectSession(day, session)}
          aria-label={`${session.title} — ${SESSION_STATUS_LABEL[session.status]} (${day.iso_date}). Abrir sesión`}
          className="focus-ring flex w-full items-center gap-1.5 rounded-[var(--r-s)] border border-transparent bg-[color:var(--surface-container-low)] px-1.5 py-1 text-left transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: SESSION_STATUS_COLOR[session.status] }}
          />
          <span className="truncate text-[10px] font-semibold leading-tight text-[color:var(--fg)]">
            {session.title}
          </span>
        </button>
      ))}
      {overflow > 0 ? (
        <span className="px-1.5 text-[9px] text-[color:var(--text-muted)]">+{overflow}</span>
      ) : null}
    </div>
  );
}
