'use client';

// Zoom SEMANA del calendario del atleta — modelo TRAINING-LOG (à la
// TrainingPeaks/Strava): 7 DÍAS COMO FILAS verticales a ancho completo, NO 7
// columnas truncadas. El coach DEBE leer la sesión entera de cada día sin
// elipsis: el título envuelve sin recortarse. Cada fila replica EXACTO el row
// canónico del mockup aprobado (revisar-mock): barra de estado a altura completa
// + día/fecha (HOY en acento) + meta line "KICKER · DURACIÓN" inline a la
// izquierda (.metric-num en el número) + título COMPLETO + afordancia a la
// derecha (lápiz al hover + chevron tenue). NINGÚN dato anclado al borde derecho.
// A diferencia del mockup (borrador, barra por grupo), esta es la SEMANA REAL:
// la barra se colorea POR ESTADO de cumplimiento. Fila entera clicable →
// SessionDrawer (lo monta el padre). Día sin sesión = fila compacta de descanso.

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

/**
 * Color de la barra de estado de la fila completa del DÍA — semana REAL, por
 * tanto se colorea POR ESTADO de cumplimiento: completada → success, perdida →
 * danger, saltada → warning, programada → muda (--text-muted). HOY con sesión
 * pendiente gana acento (foco del coach). Días de descanso no llaman aquí.
 */
function dayBarColor(session: PlanSession, isToday: boolean): string {
  if (isToday && session.status === 'scheduled') return 'var(--accent)';
  return SESSION_STATUS_COLOR[session.status];
}

export function AthleteWeekCalendar({
  week,
  onSelectSession,
  onAddSession,
  className,
}: AthleteWeekCalendarProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--r-l)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]',
        className,
      )}
      role="list"
      aria-label={`Semana del ${week.week_start} al ${week.week_end}`}
    >
      {week.days.map((day, i) => (
        <DayRow
          key={day.iso_date}
          day={day}
          withDivider={i > 0}
          onSelectSession={onSelectSession}
          onAddSession={onAddSession}
        />
      ))}
    </div>
  );
}

// Una fila = un DÍA. Columna fija de día/fecha a la izquierda + cuerpo del día
// (una o varias sesiones apiladas, o fila muda de descanso). Mismo esqueleto que
// el mockup: la fecha de HOY se enfatiza en acento con una marca "HOY".
function DayRow({
  day,
  withDivider,
  onSelectSession,
  onAddSession,
}: {
  day: PlanDay;
  withDivider: boolean;
  onSelectSession: (day: PlanDay, session: PlanSession) => void;
  onAddSession: (day: PlanDay) => void;
}) {
  const isRest = day.sessions.length === 0;

  return (
    <div
      role="listitem"
      className={cn(
        'group/day flex items-stretch',
        withDivider && 'border-t border-[color:var(--border-subtle)]',
        // Hoy = superficie ligeramente más brillante para que destaque sin
        // romper el ritmo de la lista.
        day.is_today && 'bg-[color:var(--surface-container-low)]',
      )}
    >
      {/* Columna fija: día + fecha. HOY enfatiza la fecha en acento + marca. */}
      <div className="flex w-[5.5rem] shrink-0 flex-col justify-center gap-0.5 px-3 py-3">
        <span
          className={cn(
            'micro-label leading-none',
            day.is_today ? 'text-[color:var(--accent)]' : 'text-[color:var(--text-muted)]',
          )}
        >
          {day.label.toUpperCase()} {dayNumber(day.iso_date)}
        </span>
        {day.is_today ? (
          <span className="metric-num text-[9px] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
            Hoy
          </span>
        ) : null}
      </div>

      {/* Cuerpo del día: sesiones apiladas o fila muda de descanso. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {isRest ? (
          <RestRow day={day} onAddSession={onAddSession} />
        ) : (
          day.sessions.map((session, idx) => (
            <SessionRow
              key={session.assignment_id}
              session={session}
              isToday={day.is_today}
              withDivider={idx > 0}
              onClick={() => onSelectSession(day, session)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Día de descanso: fila compacta y desenfatizada (NO un tile alto vacío).
// Sigue ofreciendo "+ sesión" como afordancia discreta al hover/focus.
function RestRow({
  day,
  onAddSession,
}: {
  day: PlanDay;
  onAddSession: (day: PlanDay) => void;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-2 py-2.5 pl-4 pr-3">
      <MIcon name="bedtime" size={16} className="shrink-0 text-[color:var(--text-muted)]" aria-hidden />
      <span className="micro-label text-[color:var(--text-muted)]">Descanso</span>
      <button
        type="button"
        onClick={() => onAddSession(day)}
        className="focus-ring ml-auto flex h-7 items-center gap-1 rounded-[var(--r-s)] px-2 text-[color:var(--text-muted)] opacity-0 transition-opacity hover:text-[color:var(--accent)] focus-visible:opacity-100 group-hover/day:opacity-100 [@media(pointer:coarse)]:opacity-60"
        aria-label={`Añadir sesión el ${day.label} ${day.iso_date}`}
      >
        <MIcon name="add" size={16} aria-hidden />
        <span className="text-[11px] font-semibold">Sesión</span>
      </button>
    </div>
  );
}

// Una sesión dentro de la fila del día — replica EXACTO el row canónico del
// mockup. Toda la fila es clicable → SessionDrawer. Barra de estado a altura
// completa (color por ESTADO de cumplimiento) · meta line "KICKER · DURACIÓN"
// inline a la izquierda (las completadas muestran "✓ 55' · RPE 8") · título
// COMPLETO sin elipsis · derecha SOLO afordancia (lápiz al hover + chevron
// tenue). Sin valor anclado al borde, sin hueco horizontal muerto.
function SessionRow({
  session,
  isToday,
  withDivider,
  onClick,
}: {
  session: PlanSession;
  isToday: boolean;
  withDivider: boolean;
  onClick: () => void;
}) {
  const completed = session.status === 'completed';
  const missedOrSkipped = session.status === 'missed' || session.status === 'skipped';
  const fmt = sessionFormatLabel(session.format);
  const barColor = dayBarColor(session, isToday);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${session.title} — ${SESSION_STATUS_LABEL[session.status]}. Abrir sesión`}
      className={cn(
        'focus-ring group/row relative flex min-h-[64px] w-full min-w-0 cursor-pointer items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors hover:bg-[color:var(--surface-container-low)]',
        withDivider && 'border-t border-[color:var(--border-subtle)]',
      )}
    >
      {/* Barra de estado a altura completa de la fila (overlay de cumplimiento). */}
      <span
        aria-hidden
        className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r-[2px]"
        style={{ backgroundColor: barColor }}
      />

      {/* Cuerpo: meta line (kicker · duración/estado JUNTOS, inline a la izq) +
          título COMPLETO, sin elipsis (envuelve si hace falta). */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="micro-label">
          {fmt ?? SESSION_STATUS_LABEL[session.status]}
          {completed ? (
            <span className="text-[color:var(--status-success)]">
              {' · '}✓{' '}
              {session.duration_min != null ? (
                <span className="metric-num">{session.duration_min}’</span>
              ) : (
                'Hecha'
              )}
              {session.rpe != null ? (
                <span className="text-[color:var(--text-muted)]">
                  {' · '}RPE <span className="metric-num">{session.rpe}</span>
                </span>
              ) : null}
            </span>
          ) : session.duration_min != null ? (
            <span className="text-[color:var(--text-muted)]">
              {' · '}
              <span className="metric-num">{session.duration_min}’</span>
            </span>
          ) : null}
          {missedOrSkipped ? (
            <span className="text-[color:var(--text-muted)]">
              {' · '}
              {SESSION_STATUS_LABEL[session.status]}
            </span>
          ) : null}
        </span>
        <span className="font-body-md [overflow-wrap:anywhere] text-[13px] font-semibold leading-snug text-[color:var(--fg)]">
          {session.title}
        </span>
      </span>

      {/* Derecha: SOLO afordancia (no dato). Lápiz al hover + chevron tenue de
          "abrir el día". Sin valor anclado al borde. */}
      <span className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`Editar ${session.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="focus-ring flex size-7 items-center justify-center rounded-[var(--r-s)] text-[color:var(--text-muted)] opacity-0 transition-opacity hover:text-[color:var(--accent)] focus-visible:opacity-100 group-hover/day:opacity-100 [@media(pointer:coarse)]:opacity-60"
        >
          <MIcon name="edit" size={16} aria-hidden />
        </button>
        <MIcon
          name="chevron_right"
          size={18}
          className="text-[color:var(--text-muted)] transition-colors group-hover/row:text-[color:var(--fg)]"
          aria-hidden
        />
      </span>
    </div>
  );
}
