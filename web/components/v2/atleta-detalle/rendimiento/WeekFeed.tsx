'use client';

// The evaluated week's session feed — "lo que hizo el atleta": the
// scheduled/completed/missed counts plus the per-day sessions (Mon→Sun), each
// dotted by its real completion status. Rendered inside the Evaluar-semana panel
// when a live evaluation carries a week_feed (it does after an on-demand propose).

import { TONE_VAR, type Tone } from './ui';
import type { WeekFeedSummary } from '@/lib/dashboard/coach/weekly-evaluation';

const SESSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  completed: { label: 'Hecha', tone: 'ok' },
  missed: { label: 'Perdida', tone: 'danger' },
  scheduled: { label: 'Planificada', tone: 'info' },
  skipped: { label: 'Saltada', tone: 'fg' },
};

const DOW_SHORT: Record<number, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
  7: 'Dom',
};

export function WeekFeed({ feed }: { feed: WeekFeedSummary }) {
  const daysWithSessions = feed.days.filter((d) => d.sessions.length > 0);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--v2-r-m)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-3">
      <div className="flex items-center gap-4">
        <FeedCount label="Planificadas" value={feed.scheduled} tone="info" />
        <FeedCount label="Hechas" value={feed.completed} tone="ok" />
        <FeedCount label="Perdidas" value={feed.missed} tone="danger" />
      </div>
      {daysWithSessions.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-[color:var(--v2-border)] pt-2">
          {daysWithSessions.map((d) => (
            <div key={d.iso_date} className="flex items-start gap-2">
              <span className="v2-micro w-8 shrink-0 pt-0.5 text-nano">
                {DOW_SHORT[d.day_of_week] ?? '—'}
              </span>
              <div className="flex min-w-0 flex-wrap gap-1.5">
                {d.sessions.map((s, i) => {
                  const meta = SESSION_STATUS[s.status] ?? { label: s.status, tone: 'fg' as Tone };
                  return (
                    <span
                      key={`${d.iso_date}-${i}`}
                      className="inline-flex items-center gap-1 text-label text-[color:var(--v2-fg)]"
                      title={meta.label}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: `var(${TONE_VAR[meta.tone]})` }}
                      />
                      <span className="truncate">{s.title}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeedCount({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="flex flex-col">
      <span className="v2-num text-lg font-bold" style={{ color: `var(${TONE_VAR[tone]})` }}>
        {value}
      </span>
      <span className="v2-micro">{label}</span>
    </div>
  );
}
