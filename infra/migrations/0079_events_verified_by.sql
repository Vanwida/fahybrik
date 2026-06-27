-- FAHYBRIK migration 0079: events.verified_by_user_id — human-curation flag.
--
-- A catalog event row carries a CURATION state a future scraper MUST respect:
-- once an owner/admin has hand-verified a row (fixed a scraped city, confirmed a
-- tentative date, or created it manually), the scraper must NEVER overwrite it on
-- its next idempotent upsert. That contract is one nullable column —
--   verified_by_user_id IS NOT NULL  ⇒  "human-owned, do not touch".
-- A scraper upsert MUST guard its UPDATE branch with
--   ... where events.verified_by_user_id is null
-- (no scraper exists yet — this column is the contract it will honour).
--
-- Why users(id), NOT coaches(id): the catalog is curated from the owner/admin
-- surface (app/[locale]/(admin), gated by the `admin` role on users), whose
-- session resolves a users.id — not a coaches.id. A pure admin need not own a
-- coach row, so a coaches FK would be unpopulatable. created_by_coach_id
-- (Pablo's own manual events) stays as-is; this is a distinct, admin-owned
-- signal. verified_at records WHEN it was vouched for (updated_at moves on any
-- edit, so it cannot stand in for verification time).

begin;

alter table events
  add column if not exists verified_by_user_id bigint references users(id) on delete set null,
  add column if not exists verified_at         timestamptz;

create index if not exists events_verified_by_user_id_idx
  on events (verified_by_user_id) where verified_by_user_id is not null;

commit;
