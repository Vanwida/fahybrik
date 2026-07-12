-- 0123_coach_guidance.sql
--
-- El coach adjunta una lista corta y ORDENADA de "consejos" a un CONTEXTO
-- (la carrera de dobles, la simulación de dobles). Es contenido del coach y
-- totalmente editable desde el dashboard; hasta que escribe los suyos, todas
-- las superficies sirven los defaults del sistema (agnósticos, en
-- shared/domain/coach-guidance.ts — el software no lleva marca ni nombres).
--
-- Una fila por (coach, contexto): la lista completa se reemplaza en cada guardado
-- (el orden es significativo). items = text[] (los consejos, ya validados en el
-- endpoint: 1..8, cada uno 1..200 chars tras trim, no vacíos).
--
-- Idempotente (create table if not exists). El runner envuelve el fichero en UNA
-- transacción y corta por punto y coma.

create table if not exists coach_guidance (
  id         bigint generated always as identity primary key,
  coach_id   bigint not null references coaches(id) on delete cascade,
  context    text   not null check (context in ('race_doubles', 'sim_doubles')),
  items      text[] not null,
  updated_at timestamptz not null default now(),
  unique (coach_id, context)
);
