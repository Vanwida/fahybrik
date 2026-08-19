'use client';

import { Link } from '@/i18n/navigation';
import { FichaCard, FichaLabel, PillEstado } from '../resumen/piezas';
import type { PlanDay, PlanWeekRow } from '@/lib/dashboard/coach/athlete-plan';
import { formatRangoSemana, sesionesDelDia } from '@/lib/dashboard/v2/ficha-resumen';
import { MODALITY_META } from '@/components/v2/constants';
import { cn } from '@/lib/utils';
import { Pill } from '@/components/v2/Pill';
import { WeekStateChip } from '@/components/v2/WeekStateChip';
import type { AthleteWeekChip } from '@fahybrid/shared/domain/coach/athlete-week-chip';
import { railWeekLabel } from '@fahybrid/shared/domain/coach/microciclo-rail';

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
  chip,
  viewedRailVisible = null,
  paintDays = true,
  emptyCopy = null,
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
  activeSessionId = null,
}: {
  week: PlanWeekRow;
  todayIso: string;
  label: string;
  chip: AthleteWeekChip;
  /** Visibilidad de la semana que se está mirando (carril). null = no está en el microciclo. */
  viewedRailVisible?: boolean | null;
  paintDays?: boolean;
  emptyCopy?: string | null;
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
  /** Sesión abierta en el panel de detalle (peek): se marca en la semana. */
  activeSessionId?: string | null;
}) {
  return (
    <FichaCard className="p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <FichaLabel className="m-0">{label}</FichaLabel>
          {viewedRailVisible == null ? (
            <WeekStateChip chip={chip} />
          ) : (
            <Pill
              tone={viewedRailVisible ? 'ok' : 'warn'}
              variant="soft"
              title={
                viewedRailVisible
                  ? 'El atleta ve esta semana'
                  : 'Borrador · el atleta no la ve'
              }
            >
              {railWeekLabel(viewedRailVisible)}
            </Pill>
          )}
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
              className="v2-focus inline-flex h-7 items-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] px-2.5 text-[12px] font-semibold text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]"
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

      {paintDays ? (
        <div className="grid grid-cols-1 gap-2.5 px-4 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-7">
          {week.days.map((d, i) => (
            <DiaCol
              key={d.iso_date}
              day={d}
              short={DAY_SHORT[i] ?? d.label}
              todayIso={todayIso}
              athleteId={athleteId}
              onOpen={onOpen}
              dayHref={dayHref}
              activeSessionId={activeSessionId}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 pb-4 pt-3">
          <p className="text-[13px] text-[color:var(--v2-muted)]">{emptyCopy}</p>
        </div>
      )}
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
  activeSessionId = null,
}: {
  day: PlanDay;
  short: string;
  todayIso: string;
  athleteId: string;
  onOpen: (assignmentId: string) => void;
  dayHref?: (iso: string) => string;
  activeSessionId?: string | null;
}) {
  const sesiones = sesionesDelDia(day, todayIso);
  const tieneActiva = activeSessionId != null && sesiones.some((s) => s.assignment_id === activeSessionId);
  const vacio = sesiones.length === 0;
  const extra = Math.max(0, sesiones.length - SESIONES_VISIBLES);
  const visibles = extra > 0 ? sesiones.slice(0, SESIONES_VISIBLES) : sesiones;
  return (
    <div
      className={cn(
        'flex min-h-[128px] flex-col overflow-hidden rounded-[var(--v2-r-m)] border bg-[color:var(--v2-surface)]',
        vacio ? 'border-dashed border-[color:var(--v2-border)] bg-transparent' : 'border-[color:var(--v2-border)]',
        (day.is_today || tieneActiva) && 'border-[1.5px] border-[color:var(--v2-fg)]',
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[color:var(--v2-border)] px-2.5 py-2">
        <span className="v2-micro text-[10px]">
          {short} {dayNumber(day.iso_date)}
        </span>
        {day.is_today ? (
          <span className="ml-auto inline-flex items-center rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[color:var(--v2-accent-fg)]">
            Hoy
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-2">
        {vacio ? (
          <span className="flex flex-1 items-center justify-center text-[12.5px] font-semibold text-[color:var(--v2-faint)]">
            Descanso
          </span>
        ) : (
          <>
            {visibles.map((s) => (
              <button
                key={s.assignment_id}
                type="button"
                onClick={() => onOpen(s.assignment_id)}
                className={cn(
                  'v2-focus -mx-1 flex w-[calc(100%+8px)] flex-col items-start rounded-[var(--v2-r-xs)] px-1 py-0.5 text-left hover:bg-[color:var(--v2-surface-2)]',
                  s.assignment_id === activeSessionId && 'bg-[color:var(--v2-accent-soft)]',
                )}
              >
                {/* Modalidad como micro-etiqueta (artboard «Semana»): el color del
                    eje + el nombre; 'mixta' habla en neutro. */}
                {s.modality ? (
                  <span
                    className="text-[9.5px] font-bold uppercase tracking-[0.07em]"
                    style={{
                      color:
                        s.modality === 'mixta'
                          ? 'var(--v2-faint)'
                          : `var(${MODALITY_META[s.modality].colorVar})`,
                    }}
                  >
                    {s.modality === 'mixta' ? 'Mixta' : MODALITY_META[s.modality].label}
                  </span>
                ) : null}
                <span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[color:var(--v2-fg)]">
                  {s.title}
                </span>
                {s.format || s.duration_min != null ? (
                  <span className="text-[11px] text-[color:var(--v2-muted)]">
                    {[s.format, s.duration_min != null ? `${s.duration_min} min` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
                {s.estado !== 'descanso' ? <PillEstado estado={s.estado} /> : null}
              </button>
            ))}
            {extra > 0 ? (
              <Link
                href={dayHref ? dayHref(day.iso_date) : `/atletas/${athleteId}/dia/${day.iso_date}`}
                className="v2-focus text-[11.5px] font-semibold text-[color:var(--v2-accent)]"
              >
                +{extra} más
              </Link>
            ) : null}
          </>
        )}
      </div>
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
      className="v2-focus inline-flex h-7 w-7 items-center justify-center rounded-[var(--v2-r-pill)] border border-[color:var(--v2-border-strong)] text-[15px] font-semibold text-[color:var(--v2-fg)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
