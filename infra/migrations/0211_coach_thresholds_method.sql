-- 0211_coach_thresholds_method.sql
--
-- EL RESTO DEL METODO DE LAS SENALES PASA A SER DATO DEL COACH (HARD RULE Nº0).
--
-- 0161 abrio `coach_signal_thresholds` con los tres dias del comunicado y dejo
-- escrito que el resto de umbrales se moverian aqui, columna a columna, cuando
-- dejaran de ser aceptables como constantes. La auditoria del panel con 100
-- atletas (docs/auditoria-panel-coach, informe B, H4/H11/H16) demostro que ya no
-- lo son: el readiness saltaba con una sola lectura bajo 67 sin base propia, el
-- check-in saltaba en atletas que nunca lo hacen y las bandas 67/45 eran `const`.
-- Otro entrenador competente pondria cada uno de estos numeros distinto, asi que
-- son metodo y nacen como dato con defecto.
--
-- NULL = «usa el defecto del sistema». Los defectos viven en
-- shared/domain/coach/signal-thresholds.ts (COACH_THRESHOLD_SPEC), NUNCA como
-- `default` de columna (DECISIONS 2026-08-09). Por eso las tres columnas del
-- comunicado dejan de ser NOT NULL: guardar ya no reemplaza el conjunto entero,
-- el coach toca un numero y el resto sigue siendo el del sistema (la pantalla
-- Ajustes > Metodo guarda al salir de cada campo).
--
-- Columnas nuevas (unidad en el nombre o en el comentario):
--   readiness_ok_min            banda «bien» desde aqui (puntos 0-100)
--   readiness_caution_min       banda «cautela» desde aqui, por debajo «bajo»
--   readiness_critical_floor    una lectura por debajo = critico, sin mirar la base
--   readiness_drop_points       X puntos por debajo de su mediana de 28 dias
--   readiness_drop_days         durante N dias seguidos
--   readiness_max_age_days      la lectura mas reciente no puede tener mas de M dias
--   checkin_habit_min           K check-ins en los 14 dias previos = tiene el habito
--   checkin_skipped_days        dias sin check-in (con habito) para avisar
--   missed_sessions_min         entrenos debidos sin hacer en 7 dias para avisar
--   message_unanswered_hours    horas esperando respuesta para subir a Hoy
--   rpe_high_min                RPE a partir del que un entreno cuenta como «al limite»
--   rpe_high_share_pct          % de los entrenos de 7 dias al limite para avisar
--
-- Aditivo e idempotente. El runner envuelve el fichero en una transaccion.

alter table coach_signal_thresholds
  alter column communication_question_unanswered_days drop not null,
  alter column communication_task_overdue_critical_days drop not null,
  alter column communication_protocol_unopened_days drop not null;

alter table coach_signal_thresholds
  add column if not exists readiness_ok_min          smallint,
  add column if not exists readiness_caution_min     smallint,
  add column if not exists readiness_critical_floor  smallint,
  add column if not exists readiness_drop_points     smallint,
  add column if not exists readiness_drop_days       smallint,
  add column if not exists readiness_max_age_days    smallint,
  add column if not exists checkin_habit_min         smallint,
  add column if not exists checkin_skipped_days      smallint,
  add column if not exists missed_sessions_min       smallint,
  add column if not exists message_unanswered_hours  smallint,
  add column if not exists rpe_high_min              smallint,
  add column if not exists rpe_high_share_pct        smallint;

-- Limites: los mismos que COACH_THRESHOLD_SPEC (el PUT los valida antes, esto es
-- la red). La coherencia entre columnas (cautela < bien) la valida el servidor
-- sobre los valores EFECTIVOS, porque aqui una columna nula significa el defecto.
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_ok_chk
    check (readiness_ok_min is null or readiness_ok_min between 1 and 100);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_caution_chk
    check (readiness_caution_min is null or readiness_caution_min between 0 and 99);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_floor_chk
    check (readiness_critical_floor is null or readiness_critical_floor between 0 and 99);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_drop_points_chk
    check (readiness_drop_points is null or readiness_drop_points between 3 and 50);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_drop_days_chk
    check (readiness_drop_days is null or readiness_drop_days between 1 and 14);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_readiness_age_chk
    check (readiness_max_age_days is null or readiness_max_age_days between 0 and 14);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_checkin_habit_chk
    check (checkin_habit_min is null or checkin_habit_min between 1 and 14);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_checkin_skipped_chk
    check (checkin_skipped_days is null or checkin_skipped_days between 1 and 14);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_missed_chk
    check (missed_sessions_min is null or missed_sessions_min between 1 and 14);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_message_chk
    check (message_unanswered_hours is null or message_unanswered_hours between 1 and 168);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_rpe_min_chk
    check (rpe_high_min is null or rpe_high_min between 6 and 10);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table coach_signal_thresholds add constraint coach_signal_thresholds_rpe_share_chk
    check (rpe_high_share_pct is null or rpe_high_share_pct between 10 and 100);
exception when duplicate_object then null;
end $$;

comment on table coach_signal_thresholds is
  'Umbrales de senal y bandas de readiness editables por el coach (HARD RULE Nº0: el umbral es metodo). Una fila por coach. NULL en una columna = el defecto del sistema, que vive en shared/domain/coach/signal-thresholds.ts (COACH_THRESHOLD_SPEC), NUNCA como default de columna. Un coach que no toca nada se comporta igual que el sistema.';
