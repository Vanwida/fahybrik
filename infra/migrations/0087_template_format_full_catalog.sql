-- 0087: extend the `template_format` enum to the full canonical format catalog.
--
-- WHY
-- ---
-- The workout-format vocabulary is now unified into ONE source of truth
-- (shared/domain/prescription/format.ts), shared coach↔athlete↔DB. The catalog
-- adds the formats Pablo prescribes that the enum did not yet carry — Tabata,
-- Death By, Steady, Chipper, Ladder, Rounds, Strength (`sets`), and the Warm-up /
-- Cool-down block types. The legacy enum members (strength_block | tempo |
-- circuit | test) are KEPT (readers normalize them to canonical) so old rows in
-- `templates.format` still read.
--
-- The V2 paths store the format in free JSONB (`prescription_json.scheme`) / a
-- TEXT column (`block_exercises.block_format`), but the legacy `templates.format`
-- column is this Postgres enum — adding the values keeps every storage path
-- consistent and prevents a latent reject if a new-format block lands there.
--
-- ADDITIVE + idempotent: ADD VALUE IF NOT EXISTS touches nothing existing. The
-- values are NOT used within this migration (PG requires a committed enum value
-- before use), so the single-txn wrap the runner applies is safe on PG 12+.

alter type template_format add value if not exists 'tabata';
alter type template_format add value if not exists 'death_by';
alter type template_format add value if not exists 'steady';
alter type template_format add value if not exists 'chipper';
alter type template_format add value if not exists 'ladder';
alter type template_format add value if not exists 'rounds';
alter type template_format add value if not exists 'sets';
alter type template_format add value if not exists 'warmup';
alter type template_format add value if not exists 'cooldown';
