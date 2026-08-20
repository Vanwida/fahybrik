-- 0202 — El correo de avisos es del club.
--
-- Leads, altas y bajas llegan a coaches.club_notify_email. Vacío = no se
-- envía. Un club nuevo no toca env. hello@ no es el buzón de nadie.
-- No es la piel (0199) ni el cuestionario de alta (0201).
-- Aditivo e idempotente.

alter table coaches add column if not exists club_notify_email text;

do $$
begin
  alter table coaches add constraint coaches_club_notify_email_chk
    check (
      club_notify_email is null
      or char_length(btrim(club_notify_email)) between 3 and 254
    );
exception when duplicate_object then null;
end $$;

comment on column coaches.club_notify_email is
  'Buzón de avisos del club (leads, altas, bajas). NULL = no se envía. Set via PATCH /api/coach/club.';
