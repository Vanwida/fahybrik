-- 0100_lead_nurturing.sql
--
-- Lead nurturing (funnel #10). A daily cron emails a bounded, idempotent sequence of
-- reminders to leads that stalled in the pipeline (left an email but never finished
-- onboarding, finished but never booked the call, no-showed, or are still deciding).
-- See web/lib/leads/nurture.ts (selector) + web/app/api/cron/nurture (the daily run).
--
-- Two idempotency + RGPD guarantees live in this schema:
--   * lead_nurture_log(lead_id, touch_type) UNIQUE — every touch fires AT MOST ONCE per
--     lead. The cron CLAIMS a row (`insert … on conflict do nothing returning id`) before
--     sending; only the run that wins the insert sends, and a failed send deletes its row
--     so the next run retries. The touch_type code IS the idempotency key.
--   * leads.no_contactar — RGPD opt-out. Set true by the public token unsubscribe endpoint;
--     the selector excludes these leads from ALL future nurturing.
--
-- Per-lead unsubscribe_token: an opaque, unguessable token for the public "No quiero más
-- recordatorios" link (never the numeric id). Backfilled for every existing lead by the
-- volatile default; unique so the endpoint can look a lead up by it. gen_random_uuid() is
-- built-in on PG13+ (Neon PG16 — no extension needed).
--
-- Additive + idempotent (guarded with `if not exists`). Runner wraps the file in one
-- transaction; no begin/commit here.

-- RGPD opt-out flag ---------------------------------------------------------------
alter table leads add column if not exists no_contactar boolean not null default false;
comment on column leads.no_contactar is
  'RGPD opt-out: true = the lead asked to stop receiving reminders. Excludes them from ALL nurturing (#10). Set by /api/leads/unsubscribe via unsubscribe_token.';

-- Per-lead unsubscribe token ------------------------------------------------------
-- Volatile default backfills existing rows with unique values on ADD; then it stays the
-- default so every new lead gets one too.
alter table leads add column if not exists unsubscribe_token text not null
  default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists leads_unsubscribe_token_idx on leads (unsubscribe_token);
comment on column leads.unsubscribe_token is
  'Opaque token for the public RGPD unsubscribe link (/api/leads/unsubscribe?token=…). Auto-assigned; never expose the numeric id.';

-- Nurture send log (idempotency) --------------------------------------------------
create table if not exists lead_nurture_log (
  id         bigint generated always as identity primary key,
  lead_id    bigint not null references leads(id) on delete cascade,
  touch_type text not null,                          -- e.g. 'parcial_t1' (see shared/domain/leads/nurture.ts)
  sent_at    timestamptz not null default now()
);
-- ONE row per (lead, touch) — the hard idempotency guarantee. The cron claims against this.
create unique index if not exists lead_nurture_log_lead_touch_idx on lead_nurture_log (lead_id, touch_type);
create index if not exists lead_nurture_log_lead_idx on lead_nurture_log (lead_id);

comment on table lead_nurture_log is
  'One row per nurture touch actually claimed/sent to a lead (#10). UNIQUE (lead_id, touch_type) = each touch fires at most once. touch_type codes: shared/domain/leads/nurture.ts.';
