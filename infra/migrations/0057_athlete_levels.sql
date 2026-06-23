-- Catálogo de niveles por coach (N1-N5 por defecto, editables)
create table if not exists athlete_levels (
  id          bigserial primary key,
  coach_id    bigint not null references coaches(id) on delete cascade,
  name        text not null,
  label       text not null,
  description text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  constraint athlete_levels_coach_name_uq unique (coach_id, name)
);
create index if not exists athlete_levels_coach_idx on athlete_levels (coach_id, sort_order);

-- Tags de nivel + días en bloques
alter table blocks
  add column if not exists min_level_id  bigint references athlete_levels(id) on delete set null,
  add column if not exists max_level_id  bigint references athlete_levels(id) on delete set null,
  add column if not exists days_per_week smallint,
  add constraint blocks_days_chk
    check (days_per_week is null or days_per_week between 1 and 7);

-- Nivel en atletas
alter table athletes
  add column if not exists level_id           bigint references athlete_levels(id) on delete set null,
  add column if not exists suggested_level_id bigint references athlete_levels(id) on delete set null,
  add column if not exists level_source       text check (level_source in ('algorithm','coach','self_reported')),
  add column if not exists level_confidence   text check (level_confidence in ('low','medium','high'));

-- Seed N1-N5 para todos los coaches existentes
insert into athlete_levels (coach_id, name, label, description, sort_order)
select c.id, lvl.name, lvl.label, lvl.description, lvl.sort_order
from coaches c
cross join (values
  ('N1','Iniciación',  'Primera experiencia estructurada. Sin carreras o >90min.',1),
  ('N2','Desarrollo',  'Base aeróbica, 0-1 carreras. 75-90min.',2),
  ('N3','Rendimiento', '1-3 carreras, entiende zonas. 65-75min.',3),
  ('N4','Competición', 'Open competitivo, múltiples carreras. 55-65min.',4),
  ('N5','Elite',       'Pro o sub-elite. <55min (H) / <65min (M).',5)
) as lvl(name,label,description,sort_order)
on conflict (coach_id, name) do nothing;
