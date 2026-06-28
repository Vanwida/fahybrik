'use client';

// v2 · INTAKE · CARRERAS — the athlete's real race evidence in the coach's intake
// review: past results (imported finishes / expired objectives) on top, upcoming
// objectives below. This is the ground truth behind the suggested level, so the
// coach confirms the classification against real finishes, not just self-report.
// Read-only; reuses the SAME Spanish race formatters as every coach race surface.

import { MIcon } from '@/components/ui/MIcon';
import {
  formatRaceTime,
  formatRaceDate,
  raceCategoryLineEs,
  RACE_PRIORITY_LABEL,
} from '@/lib/dashboard/coach/race-labels';
import type { RaceHistoryItem, UpcomingRace } from '@fahybrid/shared/schema';

function eventLabel(eventType: string): string {
  if (eventType === 'hyrox') return 'HYROX';
  if (eventType === 'deka') return 'DEKA';
  return 'Carrera';
}

export function IntakeRaces({
  past,
  upcoming,
}: {
  past: RaceHistoryItem[];
  upcoming: UpcomingRace[];
}) {
  const hasAny = past.length > 0 || upcoming.length > 0;

  return (
    <section className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <MIcon name="flag" size={14} className="text-[color:var(--v2-muted)]" />
        <span className="v2-micro">Carreras</span>
      </div>

      {!hasAny ? (
        <p className="text-xs text-[color:var(--v2-faint)]">
          Sin carreras registradas todavía.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {past.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
                Resultados
              </span>
              {past.map((r) => {
                const time = formatRaceTime(r.result_time_seconds);
                const date = formatRaceDate(r.race_date);
                return (
                  <div
                    key={`past-${r.race_id}`}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-[color:var(--v2-fg)]">
                        {r.name}
                      </span>
                      <span className="truncate text-[10px] text-[color:var(--v2-faint)]">
                        {eventLabel(r.event_type)} · {raceCategoryLineEs(r)}
                        {date ? ` · ${date}` : ''}
                      </span>
                    </div>
                    {time ? (
                      <span className="v2-num shrink-0 font-semibold text-[color:var(--v2-fg)]">
                        {time}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-[color:var(--v2-faint)]">
                        sin marca
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {upcoming.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--v2-faint)]">
                Objetivos
              </span>
              {upcoming.map((r) => {
                const goal = formatRaceTime(r.goal_time_seconds);
                const date = formatRaceDate(r.race_date);
                return (
                  <div
                    key={`up-${r.race_id}`}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-[color:var(--v2-fg)]">
                        {r.name}
                      </span>
                      <span className="truncate text-[10px] text-[color:var(--v2-faint)]">
                        {eventLabel(r.event_type)} · {RACE_PRIORITY_LABEL[r.priority]}
                        {date ? ` · ${date}` : ''}
                      </span>
                    </div>
                    {goal ? (
                      <span className="v2-num shrink-0 text-[color:var(--v2-muted)]">
                        meta {goal}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
