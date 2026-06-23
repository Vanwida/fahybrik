-- 0058: BACKFILL atr_blocks.phase_id — link existing blocks to their coach phase.
--
-- WHY
-- ---
-- 0052 added `atr_blocks.phase_id` (FK → methodology_phases) as the AGNOSTIC
-- source of truth for a block's periodization phase, and back-filled the blocks
-- that existed at that moment. But the persist path (computeMacrocycle) kept
-- DISCARDING phase_id on insert until this change — so every macrocycle created
-- between 0052 and now has `phase_id IS NULL` and falls back to the legacy `type`
-- enum. This migration re-runs the same idempotent enum→code link so those blocks
-- point at their coach's seeded phase, making `phase_id` the real axis everywhere.
--
-- ADDITIVE & NON-BREAKING
-- -----------------------
--   * Only fills rows where `phase_id IS NULL` (idempotent; safe to re-run).
--   * The legacy `type` enum and the resolver fallback are untouched, so any block
--     a coach later renamed/re-coded (no matching seed code) simply stays on the
--     enum fallback — never wrong, just legacy.
--   * Mapping mirrors 0052's data-migrate: enum ACC/TRANS/REAL → coach phase code
--     acc/trans/real (case-insensitive), scoped to each athlete's coach.

begin;

update atr_blocks ab
set phase_id = mp.id,
    updated_at = now()
from atr_macrocycles m
join athletes a on a.id = m.athlete_id
join methodology_phases mp on mp.coach_id = a.coach_id
where ab.macrocycle_id = m.id
  and a.coach_id is not null
  and ab.phase_id is null
  and lower(mp.code) = lower(ab.type::text);

commit;
