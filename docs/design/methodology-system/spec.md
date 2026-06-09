# Sistema de Metodología — Pase de Diseño (v1)

> Estado: **propuesta, pendiente de sign-off de Alex.** Nada se codifica hasta aprobación (regla UX del proyecto).
> Modelado con build-right: dominio completo → stress-test contra 12 sesiones reales de Pablo → fan-out de 5 agentes → auto-QA. Cada default cita su origen real.

---

## 1. Qué es y qué hueco llena

**Objetivo:** capturar el cerebro metodológico del coach en **estructura**, para que la IA seleccione y adapte plantillas como lo haría él (template+IA, **no** IA generando desde cero).

**El hallazgo que define el sistema:** la prescripción *por ejercicio* YA está estructurada (migración `0043` / `shared/domain/prescription/types.ts`: `PrescriptionSet` = medida × objetivo × modalidad). Las plantillas y bloques también. Lo que **no existe en ninguna parte** es la **capa de decisión**: *cómo* Pablo elige, secuencia, progresa y adapta. Hoy eso vive como texto libre en `coach_notes`/`template_segments.notes`, o directamente no existe, y el corpus RAG está **vacío**.

Este formulario captura esa capa de decisión.

**Principio de modelado:** cada punto donde el atleta toca la app, la IA necesita la regla de Pablo. Se modela como **`CUANDO [condición] → [acción]`** siempre que sea posible (casi siempre) + texto narrativo **solo** con AI-assist para lo no parametrizable (filosofía, cues).

**Stress-test (pasado):** 12 sesiones reales del seed (`seed_day_paired_templates.ts`) — squat 4×5@78% RPE7, Z2 90min decoupling<5%, 5×1km Z4, media simulación HYROX, "HRV<-15%→swap run a row", "RPE>8 serie2→−5-10%", "pace drift>3s/km→corta reps", "soreness≥4/5→skip PM". Las 12 entran como (a) prescripción estructurada [resuelto en 0043], (b) regla condición→acción, o (c) cue narrativo. **Cero texto libre necesario para la lógica.**

---

## 2. El esquema de regla (núcleo reutilizable)

Una regla es común a todas las áreas; solo cambia el `trigger_phase`. Alineado con `daily_checkins` (0010), `athlete_daily_readiness_snapshots` (0017), `prescription_json` (0043), `week_adjustment_proposals` (0017).

```ts
type RuleCondition = {
  metric: ConditionMetric;          // enum (vocabulario §3)
  operator: '<'|'<='|'='|'>='|'>'|'between'|'trend_down'|'trend_up'|'in';
  value: number | [number, number] | string;
  unit: ConditionUnit;              // pct | ms | bpm | h | scale_1_5 | score_0_100 | s_per_km | s_per_500m | zone_1_5 | reps | count | days | points | enum
  source: 'checkin'|'wearable'|'live_sensor'|'logged_set'|'plan_state'|'derived';
  window?: string;                  // 'today' | 'last_7d' | 'rep1_vs_rep6' | 'session' | '2_consecutive'
};
type RuleAction = {
  verb: ActionVerb;                 // enum (vocabulario §3)
  params: Record<string, number|string>;
  requires_coach_approval: boolean; // true → genera week_adjustment_proposal (status=pending)
};
type Rule = {
  id; coach_id;
  area: 1..14;
  trigger_phase: 'pre_session'|'intra_session'|'cross_session'|'selection';
  scope: 'set'|'exercise'|'session'|'day'|'week'|'block'|'global';
  conditions: RuleCondition[];      // AND por defecto; group{op:'OR'} para alternativas
  actions: RuleAction[];
  priority: 'critical'|'high'|'medium'|'low';
  source: { template_id?; coach_note_excerpt?; authored: 'pablo'|'ai_suggested'|'system_default' };
  enabled: boolean;
};
```

### Resolución de conflictos (global)
1. **Prioridad:** `critical > high > medium > low`. Seguridad (overtraining, skip) anula progresión.
2. **Severidad dentro de igual prioridad:** se aplica la más conservadora — `skip > reschedule > swap_session > swap_modality > downgrade_intensity > keep`. Intra-sesión: `cut_reps`/`cut_sets`/`walk_jog` ganan a `scale_load`.
3. **Coherencia de dirección:** si dos reglas empujan opuesto (subir vs bajar), gana la que **baja** (principio ATR conservador). Excepción: en `REAL`/taper, `days_to_race` manda.
4. **Scope:** la regla de scope más específico gana a igual prioridad.
5. **Agregación temporal:** no se actúa por evento aislado — `*_consecutive`/`window` exigidos por diseño (anti-overreacción).
6. **Una propuesta por semana:** acciones cross-session de la misma `week_start` se consolidan en UN `week_adjustment_proposal` (la tabla ya impone `pending uniq (athlete_id, week_start)`).
7. **`requires_coach_approval`:** toda acción que reescribe el plan asignado es `pending` hasta que Pablo aprueba. Auto-aplicables: `notify_athlete`, `request_feedback`, `redistribute_week` menor, micro-ajustes intra-sesión.
8. **Pablo > IA:** `authored:'pablo'` siempre gana a `ai_suggested`/`system_default` ante igual prioridad/scope.

---

## 3. Vocabulario exhaustivo (condiciones / acciones)

### Condiciones (`ConditionMetric` | operador típico | unidad | fuente)
`hrv_delta_vs_baseline` `<`/`between`/`trend_down` pct wearable · `hrv_ms` `<` ms wearable · `resting_hr` `>`/`trend_up` bpm wearable · `resting_hr_delta_vs_baseline` `>` bpm wearable · `sleep_hours` `<` h wearable · `sleep_quality` `<=` 1-5 checkin · `soreness` `>=` 1-5 checkin · `fatigue` `>=` 1-5 checkin · `mood` `<=` 1-5 checkin · `motivation` `<=` 1-5 checkin · `stress_level` `>=` 1-10 checkin · `sub_score` `<` 0-100 checkin · `readiness_score` `<` 0-100 derived · `perceived_effort_presession` `>` 0-10 checkin · `rpe_live` `>=` 0-10 logged_set · `rir_live` `<=` reps logged_set · `pace_drift_intra` `>` s/km|s/500m live · `pace_consistency` `>`/`<` s/km live · `pace_vs_target` `>` s/km|pct live · `hr_zone_current` `=`/`>=` 1-5 live · `hr_above_ceiling_duration` `>` s live · `time_in_zone_pct` `<` pct derived · `decoupling` `>` pct derived · `hrr60` `<` bpm derived · `sessions_missed` `>=` count plan · `sessions_missed_consecutive` `>=` count plan · `days_behind_plan` `>=` days plan · `pct_plan_completed` `<` pct plan · `perceived_difficulty` `in` {too_easy,ok,too_hard} checkin · `rpe_vs_target_delta` `>` points derived · `pace_pr_trend` flat (plateau) derived · `load_progression_stalled` =true derived · `overtraining_composite` `>=` score derived · `days_to_race` `<` days plan · `block_phase` `in` {ACC,TRANS,REAL} plan · `is_taper_window` =true plan · `injury_flag`/`injury_active(area)` =true checkin · `missing_equipment(item)` =true plan · `modality_score(m)` `<=`/`>=` 1-5 derived · `level` 1-4 · `goal_type`/`division`/`age`/`sex`.

### Acciones (`ActionVerb` | params)
`keep` · `skip{session,reason}` · `swap_session{from,to_template|to_modality}` · `swap_modality{exercise,to_modality}` · `scale_load{pct:±N,scope}` · `set_load_pct_rm{to_pct}` · `cut_reps{to|by,scope}` · `add_reps{by}` · `cut_sets{to}` · `reduce_volume{pct,scope}` · `increase_volume{pct}` · `downgrade_intensity{to_zone|to_rpe|to_pace_offset}` · `upgrade_intensity{to_zone|to_rpe}` · `walk_jog{duration_s,until}` · `walk_break{duration_s}` · `cap_pace{ceiling}` · `cap_hr{ceiling_bpm|zone}` · `extend_recovery{between_reps_s|rest_hours}` · `reschedule{to_day,reason}` · `insert_session{type,duration_min}` · `remove_session{id}` · `redistribute_week{strategy}` · `deload_week{pct,keep_intensity}` · `lower_next_week{pct,dimension}` · `progress_next_week{pct}` · `repeat_block{phase}` · `advance_block{to_phase}` · `forbid_selection` · `require_swap(modality)` · `cap_intensity(zone)` · `set_emphasis{group_id,×mult}` · `set_station_loads{M|W}` · `select_level_variant{N}` · `flag_coach{severity,message}` · `notify_athlete{message,tone}` · `request_feedback{question}` · `set_adaptive_flag{flag}` · `no_op_log_only`.

---

## 4. Las 14 áreas (campos + defaults reales de Pablo)

> Convención: `campo | tipo | opciones/rango/unidad | default Pablo (origen) | obligatorio`. Tipos: select, multiselect, slider, number+unit, matrix, toggle, rule-builder, nl+ai.
> Reglas que aparecen en varias áreas viven UNA vez en el store de reglas (§2) con su `area`; aquí se citan por referencia.

### Área 1 — Filosofía & no-negociables `[selection/global]`
Capa de validación global: toda salida de la IA pasa por estos no-negociables antes de entregarse; si los viola → descarta y reintenta, o escala a Pablo.
- `hard_rules` | rule-builder | reglas CUANDO→ENTONCES con scope (global|block|group 1-10) | default: 14 reglas pre-cargadas (abajo) | sí
- `philosophy_narrative` | nl+ai | texto indexado a RAG por bloque ATR | default: filosofía por bloque | sí
- `keystone_session_by_block` | matrix | {ACC,TRANS,REAL} × keystone_group_id (FK 1-10) + protect_rule(never_skip|swap_if_fatigued|reduce_volume) | default: ACC→g5 Zona2 `never_skip`; TRANS→g4 Series Running `swap_if_fatigued`; REAL→g7 Simulaciones `reduce_volume` (seed #7 "SESIÓN MÁS IMPORTANTE EN ACC", #8 threshold) | sí
- `deload_policy` | matrix | every_n_weeks + volume_drop_pct(0-50) + keep_intensity | default: cada 4ª sem, −40% vol, intensidad mantenida | sí
- `intensity_spacing_min_hours` | number+unit | h | default: 6 (example-templates §5; seed #1 "PM en 6+ horas") | sí
- `max_consecutive_high_intensity_days` | number | 1-7 | default: 1 | sí
- `decoupling_target_pct` | number+unit | % | default: <5% Z2; >8%→−15% vol siguiente (seed #2,#7) | sí

**14 no-negociables pre-cargados** (resumen; viven en el store): máx 1 día alta intensidad seguido · ACC no glycolítico (flag) · Z2 long keystone never_skip (swap a row si HRV<-15%) · 6h entre fuerza pesada y otra sesión · deload semana%4 −40% vol · decoupling>8%→−15% vol · HRV<-10% o sleep<6h→reschedule benchmark · HRV<-15% o soreness≥4→skip PM protegida · REAL día≤7 forbid Z5 sharpeners (taper) · REAL día≤10 fuerza→−30% carga+vol · intervals: última rep=primera ±tol, si drift>umbral→corta reps · full-sim máx 1× en REAL · **completitud de prescripción**: fuerza sin {reps,carga,RIR/RPE,tempo,descanso}→forbid; run/ergo sin (medida+objetivo)→forbid.

### Área 2 — Periodización ATR `[selection]`
El atleta no la toca; ve su resultado (bloque actual, semanas a carrera) con vocabulario athlete-facing.
- `block_type` | select | ACC|TRANS|REAL (enum `atrBlockType`, `_primitives.ts:58`) | fijos | sí
- `block_label_athlete` | text (1/tipo) | — | ACC→"Acumulación", TRANS→"Intensificación", REAL→"Tapering/Realización" | sí
- `block_duration_weeks` | number+unit | 1-8 | ACC=5, TRANS=4, REAL=3 (ground-truth `assignment_microciclo`; coherente con day_position w3/w2/w1) | sí
- `block_objective` | multiselect | volumen_aerobico|densidad_muscular|umbral_anaerobico|lactate_clearance|pace_consistency|especificidad_carrera|peaking_freshness|mantenimiento_fuerza | ACC=[volumen_aerobico,densidad_muscular]; TRANS=[umbral_anaerobico,lactate_clearance,pace_consistency]; REAL=[especificidad_carrera,peaking_freshness,mantenimiento_fuerza] (coach_notes) | sí
- `block_intensity_ceiling` | select | Z2|Z3|Z4|Z5 | ACC=Z2, TRANS=Z4, REAL=Z5 | sí
- `block_sequence_order` | number | 1..n | ACC=1→TRANS=2→REAL=3 | sí
- `assignment_unit` | toggle (read-only) | block | `block` (no week/month — las semanas salen solas) | sí
- `block_count_to_race` | matrix expandible | int/celda | macrociclo único ACC(5)+TRANS(4)+REAL(3)=12 sem; si <12 sem, recortar desde inicio de ACC (REAL siempre completo) | sí — **[confirmar con Pablo: multi-macrociclo para carreras lejanas]**

Reglas: `weeks_to_race==3→set_block(REAL)`; `REAL & weeks_to_race<=1→taper profundo`; `weeks_to_race<12→truncate_block(ACC)`.

### Área 3 — Progresión intra-bloque `[selection]`
Misma plantilla sube carga/volumen sola semana a semana; deload marcado como "semana de descarga".
- `progression_shape_volume` | select | lineal|escalon|onda | ACC=lineal | sí
- `progression_shape_intensity` | select | lineal|escalon|onda | ACC=escalon (75%→78%/sem), REAL=onda (mantiene) | sí
- `weekly_volume_delta` | number+unit | % | ACC +5-10%/sem hasta deload | sí
- `intensity_ramp_strength` | number+unit | % 1RM | ACC 60-80%, REAL 80-87% ("MANTENER fuerza, no PR") | sí
- `target_rpe_by_block` | matrix | bloque × tipo trabajo, RPE 1-10 | ACC fuerza 7/circuit 6; TRANS 8; REAL strength 8/race-sim 9 | sí
- `deload_trigger` | select | every_n_weeks|last_week_of_block|readiness_based|none | last_week_of_block + readiness overlay | sí
- `deload_volume_reduction_pct` | slider | 10-50% | −15% (seed "bajar volumen 15%"); −30% pre-race | sí
- `deload_intensity_reduction_pct` | slider | 0-40% | REAL pre-race −15-18% (85%→70%); deload normal solo baja volumen | sí

Reglas: `decoupling>8→reduce_volume(15) next week`; `pace_drift>5s/km→cut a 4 reps`; `ACC week++→increase_load(3%)`; `weeks_to_race<10 strength→reduce a 70%+vol −30%`; `REAL→hold_load(85%×3)`.

### Área 4 — Estructura semanal `[selection]`
- `sessions_per_week_by_level` | matrix | nivel × disponibilidad, int 3-14 | L1=4, L2=6, L3=8-10 (élite 2x/día 4-5 días) | sí
- `two_a_day_enabled_by_level` | matrix | toggle | L1=no, L2=parcial, L3=sí | sí
- `modality_mix_pct` | matrix | bloque × modalidad (run/erg/strength/hyrox-sim/recovery), %=100 | ACC=Z2+strength dominante; TRANS=threshold+erg+estaciones; REAL=race-sim+race-pace+strength-mant+recovery | sí
- `hard_easy_pattern` | select | hard_easy_alt|2hard_1easy|block_undulating | hard_easy_alt | sí
- `am_pm_pairing_rules` | rule-builder | pares modalidad | strength(lower)→Z2 long; intervals(race-pace)→circuit recovery; gap≥6h | sí (si 2x/día)
- `non_adjacent_session_types` | multiselect-pairs | — | {threshold,strength}, {threshold,intervals} no pegados | sí
- `key_session_per_week` | select/bloque | format | ACC=Z2 long; TRANS=threshold; REAL=hyrox_sim | sí
- `min_separation_strength_cardio_hours` | number+unit | 0-12 | 6 | sí
- `rest_day_placement` | select | post_hardest|mid_week|pre_race_sim|fixed | post_hardest_session | sí

### Área 5 — Modelo de zonas e intensidad `[derivación por atleta]`
Traduce "Z2/@RPE7/race pace/split 2:00" → número concreto por atleta usando los benchmarks del onboarding. **Las fórmulas se definen una vez; se evalúan por atleta.** Salida = `Target` válido del modelo 0043.
- **HR:** `hr_zone_count`=5 (locked, HR_ZONE_MAX=5) · `hr_anchor`=LTHR (`lthr_bpm`→fallback `max_hr_bpm`→Tanaka 207−0.7·edad) · `hr_zone_matrix` % de LTHR: Z1≤0.81 · Z2 0.82-0.88 (→138-148 con LTHR168) · Z3 0.89-0.94 · Z4 0.95-1.02 (→160-171) · Z5≥1.03 (→≥173). Salida `Target{hr_zone}` + `{hr_bpm,min,max}` resuelto.
- **Pace run:** ancla `5K` (`time_5k_seconds`→pace5K; fallbacks 10K/1milla/threshold). Offsets s/km sobre pace5K: Z1 +95..125 · Z2 +75..95 · Z3 +35..50 · Z4 +5..15 · Z5 −20..−10 · HYROX race +50..60. Salida `Target{pace,per_km}`.
- **Ergo:** ancla row `2K` (split2K), ski `1K`. Offsets s/500m sobre split2K: Z1 +20..25 · Z2 +12..18 · Z3 +5..9 · Z4 +0..4 · Z5 −8..−3. Bike %FTP Coggan (Z2 56-75%…). Salida `Target{pace,per_500m}` / watts.
- **Ajustes de máquina** (damper/stroke) = params del segmento, NO intensidad (no caben en Target): SkiErg damper 6-8/stroke 28-32; Row recovery 3-5/18-20; Row work 5-7/26-30.
- **RPE/RIR:** escala `RPE_0_10_CR10` (RPE_MAX=10). RIR por bloque: ACC 2-3, TRANS 1-2, REAL 1-2. Tabla `rpe_to_pct1rm_table` (RTS) para resolver kg cuando hay RPE+reps sin %RM.

Reglas: `lthr presente→anchor LTHR`; `lthr ausente→LTHR≈0.88·HRmax`; `sin HR→Tanaka, marcar zona "estimada, testear w1"`; `label="race pace" & a_event→pace=goal_time/8000m`; ver Área 7 para HR>techo Z2.

### Área 8 — Tests & benchmarks `[recálculo]`
Cada test → un campo del onboarding → un ancla → las zonas/cargas. Re-test recalibra.
- `test_catalog` | matrix | test × {slug, modality, protocolo, output_field, feeds_anchor} | 17 tests: `1rm_back_squat/deadlift/bench/ohp/clean` → `one_rm_*_kg` (cargas %RM); `pullups_max`; `tt_5k`→`time_5k_seconds` (zonas pace); `tt_1mile`; `tt_2k_row`→`time_2k_row_seconds` (zonas erg); `tt_1k_ski`; `ftp_20min`→`ftp_watts`; `lthr_30min`→`lthr_bpm` (todas zonas HR); `hr_max`; `station_wallball/sled_push/bbj/farmer/sandbag_lunges`; `hyrox_half_sim`. Todos los output_field verificados contra `OnboardingState`. | sí
- `test_cadence_mode` | select | block_start|every_n_weeks|on_plateau|manual | block_start | sí
- `test_schedule` | matrix | lthr+tt_5k+tt_2k_row → inicio de CADA bloque ATR; 1RM → inicio ACC+REAL (no TRANS, fatiga); stations → ACC+mid-TRANS; half_sim → cada 4-6 sem en TRANS; huecos onboarding → batería w1 ACC | sí
- `freshness_threshold_weeks` | number+unit | 1RM=12, pace/HR=6, stations=8 | sí
- `recalc_policy` | select | auto_on_result|propose_review|manual | **propose_review** (Pablo aprueba antes de mover cargas) | sí
- `oneRm_estimation` | select | Epley|Brzycki|Lombardi | Epley | sí
- `recalc_propagation` | matrix | nuevo 1RM_squat→%RM squat+accesorios; lthr→todas zonas HR; tt_5k→zonas pace; tt_2k/1k_ski→zonas erg; ftp→zonas bike | sí
- `progression_caps` | matrix | 1RM≤+7.5%/re-test, pace5K≤−3%/bloque; si excede→flag "verificar dato", no auto-aplicar | sí

Reglas: `onboarding vacío→test en w1 ACC`; `inicio bloque→re-test anclas`; `nuevo 1RM & Δ≤7.5%→propagar tras aprobación`; `sin 1RM>12sem→prescribir por RPE`; `HRV<-10% o sleep<6h día de test→reprogramar`; `race<10d→no tests 1RM/all-out`.

### Área 6 — Gates de readiness `[pre_session]`
- `hrv_skip_threshold_pct`=−15 · `hrv_modify_threshold_pct`=−10 · `sleep_min_hours`=6 · `soreness_skip_threshold`=4 · `presession_rpe_skip_threshold`=5 · `gate_logic`=ANY_triggers · `session_criticality`=key|complementary|optional · `default_modify_action`=swap_modality(run→row Z2 30min) · `coach_gate_note` (nl+ai).
- Reglas reales: `HRV<-15% O sleep<6h O soreness≥4→skip` (critical, seed #6); `HRV<-10% O sleep<6h (threshold)→reschedule d2` (high, seed #3); `HRV<-15% (post-fuerza ACC)→swap PM run a row Z2 30min` (high, seed #1); `RPE_pre>5 (complementaria)→skip` (medium, seed #6); `HRV trend_down & sub_score<40 & planned_rpe≥8→set_adaptive_flag+flag_coach` (high, 0010).
- `session_criticality` modula: si `key`, un skip de gate se degrada a `flag_coach+reschedule` (no se tira la sesión clave sin avisar a Pablo).

### Área 7 — Autorregulación intra-sesión `[intra_session]`
Señales en vivo (HR/pace/RPE por serie) → micro-ajustes inmediatos. Acciones intra auto-aplicables; las que tocan el plan futuro se difieren a un solo proposal al cierre.
- `rpe_redflag_threshold`=8 (serie 2) · `rpe_load_drop_pct`=−5..−10 · `pace_drift_cut_threshold`=3 s/km · `pace_consistency_passfail` (<2 excelente / 2-5 ok / >5 cortar a 4) · `cut_reps_target`=4 · `hr_ceiling_zone`=Z2 · `hr_over_ceiling_action`=walk_jog(30s, until back_to_zone_2) · `hr_over_ceiling_duration_s`=120 · `time_in_zone_passfail` (<80%→next −10s/km) · `coach_live_rule` (nl+ai).
- Reglas reales: `RPE>8 serie2→scale_load(−5..−10%)` (seed #1); `RPE≥8 squat→set_load_pct_rm(73%)`; `RPE>6 serie1 accesorio→cut a 3×4` (seed #6); `pace_drift>3s/km rep1→6→cut a 4 + rest 48h` (seed #5); `pace_consistency>5→cut a 4` (seed #3); `HR Z3 sostenido>120s→walk_jog 30s` (seed #2); `time_in_zone<80% Z2→lower_next_week pace +10s/km` (seed #2).
- Anti-oscilación (histéresis): una acción no revierte la anterior en la misma sesión.

### Área 11 — Manejo de desviaciones `[cross_session]`
Batch nocturno + cierre de sesión. Casi todo toca el plan → genera propuestas para Pablo salvo bajo riesgo.
- `missed_sessions_window`=7d · `missed_skip_redistribute_threshold`=1 · `missed_deload_threshold`=3 consecutivas · `days_behind_threshold`=5 · `too_easy_action`=progress_next_week(+5%/upgrade) · `too_hard_action`=reduce_volume(−10%)+downgrade · `too_easy_consecutive_required`=2 · `plateau_weeks`=3 · `decoupling_regress_threshold`=8% · `overtraining_signals` (≥3 sostenidas 7d) · `coach_deviation_policy` (nl+ai).
- Reglas reales: `decoupling>8%→lower_next_week(−15% vol)` (seed #2); `days_to_race<10→set_load 70%+reduce_volume −30%` (doc §4); `taper_window & sharpener Z5→flag_coach` (doc §4); `overtraining≥3 señales 7d→insert recovery+flag(critical)`; `too_easy ×2→progress +5%`; `too_hard O rpe_vs_target>2→reduce_volume −10%+downgrade`; `plateau 3sem→repeat_block|flag`.
- **[confirmar con Pablo]:** `missed_consecutive≥3→deload` y thresholds de `too_easy`/`plateau` están marcados `system_default` (no cita literal del seed).

### Área 9 — Sustituciones (equipo/lesión) `[selection]`
Sustituir **preservando el estímulo** (patrón + sistema energético + carga relativa), no "algo parecido". Si no hay equivalente → escala a Pablo, no degrada en silencio.
- `substitution_graph` | rule-builder (grafo) | nodos=exercise_slug, aristas={target, alt, stimulus_match(exact|high|partial), movement_pattern, energy_system, condition(no_equipment|injury_area|space|noise), scale_factor} | sí
- `stimulus_dimensions` | multiselect | movement_pattern|energy_system|primary_muscles|load_type|contraction | un sustituto válido preserva ≥(pattern+energy_system) | sí
- `injury_contraindications` | matrix | area(Rodilla/Hombro/Espalda/Cadera/Tobillo/Muñeca) × forbidden_pattern × safe_alt | sí
- `station_cues_by_level` | matrix | estación(1-8) × nivel(1-4) × {cue_1_3, scale_M/W, load_M/W} | sí

**Grafo de las 8 estaciones** (patrón | sistema | alternativas | cue | carga M/W):
SkiErg (vert_pull, aero_thr) → row(high)/bike(partial); drive cadera, finish pasado caderas; 1000m Open. · Sled Push (horiz_push/squat, glyco) → sled_drag/prowler(high), squat pesado+lunge cargado(partial,flag); cuerpo bajo, pasos cortos; M+102/W+52kg. · Sled Pull (horiz_pull, glyco) → cable_row/pendlay(high), ring/TRX row(partial); hand-over-hand; M+53/W+28kg **[peso no en seed = estándar HYROX, confirmar]**. · BBJ (jump_plyo, glyco) → burpee+box jump(high), step-out(partial,rodilla); pecho al suelo, 2 pies; ~40 reps/80m. · Rowing (horiz_pull cíclico, aero_thr) → ski(high)/bike(partial); damper 4-6, 24-28spm; 1000m. · Farmers Carry (carry, aero+grip) → KB/DB carry(exact), suitcase(partial); postura alta; M 2×24/W 2×16kg. · Sandbag Lunges (lunge+carry, glyco) → BB/DB/goblet lunge(high), split squat(partial,rodilla); rodilla trasera al suelo; M 20/W 10kg. · Wall Balls (squat+vert_push, glyco) → med-ball/DB/BB thruster(high), air squat+band press(partial,hombro); hip crease bajo rodilla; M 6kg@3.05/W 4kg@2.74, reps 100/75.
Escalado wall-ball por nivel: N1 4kg / N2-N4 6kg M·4kg W; reps 60→75→100.

### Área 10 — Individualización por atleta `[selection]`
**Consume** campos del onboarding existentes (no los recrea); añade el *cómo* Pablo ajusta.
- Consumidos: `level`(trainingLevel 1-4), age/sex/weight/height, `hyrox_division`(pro/open/doubles/relay+age_group), `goal_type`(finish/time/podium)+goalShort/Mid/Long(nl), `availability`(7 días × program/other/rest + sessionMinutes 30-180), `equipment_available`(EquipmentItem + hasTrack/hasFlatRun), `injury_history`.
- Nuevos: `modality_profile` | matrix | modalidad × strength_score 1-5 (computado de benchmarks) | sí · `emphasis_weights` | matrix | methodology_group(1-10) × multiplier 0.5-2.0 | derivado del profile | sí — **[confirmar: tabla nueva `athlete_emphasis` vs columna existente]**
- Reglas reales: `strength≤2 & run≥4 (corredor fuerte/fuerza débil)→set_emphasis(g1 ×1.5, g9 ×1.3), mantener g4 ×1.0`; `run≤2→g4 ×1.5+g5 ×1.3`; `level=1→variante cargas bajas, 1/día, estaciones 50%`; `level≥3→2x/día, race-weight, full-sim`; `program_days≤3→cap_volume, priorizar keystones`; `session_minutes<60→cortar accesorios`; `goal=finish & races=0→técnica+Z2, no glycolítico`; `goal=podium→g7 ×1.5+g6 ×1.3`; `sex=female→station_loads(W)`; `age≥45→+1 recovery, g2 ×0.7, g8 ×1.3`; `injury_active→delegar a Área 9`; `division=doubles→ajustar volumen estación, flag`.
- `emphasis_weights` sesga la **selección** de bloques de la biblioteca (no genera ejercicios — coherente con template+IA).

### Área 12 — Prep competición HYROX `[selection/cross_session]`
- `sim_half_timing_weeks_out`={6,4} · `sim_full_timing_weeks_out`={3} (fuera de taper de 7d) · `sim_frequency_in_real`=cada_2_sem · `sim_pace_offset_vs_race`=+5s/km (half), +0 (full) · `compromised_run_offset_post_sled`=+10s/km primeros 200m · `transition_target_seconds`=5 · `taper_duration_days`=7 · `taper_volume_reduction_pct`=50 · `taper_keep_intensity`=sí · `sim_division`=open · `sim_format`=singles (enums `race_division`/`race_format` migr. 0046).
- **`station_strategy`** | matrix 8 estaciones × {tiempo M/W, peso M/W, fraccionamiento, cue respiración}: SkiErg 1000m ~4:00/4:30, stroke 28-32, damper 6-8 · Sled Push 50m, M+102/W+52, 4×12.5m · Sled Pull 50m, M+78/W+52 [confirmar] · BBJ 80m/~40 reps, micro-resp cada 5 · Rowing 1000m ~3:40/4:10, 26-30spm · Farmers 200m, M 2×24/W 2×16, 2×100m · Sandbag Lunges 100m, M 20/W 10 · Wall Balls 100/75 reps, 25-15-10 +5s resp.
- `race_week_protocol` | rule-builder día -7…0: -7 calidad moderada vol−50% sin Z5 · -5/-4 activación corta+1 set técnico/estación · -3 descanso+carga glucógeno · -2 rest · -1 activación 15-20min+strides · 0 warmup race-day (trote Z1 + 3×100m race pace + set técnico ligero).

### Área 13 — Nutrición / Fueling `[pilar estructurado]`
Reglas `CUANDO momento ENTONCES pauta (g/kg + g abs + timing)`. Modela g/kg **y** gramos absolutos (la IA resuelve por peso).
- Campos: `carbs_pre_endurance`=1.0 g/kg (40-60g) 60-90min antes · `carbs_post_glycogen`=1.0 g/kg <30min · `protein_post`=0.3 g/kg · `protein_post_strength`=30g · `carb_protein_ratio_post_threshold`=3:1 · `post_window_minutes`=30 calidad/60 general · `hydration_pre_load`=sí · `electrolytes_after_min`=>60 · `am_pm_handoff_rule` (rule-builder) · `race_day_nutrition` (rule-builder) · `narrative_guidance` (nl+ai).
- Reglas reales (8 del seed): pre_endurance carbs 1g/kg+hidratación · post_strength prot 30g+carbs · post_threshold 3:1 <30min · post_glycogen carbs1+prot0.3 <30min · between_am_pm (strength→endurance 6h+) recargar pre-PM · between_am_pm (PM recovery) carbs ligeros · post_recovery_evening carbs+prot+magnesio.
- **[confirmar con Pablo, no en seed]:** `race_morning` (carbs alto/baja grasa-fibra 2-3h antes) e `intra_race` (electrolitos si >70min) = estándar de mercado.

### Área 14 — Voz & comunicación `[gobernador de estilo global]`
Gobierna CADA mensaje IA→atleta; se inyecta como system-context en toda generación (no es retrieval ocasional).
- `tone` | multiselect ponderado (slider 0-100/eje) | motivador|técnico|estricto|cálido | default Pablo: motivador 60·técnico 80·estricto 50·cálido 40 | sí
- `why_depth` | select | ninguno|una_línea|párrafo | una_línea | sí
- `languages`={es primario, en fallback} · `address_form`=tú · `emoji_use`=nunca · `intensity_words`=sí ("vaciar tanque", "settle") · `checkin_feedback_style`=dato+acción.
- `sample_messages` | nl+ai | el coach fija sliders → la IA genera 4 muestras (pre-sesión, check-in, post-sesión, pre-carrera) → Pablo aprueba/edita el set que suena a él.

---

## 5. Modelo de datos (persistencia)

**Principio:** forma fija → tablas/columnas explícitas (convención del proyecto). El motor de reglas (estructura variable de aridad) → JSONB acotado, **mismo precedente que `prescription_json` (0043)**.

- `coach_methodology` (1 fila/coach) — escalares: hr_zone_count, hr_anchor, pace/erg anclas, rpe_scale, intensity_spacing_min_hours, max_consecutive_hi_days, taper_*, recalc_policy, oneRm_estimation, gate thresholds, voice (tone sliders, why_depth, languages, emoji, feedback_style).
- `methodology_blocks` (filas ACC/TRANS/REAL/coach) — label_athlete, duration_weeks, objective[], intensity_ceiling, order, progression shapes/deltas, deload policy.
- `methodology_zones` (coach × system{hr|pace|erg|power} × zone) — label, lower/upper, anchor, op, offset.
- `methodology_tests` (coach × test) — slug, modality, protocolo, output_field, feeds_anchor, cadence, freshness_weeks, recalc propagation.
- `methodology_weekly_structure` (coach × nivel) — sessions/week, two_a_day, modality_mix, hard_easy, key_session, am_pm pairs, forbidden_adjacent, rest_placement, min_gap_h.
- `methodology_substitutions` (coach × arista) — target_slug, alt_slug, stimulus_match, movement_pattern, energy_system, condition, scale_factor.
- `methodology_station_strategy` (coach × estación 1-8) — tiempos/pesos M/W, fraccionamiento, cue, escalado por nivel.
- `methodology_nutrition_rules` (coach × momento) — carbs/protein g·g/kg, ratio, window, hydration.
- **`methodology_rules`** (motor) — columnas tipadas: id, coach_id, area, trigger_phase, scope, priority, authored, source_template_id, source_excerpt, requires_coach_approval, enabled + **`conditions_json` JSONB**, **`actions_json` JSONB** (discriminated unions de aridad variable — justificación: precedente 0043).
- `athlete_emphasis` (atleta × group_id) — modality_profile + emphasis multipliers (estado por atleta, no metodología). **[confirmar vs columna existente]**

**Síntesis a RAG (cierre del loop):** un job serializa todo lo anterior a `methodology_documents` (+`methodology_chunks`). Separación dura: **reglas estructuradas = filtro determinista** (la IA filtra candidatas por SQL/reglas, no por embeddings); **narrativa + texto sintetizado = recuperación por embedding** (tono, "por qué" de Pablo, patrones de decisión históricos con `coach_verdict` de `week_adjustment_proposals` como señal de refuerzo). Una nunca contamina la otra.

---

## 6. Forma del formulario (UX)

- **First-run:** wizard guiado por las 14 secciones. Cada sección llega **pre-rellena con los defaults de Pablo** (badge "default Pablo · confirma") → edita/confirma, no escribe de cero. Barra de completitud, autoguardado, skip & resume.
- **Steady-state:** sección "Metodología" del dashboard, 14 tarjetas editables siempre, con completitud + last-edited por tarjeta.
- **Constructor de reglas (componente clave):** textarea en lenguaje natural → `[✦]` → la IA lo parsea a chips `CUANDO [métrica][op][valor] ENTONCES [verbo][params] · prioridad` → editable → guardar. Las reglas reales de Pablo vienen pre-cargadas como chips para confirmar/editar/desactivar.
- **AI-assist (2 modos):** (a) NL→estructura para reglas y mapeos a tags; (b) pulido para campos narrativos (filosofía, cues) — mejora claridad y señala qué falta.
- **Estados por campo:** vacío / prefilled-default / coach-edited / ai-suggested-pending.
- **Aviso de conflicto:** cuando dos reglas se solapan, hint "estas 2 reglas pueden solaparse — la prioridad decide".

```
┌─ Autorregulación · Nueva regla ────────────────────────┐
│ Dílo como se lo dirías a un atleta:                    │
│ ┌────────────────────────────────────────────────────┐│
│ │ si la HRV cae más de 15% cambio el run de la tarde ││
│ │ por remo Z2 de 30 min                         [✦]  ││
│ └────────────────────────────────────────────────────┘│
│ La IA lo entiende así — edita los chips:               │
│   CUANDO  [HRV ▾] [< ▾] [ -15 %]                       │
│   ENTONCES[swap ▾] [PM run ▾] → [row Z2 · 30min ▾]    │
│   Prioridad [alta ▾]              [ ✓ Guardar regla ] │
└────────────────────────────────────────────────────────┘
```

---

## 7. Items pre-cargados a confirmar con Pablo (no bloquean el diseño)

Son defaults que Pablo confirma/edita EN el formulario (es su propósito). No son huecos del modelo:
1. Multi-macrociclo: `block_count_to_race` asume 1 ciclo de 12 sem; si encadena varios ACC→TRANS→REAL para carreras lejanas, la matriz necesita fila "nº repeticiones".
2. Sled Pull pesos (M+78/W+52) = estándar HYROX Open, no del seed.
3. `race_morning` e `intra_race` (nutrición) = estándar de mercado, no del seed.
4. 2 reglas de desviación (deload por 3 missed; thresholds too_easy/plateau) = `system_default`, no cita literal.
5. Nutrición g/kg vs gramos absolutos (modelados ambos; confirmar preferencia).
6. `athlete_emphasis`: tabla nueva vs columna existente.

---

## 8. Plan de construcción (post-sign-off, fan-out)

Unidades independientes → agentes paralelos:
1. **Migraciones** (tablas §5) + seed de los defaults reales de Pablo.
2. **Shared** (`@fahybrid/shared`): zod schemas + domain types del motor de reglas (§2) + evaluador de conflictos (§2) + resolutor de zonas (§5, label→Target por atleta).
3. **Síntesis a RAG** (job estructurado→`methodology_documents`).
4. **Web** (dashboard): wizard + 14 secciones + componente rule-builder + endpoints AI-assist (NL→estructura, pulido) + generador de sample_messages.
5. **Verificación:** typecheck + lint + stress-test de las 12 sesiones reales contra el evaluador.
