-- 0101_visit_counts.sql
--
-- First-party, cookieless, PII-free web VISIT counting (#20, closes the top of the
-- funnel). Privacy model a la Plausible: NO cookies, NO browser storage, NO persistent
-- identifier, and the raw IP is NEVER stored. The only derived value is a per-visitor
-- daily hash used transiently to dedupe unique visitors:
--     visitor_hash = sha256(dailySalt | ip | userAgent)
--     dailySalt    = sha256(AUTH_SECRET :visit: <today Europe/Madrid YYYY-MM-DD>)
-- The salt is secret-derived and rotates every day, so the hash is non-reversible AND
-- cannot be correlated across days (no long-term tracking) -> lawful basis = legitimate
-- interest, no consent banner needed. Recorder: web/lib/analytics/visits.ts.
--
-- Two tables:
--   * visit_counts -- the DAILY AGGREGATE the dashboard reads (views + unique visitors
--     per day per source). This is the durable record the /metricas funnel renders.
--   * visit_seen   -- the per-day dedup set, holding ONLY the daily-salted, non-reversible
--     hash (no PII). Prior-day rows may be purged safely at any time: the aggregate is
--     already materialised in visit_counts, so purging only forgets the (already
--     anonymous) dedup keys.
--
-- Additive + idempotent (guarded with `if not exists`). Runner wraps the file in one
-- transaction, so no begin/commit here.

-- Daily aggregate (what the dashboard reads) --------------------------------------
create table if not exists visit_counts (
  day      date   not null,
  source   text   not null,               -- 'landing' | 'empieza'
  views    bigint not null default 0,     -- total page hits that day/source
  visitors bigint not null default 0,     -- distinct visitor_hash that day/source
  primary key (day, source)
);
comment on table visit_counts is
  'Daily aggregate of cookieless web visits per source (#20). views = total hits, visitors = distinct daily-salted hashes. No PII. Written by web/lib/analytics/visits.ts recordVisit, read by lib/dashboard/coach/metrics.ts.';

-- Per-day dedup set (holds ONLY the anonymous daily hash) --------------------------
create table if not exists visit_seen (
  day          date not null,
  source       text not null,
  visitor_hash text not null,             -- sha256(daily-rotating salt | ip | ua): NOT reversible, NO raw PII
  primary key (day, source, visitor_hash)
);
comment on table visit_seen is
  'Transient per-day dedup keys for unique-visitor counting (#20). Holds ONLY the daily-salted, non-reversible visitor_hash, never a raw IP or user agent. Prior-day rows can be purged safely: the count already lives in visit_counts.';
