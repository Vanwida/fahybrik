-- 0253 — un lead es único POR COACH (dueño del embudo), no por email en toda la
-- plataforma; y el embudo público ya no puede pisar un lead que no ha abierto él.
--
-- EL PROBLEMA (revisión de aislamiento, hallazgo 6)
-- -------------------------------------------------
-- `leads.email` era único global y los dos upserts públicos (`/api/leads`,
-- `/api/leads/complete`, sin autenticar) hacían `on conflict (email) do update`:
--   · cualquiera que escribiera el email de otra persona en el formulario
--     sobrescribía sus respuestas (teléfono, edad, lesiones…) fuera del club que
--     fuera, y recibía de vuelta su `token` de reserva (con el que se ve y se
--     reserva su cita);
--   · una persona solo podía ser lead de UN club: el segundo embudo se fundía en
--     la fila del primero, que se quedaba el lead.
--
-- LA DECISIÓN (2026-09-23)
-- ------------------------
-- 1. La unicidad pasa a (dueño, email). `coach_id` NULL es «sin asignar» y cuenta
--    como un dueño más (coalesce a 0): dos capturas sin atribuir del mismo email
--    siguen siendo la misma fila. Índice por expresión para que valga en cualquier
--    versión de Postgres (no depende de `nulls not distinct`).
-- 2. `capture_key_hash`: el sha-256 de una clave aleatoria que el servidor da al
--    navegador que CREÓ la fila (cookie HttpOnly). Solo ese navegador puede
--    completar o retocar el lead desde el embudo público; cualquier otro envío con
--    el mismo email no toca la fila ni recibe el token — el lead recibe su enlace
--    por correo, en su dirección. NULL = nadie tiene la clave (las filas de antes):
--    desde el embudo ya no se pueden reescribir, que es lo seguro.
--
-- Idempotente. Sin `default` en la columna nueva (DECISIONS 2026-08-09).

alter table leads add column if not exists capture_key_hash text;

comment on column leads.capture_key_hash is
  'sha-256 (hex) de la clave de captura del navegador que creó el lead (0253). Solo quien la presenta completa o retoca el lead desde el embudo público. NULL = nadie.';

alter table leads drop constraint if exists leads_email_unique;
drop index if exists leads_email_unique;

create unique index if not exists leads_owner_email_uq
  on leads ((coalesce(coach_id, 0::bigint)), email);

-- El email sigue siendo lo que se busca (baja de correos, alta), ya sin unicidad.
create index if not exists leads_email_idx on leads (email);
