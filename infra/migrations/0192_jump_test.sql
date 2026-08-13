-- 0192 — Test de salto: el contrato gana height/cm, y el intento crudo
-- (frames, fps, carga, peso) vive aparte del benchmark agregado.
--
-- Puramente ADITIVO. Los CHECK nuevos son superconjuntos. El default del
-- metodo del coach NO vive aqui: se escribe desde DEFAULT_JUMP_METHOD al
-- crear la fila. Ningun comentario lleva punto y coma.

alter table coach_test_results drop constraint if exists coach_test_results_measure_chk;
alter table coach_test_results add constraint coach_test_results_measure_chk
  check (measure in ('time', 'distance', 'reps', 'calories', 'load', 'hrr', 'hr', 'height'));

alter table coach_test_results drop constraint if exists coach_test_results_unit_chk;
alter table coach_test_results add constraint coach_test_results_unit_chk
  check (unit in ('seconds', 'meters', 'reps', 'calories', 'kg', 'bpm', 'cm'));

create table if not exists jump_attempts (
  id                bigint generated always as identity primary key,
  athlete_id        bigint not null references athletes(id) on delete cascade,
  assignment_id     bigint references workout_assignments(id) on delete set null,
  kind              text not null check (kind in ('cmj', 'cmj_free_arms', 'sj', 'dj', 'loaded_cmj')),
  load_kg           numeric(6, 2),
  body_mass_kg      numeric(5, 2),
  takeoff_frame     integer not null,
  landing_frame     integer not null,
  fps               numeric(6, 2) not null,
  flight_time_s     numeric(8, 5) not null,
  height_cm         numeric(6, 2) not null,
  quality           text not null check (quality in ('ok', 'staggered', 'low_fps', 'discarded')),
  kept              boolean not null default false,
  created_at        timestamptz not null default now()
);

create index if not exists jump_attempts_athlete_created_idx
  on jump_attempts (athlete_id, created_at desc);

create table if not exists coach_jump_method (
  id                 bigint generated always as identity primary key,
  coach_id           bigint not null unique references coaches(id) on delete cascade,
  default_load_kg    numeric(5, 2) not null,
  attempts           smallint not null,
  keep               text not null check (keep in ('best', 'mean_best_2')),
  rest_s             smallint not null,
  arms               text not null check (arms in ('hips', 'free')),
  height_bands_json  jsonb not null,
  lri_bands_json     jsonb not null,
  updated_at         timestamptz not null default now()
);
