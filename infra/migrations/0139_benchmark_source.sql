-- 0139: el origen de una marca deja de vivir en texto libre.
--
-- `athlete_benchmarks.notes` hacía dos trabajos a la vez: nota humana Y etiqueta de
-- procedencia. Los lectores decidían si un test de calibración "contó" comparando
-- contra los literales 'coach_test' / 'athlete_test'... en una columna donde también
-- hay '5k en pista', '[demo-seed] 2k remo TT' y nulls. Con las Marcas (#Marcas, el
-- atleta se prueba cuando quiere y registra sus carreras) el origen pasa a ser
-- PRODUCTO — quién produjo el número decide si recalibra el plan o solo registra —
-- así que sube a columna de verdad con su CHECK.
--
--   source:      coach_test   → test programado por el coach (recalibra el plan)
--                athlete_test → el atleta se probó él (registra, no recalibra)
--                registered   → carrera registrada a posteriori (10K, media, maratón)
--                onboarding   → autodeclarado al entrar (nunca cuenta como test real)
--                unknown      → filas históricas sin etiqueta fiable
--   run_context: outdoor | treadmill — SOLO marcas de correr. Un 5K en cinta y uno
--                en calle no son la misma bestia: el PR nunca los mezcla.
--   event_name:  nombre humano de la carrera registrada ("Cursa del Poblenou").
--
-- `notes` se queda como nota humana. Aditiva + idempotente; el runner envuelve el
-- fichero en una transacción.

begin;

alter table athlete_benchmarks
  add column if not exists source      text,
  add column if not exists run_context text,
  add column if not exists event_name  text;

-- Backfill: solo los literales exactos son fiables; todo lo demás es 'unknown'
-- (seeds de demo, notas a mano, nulls). No se adivina.
update athlete_benchmarks
set source = case
  when notes in ('coach_test', 'athlete_test', 'onboarding', 'registered') then notes
  else 'unknown'
end
where source is null;

alter table athlete_benchmarks alter column source set default 'unknown';
alter table athlete_benchmarks alter column source set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'athlete_benchmarks_source_chk') then
    alter table athlete_benchmarks add constraint athlete_benchmarks_source_chk
      check (source in ('coach_test', 'athlete_test', 'registered', 'onboarding', 'unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athlete_benchmarks_run_context_chk') then
    alter table athlete_benchmarks add constraint athlete_benchmarks_run_context_chk
      check (run_context is null or run_context in ('outdoor', 'treadmill'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'athlete_benchmarks_event_name_chk') then
    alter table athlete_benchmarks add constraint athlete_benchmarks_event_name_chk
      check (event_name is null or length(btrim(event_name)) between 1 and 120);
  end if;
end $$;

comment on column athlete_benchmarks.source is
  'Quién produjo la marca. coach_test recalibra el plan; athlete_test registra sin recalibrar (a Pablo le llega "marca nueva"); registered = carrera registrada; onboarding = autodeclarado (no cuenta como test); unknown = histórico sin etiqueta fiable. notes queda como nota humana.';
comment on column athlete_benchmarks.run_context is
  'Solo marcas de correr: outdoor | treadmill. Un 5K en cinta no bate al de calle — el PR se lleva por contexto.';
comment on column athlete_benchmarks.event_name is
  'Nombre de la carrera registrada ("Cursa del Poblenou"). null salvo source=registered.';

-- La biblioteca de marcas lee "historial de este atleta para este slug" constantemente.
create index if not exists athlete_benchmarks_athlete_slug_idx
  on athlete_benchmarks (athlete_id, exercise_slug, recorded_at desc);

commit;
