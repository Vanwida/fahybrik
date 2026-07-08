-- 0117: lead_status_events — the missing lead transition history.
--
-- `leads.status` is a single mutable enum with NO history and no "who changed it":
-- when a coach moves a lead nuevo → contactado → cita → alta/descartado, nothing
-- records who or when. This append-only table is that record — it powers the lead
-- timeline in the ficha ("Gerard movió a Cita · hace 1h") and is the auditable
-- trail for the funnel.
--
-- No backfill: there is no prior history to reconstruct. The first event a lead
-- accrues from now on has from_status NULL when it represents the funnel entry.
--
-- Additive + idempotent. Runner strips begin/commit, wraps in one transaction.

begin;

create table if not exists lead_status_events (
  id                 bigserial primary key,
  lead_id            bigint not null references leads(id) on delete cascade,
  -- from_status NULL = the opening event (funnel entry / lead created).
  from_status        text,
  to_status          text not null,
  -- WHO moved it. A coach action carries a user_id; a system move (cron/webhook)
  -- carries kind='system' with a NULL user_id.
  changed_by_user_id bigint references users(id) on delete set null,
  changed_by_kind    actor_kind not null default 'coach',
  note               text,
  created_at         timestamptz not null default now()
);

-- The timeline query: newest-first events for one lead.
create index if not exists lead_status_events_lead_idx
  on lead_status_events (lead_id, created_at desc);

commit;
