// Cohort-wide calendar — Pablo's "all athletes, all sessions" view.
//
// Returns a deterministic week of sessions across the cohort so the demo
// always feels alive. Real session data will replace `buildDemoSessions`
// once the planner schema is wired into a sessions table; today the demo
// is the only source.

import type { CohortRow } from '@fahybrid/shared/domain/coach/types';

export type SessionModality =
  | 'strength'
  | 'run'
  | 'hyrox'
  | 'recovery'
  | 'test'
  | 'erg';

export type SessionStatus = 'done' | 'planned' | 'missed';
export type SessionSlot = 'AM' | 'PM';

export interface CalendarSession {
  session_id: string;
  athlete_id: string;
  athlete_name: string;
  block_type: 'ACC' | 'TRANS' | 'REAL';
  iso_date: string; // YYYY-MM-DD
  slot: SessionSlot;
  start_hhmm: string; // 06:30
  duration_min: number;
  modality: SessionModality;
  title: string;
  detail: string; // e.g. "4×400m @ Z3 · 90s rec"
  status: SessionStatus;
  is_demo: boolean;
}

export interface CalendarWeek {
  week_iso_start: string; // monday
  days: { iso_date: string; weekday: number; label: string }[];
  sessions: CalendarSession[];
}

const WEEK_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Deterministic PRNG so the demo week is stable across reloads.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekStart(d: Date): Date {
  // ISO week starts Monday.
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + offset);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

const RUN_TITLES = [
  { title: 'Z2 base', detail: '60min · HR 138-148', mod: 'run' as const, dur: 60 },
  { title: 'Z3 tempo', detail: '4×8min Z3 · 2min rec', mod: 'run' as const, dur: 55 },
  { title: 'Intervalos', detail: '6×800m @ Z4 · 2min rec', mod: 'run' as const, dur: 50 },
  { title: 'Long run', detail: '90min progresivo Z2→Z3', mod: 'run' as const, dur: 95 },
];
const STRENGTH_TITLES = [
  { title: 'Lower power', detail: 'Squat 5×3 @ 85% · DL 3×3 @ 80%', mod: 'strength' as const, dur: 70 },
  { title: 'Upper hyper', detail: 'Bench 4×6 · Row 4×8 · Pull-ups', mod: 'strength' as const, dur: 65 },
  { title: 'Posterior chain', detail: 'RDL 4×6 · Hip thrust 4×8 · GHD 3×12', mod: 'strength' as const, dur: 60 },
];
const HYROX_TITLES = [
  { title: 'Sled sim', detail: '4 rounds · 50m push + 50m pull · ski 250m', mod: 'hyrox' as const, dur: 75 },
  { title: 'Sandbag + WB', detail: '5×SB lunge 50m + 25 wall ball', mod: 'hyrox' as const, dur: 60 },
  { title: 'HYROX simulation', detail: 'Half-station rehearsal · target 28-32min', mod: 'hyrox' as const, dur: 90 },
  { title: 'Burpee broad', detail: 'EMOM 12 · 8 burpee + 80m run', mod: 'hyrox' as const, dur: 45 },
];
const RECOVERY_TITLES = [
  { title: 'Movilidad', detail: '30min · cadera + tobillo', mod: 'recovery' as const, dur: 30 },
  { title: 'Z1 spin', detail: '40min Z1 · cadencia 90', mod: 'recovery' as const, dur: 40 },
];
const ERG_TITLES = [
  { title: 'Ski erg', detail: '6×500m @ 1:50/500 · 90s rec', mod: 'erg' as const, dur: 35 },
  { title: 'Row threshold', detail: '4×2000m @ 1:48 · 3min rec', mod: 'erg' as const, dur: 50 },
];
const TEST_TITLES = [
  { title: 'Test 5km', detail: 'CP estimación · Z4 controlado', mod: 'test' as const, dur: 35 },
];

function pickTemplate(rand: () => number, modality: SessionModality) {
  const buckets = {
    run: RUN_TITLES,
    strength: STRENGTH_TITLES,
    hyrox: HYROX_TITLES,
    recovery: RECOVERY_TITLES,
    erg: ERG_TITLES,
    test: TEST_TITLES,
  } as const;
  const list = buckets[modality];
  return list[Math.floor(rand() * list.length)]!;
}

interface BuildArgs {
  cohort: CohortRow[];
  week_start_iso?: string;
  now?: Date;
}

// Each athlete gets a stable weekly pattern. We synthesise sessions
// from the cohort row's block + flags so heavy weeks have more sessions
// than recovery weeks.
export function buildCalendarWeek(args: BuildArgs): CalendarWeek {
  const now = args.now ?? new Date();
  const start = args.week_start_iso
    ? new Date(`${args.week_start_iso}T00:00:00`)
    : weekStart(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return {
      iso_date: isoDate(d),
      weekday: i,
      label: WEEK_LABELS[i]!,
    };
  });

  const sessions: CalendarSession[] = [];
  const todayIso = isoDate(now);

  args.cohort.forEach((athlete, idx) => {
    // Stable seed per athlete + week, so reload doesn't shuffle.
    const seed = hashString(`${athlete.athlete_id}|${days[0]!.iso_date}`);
    const rand = mulberry32(seed);

    const pattern = weeklyPattern(athlete, rand);
    pattern.forEach((slot, slotIdx) => {
      if (!slot) return;
      const iso = days[slotIdx % 7]!.iso_date;
      slot.forEach((entry, entryIdx) => {
        const tpl = pickTemplate(rand, entry.modality);
        const status: SessionStatus =
          iso < todayIso
            ? rand() < 0.85
              ? 'done'
              : 'missed'
            : 'planned';
        sessions.push({
          session_id: `demo-sess-${athlete.athlete_id}-${slotIdx}-${entryIdx}`,
          athlete_id: athlete.athlete_id,
          athlete_name: athlete.full_name,
          block_type: athlete.block_type ?? 'ACC',
          iso_date: iso,
          slot: entry.slot,
          start_hhmm: entry.slot === 'AM'
            ? ['06:00', '06:30', '07:00', '07:30'][Math.floor(rand() * 4)]!
            : ['17:00', '17:30', '18:00', '18:30', '19:00'][Math.floor(rand() * 5)]!,
          duration_min: tpl.dur,
          modality: tpl.mod,
          title: tpl.title,
          detail: tpl.detail,
          status,
          is_demo: athlete.is_demo,
        });
      });
    });
    void idx;
  });

  // Sort by iso_date, slot, start_hhmm so the drill panel is predictable.
  sessions.sort((a, b) => {
    if (a.iso_date !== b.iso_date) return a.iso_date.localeCompare(b.iso_date);
    if (a.slot !== b.slot) return a.slot === 'AM' ? -1 : 1;
    return a.start_hhmm.localeCompare(b.start_hhmm);
  });

  return {
    week_iso_start: days[0]!.iso_date,
    days,
    sessions,
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface DayEntry {
  slot: SessionSlot;
  modality: SessionModality;
}

// Returns 7-day pattern; each day is null (rest) or an array of entries.
function weeklyPattern(
  athlete: CohortRow,
  rand: () => number,
): (DayEntry[] | null)[] {
  const block = athlete.block_type ?? 'ACC';
  const heavy = block === 'REAL';
  const transition = block === 'TRANS';
  const twiceDaily = athlete.flags.twice_daily_today || heavy;

  // Default schedule. Index = weekday (0=Mon).
  const schedule: (DayEntry[] | null)[] = [
    [{ slot: 'AM', modality: 'run' }],                       // Mon
    [{ slot: 'AM', modality: 'strength' }],                  // Tue
    null,                                                     // Wed (rest)
    [{ slot: 'AM', modality: 'hyrox' }],                     // Thu
    [{ slot: 'AM', modality: 'erg' }],                       // Fri
    [{ slot: 'AM', modality: 'hyrox' }],                     // Sat
    [{ slot: 'AM', modality: 'recovery' }],                   // Sun
  ];

  if (twiceDaily) {
    schedule[1]!.push({ slot: 'PM', modality: 'run' });
    schedule[3]!.push({ slot: 'PM', modality: 'strength' });
    if (heavy) schedule[5]!.push({ slot: 'PM', modality: 'erg' });
  }

  if (heavy) {
    // Promote Wednesday to a moderate session in REAL blocks.
    schedule[2] = [{ slot: 'AM', modality: 'run' }];
    schedule[0]!.push({ slot: 'PM', modality: 'strength' });
  }

  if (transition) {
    // Trans blocks lean run-volume + a bit of erg.
    schedule[0]![0]!.modality = 'run';
    schedule[3]![0]!.modality = 'erg';
  }

  if (athlete.flags.test_today) {
    schedule[4]!.push({ slot: 'PM', modality: 'test' });
  }

  // Sprinkle small randomness without breaking determinism.
  if (rand() < 0.25 && schedule[5]) {
    schedule[5]!.push({ slot: 'PM', modality: 'recovery' });
  }

  return schedule;
}

export const MODALITY_LABEL: Record<SessionModality, string> = {
  strength: 'Fuerza',
  run: 'Carrera',
  hyrox: 'HYROX sim',
  recovery: 'Recuperación',
  erg: 'Erg',
  test: 'Test',
};

export const MODALITY_VAR: Record<SessionModality, string> = {
  // CSS variables — see globals.css. HYROX = brand orange (the only place
  // we lean into accent on the calendar). Strength = z2 (blue). Run = z3
  // (green). Erg = z4 (amber). Recovery = muted. Test = z5 (red).
  strength: 'var(--z2)',
  run: 'var(--z3)',
  hyrox: 'var(--accent)',
  recovery: 'var(--muted)',
  erg: 'var(--z4)',
  test: 'var(--z5)',
};
