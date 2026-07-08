-- 0105_athlete_billing.sql
--
-- Stripe payment core (#15) — the athlete's price is born at ALTA. Pablo fills a
-- free-text euros/mes price in the alta modal (variable per athlete, no price
-- table), we open an ad-hoc Stripe Checkout in subscription mode, and access is
-- granted ONLY when Stripe confirms payment. This migration carries the variable
-- price + the payment-linkage on `subscriptions` and mirrors Stripe invoices into
-- a local `athlete_invoices` history so the Pagos section reads without a Stripe
-- round-trip.
--
-- Money-critical columns:
--   * agreed_price_cents  — the variable price the coach agreed with the athlete,
--                           in integer cents (no floats for money). null for comp.
--   * checkout_session_id — the pending Stripe Checkout session. The webhook keys
--                           on this to map checkout.session.completed back to the
--                           right pending subscription (the customer id is unknown
--                           at alta time because Checkout creates it from the email).
--   * access_email_sent_at — idempotency stamp for the post-payment ACCESS email
--                           (the claim/download link). Claim-before-send: set it in
--                           the same statement that reads it null, then send. A
--                           duplicate webhook finds it non-null and never re-sends.
--
-- Additive + idempotent (`add column if not exists`, `create table if not exists`,
-- `create index if not exists`). The runner wraps the whole file in one
-- transaction, so there is no begin/commit here. No comment string literal below
-- contains a semicolon, so the statement splitter never mis-splits a comment.

-- Variable price + payment linkage on the user-scoped subscriptions table --------
alter table subscriptions add column if not exists agreed_price_cents int;
comment on column subscriptions.agreed_price_cents is
  'Precio mensual acordado con el atleta (#15), en céntimos enteros. Nace en el alta (texto libre euros/mes del coach, variable por atleta). null para las cuentas comp (cortesía). Alimenta el Checkout ad-hoc y la MRR.';

alter table subscriptions add column if not exists currency text not null default 'eur';
comment on column subscriptions.currency is
  'Moneda del precio acordado (ISO 4217 en minúscula, p.ej. eur). Por defecto eur.';

alter table subscriptions add column if not exists checkout_session_id text;
comment on column subscriptions.checkout_session_id is
  'Id de la sesión de Stripe Checkout pendiente (#15). El webhook mapea checkout.session.completed a esta subscripción pendiente por este id (el customer no se conoce en el alta porque Checkout lo crea a partir del email).';

alter table subscriptions add column if not exists access_email_sent_at timestamptz;
comment on column subscriptions.access_email_sent_at is
  'Sello de idempotencia del email de ACCESO post-pago (#15, el enlace de claim/descarga). Claim-before-send: se pone en el mismo statement que lo lee null y luego se envía. Un webhook duplicado lo encuentra no-null y nunca reenvía.';

-- Index the pending-session lookup the webhook runs on every checkout.session.completed.
create index if not exists subscriptions_checkout_session_idx
  on subscriptions (checkout_session_id)
  where checkout_session_id is not null;

-- Local mirror of Stripe invoices ------------------------------------------------
-- Populated by the invoice.paid / invoice.payment_failed webhooks so the Pagos
-- history renders locally. stripe_invoice_id is unique so re-delivery upserts
-- (on conflict update status/paid_at) instead of duplicating a row.
create table if not exists athlete_invoices (
  id                bigint generated always as identity primary key,
  subscription_id   bigint not null references subscriptions(id) on delete cascade,
  stripe_invoice_id text not null unique,
  amount_cents      int not null,
  currency          text not null default 'eur',
  status            text not null,
  period_start      date,
  period_end        date,
  paid_at           timestamptz,
  created_at        timestamptz not null default now()
);
comment on table athlete_invoices is
  'Espejo local de las facturas de Stripe (#15). Se llena desde invoice.paid / invoice.payment_failed (upsert por stripe_invoice_id) para que la sección de Pagos lea el historial sin llamar a Stripe. status = estado de la factura de Stripe (paid | open | uncollectible | void ...).';

-- History reads scan by subscription.
create index if not exists athlete_invoices_subscription_idx
  on athlete_invoices (subscription_id, created_at desc);
