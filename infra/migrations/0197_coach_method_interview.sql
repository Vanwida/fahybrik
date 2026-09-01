-- 0197_coach_method_interview.sql
--
-- COMO ENTRENAS: las casillas del oficio + el parrafo espejo.
--
-- El oficio es metodo (HARD RULE N0): otro entrenador competente contestaria
-- distinto. Nace como DATO por coach, nunca como const. Las preguntas y las
-- casillas SI son mecanismo (el instrumento) y viven en
-- shared/domain/coach/method-interview-catalog.ts.
--
-- Una fila por coach. Vacío = la IA no imita. Plan/chat/MCP leen mirror_text
-- (o generated_mirror si no lo ha tachado). No es el recuadro de #23 (un
-- ensayo vacio). No es #25 (papers / estudio).
--
-- Columnas explicitas, sin JSONB. Los defectos NO viven aqui: no hay defecto
-- de metodo. Un coach que no toca nada no tiene fila.
--
-- NO copiar coach_methodology (0048): aquella horneo defectos en el DDL,
-- tiene 0 filas utiles y se lee una sola columna.
--
-- Aditivo. Idempotente. El runner envuelve el fichero en UNA transaccion
-- (sin begin/commit aqui) y corta por punto y coma.

create table if not exists coach_method_interview (
  id                 bigint      generated always as identity primary key,
  coach_id           bigint      not null references coaches(id) on delete cascade,
  majority_work      text,
  typical_day        text,
  typical_athlete    text,
  venue              text,
  start_from         text,
  block_length       text,
  within_block       text,
  if_date_crowded    text,
  easy_week          text,
  training_days      text,
  save_three         text,
  hard_day_place     text,
  two_hard           text,
  same_day_two       text,
  things_per_day     text,
  session_menu       text,
  must_write         text,
  prescribe_hard     text,
  race_like_when     text,
  never_programs     text,
  strength_role      text,
  easy_role          text,
  number_source      text,
  tests_used         text[],
  no_recent_number   text,
  measure_for_measure text,
  if_going_well      text,
  raise_variable     text,
  if_flat            text,
  bad_sleep_hard     text,
  skipped_day        text,
  published_voice    text,
  is_this_ok         text,
  box_stops          text,
  typical_day_other  text,
  save_three_other   text,
  never_programs_named text,
  box_stops_phrase   text,
  generated_mirror   text,
  mirror_text        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint coach_method_interview_coach_uq unique (coach_id),
  constraint coach_method_interview_majority_work_chk
    check (majority_work is null or majority_work in ('dated_race','several_races','get_stronger','mix')),
  constraint coach_method_interview_typical_day_chk
    check (typical_day is null or typical_day in ('run_endure','run_stations','heavy_lifts','multi_sport','depends')),
  constraint coach_method_interview_typical_athlete_chk
    check (typical_athlete is null or typical_athlete in ('beginner','trains_no_plan','experienced','no_profile')),
  constraint coach_method_interview_venue_chk
    check (venue is null or venue in ('box','track','home','whatever')),
  constraint coach_method_interview_start_from_chk
    check (start_from is null or start_from in ('from_race_back','from_gaps_forward','template_block','first_week')),
  constraint coach_method_interview_block_length_chk
    check (block_length is null or block_length in ('weeks_2_3','weeks_4_6','weeks_8_plus','weeks_not_blocks')),
  constraint coach_method_interview_within_block_chk
    check (within_block is null or within_block in ('same_dearer','same_family_character','general_to_specific','no_two_mondays')),
  constraint coach_method_interview_if_date_crowded_chk
    check (if_date_crowded is null or if_date_crowded in ('race_time','worst_now','what_i_develop','most_specific')),
  constraint coach_method_interview_easy_week_chk
    check (easy_week is null or easy_week in ('every_3_4','when_body_asks','just_before_race','no_easy_weeks')),
  constraint coach_method_interview_training_days_chk
    check (training_days is null or training_days in ('d3','d4','d5','d6','no_habitual')),
  constraint coach_method_interview_save_three_chk
    check (save_three is null or save_three in ('easy_intense_strength','specific_strength_easy','strength_strength_cond','long_intervals_easy')),
  constraint coach_method_interview_hard_day_place_chk
    check (hard_day_place is null or hard_day_place in ('start','mid','weekend','life_calendar')),
  constraint coach_method_interview_two_hard_chk
    check (two_hard is null or two_hard in ('never','if_different_plus_night','like_race_day','case_by_case')),
  constraint coach_method_interview_same_day_two_chk
    check (same_day_two is null or same_day_two in ('strength_first','technical_first','aerobic_first','never_together','depends_week')),
  constraint coach_method_interview_things_per_day_chk
    check (things_per_day is null or things_per_day in ('one','two_blocks','three','long_circuit')),
  constraint coach_method_interview_session_menu_chk
    check (session_menu is null or session_menu in ('types_combine','model_sessions','write_new','fixed_catalog')),
  constraint coach_method_interview_must_write_chk
    check (must_write is null or must_write in ('measure_target_rest','stimulus_ceiling','task_and_time','depends_easy_vs_hard')),
  constraint coach_method_interview_prescribe_hard_chk
    check (prescribe_hard is null or prescribe_hard in ('zones_from_test','pct_of_mark','watch_power_pace','rpe','mix')),
  constraint coach_method_interview_race_like_when_chk
    check (race_like_when is null or race_like_when in ('early','after_base','near_date','never_whole_session','no_race_day')),
  constraint coach_method_interview_never_programs_chk
    check (never_programs is null or never_programs in ('not_in_race','nothing_forbidden','cant_measure','athlete_cant_do_well')),
  constraint coach_method_interview_strength_role_chk
    check (strength_role is null or strength_role in ('pillar','support','specific','almost_none')),
  constraint coach_method_interview_easy_role_chk
    check (easy_role is null or easy_role in ('real_volume','active_recovery','technique_slot','almost_none')),
  constraint coach_method_interview_number_source_chk
    check (number_source is null or number_source in ('tests','watch','feel','all_three')),
  constraint coach_method_interview_tests_used_chk
    check (
      tests_used is null
      or tests_used <@ array['time_distance','strength_mark','threshold','simulation','almost_no_tests']::text[]
    ),
  constraint coach_method_interview_no_recent_number_chk
    check (no_recent_number is null or no_recent_number in ('publish_without','use_old','this_week_is_test','write_from_observation')),
  constraint coach_method_interview_measure_for_measure_chk
    check (measure_for_measure is null or measure_for_measure in ('dont_ask','ask_to_talk','ask_athlete_likes')),
  constraint coach_method_interview_if_going_well_chk
    check (if_going_well is null or if_going_well in ('same_dearer','more_race_like','follow_arc','look_no_recipe')),
  constraint coach_method_interview_raise_variable_chk
    check (raise_variable is null or raise_variable in ('minutes_or_sets','intensity','less_rest','more_specific')),
  constraint coach_method_interview_if_flat_chk
    check (if_flat is null or if_flat in ('dont_raise_talk','change_stimulus','more_recovery','ask_test','raise_anyway')),
  constraint coach_method_interview_bad_sleep_hard_chk
    check (bad_sleep_hard is null or bad_sleep_hard in ('shorter_same','empty_easy','cancel','move','depends_date')),
  constraint coach_method_interview_skipped_day_chk
    check (skipped_day is null or skipped_day in ('lost','move_next','weekend','depends_session')),
  constraint coach_method_interview_published_voice_chk
    check (published_voice is null or published_voice in ('numbers','numbers_plus_why','explain_block')),
  constraint coach_method_interview_is_this_ok_chk
    check (is_this_ok is null or is_this_ok in ('yes_no_short','question_back','cheer_and_tune')),
  constraint coach_method_interview_box_stops_chk
    check (box_stops is null or box_stops in ('less_volume','less_load','change_exercise','continue')),
  constraint coach_method_interview_note_len_chk
    check (
      (typical_day_other is null or char_length(typical_day_other) <= 280)
      and (save_three_other is null or char_length(save_three_other) <= 280)
      and (never_programs_named is null or char_length(never_programs_named) <= 280)
      and (box_stops_phrase is null or char_length(box_stops_phrase) <= 280)
    ),
  constraint coach_method_interview_mirror_len_chk
    check (
      (generated_mirror is null or char_length(generated_mirror) <= 4000)
      and (mirror_text is null or char_length(mirror_text) <= 4000)
    )
);

comment on table coach_method_interview is
  'Como entrenas: casillas + parrafo espejo por coach. Vacio = la IA no imita. No es el recuadro de #23 ni el estudio de #25.';
