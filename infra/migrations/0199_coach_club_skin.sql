-- 0199_coach_club_skin.sql
--
-- Piel del club (FLEXR = una app, muchos coaches). Tres campos por coach_id.
-- Vacío = la marca de este binario (tokens actuales). No es la foto de la
-- persona (avatar_url) ni el nombre de perfil (coaches.full_name): aquellos
-- son la cara y la firma; esto es el lockup que ve quien entra al club.
--
--   • club_skin_name   — wordmark. NULL = FAHYBRID (o el binario que sea).
--   • club_logo_url    — base de Cloudflare Images, sin variante. NULL = icono de marca.
--   • club_accent_hex  — #rrggbb. NULL = --v2-accent de v2-theme.css / tokens.json.
--
-- Escritores:
--   · name + color → PATCH /api/coach/club (Zod).
--   · logo        → POST /api/coach/club/logo/confirmar y DELETE /api/coach/club/logo.
--     Aceptar logo_url en el PATCH daría dos escritores y una URL inventada.
--
-- Additive + idempotent.

alter table coaches add column if not exists club_skin_name  text;
alter table coaches add column if not exists club_logo_url   text;
alter table coaches add column if not exists club_accent_hex text;

do $$
begin
  alter table coaches add constraint coaches_club_skin_name_len
    check (club_skin_name is null or char_length(club_skin_name) <= 80);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table coaches add constraint coaches_club_accent_hex_rrggbb
    check (club_accent_hex is null or club_accent_hex ~ '^#[0-9a-f]{6}$');
exception when duplicate_object then null;
end $$;

comment on column coaches.club_skin_name is
  'Wordmark del club. NULL = marca de este binario. Set via PATCH /api/coach/club.';
comment on column coaches.club_logo_url is
  'Public Cloudflare Images base of the club logo; null = brand mark. Set via POST /api/coach/club/logo/confirmar.';
comment on column coaches.club_accent_hex is
  'Club accent as #rrggbb. NULL = current --v2-accent tokens. Set via PATCH /api/coach/club.';
