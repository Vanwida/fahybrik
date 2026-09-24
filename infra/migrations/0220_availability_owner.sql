-- 0220 — la agenda de citas tiene DUEÑO: `coach_availability` y
-- `coach_availability_exceptions` ganan `coach_id`.
--
-- EL PROBLEMA
-- -----------
-- 0093 creó la agenda sin dueño («single-coach launch: no coach_id anywhere») y
-- DECISIONS 2026-08-10 lo dejó escrito como deuda: `setAvailability` borra la tabla
-- ENTERA y la reescribe, y la fecha bloqueada es única GLOBAL. Con un segundo
-- entrenador eso significa que guardar su horario borra el del primero, que un lead
-- de un club reserva en los huecos de otro, y que bloquear el 25 de diciembre lo
-- bloquea para todos. No es un filtro que falte: es que la fila no sabe de quién es.
--
-- LA DECISIÓN (2026-09-23, reconstrucción del panel — FLEXR multi-coach)
-- ----------------------------------------------------------------------
-- La agenda es del COACH, igual que el cupo (`coaches.max_athletes`) y la dirección
-- presencial (`coaches.studio_name/location`). Cada franja y cada día bloqueado
-- llevan `coach_id`; la unicidad del día bloqueado pasa a ser POR COACH. Los huecos
-- que ve un lead son los del dueño de SU lead (`leads.coach_id`, 0147); los de una
-- revisión 1:1, los del coach del atleta. Las citas NO ganan columna: su dueño
-- sigue derivando del lead o del atleta (DECISIONS 2026-08-10, se mantiene).
--
-- RELLENO HACIA ATRÁS — por orden de evidencia, nunca por descarte
-- ----------------------------------------------------------------
--   1. Quién la escribió: `created_by_user_id` / `last_edited_by_user_id` → el club
--      de ese usuario (`coach_members` vivo, o el enlace legacy `coaches.user_id`).
--      Es un hecho grabado, no una deducción.
--   2. El club del embudo público de siempre: hasta hoy la agenda solo la leían los
--      leads del único embudo que ha existido, el del club `coaches.id = 60` (el
--      mismo hecho que usó 0147 para atribuir los leads). Solo si ese coach existe.
--   3. Una instalación de UN solo coach: la agenda no puede ser de nadie más.
-- Lo que no encaja en ninguno se queda en NULL: una franja sin dueño no la lee
-- nadie (no ofrece huecos a ningún lead) y NO se inventa un dueño para ella. Para
-- que no nazcan filas nuevas sin dueño, el NOT NULL se impone a todo lo nuevo con un
-- CHECK `not valid` (Postgres lo aplica a cada insert/update sin exigirlo a las
-- filas viejas) y se valida entero cuando ya no queda ninguna huérfana.
--
-- Idempotente: `if not exists`, relleno solo sobre `coach_id is null`, guardas en
-- cada constraint. El runner envuelve el fichero en una transacción.

alter table coach_availability
  add column if not exists coach_id bigint references coaches(id) on delete cascade;
alter table coach_availability_exceptions
  add column if not exists coach_id bigint references coaches(id) on delete cascade;

comment on column coach_availability.coach_id is
  'El coach dueño de esta franja (0220). Los huecos que ve un lead salen de la agenda del dueño de su lead; los de una revisión, de la del coach del atleta.';
comment on column coach_availability_exceptions.coach_id is
  'El coach que bloqueó este día (0220). Un día bloqueado es por coach, nunca global.';

-- ── Relleno ────────────────────────────────────────────────────────────────────
-- (1) Quién la escribió → su club.
update coach_availability ca
   set coach_id = coalesce(
         (select cm.coach_id from coach_members cm
           where cm.user_id = coalesce(ca.created_by_user_id, ca.last_edited_by_user_id)
             and cm.removed_at is null
           order by cm.added_at asc, cm.coach_id asc limit 1),
         (select c.id from coaches c
           where c.user_id = coalesce(ca.created_by_user_id, ca.last_edited_by_user_id)
           order by c.id asc limit 1))
 where ca.coach_id is null
   and coalesce(ca.created_by_user_id, ca.last_edited_by_user_id) is not null;

update coach_availability_exceptions ce
   set coach_id = coalesce(
         (select cm.coach_id from coach_members cm
           where cm.user_id = coalesce(ce.created_by_user_id, ce.last_edited_by_user_id)
             and cm.removed_at is null
           order by cm.added_at asc, cm.coach_id asc limit 1),
         (select c.id from coaches c
           where c.user_id = coalesce(ce.created_by_user_id, ce.last_edited_by_user_id)
           order by c.id asc limit 1))
 where ce.coach_id is null
   and coalesce(ce.created_by_user_id, ce.last_edited_by_user_id) is not null;

-- (2) El club del embudo público de siempre, si existe.
update coach_availability set coach_id = 60
 where coach_id is null and exists (select 1 from coaches where id = 60);
update coach_availability_exceptions set coach_id = 60
 where coach_id is null and exists (select 1 from coaches where id = 60);

-- (3) Instalación de un solo coach.
update coach_availability set coach_id = (select min(id) from coaches)
 where coach_id is null and (select count(*) from coaches) = 1;
update coach_availability_exceptions set coach_id = (select min(id) from coaches)
 where coach_id is null and (select count(*) from coaches) = 1;

-- ── Unicidad del día bloqueado: por coach ─────────────────────────────────────
alter table coach_availability_exceptions
  drop constraint if exists coach_availability_exceptions_fecha_unique;
create unique index if not exists coach_availability_exceptions_coach_fecha_uq
  on coach_availability_exceptions (coach_id, fecha);

-- ── Lecturas por coach ─────────────────────────────────────────────────────────
create index if not exists coach_availability_coach_idx
  on coach_availability (coach_id, modality, weekday) where activo;

-- ── Ninguna fila NUEVA sin dueño ───────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'coach_availability_owner_chk') then
    alter table coach_availability
      add constraint coach_availability_owner_chk check (coach_id is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_availability_exceptions_owner_chk') then
    alter table coach_availability_exceptions
      add constraint coach_availability_exceptions_owner_chk check (coach_id is not null) not valid;
  end if;
  if not exists (select 1 from coach_availability where coach_id is null) then
    alter table coach_availability validate constraint coach_availability_owner_chk;
  end if;
  if not exists (select 1 from coach_availability_exceptions where coach_id is null) then
    alter table coach_availability_exceptions validate constraint coach_availability_exceptions_owner_chk;
  end if;
end $$;
