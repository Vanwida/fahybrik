// HoyRail — the right rail of /hoy (SPEC §4 zone 3): today's sessions (with a
// 2x/día flag), upcoming A-priority events, and the team bucket strip
// (Atención / Vigilar / Listo) each deep-linking into the roster. Server
// component — only Links and readouts, no client state. (Tests-today is
// feature-flagged OFF per SPEC §4, so it is not rendered.)

import { Link } from '@/i18n/navigation';
import type { TeamPulse } from '@/lib/dashboard/coach/team-pulse';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

/** A scheduled-today summary for the rail. */
export interface RailSessionSummary {
  /** Total athletes with a session scheduled today. */
  total: number;
  /** Athletes with two sessions today (2x/día). */
  twice_count: number;
}

/** An upcoming A-priority target event. */
export interface RailUpcomingEvent {
  athlete_id: string;
  athlete_name: string;
  event_name: string;
  days_until: number;
  /** Athletes peaking for this same event window (cohort size). */
  cohort_count: number;
}

export interface HoyRailProps {
  sessions: RailSessionSummary;
  upcoming: RailUpcomingEvent[];
  pulse: TeamPulse;
}

const RAIL_CARD = 'card-elevated px-5 pb-4 pt-5 hover:border-[color:var(--border-subtle)]';

// Team buckets → roster deep-links + color tokens (Atención/Vigilar/Listo).
const BUCKETS: ReadonlyArray<{
  key: 'low' | 'caution' | 'ok';
  label: string;
  readinessParam: string;
  dot: string;
  color: string;
}> = [
  { key: 'low', label: 'Atención', readinessParam: 'low', dot: 'bg-[color:var(--danger)]', color: 'var(--danger)' },
  { key: 'caution', label: 'Vigilar', readinessParam: 'caution', dot: 'bg-[color:var(--warning)]', color: 'var(--warning)' },
  { key: 'ok', label: 'Listo', readinessParam: 'ok', dot: 'bg-[color:var(--ok)]', color: 'var(--ok)' },
];

export function HoyRail({ sessions, upcoming, pulse }: HoyRailProps) {
  const { readiness } = pulse;

  return (
    <aside className="flex flex-col gap-4" aria-label="Resumen de hoy">
      {/* Sesiones hoy */}
      <section className={RAIL_CARD} aria-labelledby="rail-sessions">
        <h2 className="micro-label mb-3" id="rail-sessions">
          Hoy
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="metric-num text-[28px] font-bold leading-none text-[color:var(--fg)]">
            {sessions.total}
          </span>
          <span className="text-[13px] text-[color:var(--text-muted)]">
            sesión{sessions.total === 1 ? '' : 'es'} programada{sessions.total === 1 ? '' : 's'}
          </span>
        </div>
        {sessions.twice_count > 0 ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-[color:var(--text-muted)]">
            <MIcon name="bolt" size={14} className="text-[color:var(--accent)]" />
            <span className="metric-num font-semibold text-[color:var(--fg)]">
              {sessions.twice_count}
            </span>{' '}
            {sessions.twice_count === 1 ? 'atleta' : 'atletas'} 2x/día
          </p>
        ) : null}
      </section>

      {/* Próximas competiciones A */}
      {upcoming.length > 0 ? (
        <section className={RAIL_CARD} aria-labelledby="rail-upcoming">
          <h2 className="micro-label mb-3" id="rail-upcoming">
            Próximo
          </h2>
          <div className="flex flex-col gap-2">
            {upcoming.slice(0, 3).map((e) => (
              <Link
                key={`${e.athlete_id}-${e.event_name}`}
                href={`/atletas/${e.athlete_id}`}
                aria-label={`${e.event_name} de ${e.athlete_name} en ${e.days_until} días`}
                className="focus-ring -mx-2 flex items-center gap-2.5 rounded-[var(--r-s)] px-2 py-1.5 transition-colors hover:bg-[color:var(--surface-container)]"
              >
                <MIcon name="flag" size={15} className="shrink-0 text-[color:var(--accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[color:var(--fg)]">
                    {e.event_name}
                  </span>
                  <span className="block truncate text-[11.5px] text-[color:var(--text-muted)]">
                    {e.cohort_count > 1
                      ? `${e.cohort_count} atletas A`
                      : e.athlete_name}
                  </span>
                </span>
                <span className="metric-num shrink-0 text-[13px] font-semibold text-[color:var(--fg)]">
                  {e.days_until}d
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Equipo — buckets → roster */}
      <section className={RAIL_CARD} aria-labelledby="rail-team">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="micro-label" id="rail-team">
            Equipo
          </h2>
          <Link
            href="/atletas"
            aria-label="Ver roster completo"
            className="focus-ring inline-flex items-center gap-0.5 rounded-[var(--r-s)] px-1 py-0.5 text-[11px] font-semibold text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          >
            Roster <MIcon name="arrow_forward" size={13} />
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {BUCKETS.map((b) => (
            <Link
              key={b.key}
              href={`/atletas?readiness=${b.readinessParam}`}
              aria-label={`Filtrar roster: ${b.label}, ${readiness[b.key]} atleta${readiness[b.key] === 1 ? '' : 's'}`}
              className="focus-ring -mx-2 flex items-center gap-3 rounded-[var(--r-s)] px-2 py-2 text-[13px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container)] hover:text-[color:var(--fg)]"
            >
              <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-[var(--r-pill)]', b.dot)} />
              {b.label}
              <span
                className="metric-num ml-auto text-sm font-semibold"
                style={{ color: b.color }}
              >
                {readiness[b.key]}
              </span>
              <MIcon name="chevron_right" size={15} className="shrink-0 text-[color:var(--surface-variant)]" />
            </Link>
          ))}
          {readiness.unknown > 0 ? (
            <Link
              href="/atletas"
              className="focus-ring -mx-2 flex items-center gap-3 rounded-[var(--r-s)] px-2 py-2 text-[12.5px] text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-container)]"
            >
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-[var(--r-pill)] bg-[color:var(--neutral)]" />
              Sin datos
              <span className="metric-num ml-auto text-sm font-semibold text-[color:var(--text-muted)]">
                {readiness.unknown}
              </span>
            </Link>
          ) : null}
        </div>
      </section>
    </aside>
  );
}
