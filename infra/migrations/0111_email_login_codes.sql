-- 0111_email_login_codes.sql
--
-- Passwordless EMAIL + one-time CODE login for the iOS athlete app. Sign in with
-- Apple stays the primary path, but an athlete whose Apple ID does not match the
-- email they were enrolled under (real case: an athlete with no linked Apple
-- account) has no way in. Email+code is the universal path.
--
--   • The athlete enters their email → if a member account exists for it (find-only,
--     like the Apple login: LOGIN NEVER CREATES), a 6-digit code is emailed.
--   • They enter the code → we mint the SAME athlete session bearer as Apple login.
--
-- Storage model mirrors magic_link_tokens (0002): only the HASH of the secret is
-- stored at rest (code_sha256 = sha256(email || ':' || code)); the plaintext code
-- only ever goes to the athlete's inbox. `consumed_at` non-null = spent (single-use);
-- `attempts` caps brute-force per code (the code is invalidated once the cap is hit).
-- Short TTL (~10 min) + per-email/IP rate limiting are enforced in the app layer.
--
-- Additive + idempotent (`if not exists`). The runner wraps the file in one
-- transaction; no begin/commit here.

create table if not exists email_login_codes (
  id            bigint generated always as identity primary key,
  email         text not null,
  code_sha256   text not null,              -- sha256(email || ':' || plaintext_code); only the hash is stored
  expires_at    timestamptz not null,
  consumed_at   timestamptz,                -- non-null = spent (verified OR invalidated); single-use
  attempts      integer not null default 0, -- failed verify attempts against THIS code; capped in the app layer
  requested_ip  text,
  created_at    timestamptz not null default now(),
  constraint email_login_codes_expires_chk check (expires_at > created_at)
);

comment on table email_login_codes is
  'One-time 6-digit codes for passwordless athlete email login (iOS). Only the salted sha256 of the code is stored; single-use via consumed_at; attempts caps brute-force. Find-only: a code is issued only when a member account already exists for the email.';

-- Lookup is always "the newest still-active code for this email".
create index if not exists email_login_codes_email_active_idx
  on email_login_codes (email, created_at desc) where consumed_at is null;
