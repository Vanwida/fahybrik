-- 0152: seed common mobility/activation movements as BASE exercises
-- (coach_id IS NULL — visible to every coach).
--
-- WHY
-- ---
-- Measured against the real catalog, not from memory: 79 exercises exist
-- today, and only 7 carry category = 'mobility'. Against a real coach's
-- photographed week, 19-22 of the ~47 items that still don't resolve to a
-- catalog exercise are mobility/activation work — Cat Cow, Bird Dog, Cobra
-- Pose, Hip Flexor Stretch, Cossack Squat, shoulder-accessory band work,
-- glute-activation drills. This is NOT the translation gap migration 0151 /
-- the GLOBAL_ALIASES expansion (2026-08-05, exercise-resolve.ts) already
-- closed — those were real catalog rows written in the other language. This
-- is genuine missing COVERAGE: the movement itself has no row to point at.
--
-- BASE, not per-coach — HARD RULE Nº0 (CLAUDE.md): a "Cat Cow" is a Cat Cow
-- for any coach on the planet, it is not anyone's methodology. A vocabulary
-- of common movements is OUR mechanism (the same reasoning that seeded the 8
-- official HYROX stations as base rows already); making every new coach
-- rebuild basic mobility from zero would charge them for a gap that is ours.
--
-- SOURCE OF THE LIST
-- -------------------
-- 21 of these 42 rows are the REAL, named movements from a real coach's
-- photographed week (web/tests/import/photo-e2e.test.ts's unresolved-name
-- corpus) — not invented. "Forward Leg Swing" from that same corpus is
-- DELIBERATELY not repeated here: it already resolves to the existing
-- `leg-swings` row via a GLOBAL_ALIASES entry added earlier the same day —
-- adding a second, near-duplicate row for it would be exactly the catalog
-- duplication this migration exists to prevent, not close a gap.
--
-- The remaining 21 extend that real corpus to the shoulder/hip/thoracic/
-- ankle/core-anti-rotation/glute-activation vocabulary any hybrid-training
-- coach would recognize and reach for constantly (World's Greatest Stretch,
-- Pallof Press, Face Pull, Clamshell, 90/90 Hip Stretch…) — common enough
-- that leaving them uncovered would just reproduce this same gap on the next
-- photographed week. Deliberately NOT exhaustive: 42 rows, not 200.
--
-- NAMES + CATEGORY/MODALITY — the two axes that do real damage if wrong
-- -----------------------------------------------------------------------
-- Names sourced from the real capture use the coach's OWN Spanish wording
-- ("Puente de glúteo", "Marcha desde puente de glúteo", "Isometría en puente
-- de glúteo") — the catalog is otherwise almost entirely English, but a
-- translated name the coach never wrote would not have matched their import
-- either. Their English equivalents are added as GLOBAL_ALIASES entries in
-- the SAME commit (exercise-resolve.ts), never invented as a second row.
--
-- category/modality were proposed with `guessMovement`
-- (shared/domain/exercises/classify.ts) and then reviewed BY HAND against
-- the real card each name came from, not accepted blind — a Cat Cow filed as
-- `strength` would materialize three sets with rest timers and silently stop
-- sending the athlete's structured run to the watch (same failure
-- `displayCategoryForModality`, web/lib/athlete/assignment-detail.ts:790-809,
-- already exists to paper over for the READ side — this migration is about
-- not causing the WRITE-side version of it). Two corrections `guessMovement`
-- alone would have missed, resolved with the full card in view instead of
-- the bare name: "Side Step Squat With Band" and "Extensión de cadera en
-- cuadrupedia" sit in the SAME real card as the other corrective/activation
-- glute work (Puente de glúteo, Single Leg Glute Bridge) and are filed as
-- `core` to match, not the generic `strength` a bare "band" keyword would
-- have proposed alone.
--
-- SLUGS — verified against the real catalog via psql before writing a single
-- line here (`select slug from exercises order by slug`), not assumed. Zero
-- collisions with the 79 that already exist; `exercises_slug_unique` (mig
-- 0132) would reject one anyway, but the point is never to find out that way.
--
-- ADDITIVE + IDEMPOTENT: `on conflict (slug) do nothing`, safe to re-run.
--
-- NOT APPLIED — written and verified against a disposable Neon branch only
-- (created, migrated, checked, deleted). Client sign-off owns when this runs
-- against production data; that decision is not this migration's to make.

insert into exercises (slug, name, category, modality, primary_muscle_groups, equipment, default_metrics_json, source) values
-- ── From the real photographed week (21) ────────────────────────────────────
('cat-cow', 'Cat Cow', 'mobility', 'mobility', array['spine','core'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('bird-dog', 'Bird Dog', 'core', 'core', array['core','glutes','shoulders'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('cobra-pose', 'Cobra Pose', 'mobility', 'mobility', array['spine','abdominals'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('hip-flexor-stretch', 'Hip Flexor Stretch', 'mobility', 'mobility', array['hip_flexors','quads'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('cossack-squat', 'Cossack Squat', 'mobility', 'mobility', array['adductors','hips','glutes'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('cable-external-rotation', 'Cable External Rotation', 'strength', 'strength', array['rotator_cuff','shoulders'], array['cable'], '{"rpe": true, "reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('band-pull-apart', 'Band Pull Apart', 'strength', 'strength', array['rear_delts','upper_back'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('prone-y-raise', 'Prone Y Raise', 'strength', 'strength', array['rear_delts','traps','rotator_cuff'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('prone-t-raise', 'Prone T Raise', 'strength', 'strength', array['rear_delts','rotator_cuff'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('serratus-wall-slide', 'Serratus Wall Slide', 'strength', 'strength', array['serratus_anterior','shoulders'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('band-scapular-retraction', 'Band Scapular Retraction', 'strength', 'strength', array['upper_back','rear_delts'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('scapular-push-up', 'Scapular Push Up', 'strength', 'strength', array['serratus_anterior','shoulders'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('diagonal-band-pull-apart', 'Diagonal Band Pull Apart', 'strength', 'strength', array['rear_delts','upper_back'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('banded-front-raise', 'Banded Front Raise', 'strength', 'strength', array['front_delts','shoulders'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('single-leg-glute-bridge', 'Single Leg Glute Bridge', 'core', 'core', array['glutes','hamstrings'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('glute-bridge', 'Puente de glúteo', 'core', 'core', array['glutes','hamstrings'], array['bodyweight'], '{"reps": true, "sets": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('glute-bridge-march', 'Marcha desde puente de glúteo', 'core', 'core', array['glutes','core'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('glute-bridge-isometric-hold', 'Isometría en puente de glúteo', 'core', 'core', array['glutes','core'], array['bodyweight'], '{"duration_seconds": true, "sets": true}', 'coach import sweep 2026-08-05'),
('hip-90-90-stretch', '90/90 Hip Stretch', 'mobility', 'mobility', array['hips','glutes'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('side-step-squat-band', 'Side Step Squat With Band', 'core', 'core', array['glutes','hips'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('quadruped-hip-extension', 'Extensión de cadera en cuadrupedia', 'core', 'core', array['glutes','hamstrings'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
-- ── Common hybrid-training vocabulary, extending the same regions (21) ──────
('worlds-greatest-stretch', 'World''s Greatest Stretch', 'mobility', 'mobility', array['hips','thoracic_spine','hamstrings'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('pigeon-pose', 'Pigeon Pose', 'mobility', 'mobility', array['hips','glutes'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('couch-stretch', 'Couch Stretch', 'mobility', 'mobility', array['hip_flexors','quads'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('frog-stretch', 'Frog Stretch', 'mobility', 'mobility', array['adductors','hips'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('ankle-dorsiflexion-mobilization', 'Ankle Dorsiflexion Mobilization', 'mobility', 'mobility', array['ankles','calves'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('calf-stretch', 'Calf Stretch', 'mobility', 'mobility', array['calves'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('inchworm', 'Inchworm', 'mobility', 'mobility', array['hamstrings','shoulders','core'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('walking-knee-hug', 'Walking Knee Hug', 'mobility', 'mobility', array['hips','glutes'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('leg-cradle', 'Leg Cradle', 'mobility', 'mobility', array['hips','glutes'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('scorpion-stretch', 'Scorpion Stretch', 'mobility', 'mobility', array['spine','hips'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('open-book-stretch', 'Open Book Stretch', 'mobility', 'mobility', array['thoracic_spine','shoulders'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('thread-the-needle', 'Thread the Needle', 'mobility', 'mobility', array['thoracic_spine','shoulders'], array['bodyweight'], '{"reps": true, "duration_seconds": true}', 'coach import sweep 2026-08-05'),
('shoulder-dislocates', 'Shoulder Dislocates', 'mobility', 'mobility', array['shoulders'], array['band_or_pvc_pipe'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('hip-cars', 'Hip CARs', 'mobility', 'mobility', array['hips'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('windmill-stretch', 'Windmill Stretch', 'mobility', 'mobility', array['hamstrings','thoracic_spine'], array['bodyweight'], '{"reps": true}', 'coach import sweep 2026-08-05'),
('standing-quad-stretch', 'Standing Quad Stretch', 'mobility', 'mobility', array['quads'], array['bodyweight'], '{"duration_seconds": true}', 'coach import sweep 2026-08-05'),
('fire-hydrant', 'Fire Hydrant', 'core', 'core', array['glutes'], array['bodyweight'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('monster-walk', 'Monster Walk', 'core', 'core', array['glutes','hips'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('clamshell', 'Clamshell', 'core', 'core', array['glutes'], array['resistance_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('pallof-press', 'Pallof Press', 'core', 'core', array['core','obliques'], array['cable_or_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05'),
('face-pull', 'Face Pull', 'strength', 'strength', array['rear_delts','rotator_cuff'], array['cable_or_band'], '{"reps": true, "sets": true}', 'coach import sweep 2026-08-05')
on conflict (slug) do nothing;
