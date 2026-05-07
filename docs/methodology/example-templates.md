# Example templates — placeholder anchors for Pablo

> **Status:** DEMO content, generated 2026-05-07. Pablo's real methodology
> replaces every section below before any athlete sees these. The DEMO tag
> in coach notes is the trigger to remove — search the DB for
> `DEMO — pending Pablo input` and you'll find every line that needs review.

These five templates exist to demonstrate the **élite level of detail** the
schema supports. They are anchors for three downstream conversations:

1. **Template builder UX** — the form must capture everything that appears
   here without "advanced settings" toggles.
2. **Workout execution UX (iOS)** — the per-segment data here is what the
   athlete reads at the top of each segment during the workout.
3. **Analytics rollups** — every numeric here (HR zone, pace target, power
   target, RPE) becomes a comparison axis when execution data flows back.

Source for exercise references: `infra/scripts/seed_exercises.ts`
(yuhonas/free-exercise-db, MIT) + 8 official HYROX stations + 23
canonical cardio variants (run × 9, row × 5, ski-erg × 5, bike × 4)
all seeded explicitly with discipline-specific defaults.

Coach: `Pablo (DEMO)` / `pablo@fabrik.training`. Replace before launch.

---

## Cardio modality vocabulary

Élite hybrid athletes do not log "running" generically. Every cardio
session has a discipline-specific intent and the catalog reflects this.
The following 23 canonical slugs exist as first-class catalog rows in
`category = 'cardio'` and are referenced directly by templates (no
indirection through a generic "running" placeholder):

**Running (9):**

| Slug | Pattern |
|---|---|
| `run-z2-long` | Aerobic base 60-120 min @ Z2, 70% HRmax, cad 174-180 |
| `run-tempo` | Sustained Z3 25-50 min, sub-LT, cad 178-184 |
| `run-recovery-jog` | Z1 active recovery 20-40 min, conversational |
| `run-threshold-intervals` | 4-8 × 1km @ Z4, ~90% LT, short jog rec |
| `run-vo2max-intervals` | 5-8 × 3 min @ Z5, full 1:1 jog recovery |
| `run-race-pace-intervals` | 6-12 × 400 m @ HYROX 1km pace |
| `run-strides` | 4-8 × 100 m fast (not max), neuromuscular |
| `run-fartlek` | Varied pace play, e.g. 1' hard / 2' easy × 10 |
| `run-hill-repeats` | 6-12 reps up a 4-8% hill, Z4-Z5 |

**Rowing (5, Concept2 RowErg):** `row-z2-long`, `row-tempo`,
`row-threshold-intervals`, `row-race-pace-intervals` (HYROX 1 km
specificity), `row-sprint-intervals`.

**SkiErg (5, Concept2):** `ski-erg-z2-long`, `ski-erg-tempo`,
`ski-erg-threshold-intervals`, `ski-erg-race-pace-intervals` (HYROX
station 1 specificity), `ski-erg-sprint-intervals`.

**Bike (4, road / indoor / Assault):** `bike-z2-endurance`,
`bike-tempo`, `bike-threshold-intervals`, `bike-vo2max-intervals`.

Each row carries `default_metrics_json` with the metric flags the
builder UI should render (time/distance/hr/calories/etc.), with
discipline-specific prescription detail (zone target, cadence ranges,
stroke rate, drag factor, recovery ratio) in `cues`. Templates
reference these slugs directly — the resolution layer in
`seed_example_templates.ts` includes a `CANONICAL_DIRECT_SLUGS` set
that bypasses any indirection for these names.

The 8 HYROX station slugs (`hyrox-ski-erg`, `hyrox-rowing`, etc.) are
**race-distance station references** with Open-division specs baked
in. They are NOT used as training intervals — for that use the
discipline-specific cardio variants (e.g. `ski-erg-race-pace-intervals`
for HYROX 1K split work, not `hyrox-ski-erg`).

---

## ATR phase mapping

The five templates cover the three ATR (Acumulación / Transformación /
Realización) phases with proportions that mirror a typical HYROX prep
cycle for an élite athlete: most variability lives in REAL because that's
where the structure has the most levers (race-sim, peaking, strength
maintenance, sharpeners).

| # | Block | Format          | Level | Duration | Why this exists                                                                                  |
|---|-------|-----------------|-------|----------|--------------------------------------------------------------------------------------------------|
| 1 | ACC   | circuit         | 2     | 75 min   | Show: long Z2 + submaximal strength circuit. No glycolytic. Volume engine for the cycle.         |
| 2 | TRANS | intervals       | 2     | 70 min   | Show: threshold work (Z3-Z4 fartlek) + station compound runs to introduce race-pace transitions. |
| 3 | REAL  | hyrox_sim       | 3     | 50 min   | Show: half-distance race simulation (4 stations + 4 runs) at race pace. Benchmark session.       |
| 4 | REAL  | intervals       | 3     | 55 min   | Show: peaking sharpener — Z5 sprints + station tune-up. Low volume, max intensity.               |
| 5 | REAL  | strength_block  | 3     | 65 min   | Show: standalone strength maintenance during REAL — heavy main lift + accessories.               |

---

## Per-template rationale

### 1. ACC — Volumen aeróbico Z2 + circuito de fuerza-resistencia

**Why this anchors the phase.** ACC is about *volume accumulation*. Pablo's
methodology should make it impossible for the athlete to mistake an ACC
session for a TRANS or REAL session — the heart-rate ceiling alone (Z2,
~140-148 bpm) signals the difference. The template demonstrates:

- A 50-min `run-z2-long` anchor with **pace ceiling** (5:40 /km cap) and
  **cadence target** (178 spm) — both are levers Pablo can tune per athlete
  based on their LT1 and running economy. The slug itself encodes the
  intent: this is an aerobic-base run, not a generic "running" entry.
- A 4-station circuit with **% 1RM cargas** (60-65%) — system needs to
  resolve `weight_pct_1rm` per athlete using their stored 1RM benchmarks
  (`athlete_benchmarks` table).
- **Tempo prescription** (3-1-1-0 on squat) — this is élite vocabulary
  that the template builder must support without translation.
- **RPE thresholds with auto-degression** ("if RPE >8 → drop to 55%") —
  surfaces a coaching protocol the iOS app will eventually enforce live.

**What Pablo replaces.** Real progression tables, real HR formulae for LT1,
real weight progression across the 3-4 weeks of the ACC block.

---

### 2. TRANS — Fartlek Z3-Z4 + estaciones HYROX específicas

**Why this anchors the phase.** TRANS is the bridge: athlete starts feeling
race intensity but volume drops. The template demonstrates:

- **`run-fartlek` with explicit recovery target** — "trote ACTIVO, no
  caminar" is the kind of cue that distinguishes coach-grade prescriptions
  from consumer apps. The slug indicates intent (varied pace play), the
  segment params carry the structure (5 × 4 min Z4 / 2 min Z2).
- **`ski-erg-race-pace-intervals` (NOT `hyrox-ski-erg`) for training reps**
  — this distinction matters. `hyrox-ski-erg` is the *race station* (1000 m
  full effort, station 1 of 8). `ski-erg-race-pace-intervals` is the
  training tool that builds toward it (3 × 500 m at race-pace 500m split).
- **Compound runs into stations** — the foundational HYROX skill: getting
  off the run with HR at Z4 and immediately producing on a station. The
  3 stations chosen (SkiErg, BBJ, wall balls) are the most aerobic-system
  taxing of the 8.
- **Power targets on SkiErg** (220 W M / 150 W W) — defaults that the PM5
  integration will feed back live; the template builder must accept watts
  as an alternative to splits.
- **Effort percentage as a separate lever from RPE** — RPE is subjective,
  effort_pct is objective; both are stored.

**What Pablo replaces.** Athlete-specific Z4 HR ranges, real wall-ball
reps based on individual unbroken capacity, station selection per
identified weakness.

---

### 3. REAL — Simulación HYROX media distancia (race pace)

**Why this anchors the phase.** This is the **benchmark session**. Pablo
runs this 6-8 weeks out from the A-event, then again at 3-4 weeks, and
compares splits + transitions + HR-recovery to track readiness.

The template demonstrates the fidelity needed for benchmarking:

- **All 4 inter-station runs use `run-race-pace-intervals`** — the slug
  itself is part of the prescription. When the athlete completes this
  template repeatedly, the analytics layer aggregates "performance on
  `run-race-pace-intervals`" as a coherent comparable across templates,
  not muddled with Z2 long runs or fartlek work.
- **Station 1 (SkiErg 1000 m) uses `hyrox-ski-erg`** because it IS the
  race station here, not a training interval. Slug choice signals intent
  to the analytics layer.
- **Per-segment pace target with race-pace anchoring** — every run segment
  references the athlete's current 5K time (e.g. "5K pace + 8-12 s/km").
  System needs to compute this per athlete from `athlete_benchmarks`.
- **HR zone progression across the workout** — Z4 → Z4 → Z4 → Z5 (final).
  The system can validate whether the athlete actually hit those zones
  via biometric stream rollups.
- **Heavy-leg pacing acceptance** — "aceptar pace +10 s/km los primeros
  200 m post-sled, recuperar pace en últimos 300 m". This is élite
  pacing IP that consumer apps can't replicate.
- **Pacing strategy per station** — wall balls broken 25-15-10, BBJ
  micro-respiration every 10 reps. These are the strategic decisions
  that win HYROX races.

**What Pablo replaces.** Real benchmark protocol (full race, half race,
which stations to substitute), real per-athlete pace formulas, real
allowed deviations before flagging readiness as "not on track".

---

### 4. REAL — Sprint intervals Z5 + station tune-up (peaking sharpener)

**Why this anchors the phase.** Peaking is where consumer apps fail
hardest — they keep pushing volume because their algorithm doesn't model
freshness. The template demonstrates:

- **`run-vo2max-intervals` for the 6 × 200 m sprint block** — even though
  the rep distance is short, the work-rest pattern (200 m sprint at >95%
  effort with 90 s recovery) is functionally a VO2max session, not a
  strides session. Slug choice respects intent over surface form.

- **Conditional execution gates** — "Si HRV bajo, sueño <7h, RPE de
  calentamiento >5 → reducir a 4 sprints o posponer". This is the kind
  of logic the ATR engine must support: a template can declare its own
  preconditions and the system can recommend skip/modify based on the
  athlete's morning biometrics.
- **Hard exclusion rules** — "no hacer en los 7 días previos al evento A".
  These rules need to be queryable (the coach dashboard cohort view
  should warn if a peaking sharpener lands inside the taper window of
  any athlete).
- **Tune-up volume calibration** — 6 × 200 m sprints (low volume), tune-up
  stations at 25-50% of race volume. The template captures the
  *philosophy* of taper through the volume choices themselves.

**What Pablo replaces.** Real readiness gates, real per-athlete pace
formulas for sprints (currently approximated as 5K time × 0.65), real
sequencing within the 14-day pre-race window.

---

### 5. Strength session — Lower body block (REAL phase)

**Why this anchors the phase.** Strength maintenance during REAL is a
common failure point in HYROX training — coaches drop strength too early
and athletes lose force production right when stations need it. The
template demonstrates:

- **Maintenance-not-PR philosophy encoded in load prescription** —
  85% 1RM × 3 reps × 5 sets is high intensity but submaximal for a true
  3RM. The system must distinguish "maintenance" from "build" loads.
- **Conditional load reduction** — "si race en <10 días → reducir cargas
  a 70% y cortar volumen 30%". Template-level conditional logic against
  the calendar.
- **Tempo + bilateral/unilateral mix** — squat (bilateral, primary) →
  RDL (bilateral, posterior chain) → BSS (unilateral) → calf raise
  (prevention) → core finisher. Élite programmers care about this
  movement-pattern coverage; the template builder UX should make it
  visible.
- **Cross-modal session pairing rules** — "no mezclar con sesión cardio
  fuerte el mismo día (mín 6h separación)". Template-level pairing
  constraints inform the iOS Today screen ordering.

**What Pablo replaces.** Real % 1RM progression across the REAL block,
real accessory selection per athlete weakness profile, real session
spacing rules.

---

## What the schema captures that the templates exercise

Concrete demonstrations of schema fields the example set hits:

- `templates.format` — all 5 formats present except `amrap`/`for_time`/
  `emom`/`tempo` (those will appear in Pablo's expanded set).
- `templates.target_block` — ACC, TRANS, REAL all present.
- `templates.target_level` — int 1-3 (internal scale; 1=novice élite,
  2=club competitor, 3=podium contender).
- `template_segments.params_json` — every key from the Zod
  `segmentParamsSchema` plus extension keys carried forward into
  jsonb: `pace_target`, `power_target_watts`, `cadence_target_spm`,
  `stroke_rate_target_spm`, `effort_pct`, `rounds_label`.
- `template_segments.notes` — coach-grade prose per segment, not generic
  exercise descriptions.

The decision to keep extension keys (pace_target, power_target_watts,
etc.) in `params_json` rather than promoting them to columns is
intentional — they're high-cardinality but optional. If a key proves
universal across templates after Pablo's input, promote it to the Zod
schema in `shared/schema/templates.ts`.

---

## Replacing this content

When Pablo sends real templates:

1. Each template's content goes into `infra/scripts/seed_example_templates.ts`
   (the `TEMPLATES` const array).
2. Remove the `DEMO — pending Pablo input` tag from coach notes.
3. Re-run `pnpm --filter @fahybrik/infra seed:templates` (idempotent —
   updates existing rows by `(coach_id, name)`).
4. Move the placeholder coach record to a real Pablo user (or update
   `PABLO_COACH` in the seed script to match the real auth row).
5. Update this doc to match the final templates.
