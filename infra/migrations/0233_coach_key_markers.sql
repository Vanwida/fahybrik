-- 0233 · Marcadores clave que cada coach quiere ver en la ficha del atleta.
--
-- Qué marcadores mira un coach es MÉTODO (HARD RULE Nº0): el catálogo cerrado y
-- el defecto (sentadilla 1RM, peso muerto 1RM, FC máx, 5 km) viven en
-- shared/domain/coach/key-markers.ts. Aquí solo se guarda la elección del coach,
-- en orden. Sin filas = el defecto del producto.

create table if not exists coach_key_markers (
  id          bigint generated always as identity primary key,
  coach_id    bigint not null references coaches(id) on delete cascade,
  marker_key  text   not null,
  position    smallint not null,
  created_at  timestamptz not null default now(),
  constraint coach_key_markers_position_chk check (position >= 0 and position < 12),
  constraint coach_key_markers_unique unique (coach_id, marker_key)
);

create index if not exists coach_key_markers_coach_idx on coach_key_markers (coach_id, position);
