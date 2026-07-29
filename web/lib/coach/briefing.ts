// Daily briefing payload builder. Aggregates dashboard-level facts that
// shouldn't require scanning the cohort table to surface.
//
// Every number here is counted from the cohort or passed in already measured.
// Nothing is defaulted to a plausible value: a line whose input is unknown is
// NOT PAINTED (docs/CONTRATO-UI.md §7). This is the screen that opens the
// coach's day, so a fabricated number here is the one he is least likely to
// question — three of them lived here (4 video reviews, a message count derived
// from the alert count, and a synthetic 78/8/14 zone split).

import type { BriefingLine, BriefingPayload, CohortRow, TimeOfDay } from '@fahybrid/shared/domain/coach/types';
import {
  aggregatePolarization,
  polarizationDrift,
  TARGET_POLARIZATION,
} from '@fahybrid/shared/domain/coach/polarization';

/** Drift beyond this many points is worth flagging to the coach. */
const POLARIZATION_DRIFT_WARN = 6;

interface BuildParams {
  coach_first_name: string;
  cohort: CohortRow[];
  now?: Date;
  active_athlete_count?: number;
  next_a_event?: { name: string; iso_date: string; athlete_count: number; phase?: string | null } | null;
  /**
   * Messages the athletes sent that the coach has not opened, summed over his
   * threads (`chat_threads.unread_for_coach`). Undefined means the caller did
   * not look — the line is skipped rather than guessed.
   *
   * There is deliberately NO `pending_video_reviews` sibling: the schema has no
   * video-review entity (no table, and `chat_messages.attachment_kind` only ever
   * carries 'image' or 'voice'), so that count cannot be known — it was a
   * hardcoded 4. It comes back the day the concept exists.
   */
  unread_messages?: number;
  scheduled_tests?: Array<{ athlete_name: string; label: string }>;
  pending_intakes?: Array<{ athlete_id: string; full_name: string }>;
}

const DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function buildBriefing(params: BuildParams): BriefingPayload {
  const now = params.now ?? new Date();
  const tod = timeOfDay(now);
  const greeting = greetingFor(tod, params.coach_first_name);
  const dateLabel = DATE_FORMATTER.format(now).replace(/\sde\s/g, ' ');

  const active_athlete_count = params.active_athlete_count ?? params.cohort.length;
  const sessionsToday = params.cohort.reduce(
    (s, r) => s + (r.sessions_today.am ? 1 : 0) + (r.sessions_today.pm ? 1 : 0),
    0,
  );
  const twiceDaily = params.cohort.filter((r) => r.flags.twice_daily_today).length;
  const alertCount = params.cohort.filter((r) => r.alerts.length > 0).length;
  const transitionReady = params.cohort.filter((r) => r.flags.transition_ready).length;
  const testsToday = params.cohort.filter((r) => r.flags.test_today).length;
  const unreadMessages = params.unread_messages ?? null;

  const polarization = aggregatePolarization(params.cohort);

  const lines: BriefingLine[] = [];
  const pendingIntakes = params.pending_intakes ?? [];
  if (pendingIntakes.length > 0) {
    const first = pendingIntakes[0];
    lines.push({
      id: 'intake_pending',
      icon: 'user-plus',
      primary:
        pendingIntakes.length === 1
          ? `1 nuevo atleta esperando intake: ${first.full_name}`
          : `${pendingIntakes.length} nuevos atletas esperando intake`,
      secondary: pendingIntakes.length === 1 ? 'completar handoff' : `incluyendo ${first.full_name}`,
      emphasis: 'warning',
      filter_param: 'intake',
      href: pendingIntakes.length === 1 ? `/intake/${first.athlete_id}` : null,
    });
  }
  if (sessionsToday > 0) {
    lines.push({
      id: 'sessions',
      icon: 'activity',
      primary: `${sessionsToday} sesiones programadas`,
      secondary: twiceDaily > 0 ? `${twiceDaily} atletas en 2x/día` : null,
      emphasis: 'normal',
      filter_param: 'today',
    });
  }
  if (alertCount > 0) {
    lines.push({
      id: 'alerts',
      icon: 'alert-triangle',
      primary: `${alertCount} atletas en alerta`,
      secondary: 'ver abajo',
      emphasis: 'critical',
      filter_param: 'alert',
    });
  }
  // Only when there is something to answer. Zero unread is not news, and an
  // unknown count is not a line at all.
  if (unreadMessages != null && unreadMessages > 0) {
    lines.push({
      id: 'messages',
      icon: 'message-circle',
      primary:
        unreadMessages === 1 ? '1 mensaje sin responder' : `${unreadMessages} mensajes sin responder`,
      secondary: null,
      emphasis: 'normal',
      filter_param: 'messages',
    });
  }
  if (transitionReady > 0) {
    lines.push({
      id: 'transitions',
      icon: 'flask-conical',
      primary: `${transitionReady} atletas listos para transición de bloque`,
      secondary: 'revisar progresión de bloque',
      emphasis: 'warning',
      filter_param: 'transition',
    });
  }
  if (testsToday > 0) {
    const testList = params.scheduled_tests ??
      params.cohort.filter((r) => r.flags.test_today).map((r) => ({ athlete_name: r.full_name, label: 'test programado' }));
    const t = testList[0];
    lines.push({
      id: 'tests',
      icon: 'beaker',
      primary: `${testsToday} test${testsToday > 1 ? 's' : ''} programado${testsToday > 1 ? 's' : ''}: ${t.athlete_name}`,
      secondary: t.label,
      emphasis: 'warning',
      filter_param: 'test',
    });
  }
  if (polarization) {
    const target = `${TARGET_POLARIZATION.low}/${TARGET_POLARIZATION.mid}/${TARGET_POLARIZATION.high}`;
    const drift = polarizationDrift(polarization);
    const warn = drift > POLARIZATION_DRIFT_WARN;
    lines.push({
      id: 'polarization',
      icon: 'bar-chart-3',
      primary: `Polarización atletas 7d: ${polarization.low}/${polarization.mid}/${polarization.high}`,
      secondary: warn ? `target ${target} · pol drift +${Math.round(drift)}` : `target ${target}`,
      emphasis: warn ? 'warning' : 'normal',
      filter_param: 'polarization',
    });
  }
  if (params.next_a_event) {
    lines.push({
      id: 'event',
      icon: 'flag',
      primary: `${params.next_a_event.name} en ${daysUntil(now, params.next_a_event.iso_date)}d`,
      secondary: `${params.next_a_event.athlete_count} atletas A-event${
        params.next_a_event.phase ? ` · fase ${params.next_a_event.phase}` : ''
      }`,
      emphasis: 'normal',
      filter_param: 'event',
    });
  } else {
    const upcoming = inferUpcomingEvent(params.cohort);
    if (upcoming) {
      lines.push({
        id: 'event',
        icon: 'flag',
        primary: `${upcoming.name} en ${upcoming.days}d`,
        secondary: `${upcoming.athlete_count} atletas A-event`,
        emphasis: 'normal',
        filter_param: 'event',
      });
    }
  }

  const is_quiet_day = alertCount === 0 && sessionsToday === 0 && transitionReady === 0;

  return {
    greeting,
    date_label: dateLabel,
    iso_date: now.toISOString().slice(0, 10),
    active_athlete_count,
    time_of_day: tod,
    is_quiet_day,
    is_first_time: params.cohort.length === 0,
    lines,
  };
}

function timeOfDay(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

function greetingFor(tod: TimeOfDay, name: string): string {
  const first = name.split(' ')[0].toUpperCase();
  switch (tod) {
    case 'morning':
      return `BUENOS DÍAS, ${first}`;
    case 'afternoon':
      return `BUENAS TARDES, ${first}`;
    case 'evening':
      return `BUENA TARDE, ${first}`;
    case 'night':
      return `BUENAS NOCHES, ${first}`;
  }
}

// The soonest target race in the cohort, named as the athlete actually named it.
// The name used to be the literal 'HYROX BCN' regardless of the race — real ones
// in production read "HYROX Barcelona" and "Leapmotor HYROX Barcelona", and an
// athlete pointing at Madrid or a DEKA would have been told he was doing HYROX
// BCN. Null name ⇒ no event line: the countdown alone names nothing.
function inferUpcomingEvent(
  cohort: CohortRow[],
): { name: string; days: number; athlete_count: number } | null {
  const upcoming = cohort
    .filter((r) => r.days_to_a_event != null && r.a_event_name != null)
    .sort((a, b) => (a.days_to_a_event ?? 0) - (b.days_to_a_event ?? 0));
  if (upcoming.length === 0) return null;
  const target = upcoming[0];
  const days = target.days_to_a_event!;
  // Athletes pointing at the SAME race, by name — a week's proximity used to be
  // enough to lump two different races into one count.
  const cohortAtSameEvent = cohort.filter((r) => r.a_event_name === target.a_event_name).length;
  return {
    name: target.a_event_name!,
    days,
    athlete_count: cohortAtSameEvent,
  };
}

function daysUntil(now: Date, iso: string): number {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((target - today) / 86_400_000));
}
