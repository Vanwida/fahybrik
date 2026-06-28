-- 0084_coach_profile_fields.sql
--
-- Make the coach profile editable. Until now coaches exposed only full_name +
-- email (read-only). This adds the rest of a coach's public identity — the
-- fields an athlete sees about who trains them, and a future coach directory
-- would surface.
--
-- Fields (bio already exists from 0001_init):
--   • avatar_url    — public URL of the coach photo (Vercel Blob). NULL = initials.
--   • specialties   — free tags (HYROX, híbrido, running, fuerza…). COACH CONTENT,
--                     not a hardcoded enum: every coach owns their own list.
--   • certifications— free tags / list (CrossFit L2, HYROX Trainer…). Same.
--   • studio_name   — box / studio, e.g. "Fabrik Training Club Barcelona".
--   • location      — city / country context.
--
-- Design decisions:
--   • Tags are native text[] (NOT jsonb): explicit columns, queryable, and the
--     convention here reserves jsonb for ML/embedding vectors only. NULL = unset;
--     readers coalesce to []. We don't default to '{}' so "never touched" and
--     "explicitly emptied" stay distinguishable at the row level.
--   • All set via PATCH /api/coach/profile (Zod-validated, auth'd to the coach);
--     the photo is uploaded via POST /api/coach/profile/avatar (Vercel Blob).
--   • Additive + idempotent: every ADD COLUMN is guarded by IF NOT EXISTS, so
--     re-running the migration is a no-op.
--
alter table coaches add column if not exists avatar_url     text;
alter table coaches add column if not exists specialties    text[];
alter table coaches add column if not exists certifications text[];
alter table coaches add column if not exists studio_name    text;
alter table coaches add column if not exists location       text;

comment on column coaches.avatar_url     is 'Public URL of the coach photo (Vercel Blob); null = render initials. Set via POST /api/coach/profile/avatar + PATCH /api/coach/profile.';
comment on column coaches.specialties    is 'Free specialty tags (coach content, e.g. HYROX, running); null = unset → reader coalesces to []. Set via PATCH /api/coach/profile.';
comment on column coaches.certifications is 'Free certification tags (coach content); null = unset → reader coalesces to []. Set via PATCH /api/coach/profile.';
comment on column coaches.studio_name    is 'Coach box / studio name. Set via PATCH /api/coach/profile.';
comment on column coaches.location       is 'Coach location (city/country). Set via PATCH /api/coach/profile.';
