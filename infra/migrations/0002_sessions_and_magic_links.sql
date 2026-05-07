-- FAHYBRIK migration 0002: auth sessions + coach magic-link tokens
-- Athletes authenticate via Apple Sign In; sessions back the JWT (jti) so logout truly invalidates.
-- Coaches (Pablo) authenticate via emailed magic links (single-use, hashed at rest).

begin;

-- =============================================================================
-- Sessions (JWT jti registry, used for both athlete and coach sessions)
-- =============================================================================

create table sessions (
  id              bigint generated always as identity primary key,
  user_id         bigint not null references users(id) on delete cascade,
  jti             text not null,
  user_agent      text,
  ip              text,
  issued_at       timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  last_seen_at    timestamptz,
  constraint sessions_jti_unique unique (jti),
  constraint sessions_expires_chk check (expires_at > issued_at)
);

create index sessions_user_idx on sessions (user_id, issued_at desc);
create index sessions_active_idx on sessions (user_id) where revoked_at is null;

-- =============================================================================
-- Magic-link tokens (coach email login)
--   token_hash = sha256(plaintext_token), only the plaintext goes to email
--   used_at non-null = consumed (single-use)
-- =============================================================================

create table magic_link_tokens (
  id            bigint generated always as identity primary key,
  email         text not null,
  token_hash    text not null,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  requested_ip  text,
  created_at    timestamptz not null default now(),
  constraint magic_link_tokens_hash_unique unique (token_hash),
  constraint magic_link_tokens_expires_chk check (expires_at > created_at)
);

create index magic_link_tokens_email_idx on magic_link_tokens (email, created_at desc);
create index magic_link_tokens_active_idx on magic_link_tokens (token_hash) where used_at is null;

commit;
