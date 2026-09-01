-- 0177_coach_movement_policy.sql
-- Ajustes de método del coach sobre el sensor (HARD RULE Nº0: no cablear metodología).

begin;

create table if not exists coach_movement_policy (
  coach_id                      bigint primary key references coaches(id) on delete cascade,
  -- Confianza mínima para precargar el contador sin forzar confirmación.
  auto_count_min_confidence     real not null default 0.80
    check (auto_count_min_confidence >= 0 and auto_count_min_confidence <= 1),
  -- Pérdida de velocidad (%) a partir de la cual se marca la serie como "agotada".
  velocity_loss_cutoff_pct      real not null default 20
    check (velocity_loss_cutoff_pct >= 0 and velocity_loss_cutoff_pct <= 100),
  -- Si el conteo automático se aplica por defecto a ejercicios contables.
  auto_count_enabled            boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

comment on table coach_movement_policy is
  'Política de método del coach sobre conteo/velocidad por sensor. Defectos = comportamiento actual sin tocar nada.';

-- Overrides por ejercicio: null = hereda la política global (doctrina 0085).
alter table coach_exercise_overrides
  add column if not exists auto_count_enabled boolean,
  add column if not exists min_rep_rom_m real;

alter table coach_exercise_overrides drop constraint if exists coach_exercise_overrides_min_rep_rom_chk;
alter table coach_exercise_overrides add constraint coach_exercise_overrides_min_rep_rom_chk
  check (min_rep_rom_m is null or min_rep_rom_m >= 0);

comment on column coach_exercise_overrides.auto_count_enabled is
  'Si este ejercicio se cuenta solo. NULL = hereda coach_movement_policy.auto_count_enabled.';
comment on column coach_exercise_overrides.min_rep_rom_m is
  'Recorrido mínimo (m) que cuenta como repetición válida. NULL = hereda default del detector.';

-- Consentimiento del atleta a archivar señal inercial (fase 0).
alter table athletes
  add column if not exists sensor_capture_consent_at timestamptz,
  add column if not exists sensor_capture_consent_version text;

comment on column athletes.sensor_capture_consent_at is
  'Cuándo el atleta consintió archivar señal inercial de muñeca. NULL = no archivar (el procesado en vivo puede seguir).';
comment on column athletes.sensor_capture_consent_version is
  'Versión del texto de consentimiento aceptado. Sin versión no se archiva.';

commit;
