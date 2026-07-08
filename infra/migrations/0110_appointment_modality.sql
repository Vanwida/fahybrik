-- 0110_appointment_modality.sql
--
-- #40: citas de videollamada vs presencial. Dos horarios INDEPENDIENTES (video | presencial)
-- que Pablo pinta por separado y pueden SOLAPARSE libremente. La ocupación es AGNÓSTICA:
-- una cita reservada en la hora T (sea video o presencial) bloquea T en los DOS horarios —
-- el coach no puede estar en dos sitios a la vez (ya lo garantiza busyStartMs, que lee todas
-- las citas activas sin filtrar por modalidad).
--
-- La dirección presencial NO necesita columna nueva: reutiliza coaches.studio_name (nombre
-- del box, default «Fabrik Training Club Barcelona») + coaches.location (calle), ya editables
-- en el perfil (PATCH /api/coach/profile).
--
-- Aditiva + idempotente. Runner envuelve el fichero en una transacción; sin begin/commit.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'appointment_modality') then
    create type appointment_modality as enum ('video', 'presencial');
  end if;
end $$;

-- coach_availability: cada franja pertenece a un horario (video | presencial). Las franjas
-- EXISTENTES pasan a 'video' (preserva el comportamiento de hoy: solo videollamadas).
alter table coach_availability add column if not exists modality appointment_modality not null default 'video';
create index if not exists coach_availability_modality_idx on coach_availability (modality) where activo;

comment on column coach_availability.modality is
  '#40: horario al que pertenece la franja (video|presencial). Dos horarios independientes que pueden solaparse; el solape se representa con dos franjas a la misma hora, una de cada modalidad.';

-- appointments: la modalidad concreta de la cita — la elige el lead al reservar. Las citas
-- EXISTENTES pasan a 'video'.
alter table appointments add column if not exists modality appointment_modality not null default 'video';

comment on column appointments.modality is
  '#40: modalidad de la cita (video=Google Meet | presencial=en el box, con location). El lead la elige al reservar; la ocupación de la hora es agnóstica de modalidad.';
