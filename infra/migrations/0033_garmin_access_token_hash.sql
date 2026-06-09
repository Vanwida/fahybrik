-- 0033: index garmin_oauth_tokens by SHA-256 of the userAccessToken (Finding M15).
--
-- The Garmin Health webhook (app/api/garmin/webhook/route.ts) identifies the
-- owning athlete via the per-summary `userAccessToken`. Until now the resolver
-- DECRYPTED EVERY row of garmin_oauth_tokens on each webhook and compared the
-- plaintext — O(n) AES-GCM decrypts per push, which (a) does not scale and
-- (b) needlessly exposes cryptographic material for every connected athlete on
-- every inbound event.
--
-- The fix mirrors the established `*_sha256` lookup pattern already used by
-- magic_link_tokens (lib/auth/magic-link.ts:hashToken) and partner_invitations
-- (0032). We add an indexed SHA-256 of the access token so the webhook can do a
-- single indexed lookup and decrypt ONLY the matched row.
--
--   1. Add `access_token_sha256` (hex SHA-256 of the plaintext access token).
--   2. Backfill it for existing rows by decrypting once in the app-side backfill
--      script (scripts/backfill_garmin_token_hash.ts). The DB cannot compute it
--      here because the token is AES-GCM encrypted with an app-held key, not
--      hashed — so this migration only adds the column + index. The backfill is
--      a no-op when there are no rows (none in flight pre-launch).
--   3. UNIQUE index so the lookup returns exactly one row.
--
-- Idempotent: IF NOT EXISTS throughout.

begin;

alter table garmin_oauth_tokens
  add column if not exists access_token_sha256 text;

comment on column garmin_oauth_tokens.access_token_sha256 is
  'M15: hex SHA-256 of the Garmin userAccessToken. Indexed for O(1) webhook lookup so we decrypt only the matched row. Written on token save; backfilled via scripts/backfill_garmin_token_hash.ts for pre-existing rows.';

create unique index if not exists garmin_oauth_tokens_access_token_sha256_uidx
  on garmin_oauth_tokens (access_token_sha256);

commit;
