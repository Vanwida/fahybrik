-- FAHYBRIK migration 0011: chat attachments + APNS push tokens.
--
-- Two additive concerns bundled because they ship together (#32 + #33):
--
--   * chat_messages.attachment_url + attachment_kind: voice notes (.m4a),
--     videos (.mp4), images, files. Body becomes optional when an attachment
--     is present (voice note has no transcript yet — Phase 2).
--
--   * apns_push_tokens: per-device APNS push token. We could squeeze this
--     into the existing `devices` table (type='iphone', identifier=token)
--     but push needs APNS-specific metadata (env sandbox/prod, last_failure,
--     bundle_id) that doesn't belong in the generic biometric devices table.
--     Linking via (athlete_id, device_id) keeps the relation explicit when
--     iOS sends both a HealthKit device row and a push token.
--
-- Why we don't add a `chat_attachment_kind` enum at the DB level: the set
-- evolves (voice → video → image → file → location → workout-card). Zod
-- validates server-side; storing as text is cheaper than recreating the
-- enum every quarter.

begin;

-- =============================================================================
-- Chat attachments
-- =============================================================================

alter table chat_messages
  add column if not exists attachment_url   text,
  add column if not exists attachment_kind  text,
  add column if not exists attachment_meta  jsonb;

-- Body is no longer required when an attachment exists. We can't drop the
-- NOT NULL on body cheaply (existing rows have body), so allow body to be
-- empty string when attachment is present — Zod enforces "at least one".

alter table chat_messages
  alter column body drop not null;

-- =============================================================================
-- APNS push tokens
-- =============================================================================

create table apns_push_tokens (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  -- Optional link to the biometric devices row (when iOS is also a HealthKit
  -- source). Null when the user only registered for push and didn't grant
  -- HealthKit perms.
  device_id       bigint references devices(id) on delete set null,
  -- The 64-hex-char APNS device token. Unique per (bundle_id, env, token).
  device_token    text not null,
  -- 'sandbox' (TestFlight / Xcode) or 'production' (App Store).
  apns_env        text not null,
  bundle_id       text not null,
  -- Marketing version + build for diagnostics.
  app_version     text,
  app_build       text,
  -- Last successful push sent. Null until first send.
  last_pushed_at  timestamptz,
  -- Last APNS error reason (e.g., 'BadDeviceToken', 'Unregistered'). When
  -- non-null, the token should be considered dead and skipped on next send;
  -- a re-register from iOS will clear it.
  last_failure    text,
  failed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint apns_push_tokens_unique unique (user_id, bundle_id, apns_env, device_token),
  constraint apns_push_tokens_env_chk check (apns_env in ('sandbox', 'production'))
);

create index apns_push_tokens_user_idx
  on apns_push_tokens (user_id, last_failure nulls first);

commit;
