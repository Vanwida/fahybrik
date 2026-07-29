# Flexr — Race Mode / Live Corner / Personal Odometry

**Status:** Draft for multi-model debate (not implementation-ready)  
**Date:** 2026-07-29  
**Brand framing:** **Flexr** = umbrella product/app. **FAHYBRID** = hybrid training product under the Flexr umbrella (coach–athlete system, methodology, plans). This spec is for a **race-day / live** surface that can ship as:

- a focused experience inside Flexr, and/or  
- a lightweight “external” race companion that still plugs into FAHYBRID athlete data when available.

**Working product name (race surface):** *Flexr Race* (or *Race Mode* inside Flexr)  
**Codename in this doc:** Race Mode  

**Audience for this document:** product + eng + design debate across different AIs/models. Prefer disagreement on tradeoffs over polite consensus.

---

## 1. One-liner

**Flexr Race** is a race-day system for HYROX (and hybrid races): personal distance/lap estimation without reliable indoor GPS, Apple Watch as the athlete’s “corner,” optional coach radio, and a shareable live board so friends and family follow the battle — not a map pin.

---

## 2. Why this exists (problem)

### 2.1 Athlete problems (race day)

| Pain | Why it hurts |
|------|----------------|
| Indoor GPS dies or lies in venues | Any “live map” product fails on the floor |
| Athletes lose lap count on the run loop | Cognitive load + crowd + fatigue |
| Athletes lose “which station / which of 8” | Structure is fixed but stress is high |
| No useful feedback mid-race | Looking at phone is bad; Watch must speak in haptics |
| Official timing is late or cold | Results boards ≠ emotional live experience for *your* circle |

### 2.2 Coach problems

| Pain | Why it hurts |
|------|----------------|
| Coach is in stands, athlete on floor | Voice doesn’t scale; timing decisions do |
| Hard to know splits / HR / whether athlete is on plan | Decisions become guesswork |
| Marking progress manually for the athlete is possible but not always available | Need **autonomous** path, coach path is optional upgrade |

### 2.3 Spectator / growth problems

| Pain | Why it matters for downloads |
|------|------------------------------|
| Friends/family can’t “follow” a normal HYROX the way they follow a marathon GPS tracker | High emotion, zero product |
| Official apps cover leaderboard/events, not *personal corner + coach + watch language* | Differentiation |
| Post-race is a PDF or slow results page | No shareable drama → no organic installs |

### 2.4 Market gap (positioning, not legal claim)

HYROX ecosystem already has official results, some event apps, and third-party live split products. **Do not compete as “official chip timing.”** Compete as:

> **Personal race OS:** Watch truth + optional coach + social live board + post-race story cards.

---

## 3. Brand & product boundaries

### 3.1 Flexr umbrella

- **Flexr** = parent brand / app shell (identity, accounts, race-day tools, possibly multi-sport later).
- **FAHYBRID** = training methodology product (coach Pablo model, plans, library, athlete app loop).
- Race Mode should feel **Flexr-native** on race day (simple, dramatic, wearable-first) while optionally **importing FAHYBRID context** (target race time, plan splits, athlete profile, historical runs).

### 3.2 Coupling rules (for debate)

| Mode | Behavior |
|------|----------|
| **Flexr-only** | Athlete can calibrate + race + share live without full FAHYBRID coaching stack |
| **Flexr + FAHYBRID linked** | Pulls race target, station plan, coach identity, training-derived pace model; post-race writes back splits/HR for coach analytics |
| **Hard rule** | Race Mode must not require cloud/coach to function for **self lap + odometry + haptics** (offline-capable core) |

### 3.3 What success looks like

1. Athlete finishes a HYROX never losing station/round awareness on the Watch.  
2. At least one non-athlete opens a live link and stays for the race (retention of attention).  
3. Finish card gets shared (Stories / WhatsApp).  
4. App Store narrative writes itself: *“Your corner on your wrist. Your people on the live board.”*

---

## 4. Goals & non-goals

### 4.1 Goals

- **G1 — Zero-coach autonomy:** count rounds + approximate run distance/laps with Watch + optional self-tap.  
- **G2 — Personal odometry:** distance estimate from cadence/stride model trained with outdoor GPS calibration protocol.  
- **G3 — Haptic language:** athlete can race mostly eyes-up; Watch communicates phase and lap via patterns.  
- **G4 — Optional coach corner:** simple progress marking + short “chips” (not chat).  
- **G5 — Spectate link:** real-time race board for circle; primary organic download loop.  
- **G6 — Honest UX:** never present estimates as official chip times; use `~` and confidence.  
- **G7 — Wow without necessity:** features can be “noise machines” if they don’t compromise safety/clarity.

### 4.2 Non-goals (v1)

- Official timing replacement or chip integration (unless later partnership).  
- Continuous indoor GPS map as primary UX.  
- Full video livestream from athlete phone as core (battery/heat/shame).  
- Free-text chat during race.  
- Multi-sport ultra engine (stick to HYROX-shaped races first).  
- Perfect millimeter indoor positioning.

---

## 5. Domain model (HYROX-shaped)

### 5.1 Race structure (canonical)

HYROX (individual) mental model:

```
for round in 1..8:
  RUN ~1000 m (venue loop; lap length unknown a priori)
  STATION[round]  // fixed order
```

Stations (standard order — confirm per event rules if variants):

1. SkiErg  
2. Sled Push  
3. Sled Pull  
4. Burpee Broad Jump  
5. Rowing  
6. Farmers Carry  
7. Sandbag Lunges  
8. Wall Balls  

**Doubles / relay / pro variants** = later extensions; model should not assume only individual forever, but v1 can hardcode individual.

### 5.2 Two counters (must not mix)

| Counter | Meaning | User language |
|---------|---------|---------------|
| **Round** | Which of the 8 run+station blocks | “Voy al 4” |
| **Track lap** | Loop count inside current 1 km run | “Vuelta 2 del km” |
| **Run meters (est.)** | Estimated meters into current km | “~640 m” |

UI must show these as separate concepts.

### 5.3 Phases

```
IDLE → WARMUP_CAL → ARMED → RUN_N → STATION_N → … → FINISH → RECAP
```

Optional: `TRANSITION` (walking to station / queue) — important for odometry gating.

### 5.4 Truth sources (priority)

1. **Athlete explicit action** (tap / Action Button) — absolute for that event  
2. **Coach explicit action** (optional) — absolute if athlete accepted coach link  
3. **Mode classifier** (run vs station family) — high confidence transitions  
4. **Odometry integration** — continuous estimate, never absolute alone  
5. **Plan clock / ETA** — derived, advisory  

Fusion rule of thumb:

- 2 independent signals agree → auto-advance + haptic  
- conflict → “doubt” haptic + wait for tap  
- odometry alone → display with `~` never as integer truth without qualification  

---

## 6. Feature set

### 6.1 A — Watch Race Face (athlete core)

**Always-on-ish race UI (minimal):**

```
ROUND / PHASE
big: RUN 4 · V~2   or   STATION · ROW
HR
+/- vs plan (optional)
meters ~ or last-km cue
```

**Primary athlete actions:**

| Action | Effect |
|--------|--------|
| Primary tap / Action Button | Context-dependent: +1 track lap **or** “close current block” (mode set pre-race) |
| Undo gesture (e.g. triple) | Revert last mark |
| Double-tap alternative | Same as primary for non-Ultra |
| Fist / AssistiveTouch option | Hands full (farmers/sled) — explore |

**Pre-race config:**

- Target finish time / station split plan (manual or from FAHYBRID)  
- Lap mode: *self-tap track laps* vs *meter budget* vs *hybrid*  
- Coach linked? Spectate public/unlisted?  
- Odometry profile required for “high confidence meters”?  

### 6.2 B — Haptic language

Athlete should recognize patterns blind. **Max ~5–6 patterns in v1.**

| Event | Pattern (proposal) | Notes |
|-------|-------------------|--------|
| +1 track lap | 1 short | Frequent; keep light |
| Last stretch of km | 1 short + 1 long | ~850–900 m est. or last lap if known |
| Km complete / go station | 2 long | |
| Enter station (detected or marked) | 3 short | |
| Station done → run | 2 short + 1 long | |
| System doubt / confirm | 4 micro | Needs tap |
| Off-plan warning (optional) | rigid single | Rate-limit hard |
| Coach chip | unique full pattern | Distinct from system |

**Anti-spam:** avoid informative haptics more often than ~every 30–40s on run; silence during station work except transitions.

### 6.3 C — Personal odometry (no race-day GPS)

#### Thesis

```
distance ≈ Σ (steps_i × stride_hat_i)
stride_hat = f_athlete(cadence [, effort_proxy]) × k_day × k_fatigue
```

Only integrate while phase == `RUN` (not stations, not queue shuffle if classifiable).

#### Signals

| Signal | Role |
|--------|------|
| Step count / cadence | Primary |
| Outdoor GPS historical + lab protocol | Train `f_athlete` |
| Day-of warmup or 1 marked venue lap | `k_day` |
| Mid-race “km closed” tap | Online recal of `k` for next runs |
| HR zone / pace intent | Disambiguate same cadence different stride |
| Vertical oscillation / motion class | Gate run vs walk vs station |

#### Accuracy expectations (honest)

| Context | Typical error band |
|---------|-------------------|
| Clean outdoor km, fresh calibration | ±1–3% |
| Outdoor, weeks after lab | ±2–5% |
| Indoor HYROX crowded | ±5–10% (sometimes worse with queues) |
| After mid-race realign tap | next km often ±3–6% |

**Never** market as official distance.

### 6.4 D — Calibration protocol (“Odometry Lab”)

Opt-in. Unlocks high-confidence race estimation.

**Product copy direction:**  
“Teach Flexr your stride. One session. Better lap estimates on race day.”

#### Protocol tiers

| Tier | Content | Quality |
|------|---------|---------|
| **Lite** | 1 km race pace + 1 km roxzone | Usable |
| **Standard (default)** | + easy + slightly fast | Good |
| **Pro** | Full map + retest cadence | Lab-like |

#### Standard session (proposal, ~25–35 min quality work + warm-up)

All **outdoor/track, flat, good GPS**, prefer race shoes.

1. **Warm-up** 8–10 min easy  
2. **A — Easy anchor:** 1 km easy conversational  
3. **B — Roxzone:** 1 km at race+15–30s/km **or** broken 300–400s with walk/shuffle inserts (simulates queue + reattach) — **mandatory for HYROX transfer**  
4. **C — Race:** 1–2 km at target race pace  
5. **D — Push:** 600–1000 m at race−10–15s/km  
6. **E — Fatigued-slower:** 1 km at race+10–20s (optional if volume high)  
7. **F — Form strides:** 4×80–100 m progressive (optional)  
Rest 2–3 min walk between hard blocks.

#### Model build (v1 engineering)

- Slice GPS into windows (5–10 s or 50–100 m)  
- Drop outliers (stops, GPS jumps, traffic lights)  
- Per cadence bin: median stride, sample count, pace distribution  
- Optional second axis: HR zone or labeled intent (`easy|roxzone|race|push`)  
- Persist **Odometry Profile** with quality score + expiry (e.g. 4–8 weeks or shoe change)

#### Day-of race

- Optional outdoor 1 km with GPS → refresh `k_day`  
- Or 1 marked indoor lap (athlete taps start/end at fixed landmark) → venue stride scale  
- Each completed km with athlete confirm updates online scale for remaining runs  

#### Profile quality gate

App should refuse “high confidence” badge if athlete only has easy runs, or coverage of race/roxzone bins is empty.

### 6.5 E — Mode classifier (run ↔ station)

HYROX **order is fixed** → classification is not open-world exercise recognition; it’s **“does motion match next expected phase?”**

Rough signatures (implementation detail later):

| Mode | Motion sketch |
|------|----------------|
| Run | Regular cadence, foot impacts |
| Ski | Vertical pull rhythm, low foot impact |
| Sled push | Short steps, high effort, low flight |
| Sled pull | Odd direction / pull pattern |
| BBJ | Long jumps + landings |
| Row | Seated drive cycle |
| Farmers | Loaded march, reduced arm swing |
| Lunges | Long step, vertical, asymmetric |
| Wall balls | Squat + upward extension peaks |

**v1.5 ambition:** auto phase advance when stable 20–40s match; else doubt + tap.  
**v1 shippable:** self-tap phase + odometry on run only.

### 6.6 F — Coach corner (optional)

Coach device (iPhone primary; Watch secondary):

**Big dumb controls:**

- Next station / close block  
- +1 run lap (for athlete)  
- Optional split mark  

**Chips (1-way, ≤ short string):**

Examples: `EMPUJA` · `BAJA` · `AGUA` · `VAS BIEN` · `+15 OK` · free 24–40 chars  

Athlete Watch: full-screen chip + strong haptic; auto-dismiss ~8s; no reply UX.

**Spectator feed may show coach chips** (drama) — privacy toggle.

### 6.7 G — Race Beacon (spectate / growth loop)

Athlete starts **LIVE** → link:

`flexr.app/live/<slug>` (example)

**Spectator board (web first, app optional):**

- Athlete name, division, wave  
- Current phase (RUN 3 → next station)  
- Progress bar 0–8 / %  
- Last station splits  
- HR (if shared)  
- +/- vs plan / ETA finish  
- Confidence of data (coach-marked vs auto vs estimate)  

**Notifications (opt-in followers):**

- Station completed + split  
- Enter wall balls  
- Finish + time  

**Privacy:**

- Unlisted link vs followers-only vs public club  
- Hide HR / hide coach chips / hide ETA  

**Post-race Finish Card (share):**

- Finish time, PB delta if known  
- Best/worst station  
- Coach calls count  
- “Tracked with Flexr”  

**Growth thesis:** each race converts N friends → installs. Spectate web should work without install; deep features / follow next race push install.

### 6.8 H — Pace Oracle (advisory)

Not core physics; derived:

- Preloaded station targets (coach/FAHYBRID/manual)  
- Running clock vs plan  
- ETA = remaining plan + current deviation × damping  

UI: on-pace / behind / crushing — for athlete (subtle) and spectator (dramatic).

### 6.9 I — Wow extras (backlog, not v1 blockers)

- Crew race boards (friends same event)  
- Club leaderboard live (Fabrik athletes)  
- Venue lap length crowd-sourced per event  
- Finish Reel auto-edit (15s)  
- Audio ambience stream (optional, privacy-heavy)  
- BLE/NFC venue beacons (Fabrik race kit)  
- Machine BLE (Concept2) if available — never depend  

---

## 7. MVP definition (what to debate as “first ship”)

### 7.1 Proposed MVP (“Noise + Trust”)

Must feel wow **and** survive a real indoor race:

1. Watch race face: round + phase + HR + self-tap  
2. Haptic language (≤6 patterns) + undo  
3. Odometry Lite/Standard lab + race estimate with `~`  
4. Race Beacon web board + finish card  
5. Optional: coach next/lap + 5 chips  

**Explicitly later:** full auto station classifier, crew modes, video, venue hardware.

### 7.2 MVP success metrics

| Metric | Signal |
|--------|--------|
| Activation | % of race starts that complete calibration lab before first race |
| Trust | % of km where athlete used undo/correct &lt; threshold |
| Autonomy | Races completed with zero coach marks |
| Virality | Unique spectate viewers / race; finish card shares |
| Retention | Spectator → install → own calibration within 14d |

---

## 8. UX principles

1. **Wrist is primary; phone is secondary; web is social.**  
2. **One gesture to rule the race** — no menus mid wall-balls.  
3. **Estimates look like estimates** (`V~2`, `~640 m`).  
4. **Fatigue UI:** late rounds → bigger numbers, stronger haptics, fewer secondary stats.  
5. **Fail safe:** if model confuses, ask for tap; never silently skip a station.  
6. **Premium hybrid aesthetic** (FAHYBRID/Flexr brand), athletic dense — not generic AI fitness chrome.  
7. **Safety:** no feature that encourages phone staring mid-sled; Watch haptics &gt; visual complexity.

---

## 9. Technical architecture (sketch for debate)

### 9.1 Clients

| Client | Role |
|--------|------|
| watchOS | Sensors, haptics, race face, offline core |
| iOS | Lab GPS session, LIVE session hub, coach UI, pairing |
| Web | Spectate board, finish card, marketing |
| Optional Android later | Spectate first; athlete later |

### 9.2 Session topology

```
[Watch sensors + taps]
        │
        ▼
[iPhone Race Runtime] ──offline buffer──► local truth log
        │
        ├──► cloud race session (if LIVE / coach / multi-device)
        │         ├── coach channel
        │         └── spectate channel (pub-sub)
        │
        └──► post-race writeback → FAHYBRID (if linked)
```

**Offline-first athlete core:** Watch+iPhone must keep counting if venue network dies.

### 9.3 Data objects (conceptual)

- `Athlete`  
- `OdometryProfile` (bins, model version, quality, expiry, shoe tag)  
- `CalibrationSession` (raw windows, GPS track refs, acceptance)  
- `RaceEvent` (venue, date, format individual/doubles…)  
- `RaceSession` (live state machine, privacy, links)  
- `PhaseEvent` (source: athlete|coach|auto|odom, timestamp, confidence)  
- `Split` (station/run, time, est meters, hr summary)  
- `CoachChip`  
- `SpectateSnapshot` (throttled public projection)  
- `FinishCard`  

### 9.4 Odometry pipeline

```
Lab GPS → clean windows → cadence/stride table (+ effort axis)
     → OdometryProfile

Race:
  motion gate → RUN?
  cadence → stride_hat
  steps × stride_hat × k_day × k_fatigue → meters_hat
  UI/haptics thresholds
  athlete confirm km → update k
```

### 9.5 Sync / latency

- Athlete self-view: local, &lt;100ms to haptic  
- Coach: target &lt;1–2s  
- Spectate: 1–3s acceptable; batch snapshots  
- Don’t stream raw IMU to cloud  

### 9.6 Privacy & permissions

- Motion, Health/HR, location **only for lab/outdoor cal** (race indoor should not require continuous location)  
- Live link tokens rotatable; expire after race + N hours  
- GDPR-friendly export/delete of race sessions  
- Clear disclosure: estimates ≠ official results  

### 9.7 Platform notes (Apple)

- Background workout session for continuous HR/motion  
- Action Button (Ultra)  
- HKWorkout / WorkoutKit considerations  
- Battery budget: race ~60–120 min continuous sensors  
- Haptic customization limits per watchOS version  

---

## 10. FAHYBRID integration (optional but valuable)

| FAHYBRID asset | Race Mode use |
|----------------|---------------|
| Target race / plan splits | Pace Oracle + +/- |
| Historical runs | Pre-seed odometry before formal lab |
| Coach identity | Coach corner auth |
| Athlete roster / club | Club live board |
| Post-race analytics | Station weakness, HR drift, plan adherence |

**Writeback:** structured splits + phase log + whether estimates/corrections happened (model quality loop).

---

## 11. Competitive / narrative positioning

**We are:**

- The **corner** (coach + watch language)  
- The **personal odometry lab** for indoor hybrid racing  
- The **social board** for your people  

**We are not:**

- Official HYROX timing  
- Marathon live GPS clone  
- Generic “start a run” watch app  

**App Store angle examples:**

- “Never lose your lap count again.”  
- “Your coach on your wrist. Your people on the live board.”  
- “Calibrate your stride. Race without GPS.”  

---

## 12. Risks & failure modes

| Risk | Mitigation |
|------|------------|
| Athletes trust meters as official | Copy + `~` + confidence; no “chip” language |
| Haptic spam → disable | Strict budget; presets Quiet/Race/Coach |
| Classifier false station skip | Fixed order + high threshold + mandatory confirm on doubt |
| Crowds destroy odometry | Roxzone lab + walk gate + mid-race k update |
| Network dead at venue | Offline core; spectate degrades gracefully |
| Battery death mid-race | Pre-race battery gate; Watch-only degraded mode |
| Scope creep (video, mesh, AI chat) | MVP freeze list in §7 |
| Official event rules / device bans | Athlete responsibility; design for Watch-only minimal |

---

## 13. Open questions for multi-model debate

Use these as structured disagreement points:

### Product

1. Is **Flexr** a separate App Store app or a mode inside FAHYBRID iOS? Tradeoff: distribution/virality vs unified athlete graph.  
2. Is spectate-first growth more important than athlete odometry trust in v1?  
3. Should coach features be v1 or strictly v1.1 (elite niche vs open amateur viral)?  
4. Individual HYROX only, or doubles in MVP?  
5. Free spectate forever vs gate advanced board behind install/account?

### Odometry / science

6. Is cadence→stride binning enough, or do we need effort-axis / ML on raw IMU from day one?  
7. How aggressive should day-of calibration be (friction vs accuracy)?  
8. What’s the minimum lab we can require without killing activation?  
9. Should we expose error bands to power users or only fuzzy UX?  
10. Indoor lap length: per-athlete mark vs crowd venue model vs meters-only (no lap integers)?

### Interaction

11. Single Action Button meaning: always “close block” vs always “+1 lap” vs adaptive by phase?  
12. Auto classifier: worth the false-positive risk in v1?  
13. Haptic vocabulary: fewer stronger patterns vs richer set?  

### Architecture

14. Watch-only degraded mode without phone in pocket — required for MVP?  
15. WebSocket vs SSE vs Firebase-style for spectate?  
16. How much FAHYBRID coupling before Flexr stops feeling independent?  

### Legal / brand / ops

17. Naming: Flexr Race vs standalone name for ASO?  
18. Liability copy when athlete miscounts following the app?  
19. Event organizer relationships: ignore vs partner early?

### Metrics / kill criteria

20. What kill criteria end the experiment (e.g. &lt;X% complete races without panic undo storms)?  

---

## 14. Suggested debate format for another AI

Ask the other model to:

1. **Attack** this spec: weakest assumptions, most expensive features, most likely race-day failure.  
2. Propose an **even thinner MVP** that still creates wow + downloads.  
3. Propose a **maximalist 12-month** version and say what to refuse.  
4. Redesign the **calibration protocol** for higher compliance (shorter) vs higher accuracy (longer) — pick one and justify.  
5. Choose **one** primary growth loop (spectate vs coach B2B clubs vs athlete utility) and cut features that don’t serve it.  
6. List **instrumentation** events needed to know if odometry is trusted.  
7. Write **anti-goals** they would add.  
8. If they disagree with “no GPS map,” defend an alternative that survives indoor multipath.

---

## 15. Appendix A — Example race-state machine (simplified)

```
ARMED
  on start → RUN_1, meters=0, lap=0

RUN_n
  on step/cadence → update meters_hat
  on +lap_tap → lap++
  on meters_hat > last_stretch_threshold → haptic last_stretch
  on close_km (tap|coach|meters≈1000+confirm) → STATION_n
  on undo → previous

STATION_n
  on close_station (tap|coach|auto_stable) →
    if n==8 → FINISH
    else → RUN_(n+1)

FINISH
  → build FinishCard, stop LIVE after grace
```

---

## 16. Appendix B — Example spectate snapshot JSON (illustrative)

```json
{
  "session_id": "…",
  "athlete": { "display_name": "Alex", "division": "Open Men" },
  "phase": { "type": "run", "round": 4, "label": "RUN 4" },
  "track": { "lap": 2, "lap_is_estimate": true, "meters_hat": 640, "meters_confidence": "medium" },
  "hr_bpm": 168,
  "plan": { "delta_s": 12, "eta_finish": "1:12:40" },
  "splits": [
    { "id": "ski", "status": "done", "time_s": 252 },
    { "id": "sled_push", "status": "done", "time_s": 228 }
  ],
  "last_coach_chip": { "text": "EMPUJA", "ts": "…" },
  "sources": { "phase": "athlete_tap", "meters": "odometry_v1" },
  "updated_at": "…"
}
```

---

## 17. Appendix C — Calibration acceptance checklist

Profile marked **race-ready** only if:

- [ ] ≥1 window cluster at race-pace cadence bins  
- [ ] ≥1 roxzone/slow cluster  
- [ ] GPS quality score above threshold (low gap ratio)  
- [ ] Same device family as race Watch (or transfer validated)  
- [ ] Profile age &lt; configured max weeks  
- [ ] Athlete confirmed shoe context (optional but recommended)

---

## 18. Document history

| Date | Note |
|------|------|
| 2026-07-29 | Initial draft from product brainstorm: live spectate, coach corner, autonomous lap/haptics, personal cadence–stride odometry lab, Flexr umbrella framing. For multi-model debate. |

---

## 19. Handoff blurb (paste to another AI)

> Here is a product/engineering draft spec for **Flexr Race Mode**: a HYROX race-day system under the Flexr umbrella (FAHYBRID = training product). Core ideas: (1) personal stride/cadence odometry trained via outdoor GPS calibration protocol for indoor distance without GPS, (2) Apple Watch haptic race language + self-tap autonomy, (3) optional coach chips/lap marking, (4) shareable live spectate board for downloads. Please critique assumptions, propose a thinner MVP, and disagree on growth loop priority (spectate vs athlete utility vs coach). Full spec follows.
