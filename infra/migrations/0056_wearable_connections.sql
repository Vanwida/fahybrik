-- 0056: provider-agnostic wearable OAuth connections (COROS, WHOOP, + future).
--
-- WHY
-- ---
-- Garmin already has its own table (`garmin_oauth_tokens`) and it WORKS. We are
-- NOT touching it. But the onboarding DevicesStep offers more wearables than
-- Garmin (COROS and WHOOP next; Oura / Polar / Suunto on the roadmap), and
-- standing up a bespoke `<provider>_oauth_tokens` table per provider would be
-- copy-paste sprawl — N near-identical tables, N token stores, N webhook
-- reverse-lookups. Every new wearable would re-pay the same schema cost.
--
-- This migration introduces ONE generic table keyed by (athlete_id, provider).
-- A single token store + a single OAuth2 engine then serve every OAuth2-based
-- wearable; only the per-provider endpoint config differs. The column set is the
-- UNION of what these providers need, designed once against the real flows:
--
--   · access_token_encrypted   — every provider issues one (OAuth2 access token).
--   · refresh_token_encrypted  — OAuth2 refresh token (COROS/WHOOP rotate access
--                                tokens; nullable because not every provider/grant
--                                returns one).
--   · token_secret_encrypted   — RESERVED for a future OAuth1 provider (this is
--                                the slot that would let us CONSOLIDATE Garmin
--                                into this table later without a schema change).
--   · access_token_sha256       — optional reverse-lookup parity with Garmin's
--                                webhook resolver: hash the inbound token, match
--                                an indexed column, never decrypt every row.
--   · provider_user_id          — the provider's stable user id; webhooks identify
--                                the user by THIS (not by the access token, which
--                                rotates), so it is the primary reverse-lookup key.
--   · scopes / expires_at       — granted permissions + access-token expiry, used
--                                to drive refresh and to know what we may read.
--   · status                    — connected | revoked | error, so the UI and sync
--                                jobs can skip dead connections without deleting
--                                the row (preserves provider_user_id history).
--
-- WHY GARMIN STAYS SEPARATE (for now): it is live and tested; migrating its rows
-- mid-flight is needless risk. The `token_secret_encrypted` slot above keeps the
-- door open to fold Garmin in later as a deliberate, separate migration. Until
-- then `provider` here is OAuth2-providers only ('coros' | 'whoop' | ...).
--
-- ONE CONNECTION PER (athlete, provider): a `unique (athlete_id, provider)`
-- constraint — reconnecting UPSERTs the same row (new tokens, status back to
-- 'connected') rather than accumulating stale duplicates. `on delete cascade`
-- ties a connection's lifetime to the athlete.
--
-- ADDITIVE: a brand-new table + indexes only. `create table if not exists` and
-- `create index if not exists` make re-running a no-op (the runner is idempotent).
-- It does NOT alter `garmin_oauth_tokens` or any existing object. To revert:
-- `drop table if exists wearable_connections;`.

begin;

create table if not exists wearable_connections (
  id bigserial primary key,
  athlete_id bigint not null references athletes(id) on delete cascade,
  provider text not null,                       -- 'coros' | 'whoop' | future ('oura','polar','suunto',...)
  provider_user_id text,                        -- provider's stable user id; webhook reverse-lookup key
  access_token_encrypted bytea not null,        -- AES-256-GCM (lib/crypto/aes-gcm)
  refresh_token_encrypted bytea,                -- OAuth2 refresh (nullable)
  token_secret_encrypted bytea,                 -- reserved for future OAuth1 (garmin consolidation)
  access_token_sha256 text,                     -- optional reverse-lookup parity w/ garmin
  scopes text,                                  -- space-separated granted scopes/permissions
  expires_at timestamptz,                       -- access-token expiry (nullable)
  status text not null default 'connected',     -- 'connected' | 'revoked' | 'error'
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, provider)
);

-- Webhook reverse-lookup by the provider's stable user id (primary path).
create index if not exists wearable_connections_provider_user_idx
  on wearable_connections (provider, provider_user_id);

-- Optional reverse-lookup by hashed access token (parity with Garmin's resolver).
create index if not exists wearable_connections_token_sha_idx
  on wearable_connections (provider, access_token_sha256);

commit;
