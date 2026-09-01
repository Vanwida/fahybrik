// Demo persona — Marc Vidal · HYROX BCN 2026 · 42 days out · race-prep w2d4
// Mirrors WorkoutPlan.demo and TodayView.swift demo data, expanded for prototype.

const PERSONA = {
  name: 'Marc Vidal',
  initials: 'MV',
  raceName: 'HYROX BCN',
  raceDate: new Date('2026-06-18'),
  daysToRace: 42,
  block: 'MC3', week: 2, day: 4,
  recoveryPct: 72,
  hrv: { value: 58, delta: '▲', unit: 'ms' },
  sleep: '7h 12m', rhr: 48,
  weekly: { compliance: '5/6', volumeDelta: '+12%', rpe: 7.2 },
  carga: {
    ctl: 75, ctlTrend: '▲',
    atl: 63, atlTrend: '▲',
    tsb: 12, tsbLabel: 'fresco',
    acr: 1.1, acrLabel: 'normal',
    z34: 68,
    readiness: 78,
    polarization: { z12: 78, z3: 8, z45: 14 },
  },
  yesterday: {
    title: '100m Run · 50 Wall Balls',
    duration: '24:32', rpe: 8,
    coachNote: 'Bien metido. Mantén.',
  },
};

// Workout plan — mirrors WorkoutPlan.demo
const PLAN = {
  name: 'Sled Push + Wall Ball Circuit',
  format: 'For Time',
  durationEst: 52 * 60,
  blockContext: 'MC3 · sem 2 · día 4',
  zoneTargets: [
    { z: 'Z3', pct: 60 }, { z: 'Z4', pct: 30 }, { z: 'Z5', pct: 10 },
  ],
  equipment: ['Sled 50kg', 'Wall ball 9kg', 'PM5'],
  connections: [
    { label: 'Garmin', ok: true },
    { label: 'HR Strap', ok: true },
    { label: 'PM5', ok: false },
  ],
  warmup: [
    '5 min easy bike o jog',
    '10 air squats + 10 push-ups',
    '2 series · 5 wall balls técnica',
  ],
  coachNote: 'Mantén la cadencia controlada en run. Sled all-out.',
  segments: [
    { id: 1, title: 'Run 400m',                 kind: 'running', dist: 400, paceTgt: '4:30/km', zone: 'Z3' },
    { id: 2, title: 'Sled push 100m · 50kg',    kind: 'sled',    dist: 100,                     zone: 'Z5', load: 50 },
    { id: 3, title: 'Wall balls · 50 · 9kg',    kind: 'reps',    reps: 50,                      zone: 'Z4', load: 9 },
    { id: 4, title: 'Run 400m',                 kind: 'running', dist: 400, paceTgt: '4:30/km', zone: 'Z3' },
    { id: 5, title: 'Row 500m · TGT 240W',      kind: 'rowski',  dist: 500, powerTgt: 240,      zone: 'Z4' },
  ],
};

// Plan tab — 4 weeks of sessions (mes view)
const WEEK_PLAN = [
  { wk: 'W18', label: 'MC1 w4',  days: ['AM Strength · Z2 long', 'AM Threshold · Skill', 'AM Hyrox · Recovery', 'AM Strength · Mob', 'AM VO2 · Sled', 'AM Long', 'Rest'] },
  { wk: 'W19', label: 'MC2 w1', days: ['AM Strength', 'AM Threshold', 'AM Hyrox sim', 'AM Strength', 'Test 5K', 'Race-pace dress', 'Rest'] },
  { wk: 'W20', label: 'MC3 w1', days: ['AM Strength', 'AM Z3 Sharpen', 'PM Tempo', 'AM Strength', 'AM Race-pace', 'Dress rehearsal', 'Rest'] },
  { wk: 'W21', label: 'MC3 w2 (HOY)', current: true, days: ['Strength upper', 'Threshold 4×1k', 'Sled+WB ★', 'Mob', 'AM Z3 ·  PM Z2', 'Long', 'Rest'] },
];

// Day-by-day session list (Plan · semana view)
const TODAYS_SESSIONS = [
  { time: 'AM', title: 'Strength upper', duration: '52 min', status: 'done', summary: '52:18 · RPE 7 · ✓' },
  { time: 'PM', title: 'Sled Push + Wall Ball Circuit', duration: '~52 min', status: 'next', isHero: true },
];

// Daily morning check-in — fresh state values
const CHECKIN_QUESTIONS = [
  { id: 'soreness',  label: 'Soreness',       value: 3 },
  { id: 'mood',      label: 'Mood',           value: 2 },
  { id: 'motivation',label: 'Motivación',     value: 1 },
  { id: 'fatigue',   label: 'Fatiga',         value: 4 },
  { id: 'sleepQ',    label: 'Calidad sueño',  value: 1 },
];

// Onboarding step definitions — names + minimal shape (full UI per step)
const ONBOARDING_STEPS = [
  { id: 'welcome',     title: 'Bienvenido.' },
  { id: 'basics',      title: 'Datos básicos' },
  { id: 'background',  title: 'Tu pasado deportivo' },
  { id: 'history',     title: 'Tus carreras' },
  { id: 'onerm',       title: '1RMs' },
  { id: 'endurance',   title: 'Benchmarks de resistencia' },
  { id: 'stations',    title: 'HYROX · estaciones' },
  { id: 'threshold',   title: 'Anaeróbico / umbral' },
  { id: 'training',    title: 'Cómo entrenas' },
  { id: 'recovery',    title: 'Recuperación' },
  { id: 'goals',       title: 'Tu A-event' },
  { id: 'connect',     title: 'Conexiones' },
  { id: 'done',        title: '✓ Listo.' },
];

window.PERSONA = PERSONA;
window.PLAN = PLAN;
window.WEEK_PLAN = WEEK_PLAN;
window.TODAYS_SESSIONS = TODAYS_SESSIONS;
window.CHECKIN_QUESTIONS = CHECKIN_QUESTIONS;
window.ONBOARDING_STEPS = ONBOARDING_STEPS;
