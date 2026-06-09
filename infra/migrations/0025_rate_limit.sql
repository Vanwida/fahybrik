-- 0025: rate_limit_buckets — table-based rate limiting (A1).
--
-- No Redis/Upstash in the stack, so throttling lives in Postgres. Fixed-window
-- counter keyed by an opaque string (caller composes "<scope>:<endpoint>:<id>",
-- e.g. "ip:auth-email:1.2.3.4" or "user:partner-invite:42"). The window is a
-- truncated timestamp; the first request in a new window resets the count via
-- an atomic upsert.
--
-- We keep one row per (key, window_start). Old windows are pruned lazily by the
-- helper (best-effort delete) and could also be swept by a cron later; the
-- table stays tiny because keys collapse to the active window only.
--
-- Idempotent: IF NOT EXISTS throughout.

begin;

create table if not exists rate_limit_buckets (
  bucket_key    text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (bucket_key, window_start)
);

-- Lets the lazy pruner delete expired windows cheaply.
create index if not exists rate_limit_buckets_window_idx
  on rate_limit_buckets (window_start);

commit;
