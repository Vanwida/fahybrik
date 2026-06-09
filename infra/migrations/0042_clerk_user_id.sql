-- 0042: Clerk identity bridge.
--
-- Clerk pasa a ser la fuente de verdad de IDENTIDAD (login). Nuestra tabla
-- `users` conserva lo de DOMINIO (atleta/coach/roles, planes, chat) y se vincula
-- a Clerk por este puente: users.clerk_user_id = el id `user_xxx` de Clerk.
--
-- Aditivo y seguro: columna nullable + único. Los gates (coach/admin) migrarán
-- a resolver la sesión por Clerk -> clerk_user_id -> fila de dominio (Fase 2b).
-- Mientras tanto la auth casera sigue funcionando contra users.id.

alter table users
  add column if not exists clerk_user_id text;

-- Un id de Clerk no puede mapear a dos filas de dominio.
create unique index if not exists users_clerk_user_id_key
  on users (clerk_user_id)
  where clerk_user_id is not null;
