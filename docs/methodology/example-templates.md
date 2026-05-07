# Example templates — placeholder anchors for Pablo

> **Status:** DEMO content, generated 2026-05-07. Pablo's real methodology
> replaces every section below before any athlete sees these. The DEMO tag
> in coach notes is the trigger to remove — search the DB for
> `DEMO — pending Pablo input` and you'll find every line that needs review.

There are **two demo template sets** seeded by separate scripts:

- **Set A — `seed_example_templates.ts` (5 templates, IDs 1-5)**: original
  élite-detail demonstration from task #19. Templates cover ACC × 1,
  TRANS × 1, REAL × 3 and exist to anchor the schema-fidelity discussion
  with Pablo (every Zod field, every per-segment lever).

- **Set B — `seed_day_paired_templates.ts` (6 templates, IDs 6-11)**:
  day-paired demonstration from task #21. Templates form three day-pair
  buckets across ACC / TRANS / REAL phases and exercise the 2x/day élite
  programming pattern, including AM↔PM template pairing via the new
  `templates.paired_with_template_id` column (migration 0003).

Both sets coexist in the DB by design — they're complementary, not
duplicates. The 5 in Set A demonstrate **detail density**; the 6 in
Set B demonstrate **day-pair structure + complementary session design**.
Pablo's real methodology will eventually replace one or both; the seed
scripts are idempotent and can be re-run safely as the content evolves.

Both sets are owned by the `Pablo (DEMO)` placeholder coach
(`pablo@fabrik.training`). Replace before launch.

Source for exercise references: `infra/scripts/seed_exercises.ts`
(yuhonas/free-exercise-db, MIT) + 8 official HYROX stations + 23
canonical cardio variants (run × 9, row × 5, ski-erg × 5, bike × 4) +
2 erg-recovery rows + 8 test protocols + 7 strength accessories +
3 mobility/prehab blocks, all seeded explicitly with discipline-specific
defaults.

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

1. Each template's content goes into the relevant seed script
   (`seed_example_templates.ts` for the original 5; `seed_day_paired_templates.ts`
   for the 6 day-paired ones — pick whichever set most closely matches
   the new methodology).
2. Remove the `DEMO — pending Pablo input` tag from coach notes.
3. Re-run `pnpm --filter @fahybrik/infra seed:templates` and/or
   `pnpm --filter @fahybrik/infra seed:day-paired` (both idempotent —
   updates existing rows by `(coach_id, name)`; pairings re-applied in
   second pass).
4. Move the placeholder coach record to a real Pablo user (or update
   `PABLO_COACH` in the seed scripts to match the real auth row).
5. Update this doc to match the final templates.

---

# Set B — 6 day-paired templates (task #21)

This second set demonstrates the **2x/day élite pattern** — élite hybrid
athletes train 2 sessions/day, 4-5 days/week. The Today screen and the
coach assignment flow need to know AM/PM pairs so that when one session
is shown, its complementary partner is visible above the fold (see
`/docs/ux/02-athlete-today.md`).

## Template list

| ID | Day position    | Format          | Block | Level | Duration | Pair      |
|----|-----------------|-----------------|-------|-------|----------|-----------|
| 6  | ACC w3 d2 AM    | strength_block  | ACC   | 2     | 60 min   | ↔ #7      |
| 7  | ACC w3 d2 PM    | tempo           | ACC   | 2     | 90 min   | ↔ #6      |
| 8  | TRANS w2 d1 AM  | intervals       | TRANS | 2     | 50 min   | singleton |
| 9  | TRANS w2 d3 AM  | hyrox_sim       | TRANS | 2     | 60 min   | singleton |
| 10 | REAL w1 d2 AM   | intervals       | REAL  | 3     | 55 min   | ↔ #11     |
| 11 | REAL w1 d2 PM   | circuit         | REAL  | 1     | 35 min   | ↔ #10     |

Pairing is stored bidirectionally in `templates.paired_with_template_id`
(self-FK with `ON DELETE SET NULL`). Day position is stored in
`templates.day_position` as a free-form text token for human readability.

## Schema additions (migration 0003)

```sql
alter table templates
  add column day_position text,
  add column paired_with_template_id bigint
    references templates(id) on delete set null;
```

A `paired_not_self_chk` constraint prevents self-references. Indexes on
both columns (partial: only non-null rows) keep query plans tight when
the Today screen and Plan view filter by these fields.

## Per-template rationale

### 6 — ACC w3 d2 AM: Lower body strength + accessory

**Why this anchors the pair.** The AM session is the **structural lever**
of the day. ACC week 3 is mid-block — athlete has accumulated 2 weeks of
volume and is ready for slightly higher absolute loads (78% 1RM × 5 reps
× 4 sets vs week 1's 75%). The session demonstrates:

- **6-segment pyramid:** main lift → posterior chain primary → unilateral
  bilateral → unilateral hinge (single-leg RDL — newly added accessory)
  → posterior chain finisher (glute-ham raise) → core. This is the
  movement-pattern coverage signature of élite lower-body strength.
- **Tempo prescription on every strength segment** — élite differentiator.
- **`single-leg-rdl` — added in catalog audit specifically because the
  template builder needs to support it.** The template-builder UX spec
  (line 41-54 of `docs/ux/05-template-builder.md`) requires every
  accessory referenced here to exist as a catalog row.
- **Coach note: AM/PM nutrition + recovery handoff** — explicit guidance
  that the PM Z2 long run (paired) needs carbs 60-90 min before, and
  the system should warn if HRV crashes overnight.

**What Pablo replaces.** Real % 1RM progression curve across the 4-week
ACC block, real accessory rotation (he may swap glute-ham raise for
nordic curl on different weeks).

### 7 — ACC w3 d2 PM: Z2 long run

**Why this is the day's keystone.** Despite being PM, this is **THE
session of the week** in ACC philosophy — it's where aerobic base is
built. The template demonstrates:

- **Single-segment design** — sometimes the right template is one
  perfectly-prescribed segment, not a circuit. The schema accommodates
  this (no minimum segment count).
- **HR ceiling discipline** — coach note: *"Si HR sube a Z3 sostenido →
  walk-jog 30s para volver a Z2. NO ajustar pace manteniendo HR alto"*.
  This is the kind of cue that defines coach-grade vs consumer-grade.
- **Decoupling target as a session-level KPI** — `<5%` as the
  pass/fail. The system can compute Pa:Hr decoupling automatically once
  Garmin data flows back; the template's coach note becomes the
  programmatic threshold.
- **Strength→endurance same-day pairing accommodation** — coach note
  explicitly handles the "AM was strength heavy" reality: extra carbs,
  hydration pre-load, contingency to swap to row Z2 if HRV crashes.

**What Pablo replaces.** Per-athlete LT1 HR formula (currently 142 bpm
default), per-athlete pace ceiling (currently `5:20-5:50 /km`).

### 8 — TRANS w2 d1 AM: Threshold intervals running (singleton)

**Why this is a singleton.** TRANS w2 d1 is the week's hardest running
session — paired with active recovery the next day, not a same-day PM.
Singleton design tells the system: *"don't suggest a complementary PM
session today."* Demonstrates:

- **`run-threshold-intervals` with full prescription** — 5 × 1 km at Z4
  with 90s jog recovery. Pace target individualized via the athlete's
  5K benchmark (system computes pace from `athlete_benchmarks`).
- **HRR60 as a tracked KPI** — heart-rate recovery in first 60 seconds
  post-rep. >25 bpm drop = excellent. The coach note explicitly calls
  this out so the analytics layer knows to extract and trend it.
- **Conditional execution gate** — *"NO hacer si HRV <-10% baseline o
  sleep <6h. Reschedule a d2."* Templates can declare their own
  preconditions; the system enforces them via the morning check-in
  (`docs/ux/02-athlete-today.md` daily check-in section).
- **Pace consistency target** — variation between rep 1 and rep 5
  becomes the readiness signal.

**What Pablo replaces.** Real recovery ratio (currently 90s — Pablo may
prefer 60s for more lactate-clearance focus, or 2:00 for more pace
preservation).

### 9 — TRANS w2 d3 AM: HYROX simulation half (singleton)

**Why this is the most complex template in the set.** 8 segments,
race-pace, mixed modality. Demonstrates:

- **8-segment alternating run+station structure** — every odd segment
  is `run-race-pace-intervals` 500 m, every even segment is a HYROX
  station at half-distance. The template is essentially the data
  structure that the iOS workout-execution screen renders as
  consecutive lap blocks.
- **Race-pace adjustments per segment** — Run #1 is race pace +5 s/km,
  Run #3 is race pace +10 s/km (heavy legs from sled), Run #4 is
  race pace flat. This is the kind of nuance that distinguishes
  practice from benchmark.
- **`ski-erg-race-pace-intervals` (NOT `hyrox-ski-erg`)** for the
  station-1 half — half-distance training is the cardio variant, not
  the race-day station slug. The full benchmark `test-hyrox-half-sim`
  uses different (eventually canonical) prescriptions; this template
  is **practice**, the test exercise is **benchmark**.

**What Pablo replaces.** The half-sim layout itself (Pablo may want
6 stations not 4, or different station selection per individual
weakness profile).

### 10 — REAL w1 d2 AM: Race-pace intervals + station tune-up

**Why this is the AM of the REAL pair.** REAL w1 means 6-8 weeks pre-A
event. Volume drops, specificity rises. Demonstrates:

- **3-block design**: race-pace runs (6 × 400 m) → BBJ tune-up →
  wall ball tune-up. Each block has a different intent: 400 m runs
  build neuromuscular race-pace memory; BBJ tune-up is precision +
  consistency (not max effort); wall balls are unbroken-set practice.
- **Recovery 75 s walk-jog (incomplete)** — simulates the post-station
  fatigue feel of race day, NOT lab-clean rest.
- **Conditional logic in coach note** — *"Si pace cae >3 s/km → cortar
  a 4 reps + descansar 48h"*. The session adapts on-the-fly.
- **Pair handoff to PM** — coach note gives explicit guidance to
  swap PM to lighter modality if AM cooked the athlete.

**What Pablo replaces.** Per-athlete race-pace target (currently
"~4:30 /km M / ~5:00 /km W" — derived from each athlete's benchmark).

### 11 — REAL w1 d2 PM: Recovery + skill

**Why this is the PM partner.** PM in REAL is **protected**. The session
has 3 explicit purposes: blood flow (row recovery), skill maintenance
(strict pull-ups, low volume), prehab (banded shoulder for high-volume
SkiErg + pull-up). Demonstrates:

- **`row-recovery` slug** — added in catalog audit specifically for
  this purpose. Generic "row" wouldn't communicate intent.
- **Strict pull-ups at low volume + low RPE** — the template
  intentionally leaves headroom (RPE target 5, NOT 8). Skill
  maintenance is not adaptation work.
- **Mobility/prehab blocks (`prehab-shoulder-banded-15min`,
  `foam-roll-lower-15min`) as full segments**, not afterthoughts. The
  catalog supports them as first-class rows.
- **Skip authority encoded in coach note** — *"IMPRESCINDIBLE skip si:
  HRV <-15% baseline, sleep <6h, soreness self-rating ≥4/5"*. The
  daily check-in feeds this directly.
- **Level 1 target_level** — this PM is approachable for any athlete
  level, NOT just podium contenders. It's the recovery-protection
  template every level needs.

**What Pablo replaces.** Skill segment selection (he may rotate
pull-ups → muscle-ups → ring rows depending on athlete history).

## Catalog audit additions exercised by these templates

The day-paired templates use rows added in the catalog audit:

- `row-recovery` (new — in template #11)
- `single-leg-rdl` (new — in template #6)
- `glute-ham-raise` (existed)
- `prehab-shoulder-banded-15min` (new — in template #11)
- `foam-roll-lower-15min` (new — in template #11)

The remaining audit additions (8 test protocols, other strength
accessories, `ski-erg-recovery`, `mobility-hip-flow-15min`) are
available for the template builder to compose Pablo's future templates;
they're not all consumed in the demo set, by design — the catalog
should outpace the demo coverage.

## Pairing semantics for downstream UI

When a template has a non-null `paired_with_template_id`, downstream
code should:

- **Today screen (athlete iOS):** show both AM and PM cards stacked
  above the fold (per `docs/ux/02-athlete-today.md` "2x/day pattern"
  section). The completed earlier session collapses with ✓ + summary.
- **Plan screen (athlete iOS):** weekly grid renders pairs as a single
  vertically-stacked cell so AM/PM relationship is immediately visible.
- **Coach assignment flow (dashboard):** when assigning the AM, prompt
  *"Asignar también la PM emparejada?"* with a default-yes affordance.
  Single-click bulk-assign for the day.
- **Analytics rollups:** training-load calculations should attribute
  the day's combined load to both sessions, not double-count.

When `paired_with_template_id` is NULL, treat as singleton — no implicit
PM session is suggested.
