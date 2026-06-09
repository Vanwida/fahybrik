-- 0037: blocks library (Biblioteca de Bloques) — Pablo's methodology as a set of
-- reusable training BLOCKS. Each row is one concrete prescription (e.g.
-- "Front squat 5×10/10/8/8/6 @65-80%") classified into one of the 10
-- methodology_groups (0030). Several blocks compose a session/day; the IA picks
-- existing blocks + tweaks `default_modifiers` rather than generating from
-- scratch.
--
-- MODEL A (decided with Alex): store Pablo's text VERBATIM in `description` — it
-- is the source of truth. We do NOT parse the prescription into fine structure
-- (sets/reps/load) now; `format` / `atr_block_hint` are coarse inferred hints
-- only, and `default_modifiers` holds adjustable placeholders coach/IA set on
-- use.
--
-- `coach_id` is NULL for now = Pablo's GLOBAL block library (single-coach app).
-- When the app goes multi-coach, per-coach blocks get a non-null coach_id and
-- the catalog query filters `coach_id is null OR coach_id = <me>`.

begin;

create table if not exists blocks (
  id                   bigserial primary key,
  slug                 text not null unique,
  -- short, human-readable title derived from the description (e.g.
  -- "Front squat 5×10-8-8-8-6 @65-80%"). Display label only.
  title                text not null,
  -- VERBATIM text from Pablo (source of truth). Never reword.
  description          text not null,
  methodology_group_id bigint not null references methodology_groups(id),
  -- coarse inferred format hint (strength_block, plyometric, erg_intervals,
  -- run_intervals, zone2, metcon, race_sim, core_mobility, functional_circuit,
  -- tapering). Derived from group/text; NOT the technical templates.format enum.
  format               text null,
  -- ATR periodization phase hint inferred from the group. NULL when ambiguous.
  atr_block_hint       text null check (atr_block_hint in ('ACC', 'TRANS', 'REAL')),
  -- provenance metadata: the "S1 – Martes" hint from the source spreadsheet.
  source_ref           text null,
  -- adjustable placeholders coach/IA fill when composing a day
  -- (e.g. {"intensity_pct":null,"level":null,"duration_min":null,"rounds":null}).
  default_modifiers    jsonb null,
  -- NULL = Pablo's global library (single-coach). Per-coach blocks later.
  coach_id             bigint null references coaches(id),
  created_at           timestamptz not null default now()
);

create index if not exists blocks_methodology_group_idx
  on blocks (methodology_group_id);

-- slug already has a UNIQUE constraint (implicit index); no extra index needed.

commit;
