'use client';

import { Link } from '@/i18n/navigation';
import { FichaCard, FichaLabel, PillEstado } from '../resumen/piezas';
import type { PlanDay, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import { formatRangoSemana, sesionesDelDia } from '@/lib/dashboard/v2/ficha-resumen';
import { cn } from '@/lib/utils';

/** A day with 8 lifts is a day, not a feed. The grid shows a few and the rest
 *  lives in the day editor. */
const SESIONES_VISIBLES = 3;

const DAY_SHORT = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'] as const;

function dayNumber(iso: string): string {
  return iso.slice(8, 10).replace(/^0/, '');
}

export function SemanaCanvas({
  week,
  todayIso,
  label,
  canPrev,
  canNext,
  showHoy,
  onPrev,
  onNext,
  onHoy,
  onOpen,
  athleteId,
  focus,
  dayHref,
}: {
  week: PlanWeekRow;
  todayIso: string;
  label: string;
  canPrev: boolean;
  canNext: boolean;
  showHoy: boolean;
  onPrev: () => void;
  onNext: () => void;
  onHoy: () => void;
  onOpen: (assignmentId: string) => void;
  athleteId: string;
  focus: React.ReactNode;
  dayHref?: (iso: string) => string;
}) {
  return (
    <FichaCard className="p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <FichaLabel className="m-0">{label}</FichaLabel>
          <span className="v2-num text-[12px] text-[color:var(--v2-muted)]">
            {formatRangoSemana(week.week_start, week.week_end)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <NavBtn label="Semana anterior" disabled={!canPrev} onClick={onPrev}>
            ‹
          </NavBtn>
          {showHoy ? (
            <button
              type="button"
              onClick={onHoy}
              className="v2-focus inline-flex h-7 items-center rounded-[7px] border border-[color:var(--v2-border-strong)] px-2 text-[12px] font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
            >
              Hoy
            </button>
          ) : null}
          <NavBtn label="Semana siguiente" disabled={!canNext} onClick={onNext}>
            ›
          </NavBtn>
        </div>
      </div>

      {focus ? <div className="px-4 pt-3">{focus}</div> : null}

      <div className="mt-3 grid grid-cols-7 gap-px bg-[#EDE7DE] dark:bg-[color:var(--v2-border)]">
        {week.days.map((d, i) => (
          <DiaCol
            key={d.iso_date}
            day={d}
            short={DAY_SHORT[i] ?? d.label}
            todayIso={todayIso}
            athleteId={athleteId}
            onOpen={onOpen}
            dayHref={dayHref}
            first={i === 0}
            last={i === week.days.length - 1}
          />
        ))}
      </div>
    </FichaCard>
  );
}

function DiaCol({
  day,
  short,
  todayIso,
  athleteId,
  onOpen,
  dayHref,
  first,
  last,
}: {
  day: PlanDay;
  short: string;
  todayIso: string;
  athleteId: string;
  onOpen: (assignmentId: string) => void;
  dayHref?: (iso: string) => string;
  first: boolean;
  last: boolean;
}) {
  const sesiones = sesionesDelDia(day, todayIso);
  const vacio = sesiones.length === 0;
  const extra = Math.max(0, sesiones.length - SESIONES_VISIBLES);
  const visibles = extra > 0 ? sesiones.slice(0, SESIONES_VISIBLES) : sesiones;
  return (
    <div
      className={cn(
        'flex min-h-[120px] flex-col gap-1.5 px-2 py-2.5',
        vacio ? 'bg-[#FBF9F6] dark:bg-[color:var(--v2-bg)]' : 'bg-[color:var(--v2-surface)]',
        day.is_today && 'bg-[#FDF6F1] shadow-[inset_0_2px_0_#E85D1F] dark:bg-[color:var(--v2-accent-soft)]',
        first && 'rounded-bl-[14px]',
        last && 'rounded-br-[14px]',
      )}
    >
      <span className="v2-num text-[10px] uppercase tracking-[0.06em] text-[color:var(--v2-muted)]">
        {short} {dayNumber(day.iso_date)}
        {day.is_today ? ' · HOY' : ''}
      </span>
      {vacio ? (
        <span className="text-[12.5px] font-semibold text-[color:var(--v2-faint)]">Descanso</span>
      ) : (
        <>
          {visibles.map((s) => (
            <button
              key={s.assignment_id}
              type="button"
              onClick={() => onOpen(s.assignment_id)}
              className="v2-focus flex flex-col items-start rounded-[6px] text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            >
              <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[color:var(--v2-fg)]">
                {s.title}
              </span>
              {s.estado !== 'descanso' ? <PillEstado estado={s.estado} /> : null}
            </button>
          ))}
          {extra > 0 ? (
            <Link
              href={dayHref ? dayHref(day.iso_date) : `/atletas/${athleteId}/dia/${day.iso_date}`}
              className="v2-focus text-[11.5px] font-semibold text-[#C24A0F]"
            >
              +{extra} más
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

function NavBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[7px] border border-[color:var(--v2-border-strong)] text-[15px] font-semibold text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
