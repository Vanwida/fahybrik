'use client';

// WeekContextStrip — the permanent WEEK frame above the day editor. The coach's
// unit of thought is the WEEK, not the day: a day is composed in the context of
// the other six. Like TrainingPeaks/TrueCoach, the seven days sit across the top
// (L M X J V S D); the currently-edited day is highlighted; clicking any cell
// navigates to edit that day (same editor, the strip persists).
//
// HONEST DATA ONLY. Each cell renders ONLY what the day's slots_json actually
// holds — derived once by deriveWeekModalities (the same derivation the
// microcycle screen uses; DRY, not reinvented):
//   · workout day → its distinct training-modality chips (real labels, colored
//     by the v2 modality hue) so the coach reads the TYPE/focus at a glance, plus
//     a quiet honest count (N bl · N ej — the "ej" half only when items exist).
//   · rest day    → a distinct "Descanso" cell (never an editable-looking blank).
//   · empty day   → a dashed "— / +" affordance reading clearly "nada aún".
// There is NO invented hardness/volume score — a number appears only when it is
// literally a count of what is there.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { MODALITY_META, type V2Modality } from '@/components/v2/constants';
import {
  DAY_LABELS_SHORT,
  DAY_LABELS_FULL,
  dayCanvasHref,
  type DayModalityInfo,
} from '@/lib/dashboard/v2/planes-model';
import { cn } from '@/lib/utils';

// An honest count line for a workout cell: blocks always (real container count),
// exercises only when the blocks actually carry items. No fabricated minutes.
function countLine(day: DayModalityInfo): string {
  const bl = `${day.block_count} bl`;
  return day.item_count > 0 ? `${bl} · ${day.item_count} ej` : bl;
}

function DayCell({
  day,
  dayIndex,
  href,
  isCurrent,
}: {
  day: DayModalityInfo;
  dayIndex: number; // 0 = Monday … 6 = Sunday
  href: string;
  isCurrent: boolean;
}) {
  const fullLabel = DAY_LABELS_FULL[dayIndex] ?? '';
  const isWorkout = day.session_count > 0 && !!day.dominant;
  const dominant = day.dominant;

  // The accent ring + tint marks the day being edited (shared across all states).
  const currentRing = isCurrent
    ? 'border-[color:var(--v2-accent)] ring-1 ring-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)]'
    : '';

  const aria = isWorkout
    ? `${fullLabel} · ${day.modalities.map((m) => MODALITY_META[m].label).join(' + ')} · ${countLine(day)}`
    : day.is_rest
      ? `${fullLabel} · descanso`
      : `${fullLabel} · sin nada aún`;

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={aria}
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'v2-focus group flex min-h-[92px] flex-col gap-1.5 rounded-[var(--v2-r-m)] border p-2 transition-colors',
        isWorkout
          ? 'bg-[color:var(--v2-surface)] hover:border-[color:var(--v2-border-strong)]'
          : day.is_rest
            ? 'items-center justify-center bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)]'
            : 'items-center justify-center border-dashed text-[color:var(--v2-faint)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
        currentRing || 'border-[color:var(--v2-border)]',
      )}
      style={
        isWorkout && dominant && !isCurrent
          ? { borderLeftWidth: '3px', borderLeftColor: `var(${MODALITY_META[dominant].colorVar})` }
          : undefined
      }
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            'text-[10px] font-bold uppercase tracking-wide',
            isCurrent ? 'text-[color:var(--v2-accent)]' : 'text-[color:var(--v2-muted)]',
          )}
        >
          {DAY_LABELS_SHORT[dayIndex]}
        </span>
        {isWorkout && day.session_count > 1 ? (
          <span className="v2-num text-[9px] text-[color:var(--v2-faint)]">
            {day.session_count} ses
          </span>
        ) : null}
      </div>

      {isWorkout ? (
        <>
          <div className="flex flex-wrap gap-1">
            {day.modalities.map((m: V2Modality) => (
              <span
                key={m}
                className="rounded-[var(--v2-r-pill)] px-1.5 py-0.5 text-[9px] font-semibold leading-none"
                style={{
                  background: `var(${MODALITY_META[m].softVar})`,
                  color: `var(${MODALITY_META[m].colorVar})`,
                }}
              >
                {MODALITY_META[m].label}
              </span>
            ))}
          </div>
          <span className="v2-num mt-auto text-[9.5px] text-[color:var(--v2-faint)]">
            {countLine(day)}
          </span>
        </>
      ) : day.is_rest ? (
        <>
          <MIcon name="bedtime" size={16} />
          <span className="text-[10px] font-semibold">Descanso</span>
        </>
      ) : (
        <>
          <MIcon name="add" size={16} />
          <span className="text-[9px] font-medium">Nada aún</span>
        </>
      )}
    </Link>
  );
}

// The quiet, honest one-line week summary: real counts of training vs rest/empty
// days + the distinct modalities the week actually covers. No invented metric.
function weekSummary(days: DayModalityInfo[]): string {
  const train = days.filter((d) => d.session_count > 0).length;
  const off = days.length - train;
  const mods: V2Modality[] = [];
  for (const d of days) for (const m of d.modalities) if (!mods.includes(m)) mods.push(m);
  const parts = [`${train} ${train === 1 ? 'día' : 'días'} de entreno`, `${off} de descanso`];
  if (mods.length) parts.push(mods.map((m) => MODALITY_META[m].label).join(' · '));
  return parts.join(' — ');
}

export function WeekContextStrip({
  microcycleId,
  weekName,
  weekDays,
  weekDayBase,
  currentDayOfWeek,
}: {
  microcycleId: string;
  weekName: string;
  /** The focused week's 7 days, Mon→Sun (deriveWeekModalities output). */
  weekDays: DayModalityInfo[];
  /** Flat month-wide index of this week's Monday → cell href = base + (dow-1). */
  weekDayBase: number;
  /** 1..7 — the day currently open in the editor below (highlighted). */
  currentDayOfWeek: number;
}) {
  return (
    <section
      aria-label={`Semana en contexto · ${weekName}`}
      className="rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-[color:var(--v2-muted)]">
          {weekName}
        </h2>
        <p className="v2-num text-[10px] text-[color:var(--v2-faint)]">{weekSummary(weekDays)}</p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day, i) => (
          <DayCell
            key={day.day_of_week}
            day={day}
            dayIndex={i}
            href={dayCanvasHref(microcycleId, weekDayBase + i)}
            isCurrent={day.day_of_week === currentDayOfWeek}
          />
        ))}
      </div>
    </section>
  );
}
