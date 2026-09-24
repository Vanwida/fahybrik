-- 0218: VISTAS GUARDADAS de la lista de Atletas.
--
-- Una vista es un filtro con nombre: la cadena de consulta de la URL de Atletas
-- (`nivel=3&semana=oculta`…). Las vistas de serie (Necesitan algo, Todos, Sin
-- plan, No ven su semana, Pausados) NO se guardan: viven en
-- `shared/schema/saved-views.ts` y sus nombres quedan reservados.
--
-- Del club (coach_id), no de la persona: el equipo de un club comparte vistas.

begin;

create table if not exists coach_saved_views (
  id         bigint generated always as identity primary key,
  coach_id   bigint   not null references coaches(id) on delete cascade,
  name       text     not null,
  query      text     not null default '',
  position   integer  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coach_saved_views_name_chk check (length(btrim(name)) between 1 and 60),
  constraint coach_saved_views_query_chk check (length(query) <= 2000),
  constraint coach_saved_views_position_chk check (position >= 0)
);

create unique index if not exists coach_saved_views_name_uq
  on coach_saved_views (coach_id, lower(btrim(name)));

create index if not exists coach_saved_views_coach_idx
  on coach_saved_views (coach_id, position, id);

comment on table coach_saved_views is
  '0218: vistas guardadas de Atletas (nombre + cadena de consulta de la URL). Las de serie no se guardan.';

commit;
