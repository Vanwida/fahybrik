// Rail summary types for the /hoy context rail — the small aggregates the coach
// home computes (today's session load, the next A-priority target events). Pure
// data shapes consumed by the shared hoy-data loader; kept here (not in a UI
// component) so the backend never depends on a React module.

/** Today's scheduled-session summary for the rail. */
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
