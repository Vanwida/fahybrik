-- 0030: methodology_groups (D3 / A8 finding) — the 10 pedagogical training
-- groups from the master doc §10 "Biblioteca de Entrenamientos" (pág. 16). The
-- technical `templates.format` enum (amrap/intervals/...) already exists, but
-- the COACH-FACING pedagogical group ("Fuerza Base", "Series de Ergómetros",
-- "Tapering / Activación pre-carrera"…) did not. This is the IA personalization
-- engine's primary classification axis and Pablo's main filter in the catalog.
--
-- id is a FIXED small-int PK (1..10) matching the doc's numbering exactly — these
-- are a closed, stable set defined by Pablo's methodology, not user-generated.
-- name/description are bilingual (es canonical from the doc, en a faithful
-- translation). enfoque_estratégico from the doc maps to description_es.

begin;

create table if not exists methodology_groups (
  id              integer primary key,
  slug            text not null unique,
  name_es         text not null,
  name_en         text not null,
  description_es  text null,
  sort_order      integer not null
);

-- Seed the 10 groups (idempotent upsert — re-running keeps copy in sync with
-- the doc without creating duplicates).
insert into methodology_groups (id, slug, name_es, name_en, description_es, sort_order) values
  (1,  'fuerza-base',
       'Fuerza Base',
       'Base Strength',
       'Desarrollar fuerza máxima y masa muscular funcional. Series largas con cargas progresivas (65-85%) en movimientos compuestos: squat, press, hip thrust, deadlift.',
       1),
  (2,  'fuerza-explosiva-pliometrica',
       'Fuerza Explosiva / Pliométrica',
       'Explosive / Plyometric Strength',
       'Potencia neuromuscular y capacidad reactiva. Depth jumps, box jumps, zancadas pliométricas y movimientos balísticos. Mejora la economía de carrera.',
       2),
  (3,  'series-ergometros',
       'Series de Ergómetros (Row / SkiErg / AB)',
       'Ergometer Intervals (Row / SkiErg / AB)',
       'Potencia aeróbica en ergómetros. Series progresivas cerca del umbral (RPE 8). Carga creciente: 3'' → 3''30" → 4'' → 6''. Transferencia directa a estaciones HYROX.',
       3),
  (4,  'series-running',
       'Series de Running',
       'Running Intervals',
       'Elevar el umbral anaeróbico y la velocidad de carrera. Series en pista/cinta: intervalos largos (1200m), sprints (400m), fartlek y tempo runs. Fundamental para los 8km de HYROX.',
       4),
  (5,  'zona2-recuperacion',
       'Zona 2 / Recuperación Aeróbica',
       'Zone 2 / Aerobic Recovery',
       'Base aeróbica, recuperación activa entre sesiones intensas y eficiencia mitocondrial. Runs largos en zona 2 y sesiones multi-máquina.',
       5),
  (6,  'wods-metcons',
       'WODs / Metcons Competitivos',
       'Competitive WODs / Metcons',
       'Alta intensidad combinando fuerza y resistencia. Simula las demandas fisiológicas de HYROX. Entrena tolerancia al lactato, toma de decisiones bajo fatiga y ritmo de competición.',
       6),
  (7,  'simulaciones-carrera',
       'Simulaciones de Carrera (HYROX / DEKA)',
       'Race Simulations (HYROX / DEKA)',
       'Replicar condiciones de competición. EMOMs multi-estación, simulaciones completas. Entrena transiciones (RoxZone), ritmo de carrera y gestión del esfuerzo.',
       7),
  (8,  'core-movilidad-preventivos',
       'Core, Movilidad y Preventivos',
       'Core, Mobility & Prehab',
       'Prevenir lesiones, mantener rangos de movimiento óptimos y fortalecer la cadena estabilizadora. Side plank, Turkish get-up, hollow hold, foam rolling.',
       8),
  (9,  'circuitos-funcionales',
       'Circuitos Funcionales de Fuerza-Resistencia',
       'Functional Strength-Endurance Circuits',
       'Resistencia muscular local y capacidad de trabajo continuo. Pull ups, dips, lunges, DB snatch, renegade row. Clave para las estaciones de HYROX.',
       9),
  (10, 'tapering-activacion',
       'Tapering / Activación Pre-carrera',
       'Tapering / Pre-race Activation',
       'Reducción de carga manteniendo sharpness competitiva. Volúmenes bajos, intensidades controladas, activaciones específicas. Preparación final para competición.',
       10)
on conflict (id) do update set
  slug           = excluded.slug,
  name_es        = excluded.name_es,
  name_en        = excluded.name_en,
  description_es = excluded.description_es,
  sort_order     = excluded.sort_order;

-- Link templates to their pedagogical group (nullable — not every template maps
-- cleanly, and the backfill is heuristic / best-effort).
alter table templates
  add column if not exists methodology_group_id integer null references methodology_groups(id);

create index if not exists templates_methodology_group_idx
  on templates (methodology_group_id)
  where methodology_group_id is not null and archived_at is null;

-- Heuristic backfill of existing templates by format + name keywords (A8 step 3).
-- Only touches rows still unclassified, so re-running won't override manual edits.
--
--   strength_block                          → 1  Fuerza Base
--   hyrox_sim                               → 7  Simulaciones de Carrera
--   intervals + (erg|row|ski|remo|bike|ab)  → 3  Series de Ergómetros
--   intervals + (run|fartlek|pista|sprint)  → 4  Series de Running
--   intervals (other)                       → 4  Series de Running (default for series)
--   tempo                                   → 5  Zona 2 / Recuperación
--   amrap | for_time | emom                 → 6  WODs / Metcons
--   circuit + (movilidad|mobility|core|prevent) → 8  Core / Movilidad
--   circuit                                 → 9  Circuitos Funcionales
--   name ~ recover|recuper|zona 2|z2        → 5  Zona 2 / Recuperación
--   name ~ taper|activacion|peaking|sharpen → 10 Tapering
-- Ambiguous → left NULL.
update templates t set methodology_group_id = sub.gid
from (
  select id,
    case
      when name ~* '(taper|activaci[oó]n|peaking|sharpen)' then 10
      when name ~* '(recover|recuper|zona\s*2|\bz2\b)' then 5
      when format::text = 'strength_block' then 1
      when format::text = 'hyrox_sim' then 7
      when format::text = 'tempo' then 5
      when format::text = 'intervals' and name ~* '(erg|\brow\b|remo|ski|skierg|bike|\bab\b|assault)' then 3
      when format::text = 'intervals' then 4
      when format::text in ('amrap', 'for_time', 'emom') then 6
      when format::text = 'circuit' and name ~* '(movilidad|mobility|core|prevent|prehab|estab)' then 8
      when format::text = 'circuit' then 9
      else null
    end as gid
  from templates
) sub
where t.id = sub.id
  and sub.gid is not null
  and t.methodology_group_id is null;

commit;
