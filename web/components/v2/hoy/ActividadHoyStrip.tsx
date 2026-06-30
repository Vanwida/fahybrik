'use client';

// ActividadHoyStrip — the "Actividad de hoy" ambient glance on Hoy (SABER layer).
//
// Unlike the triage lanes (which trend to ZERO as the coach clears them), this is
// a REVIEW-AT-SCALE readout: what the roster actually LOGGED today, newest-first,
// so the coach can glance + lightly encourage without it ever becoming a queue.
// Each row keys on the EXECUTION existing (not the assignment status), so an
// off-plan "entreno libre" surfaces here exactly like a prescribed one — closing
// the loop coach-side: "tu atleta hizo X hoy" is finally visible on the dashboard.
//
// Tapping a row opens that athlete's detail, where the coach drills into the
// executed session (prescrito-vs-hecho + per-segment actuals — already built).

import { MIcon } from '@/components/ui/MIcon';
import { AthleteAvatar } from '@/components/v2/AthleteAvatar';
import { Link } from '@/i18n/navigation';
import type { ActivityToday } from '@/lib/dashboard/coach/activity-today';

export function ActividadHoyStrip({ activity }: { activity: ActivityToday }) {
  if (activity.sessions.length === 0) return null;

  // The header count is the REAL total logged today (may exceed the rendered rows
  // when the rail is capped), so "+N más" stays honest.
  const hidden = activity.total - activity.sessions.length;

  return (
    <section aria-label="Actividad de hoy" className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <MIcon name="bolt" size={16} className="text-[color:var(--v2-accent)]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-[color:var(--v2-muted)]">
          Actividad de hoy
        </span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {activity.total}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {activity.sessions.map((s) => (
          <Link
            key={s.id}
            href={`/atletas/${s.athlete_id}`}
            className="v2-focus group w-64 shrink-0 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-2.5 transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            {/* Identity row + relative age */}
            <div className="flex items-center gap-2.5">
              <AthleteAvatar name={s.athlete_name} size="md" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-[color:var(--v2-fg)]">
                  {s.athlete_name}
                </span>
                {s.age_label ? (
                  <span className="text-[11px] text-[color:var(--v2-faint)]">{s.age_label}</span>
                ) : null}
              </div>
              <MIcon
                name="arrow_forward"
                size={15}
                className="shrink-0 text-[color:var(--v2-faint)] transition-colors group-hover:text-[color:var(--v2-fg)]"
              />
            </div>

            {/* Session name + format */}
            <p className="mt-1.5 truncate text-xs font-medium text-[color:var(--v2-fg)]">
              {s.session_name}
              {s.format_label ? (
                <span className="font-normal text-[color:var(--v2-muted)]"> · {s.format_label}</span>
              ) : null}
            </p>

            {/* Real key result (tiempo · RPE / "Completada") */}
            <p className="mt-0.5 v2-num text-[11px] text-[color:var(--v2-muted)]">{s.result}</p>
          </Link>
        ))}

        {hidden > 0 ? (
          <Link
            href="/atletas"
            className="v2-focus flex w-28 shrink-0 flex-col items-center justify-center rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] p-2.5 text-center transition-colors hover:border-[color:var(--v2-border-strong)]"
          >
            <span className="text-sm font-semibold text-[color:var(--v2-fg)]">+{hidden}</span>
            <span className="text-[11px] text-[color:var(--v2-muted)]">más hoy</span>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
