# iOS redesign — backend gaps to build later

Captured during the faithful iOS athlete-app redesign (jun 2026). The UI for every screen
was built to the hi-fi handoff and wired to **honest empty states**: each screen renders real
data when the backend provides it and a truthful "aún no hay…" placeholder otherwise. This file
lists what the backend (and a few iOS wiring tasks) must provide for those screens to fill in.

Conventions: the iOS `APIClient` decodes with `.convertFromSnakeCase`, so endpoints return
**snake_case**; the Swift models the views already expect are noted per item.

---

## A. Backend endpoints / fields to build

### A1. Carreras — race overview  (ties to #31 `/api/athlete/race-context`)
`GET /api/athlete/race-context` → `CarrerasOverview { last_race, ia_report, station_benchmarks[], running_splits[], pace_drop_note?, history[] }`
- `RaceResultSummary`: `event_name, date, division?, total_time, run_time, stations_time, roxzone_time, standing_label?, delta_vs_previous?, total_seconds?` (`total_seconds` drives the evolution-chart bar heights).
- `StationBenchmark`: `station, time, delta, fraction(0–1), severity("better"|"slightly_worse"|"worse")`.
- `RunningSplit`: `label("k1"…"k8"), pace, height(0–1), severity`.

### A2. Carreras — IA weak-point report
Attached per race (source = methodology IA). Fields: `summary` (prose, e.g. "empuje de trineo y wall balls; RoxZone sobre la media Pro") + `recommended_groups[]` (e.g. "G03 · Ergómetros", "G09 · Circuitos f-r"). No endpoint exists.

### A3. Carreras — per-station detail
`GET /api/athlete/stations/{station}` → `StationDetail { station, technique_video_url?, last_time, benchmark_time, delta, severity, fraction, percentile_label?, trend[{label,height,time,severity}], sub_metrics[{label,value,unit?,emphasis?}], training[{title,group?,count?,next_label?,modality?}], ia_recommendation?, ia_objective? }`. (8 non-run HYROX stations.)

### A4. Carreras — running deep-dive
`GET /api/athlete/running-analysis` → `RunningAnalysis { threshold_pace?, vo2_estimate?, best_1k?, weekly_volume_km?, splits[], split_drop_note?, pace_zones[{zone,descriptor,pace,highlight}], progression[{height,pace,current}], training[] }`.
- NOTE: `weekly_volume_km` already comes live from `StatsService`; the view prefers the live figure so the two never disagree — backend can treat it as fallback. The rest (threshold/VO₂/best-1k/splits/zones/progression) currently render "—" until shipped.

### A5. Plan — week metadata
`GET /api/athlete/plan/week` currently lacks:
- `coach_name` and `microciclo_name` as discrete fields → subtitle can't say "Publicada por {coach} · microciclo «{name}»" (today shows the honest "Tu coach publica esta semana automáticamente").
- a denominator for the week counter → counter shows the coach's freeform `week_label` verbatim (no "N/M").
- per-session `is_test` / `session_kind` flag → the amber "test" badge (e.g. "Remo 2k test") cannot render.
- a reliable per-session `slot` ("am"/"pm") → AM/PM split is currently inferred (single-session days default to AM).
- per-session summary fields (`est_duration`, `blocks_count`, a short prescription line) → Inicio's hero/PM rows show "Mañana · Carrera" instead of the handoff's "≈55 min · 3 bloques · 5×1000m".

### A6. Inicio — publish-notice + streak
- **Publish-notice row** ("{coach} publicó tu semana N/M"): needs a real `published_at` / last-publish **event** signal. OMITTED until then (not faked).
- **Streak chip** ("🔥 N días"): no streak signal. OMITTED.

### A7. Chat / Perfil
- Coach **online presence / last-seen** field on the chat thread → enables the handoff's "en línea" (currently shows the honest role line, never fabricated).
- A `last_coach_message` field on the thread DTO → Inicio's coach-note row could show the message text (today shows the real unread **count** instead).
- Athlete **level** field on `/api/auth/me` (handoff "Nivel avanzado") → currently omitted; `división` is shown from the target race only.
- Voice-note **duration** in the chat message DTO (renders "audio" today).

### A8. Detalle de sesión — coach attribution + shared flag
- `coach_name` on the assignment-detail payload (only `ChatService` has it today) → enables "Generado y revisado por {coach}".
- The Dobles **shared-session 👥 flag** is not on `WorkoutPlan` (lives on `AssignmentInfo`/`PlanDay`) — see iOS wiring B1.

### A9. Dobles (4 endpoints — backend not shipped)
1. `GET /api/athlete/dobles/plan` → `{partner_name, partner_plan_visible, week_label, self_days[], partner_days[]}`; each day `{id, day_label, session_title, detail, togetherness(both_done|optional_together|each_own|joint_mandatory|rest), modality}`.
2. `GET /api/athlete/dobles/analytics` → `{partner_name, best_self, best_partner, doubles_mark, doubles_delta, contributions[{id,group,self_share}], weekly[{id,metric,self_value,partner_value}], head_to_head[], contribution_summary?}`.
3. `GET /api/athlete/dobles/session/{id}` → `{title, subtitle, self_name, partner_name, self_one_rm, partner_one_rm, exercises[{id,exercise,sets_reps,self_load,partner_load}]}`. Backend must **resolve each load over that athlete's own 1RM** (relates to `WorkoutItemParams` + station role a/b).
4. `GET /api/athlete/dobles/simulation` → `{title, day_label, intro, self_name, partner_name, coach_note, station_splits[{id,station,self_share,detail,split_note,flagged}]}`.
- Un-wired actions (no start endpoints): "Hacerla juntos", "Por mi cuenta", "Empezar simulación juntos".

### A10. Technique videos (cross-cutting)
No technique-video URL field anywhere (Detalle warmup, station detail). `TechniqueVideoPlaceholder` shows "Vídeo próximamente"; per-exercise "Ver técnica" appears only when a real `exercise_video_url` exists.

---

## B. iOS-side wiring follow-ups (NOT backend)

### B1. Detalle: pass the rich prescription into the brief  (biggest fidelity gap)
`PreWorkoutBriefView` receives a `WorkoutPlan` (live-execution shape), which **flattens blocks → a flat `[WorkoutSegment]` and drops the strength prescription**. As a result the strength table can't show **sets, %1RM (`loadPct`), RPE, rest**, and true block grouping (Calentamiento/Principal/Core) and the Dobles shared flag are lost.
FIX (small, iOS-only): thread the `AssignmentDetail` (or `assignmentId`, so the brief reads the already-populated `AssignmentDetailCache`) into `PreWorkoutBriefView`, then render the real `WorkoutBlock`/`WorkoutItem`/`WorkoutItemParams` (reuse `WorkoutItemParamsFormatter`). One `WorkoutContainer` change + the brief's table.

### B2. Detalle: quick-complete (skip-timer) path
The brief exposes only `onStart` (→ live ActiveWorkout) and `onClose`; there is no honest quick-complete. Add an `onQuickComplete(note, rpe)` callback (wired in `WorkoutContainer`) for sessions that don't need live tracking (e.g. strength) so the handoff's "Marcar completada ✓ + RPE" is real, not a disguised timer launch.

### B3. Detalle: AM/PM cross-session switch
The brief is handed one session; the sibling (AM↔PM) isn't passed (nav shows "1 sesión hoy"). Needs sibling-session linkage + a multi-session brief input to render the AM/PM switcher.

### B4. Perfil: app language preference
`Idioma` reflects device locale read-only. Add a stored preference + picker to make it actionable.

---

## C. Notes
- Every screen above is **built and faithful**; these gaps only govern when the empty states fill with real data.
- Items in A tie largely to **#31** (race-context) and the Dobles backend; B items are self-contained iOS tasks.
