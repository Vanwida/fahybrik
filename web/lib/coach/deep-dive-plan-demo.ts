// Demo Plan payload — Marc Vidal, final microciclo w1 (canonical example from
// /docs/ux/13-deep-dive-sub-tabs.md). The shape here mirrors what the real
// builder produces. Used when (a) the URL points at a `demo-N` athlete or
// (b) Pablo opened a real athlete with no assignments yet.

import type {
  PlanDay,
  PlanPayload,
  PlanSession,
  PlanSlot,
  PlanViewMode,
  PlanWeek,
} from './deep-dive-plan';

const DEMO_GENERATED_AT = '2026-05-08T08:00:00.000Z';

// Demo microciclo names — plausible coach DATA (agnostic strings, NOT a fixed
// phase enum). The third (final) microciclo demos a taper preview.
const DEMO_MICROCICLOS = { base: 'Base', build: 'Construcción', peak: 'Pico' } as const;

export function getMarcPlan(
  athlete_id: string,
  view: PlanViewMode,
  anchor: Date,
): PlanPayload | null {
  // Only the canonical demo athletes get a hand-crafted plan; the rest map
  // to a synthesized version anchored at the requested date.
  if (athlete_id === 'demo-1') return buildPlan(athlete_id, 'Marc Vidal', view, anchor);
  if (athlete_id === 'demo-2') return buildPlan(athlete_id, 'Sara Puig', view, anchor);
  if (athlete_id.startsWith('demo-')) {
    return buildPlan(athlete_id, 'Atleta demo', view, anchor);
  }
  return null;
}

export function getDemoPlanFallback(
  athlete_id: string,
  full_name: string,
  view: PlanViewMode,
  anchor: Date,
): PlanPayload {
  const out = buildPlan(athlete_id, full_name, view, anchor);
  return { ...out, is_demo: true };
}

function buildPlan(
  athlete_id: string,
  athlete_name: string,
  view: PlanViewMode,
  anchor: Date,
): PlanPayload {
  const range = computeRange(view, anchor);

  // The demo plan is anchored at HYROX BCN 2026-06-18: the final microciclo
  // (Pico) w1=2026-05-04 to 2026-05-10, w2 next. We seed all weeks visible in
  // the viewport with deterministic patterns; the final microciclo tapers.
  const weeks: PlanWeek[] = [];
  let cursor = parseIso(range.start_iso);
  const end = parseIso(range.end_iso);

  while (cursor.getTime() <= end.getTime()) {
    weeks.push(buildWeek(cursor));
    cursor = addDays(cursor, 7);
  }

  const total = weeks.reduce((s, w) => s + w.days.reduce((d, day) => d + day.sessions.length, 0), 0);

  return {
    generated_at_iso: DEMO_GENERATED_AT,
    is_demo: true,
    athlete_id,
    athlete_name,
    view_mode: view,
    view_label: viewLabel(view, anchor),
    range_iso_start: range.start_iso,
    range_iso_end: range.end_iso,
    total_sessions: total,
    current_block: DEMO_MICROCICLOS.peak,
    current_block_label: `${DEMO_MICROCICLOS.peak} · sem 1 / 2`,
    current_macrocycle_total_weeks: 12,
    weeks,
    a_event: { name: 'HYROX BCN', iso_date: '2026-06-18', days_until: 41 },
  };
}

// ---------------------------------------------------------------------------
// Week / day construction
// ---------------------------------------------------------------------------

function buildWeek(monday: Date): PlanWeek {
  const block = blockForWeek(monday);
  const taper = taperForWeek(monday);
  const days: PlanDay[] = [];
  const todayIso = isoDate(new Date('2026-05-08T08:00:00.000Z'));
  const aEventIso = '2026-06-18';

  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const dayIso = isoDate(day);
    const sessions = sessionsForDay(dayIso, i + 1, block.type, taper.factor);
    days.push({
      iso_date: dayIso,
      day_of_week: i + 1,
      short_label: ['L', 'Ma', 'Mi', 'J', 'V', 'S', 'D'][i],
      long_label: day.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' }),
      is_today: dayIso === todayIso,
      is_past: dayIso < todayIso,
      sessions,
    });
  }

  const has_a_event = aEventIso >= isoDate(monday) && aEventIso <= isoDate(addDays(monday, 6));

  return {
    week_index: weekNumberOf(monday),
    iso_week_label: `W${weekNumberOf(monday)}`,
    iso_start_date: isoDate(monday),
    iso_end_date: isoDate(addDays(monday, 6)),
    block_type: block.type,
    block_position_in_block: block.position_in_block,
    is_taper: taper.factor < 1,
    taper_factor: taper.factor,
    taper_label: taper.label,
    has_a_event,
    a_event_label: has_a_event ? 'HYROX BCN' : null,
    days,
  };
}

interface BlockInfo { type: string | null; position_in_block: number | null }
function blockForWeek(monday: Date): BlockInfo {
  // Demo microciclos: Base w1-w6 (2026-03-23 → 2026-05-03), Construcción w7-w10,
  // Pico w11-w12. The final (Pico) microciclo demos the taper preview.
  const iso = isoDate(monday);
  if (iso < '2026-03-23') return { type: null, position_in_block: null };
  if (iso >= '2026-03-23' && iso < '2026-05-04') {
    const w = Math.floor(daysBetween(parseIso('2026-03-23'), monday) / 7) + 1;
    return { type: DEMO_MICROCICLOS.base, position_in_block: w };
  }
  if (iso >= '2026-05-04' && iso < '2026-06-01') {
    const w = Math.floor(daysBetween(parseIso('2026-05-04'), monday) / 7) + 1;
    return { type: DEMO_MICROCICLOS.build, position_in_block: w };
  }
  if (iso >= '2026-06-01' && iso < '2026-06-22') {
    const w = Math.floor(daysBetween(parseIso('2026-06-01'), monday) / 7) + 1;
    return { type: DEMO_MICROCICLOS.peak, position_in_block: w };
  }
  return { type: null, position_in_block: null };
}

function taperForWeek(monday: Date): { factor: number; label: string | null } {
  const block = blockForWeek(monday);
  if (block.type !== DEMO_MICROCICLOS.peak || block.position_in_block == null) {
    return { factor: 1, label: null };
  }
  const w = block.position_in_block;
  const factor = w === 1 ? 1 : w === 2 ? 0.7 : 0.5;
  return { factor, label: `${DEMO_MICROCICLOS.peak} sem ${w} · ${Math.round(factor * 100)}%` };
}

// ---------------------------------------------------------------------------
// Sessions per day (deterministic patterns, élite hybrid 2x/day)
// ---------------------------------------------------------------------------

function sessionsForDay(
  iso_date: string,
  dayOfWeek: number,
  block: string | null,
  taperFactor: number,
): PlanSession[] {
  // Sunday is rest/active recovery only.
  if (dayOfWeek === 7) {
    return [
      mkSession(iso_date, 'AM', 'Rest day · mobility 20min', 'recovery', 20, 'Mobility', taperFactor, 'scheduled'),
    ];
  }

  const past = iso_date < '2026-05-08';
  const today = iso_date === '2026-05-08';
  const status = (i: number): PlanSession['status'] => {
    if (past) {
      // Lay in two missed days for visual variety on history.
      if (iso_date === '2026-05-01' && i === 1) return 'missed';
      if (iso_date === '2026-04-22' && i === 0) return 'missed';
      return 'completed';
    }
    if (today) return i === 0 ? 'completed' : 'scheduled';
    return 'scheduled';
  };

  const patterns: Record<number, [Omit<PlanSession, 'iso_date' | 'status' | 'taper_factor'>, Omit<PlanSession, 'iso_date' | 'status' | 'taper_factor'>?]> = {
    1: [
      { session_id: '', slot: 'AM', title: 'Strength upper body',  modality: 'strength', duration_min: 55, intensity_label: 'Strength · 4×6',     rpe: null, is_pr: false },
      { session_id: '', slot: 'PM', title: 'Z2 long run',           modality: 'running',  duration_min: 75, intensity_label: 'Z2 long',             rpe: null, is_pr: false },
    ],
    2: [
      { session_id: '', slot: 'AM', title: 'Threshold intervals 4×1km', modality: 'running', duration_min: 50, intensity_label: 'Z4 threshold',     rpe: null, is_pr: false },
      { session_id: '', slot: 'PM', title: 'Skill + drills',       modality: 'skill',    duration_min: 35, intensity_label: 'Skill',               rpe: null, is_pr: false },
    ],
    3: [
      { session_id: '', slot: 'AM', title: 'HYROX simulation half',  modality: 'hyrox',    duration_min: 50, intensity_label: 'Hyrox sim',          rpe: null, is_pr: false },
      { session_id: '', slot: 'PM', title: 'Active recovery + mob',  modality: 'recovery', duration_min: 30, intensity_label: 'Recovery',           rpe: null, is_pr: false },
    ],
    4: [
      { session_id: '', slot: 'AM', title: 'Strength lower body',  modality: 'strength', duration_min: 60, intensity_label: 'Strength · 5×5',     rpe: null, is_pr: false },
      { session_id: '', slot: 'PM', title: 'Mobility flow',        modality: 'recovery', duration_min: 30, intensity_label: 'Mobility',            rpe: null, is_pr: false },
    ],
    5: [
      { session_id: '', slot: 'AM', title: 'VO2max intervals 5×3min', modality: 'running', duration_min: 45, intensity_label: 'Z5 VO2',           rpe: null, is_pr: false },
      { session_id: '', slot: 'PM', title: 'Sled accumulation',     modality: 'hyrox',    duration_min: 40, intensity_label: 'Sled · 6×100m',      rpe: null, is_pr: false },
    ],
    6: [
      { session_id: '', slot: 'AM', title: 'Long Z2 run 90min',    modality: 'running',  duration_min: 90, intensity_label: 'Z2 long',             rpe: null, is_pr: false },
    ],
  };

  const dayDef = patterns[dayOfWeek];
  if (!dayDef) return [];

  const out: PlanSession[] = [];
  dayDef.forEach((s, i) => {
    if (!s) return;
    const minutes = scaleDuration(s.duration_min, taperFactor);
    out.push({
      session_id: `${iso_date}-${s.slot}`,
      iso_date,
      slot: s.slot,
      title: s.title,
      modality: s.modality,
      duration_min: minutes,
      intensity_label: s.intensity_label,
      rpe: s.rpe,
      is_pr: s.is_pr,
      status: status(i),
      taper_factor: taperFactor,
    });
  });
  return out;
}

function mkSession(
  iso_date: string,
  slot: PlanSlot,
  title: string,
  modality: PlanSession['modality'],
  duration_min: number,
  intensity_label: string,
  taper_factor: number,
  status: PlanSession['status'],
): PlanSession {
  return {
    session_id: `${iso_date}-${slot}`,
    iso_date,
    slot,
    title,
    modality,
    duration_min: scaleDuration(duration_min, taper_factor),
    intensity_label,
    rpe: null,
    is_pr: false,
    status,
    taper_factor,
  };
}

function scaleDuration(min: number | null, factor: number): number | null {
  if (min == null) return null;
  return Math.round(min * factor);
}

// ---------------------------------------------------------------------------
// Range / labels (tiny duplicated helpers — keeping demo file standalone)
// ---------------------------------------------------------------------------

interface DateRange { start_iso: string; end_iso: string }
function computeRange(view: PlanViewMode, anchor: Date): DateRange {
  if (view === 'day') return { start_iso: isoDate(anchor), end_iso: isoDate(anchor) };
  if (view === 'week') {
    const monday = mondayOf(anchor);
    return { start_iso: isoDate(monday), end_iso: isoDate(addDays(monday, 6)) };
  }
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const last = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  return { start_iso: isoDate(mondayOf(first)), end_iso: isoDate(addDays(mondayOf(last), 6)) };
}
function viewLabel(view: PlanViewMode, anchor: Date): string {
  if (view === 'day') return anchor.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'short' });
  if (view === 'week') {
    const monday = mondayOf(anchor);
    const sunday = addDays(monday, 6);
    return `Sem W${weekNumberOf(monday)} · ${monday.getUTCDate()}-${sunday.getUTCDate()} ${monday.toLocaleDateString('es-ES', { month: 'short' })}`;
  }
  return `${anchor.toLocaleDateString('es-ES', { month: 'long' })} ${anchor.getUTCFullYear()}`;
}
function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function pad(n: number): string { return String(n).padStart(2, '0'); }
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}
function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function daysBetween(a: Date, b: Date): number {
  const aDay = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bDay = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bDay - aDay) / 86_400_000);
}
function mondayOf(d: Date): Date {
  const day = d.getUTCDay() || 7;
  return addDays(d, -(day - 1));
}
function weekNumberOf(monday: Date): number {
  const target = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}
