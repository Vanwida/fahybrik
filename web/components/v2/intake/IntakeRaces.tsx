'use client';

// v2 · INTAKE · CARRERAS — the athlete's real race evidence in the coach's intake
// review: past results (imported finishes / expired objectives) on top, upcoming
// objectives below. This is the ground truth behind the suggested level, so the
// coach confirms the classification against real finishes, not just self-report.
// Read-only; reuses the SAME Spanish race formatters as every coach race surface.

import { Card, CardHeader, List, ListRow } from '@/components/v2/ui';
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
    <Card padding={hasAny ? 'none' : 'md'}>
      <CardHeader title="Carreras" className={hasAny ? 'px-4 pt-4' : 'mb-1'} />
      {!hasAny ? (
        <p className="t-body-sm text-v2-muted">Sin carreras todavía</p>
      ) : (
        <List aria-label="Carreras" className="rounded-none border-x-0 border-b-0">
          {past.map((r) => {
            const time = formatRaceTime(r.result_time_seconds);
            const date = formatRaceDate(r.race_date);
            return (
              <ListRow
                key={`past-${r.race_id}`}
                density="compact"
                title={r.name}
                detail={`${eventLabel(r.event_type)} · ${raceCategoryLineEs(r)}${date ? ` · ${date}` : ''}`}
                meta={time ?? 'sin marca'}
              />
            );
          })}
          {upcoming.map((r) => {
            const goal = formatRaceTime(r.goal_time_seconds);
            const date = formatRaceDate(r.race_date);
            return (
              <ListRow
                key={`up-${r.race_id}`}
                density="compact"
                title={r.name}
                detail={`${eventLabel(r.event_type)} · ${RACE_PRIORITY_LABEL[r.priority]}${date ? ` · ${date}` : ''}`}
                meta={goal ? `objetivo ${goal}` : null}
              />
            );
          })}
        </List>
      )}
    </Card>
  );
}
