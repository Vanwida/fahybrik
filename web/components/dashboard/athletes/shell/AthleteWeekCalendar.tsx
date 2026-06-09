'use client';

// Zoom SEMANA del calendario del atleta (UX redesign §2b): 7 columnas, cada
// sesión como card con estado (✓ verde / pendiente / saltada / perdida) y, en
// completadas, el dato real del atleta (tiempo · RPE) como hint junto a lo
// prescrito. Click en sesión → SessionDrawer (lo monta el padre).

import type { PlanDay, PlanSession, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import {
  SESSION_STATUS_COLOR,
  SESSION_STATUS_LABEL,
} from '@/lib/dashboard/constants/session-status';
import { formatLabel } from '@/lib/studio/section-types';
import type { TemplateFormat } from '@/lib/templates/schema';
import { cn } from '@/lib/utils';
import { MIcon } from '@/components/dashboard/MIcon';

interface AthleteWeekCalendarProps {
  week: PlanWeekRow;
  onSelectSession: (day: PlanDay, session: PlanSession) => void;
  /** "+ sesión" en un día (vacío o no) — abre el alta de sesión del padre. */
  onAddSession: (day: PlanDay) => void;
  className?: string;
}

function dayNumber(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function sessionFormatLabel(format: string | null): string | null {
  if (!format) return null;
  return formatLabel(format as TemplateFormat);
}

export function AthleteWeekCalendar({
  week,
  onSelectSession,
  onAddSession,
  className,
}: AthleteWeekCalendarProps) {
  return (
    <div
      className={cn('grid grid-cols-1 gap-[var(--gutter)] sm:grid-cols-2 lg:grid-cols-7', className)}
      role="list"
      aria-label={`Semana del ${week.week_start} al ${week.week_end}`}
    >
      {week.days.map((day) => (
        <div key={day.iso_date} role="listitem" className="flex min-w-0 flex-col gap-2">
          <header
            className={cn(
              'flex items-baseline gap-1.5 border-b pb-1.5',
              day.is_today
                ? 'border-b-2 border-[color:var(--accent)]'
                : 'border-[color:var(--border-subtle)]',
            )}
          >
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-[0.1em]',
                day.is_today ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]',
              )}
            >
              {day.label}
            </span>
            <span
              className={cn(
                'metric-num text-xs font-semibold',
                day.is_today ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]',
              )}
            >
              {dayNumber(day.iso_date)}
            </span>
            {day.is_today ? (
              <span className="ml-auto rounded-[var(--r-pill)] border border-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] px-1.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                Hoy
              </span>
            ) : null}
          </header>

          {day.sessions.length === 0 ? (
            <div className="flex min-h-[118px] flex-col items-center justify-center gap-1 rounded-[var(--r-l)] border border-dashed border-[color:color-mix(in_srgb,var(--border-subtle)_60%,transparent)] p-3 text-[color:var(--text-muted)] opacity-60">
              <MIcon name="bedtime" size={18} aria-hidden />
              <span className="micro-label text-[9px]">Descanso</span>
            </div>
          ) : (
            day.sessions.map((session) => (
              <SessionCard
                key={session.assignment_id}
                session={session}
                onClick={() => onSelectSession(day, session)}
              />
            ))
          )}

          <button
            type="button"
            onClick={() => onAddSession(day)}
            className="focus-ring rounded-[var(--r-s)] py-1 text-left text-[10px] font-semibold text-[color:var(--text-muted)] transition-colors hover:text-[color:var(--accent)]"
            aria-label={`Añadir sesión el ${day.label} ${day.iso_date}`}
          >
            + sesión
          </button>
        </div>
      ))}
    </div>
  );
}

function SessionCard({ session, onClick }: { session: PlanSession; onClick: () => void }) {
  const completed = session.status === 'completed';
  const fmt = sessionFormatLabel(session.format);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${session.title} — ${SESSION_STATUS_LABEL[session.status]}. Abrir sesión`}
      className="focus-ring relative flex min-h-[118px] w-full flex-col gap-1.5 rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-3 pl-3.5 text-left shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.4)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_35%,var(--border-subtle))]"
    >
      {/* Barra de estado (overlay de cumplimiento, visible en todos los zooms) */}
      <span
        aria-hidden
        className="absolute bottom-2.5 left-0 top-2.5 w-[3px] rounded-r-[2px]"
        style={{ backgroundColor: SESSION_STATUS_COLOR[session.status] }}
      />
      <span className="absolute right-2 top-2" title={SESSION_STATUS_LABEL[session.status]}>
        {completed ? (
          <MIcon name="check_circle" size={16} filled className="text-[color:var(--status-success)]" />
        ) : (
          <span
            aria-hidden
            className="mt-1 block h-[7px] w-[7px] rounded-full"
            style={{ backgroundColor: SESSION_STATUS_COLOR[session.status] }}
          />
        )}
      </span>

      {fmt ? (
        <span className="pr-5 text-[9px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-muted)]">
          {fmt}
        </span>
      ) : null}
      <span className="pr-5 text-xs font-semibold leading-snug text-[color:var(--fg)]">
        {session.title}
      </span>

      <span className="mt-auto flex items-center gap-1.5">
        {completed ? (
          <span className="metric-num text-[9.5px] font-medium text-[color:var(--status-success)]">
            {session.duration_min != null ? `${session.duration_min}'` : 'Hecha'}
            {session.rpe != null ? ` · RPE ${session.rpe}` : ''}
          </span>
        ) : session.status === 'missed' || session.status === 'skipped' ? (
          <span
            className="text-[9.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: SESSION_STATUS_COLOR[session.status] }}
          >
            {SESSION_STATUS_LABEL[session.status]}
          </span>
        ) : null}
      </span>
    </button>
  );
}
