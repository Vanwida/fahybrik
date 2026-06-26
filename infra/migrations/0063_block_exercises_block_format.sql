-- 0063: block_exercises gains block_format + block_title (mirrors template_segments
-- 0020), so a library block round-trips each sub-block's archetype/title.
begin;
alter table block_exercises add column if not exists block_format text;
alter table block_exercises add column if not exists block_title text;
commit;
