-- 0208: persist the COROS MCP OAuth client from Dynamic Client Registration.
--
-- Pico registers FAHYBRID at the MCP registration_endpoint (RFC 7591). COROS
-- issues a public client (token_endpoint_auth_method=none, no secret) — measured
-- 2026-09-05. Partner COROS_CLIENT_ID / SECRET are not used.
--
-- One row per redirect_uri so a preview callback cannot overwrite prod.
-- client_secret_enc is null for a public client; filled only if COROS later
-- issues a confidential client (then AES-256-GCM with ENCRYPTION_KEY).

create table if not exists coros_mcp_oauth_client (
  redirect_uri text primary key,
  client_id text not null,
  client_secret_enc bytea,
  token_endpoint_auth_method text not null default 'none',
  issuer text,
  registration_client_uri text,
  registration_access_token_enc bytea,
  secret_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table coros_mcp_oauth_client is
  'MCP OAuth client from Dynamic Client Registration (not Partner Open API). Public client_id is enough; secret is encrypted only if issued.';
