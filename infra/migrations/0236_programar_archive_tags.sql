-- 0236 · Programar: archivar y etiquetar programas, bloques y entrenos de biblioteca.
--
-- Por qué (auditoría del panel, informe D §2.2 y §4.4): la biblioteca tiene que
-- escalar a cientos de piezas y el coach necesita (a) quitarse de en medio lo que
-- ya no usa SIN borrarlo — un programa que alguien hizo sigue siendo la historia
-- de ese atleta, y `athlete_month_assignments` lo referencia con RESTRICT — y
-- (b) organizar con SUS etiquetas, no con los diez «grupos metodológicos» globales
-- de un solo coach (HARD RULE Nº0).
--
--   · `archived_at` — NULL = activo. `templates` ya lo tenía (0013); se añade a
--     `program_month_templates` y `blocks`. Archivar es reversible.
--   · `tags` — etiquetas libres del coach (dato suyo, sin catálogo impuesto).
--     Columna explícita de texto[], no un JSON: se filtra y se agrupa por ella.
--
-- Idempotente.

alter table program_month_templates add column if not exists archived_at timestamptz;
alter table blocks add column if not exists archived_at timestamptz;

alter table program_month_templates add column if not exists tags text[] not null default '{}';
alter table blocks add column if not exists tags text[] not null default '{}';
alter table templates add column if not exists tags text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'program_month_templates_tags_chk') then
    alter table program_month_templates add constraint program_month_templates_tags_chk
      check (cardinality(tags) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'blocks_tags_chk') then
    alter table blocks add constraint blocks_tags_chk check (cardinality(tags) <= 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'templates_tags_chk') then
    alter table templates add constraint templates_tags_chk check (cardinality(tags) <= 20);
  end if;
end $$;

create index if not exists program_month_templates_active_idx
  on program_month_templates (coach_id) where archived_at is null and athlete_id is null;
create index if not exists blocks_coach_active_idx
  on blocks (coach_id) where archived_at is null;
