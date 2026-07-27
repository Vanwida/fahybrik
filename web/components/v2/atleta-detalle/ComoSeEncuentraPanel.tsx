// «Cómo se encuentra» — the coach's window into the athlete's daily check-in
// (mockup: docs/design/como-se-encuentra-mockup.html, approved 27-jul-2026).
// Renders in PlanTab's right column, under the Readiness tile it explains.
//
// Honesty rules (single-sourced in lib/dashboard/coach/checkin-presentation):
// the 5 rows mirror the EXACT iOS questions with soreness/energy already
// positive-framed; the note is verbatim; a stale check-in is dated and dimmed,
// never presented as today's state; week-strip gaps stay gaps.

import { Panel } from './parts';
import {
  CHECKIN_DOW_LABEL,
  adaptiveFlagCopy,
  checkinDimensionRows,
  checkinFreshnessLabel,
  checkinScoreTone,
  checkinValueTone,
  type CheckinContent,
  type CheckinTone,
  type CheckinWeekSlot,
} from '@/lib/dashboard/coach/checkin-presentation';
import { cn } from '@/lib/utils';

const TONE_TEXT: Record<CheckinTone, string> = {
  ok: 'text-[color:var(--v2-ok)]',
  warn: 'text-[color:var(--v2-warn)]',
  danger: 'text-[color:var(--v2-danger)]',
};
const TONE_BG: Record<CheckinTone, string> = {
  ok: 'bg-[color:var(--v2-ok)]',
  warn: 'bg-[color:var(--v2-warn)]',
  danger: 'bg-[color:var(--v2-danger)]',
};
const TONE_SOFT: Record<CheckinTone, string> = {
  ok: 'bg-[color:var(--v2-ok-soft)]',
  warn: 'bg-[color:var(--v2-warn-soft)]',
  danger: 'bg-[color:var(--v2-danger-soft)]',
};

function ScorePill({ score, dimmed }: { score: number; dimmed?: boolean }) {
  const tone = checkinScoreTone(score);
  return (
    <span
      className={cn(
        'rounded-[var(--v2-r-pill)] px-2.5 py-0.5 font-mono text-sm font-semibold',
        TONE_TEXT[tone],
        TONE_SOFT[tone],
        dimmed && 'opacity-75',
      )}
    >
      {score}
    </span>
  );
}

function DimensionRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  const tone = checkinValueTone(value);
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5">
      <span className="text-[13px] text-[color:var(--v2-fg)]">{label}</span>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <i
            key={i}
            className={cn(
              'h-1.5 w-3.5 rounded-[3px]',
              i <= value
                ? TONE_BG[tone]
                : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
            )}
          />
        ))}
      </span>
      <span className="w-7 text-right font-mono text-xs text-[color:var(--v2-muted)]">
        {value}/5
      </span>
    </div>
  );
}

function WeekStrip({ week }: { week: CheckinWeekSlot[] }) {
  if (week.length === 0) return null;
  const todayIso = week[week.length - 1]!.iso;
  return (
    <div className="flex items-end gap-1.5">
      {week.map((d) => {
        const tone = d.sub_score != null ? checkinScoreTone(d.sub_score) : null;
        return (
          <div key={d.iso} className="flex flex-col items-center gap-1">
            <span
              className={cn(
                'grid h-[26px] w-[26px] place-items-center rounded-[var(--v2-r-xs)] font-mono text-[10px]',
                tone
                  ? cn(TONE_TEXT[tone], TONE_SOFT[tone])
                  : 'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] text-[color:var(--v2-muted)]',
                d.iso === todayIso && 'outline outline-[1.5px] outline-offset-1 outline-[color:var(--v2-border-strong)]',
              )}
            >
              {d.sub_score ?? '·'}
            </span>
            <span className="text-[9.5px] font-medium uppercase text-[color:var(--v2-faint)]">
              {CHECKIN_DOW_LABEL[d.dow]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ComoSeEncuentraPanel({
  checkin,
  week,
}: {
  checkin: CheckinContent | null;
  week: CheckinWeekSlot[];
}) {
  if (!checkin) {
    return (
      <Panel title="Cómo se encuentra">
        <p className="py-2 text-center text-xs leading-relaxed text-[color:var(--v2-muted)]">
          Sin check-in todavía.
          <br />
          El atleta aún no ha registrado ninguno desde la app.
        </p>
      </Panel>
    );
  }

  const stale = checkin.days_ago > 0;
  const flagCopy = adaptiveFlagCopy(checkin.adaptive_flag);

  return (
    <Panel title="Cómo se encuentra" action={<ScorePill score={checkin.sub_score} dimmed={stale} />}>
      <div className={cn('flex flex-col gap-3', stale && 'opacity-65')}>
        <p className={cn('text-xs', stale ? 'text-[color:var(--v2-warn)]' : 'text-[color:var(--v2-muted)]')}>
          {checkinFreshnessLabel(checkin)}
        </p>

        <div className="flex flex-col gap-2">
          {checkinDimensionRows(checkin).map((d) => (
            <DimensionRow key={d.key} label={d.label} value={d.value} />
          ))}
        </div>

        {checkin.notes ? (
          <blockquote className="rounded-[var(--v2-r-s)] border-l-[3px] border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-xs italic leading-relaxed text-[color:var(--v2-muted)]">
            <span className="font-semibold not-italic text-[color:var(--v2-fg)]">Nota del atleta: </span>
            «{checkin.notes}»
          </blockquote>
        ) : null}

        {flagCopy ? (
          <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-danger)] bg-[color:var(--v2-danger-soft)] p-2.5">
            <span
              aria-hidden
              className="grid h-[17px] w-[17px] flex-none place-items-center rounded-full bg-[color:var(--v2-danger)] text-[11px] font-bold text-white"
            >
              !
            </span>
            <p className="text-xs leading-snug text-[color:var(--v2-fg)]">{flagCopy}</p>
          </div>
        ) : null}

        <WeekStrip week={week} />
      </div>
    </Panel>
  );
}
