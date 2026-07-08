-- 0107_athlete_reviews.sql
--
-- Revisiones 1:1 recurrentes coach-atleta (#21). Reutiliza el sistema de citas
-- (appointments) en vez de duplicarlo: una revision ES una cita cuyo sujeto es un
-- ATLETA (athlete_id) en lugar de un lead. El coach PROPONE (una notificacion al
-- usuario del atleta), el atleta reserva su hueco en la app (auto-aceptada + Meet),
-- y la revision se registra despues via session_reports (#14, outcome=seguimiento).
-- Una senal "revision 1:1 vencida" recuerda al coach; un atleta pausado/baja (#13)
-- la silencia (el batch de senales ya filtra lifecycle_status=activo).
--
-- Aditivo + idempotente (guardas do-block sobre pg_constraint + `if not exists`).
-- El runner envuelve el fichero en UNA transaccion, asi que no hay begin/commit aqui.
-- Ningun literal de comentario contiene punto y coma, para que el splitter por ';'
-- del runner nunca corte mal una sentencia.

-- ── appointments: el atleta como sujeto de una revision 1:1 ──────────────────────
-- Junto al lead (cita de intro) ahora una cita puede tener como sujeto un ATLETA.
alter table appointments add column if not exists athlete_id bigint references athletes(id) on delete cascade;
comment on column appointments.athlete_id is
  'Sujeto atleta de una revision 1:1 recurrente (#21). null en una cita de intro con un lead. Exactamente uno de lead_id | athlete_id va informado (appointments_subject_chk).';

create index if not exists appointments_athlete_id_idx on appointments (athlete_id) where athlete_id is not null;

-- Una cita de intro lleva lead_id, una revision lleva lead_id null → lead_id deja de
-- ser NOT NULL. drop not null es idempotente (no-op si ya es nullable).
alter table appointments alter column lead_id drop not null;

-- Guarda de sujeto: al menos uno presente (espeja session_reports_subject_chk).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_subject_chk') then
    alter table appointments add constraint appointments_subject_chk
      check (lead_id is not null or athlete_id is not null);
  end if;
end $$;

-- kind: intro (videollamada de captacion con un lead, el comportamiento existente y el
-- valor por defecto) | revision (revision 1:1 recurrente con un atleta, #21).
alter table appointments add column if not exists kind text not null default 'intro';
comment on column appointments.kind is
  'Tipo de cita (#21). intro = videollamada de captacion con un lead (por defecto). revision = revision 1:1 recurrente con un atleta.';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_kind_chk') then
    alter table appointments add constraint appointments_kind_chk
      check (kind in ('intro', 'revision'));
  end if;
end $$;

-- Como maximo UNA revision activa (pendiente|aceptada) por atleta — el gemelo de
-- appointments_one_active_per_lead. Las filas con athlete_id null quedan fuera del
-- indice (y las filas de lead, con athlete_id null, no colisionan entre si aqui).
-- El indice appointments_one_active_per_lead sigue igual: sus filas de revision
-- llevan lead_id null y los NULL son distintos en un unique index, asi que ni bloquea
-- las revisiones ni deja de garantizar una intro activa por lead.
create unique index if not exists appointments_one_active_per_athlete
  on appointments (athlete_id)
  where athlete_id is not null and status in ('pendiente', 'aceptada');

-- ── athletes: cadencia de revision 1:1 que Pablo fija por atleta ──────────────────
-- Opt-OUT: por defecto MENSUAL (coaching 1:1 premium de alto contacto = estandar
-- de mercado; Pablo lo baja a trimestral o lo apaga por atleta). mensual = umbral
-- 30d, trimestral = 90d (los numeros viven en web/lib/coach/signal-config.ts).
alter table athletes add column if not exists review_cadence text not null default 'mensual';
comment on column athletes.review_cadence is
  'Cadencia de revision 1:1 recurrente (#21) que Pablo fija por atleta. mensual (por defecto — opt-out) | trimestral | ninguna. Alimenta la senal review_1on1_due, silenciada si el atleta no esta activo (#13).';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'athletes_review_cadence_chk') then
    alter table athletes add constraint athletes_review_cadence_chk
      check (review_cadence in ('ninguna', 'mensual', 'trimestral'));
  end if;
end $$;
