-- Alta del lead como atleta (funnel #5) — the link that closes web → onboarding →
-- cita → llamada → alta → app.
--
-- Three additive, idempotent columns:
--   * leads.converted_athlete_id — the athlete this lead became (set when the alta
--     invite is REDEEMED, not when it is sent). NULL until the athlete claims.
--   * leads.alta_sent_at — when the coach sent the alta invite email. Drives the
--     "alta enviada" marker on the lead card. NULL = alta not yet sent.
--   * athlete_invitations.lead_id — the originating lead, so redeeming the invite
--     can flip that lead to `convertido` + stamp converted_athlete_id in the same
--     transaction (system transition, forward-only; never reachable by hand).

alter table leads
  add column if not exists converted_athlete_id bigint references athletes(id) on delete set null,
  add column if not exists alta_sent_at timestamptz;

comment on column leads.converted_athlete_id is 'Funnel #5: the athlete this lead converted into (set on invite redeem). NULL until converted.';
comment on column leads.alta_sent_at is 'Funnel #5: when the coach sent the alta invite email. NULL = alta not yet sent.';

alter table athlete_invitations
  add column if not exists lead_id bigint references leads(id) on delete set null;

comment on column athlete_invitations.lead_id is 'Funnel #5: originating lead (if the athlete was created via lead alta). On redeem → lead.status=convertido + leads.converted_athlete_id.';

create index if not exists athlete_invitations_lead_idx
  on athlete_invitations (lead_id) where lead_id is not null;
