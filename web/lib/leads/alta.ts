import 'server-only';

import { z } from 'zod';
import { sql, type TransactionClient } from '@/lib/db';
import { subscriptionPlanType } from '@fahybrid/shared/schema/_primitives';
import {
  createCompAthlete,
  CompAthleteError,
  type AthleteBillingSpec,
} from '@/lib/dashboard/coach/comp-athletes';
import {
  createAthleteInvitation,
  buildAthleteInviteUrl,
} from '@/lib/athlete/invitations';
import { loadStripeConfig, createSubscriptionCheckoutAdHoc } from '@/lib/stripe';
import { ageToDobIso } from './alta-mapping';
import { buildFunnelProfile, mapTargetRace } from './funnel-carry';
import { sendAltaEmail } from './alta-email';
import { sendAltaPaymentEmail } from './alta-payment-email';

// Alta del lead como atleta (funnel #5) — the coach confirms the pre-filled modal
// and this closes the loop. There are two billing paths (#15):
//
//   * COMP (cortesía) — today's behavior. The athlete gets active courtesy access
//     immediately and we email the claim/download link right away.
//
//   * STRIPE (cobro) — the price is born at alta (the coach types a euros/mes
//     figure). We create the athlete with a PENDING subscription carrying that
//     price, mint the claim invite but DO NOT email it, open an ad-hoc Stripe
//     Checkout, and email an ACCEPTANCE (price + pay button). Access is granted
//     ONLY when Stripe confirms payment (webhook) — that's when the claim email
//     is finally sent.
//
// The lead only flips to `convertido` LATER, when the invite is redeemed (see
// redeemAthleteInvitation) — sending the alta does not convert; claiming does.

/** ISO 4217 currency for the athlete price (single-market ES launch). */
const ALTA_CURRENCY = 'eur';

/** Coach-confirmed athlete profile from the alta modal. Server-validated. */
export const altaInputSchema = z
  .object({
    full_name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email(),
    edad: z.coerce.number().int().min(12).max(100).nullable().optional(),
    sex: z.enum(['male', 'female', 'other']).nullable().optional(),
    training_days_per_week: z.coerce.number().int().min(1).max(14).nullable().optional(),
    level_id: z.coerce.number().int().positive().nullable().optional(),
    modality: subscriptionPlanType,
    notes: z.string().trim().max(4000).optional(),
    // #15 — the variable monthly price the coach agreed with the athlete, in
    // euros. Pre-filled in the modal from the lead's latest quoted_price_eur.
    agreed_price_eur: z.coerce.number().positive().max(100000).optional(),
    // Explicit billing. Defaults to 'stripe' when a price is given, else 'comp'.
    billing: z.enum(['stripe', 'comp']).optional(),
    // Plan FUNDADOR: cobro por Stripe pero con el cupón FUNDADOR (100% off, forever)
    // → 0 € al mes, sin tarjeta. Se sigue exigiendo el precio (el de lista, para
    // MRR y para el día que deje de ser fundador). Solo aplica al path stripe.
    founder: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    const effective = resolveBilling(val.billing, val.agreed_price_eur);
    // El precio solo es obligatorio en el cobro NORMAL. En Fundador el cobro es 0 €
    // vía el cupón FUNDADOR, así que el precio (de lista) es OPCIONAL.
    if (effective === 'stripe' && !val.founder && !(val.agreed_price_eur && val.agreed_price_eur > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['agreed_price_eur'],
        message: 'El precio mensual es obligatorio para el cobro por Stripe.',
      });
    }
  });
export type AltaInput = z.infer<typeof altaInputSchema>;

/** Default: stripe when a price is present, comp otherwise. */
function resolveBilling(
  billing: 'stripe' | 'comp' | undefined,
  agreed_price_eur: number | undefined,
): 'stripe' | 'comp' {
  if (billing) return billing;
  return agreed_price_eur != null ? 'stripe' : 'comp';
}

export interface AltaResult {
  athlete_id: string;
  lead_id: string;
  billing: 'stripe' | 'comp';
  /**
   * Claim/download link. For COMP it is already emailed; for STRIPE it is minted
   * but only emailed AFTER payment (the webhook), so treat it as informational.
   */
  invite_url: string;
  expires_at: string;
  /** STRIPE only: the Stripe Checkout URL sent in the acceptance email. */
  checkout_url: string | null;
  /** Whether we emailed the athlete (claim for comp, acceptance for stripe). */
  email_sent: boolean;
}

export class AltaError extends Error {
  constructor(
    readonly code:
      | 'lead_not_found'
      | 'lead_terminal'
      | 'athlete_other_coach'
      | 'email_in_use'
      | 'athlete_already_linked'
      | 'stripe_not_configured'
      | 'stripe_checkout_failed',
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AltaError';
  }
}

/**
 * Give a lead the alta as an athlete. Routes to the COMP or STRIPE path by the
 * effective billing (explicit `billing`, else stripe when a price is given).
 */
export async function altaLeadAsAthlete(params: {
  lead_id: bigint;
  coach_id: bigint;
  input: AltaInput;
}): Promise<AltaResult> {
  const billing = resolveBilling(params.input.billing, params.input.agreed_price_eur);
  return billing === 'stripe' ? altaStripe(params) : altaComp(params);
}

// ---------------------------------------------------------------------------
// COMP path (courtesy) — unchanged behavior: active access + immediate claim.
// ---------------------------------------------------------------------------
async function altaComp(params: {
  lead_id: bigint;
  coach_id: bigint;
  input: AltaInput;
}): Promise<AltaResult> {
  const { lead_id, coach_id, input } = params;
  const tx = await sql.begin((trx) =>
    createAthleteFromLead(trx, { lead_id, coach_id, input, billing: { kind: 'comp' } }),
  );

  // Email the athlete: download the app + sign in with their email (post-commit;
  // non-fatal on failure). Comp access is already active, so there's nothing to
  // claim on the web — the email points them straight at the app login.
  const email = await sendAltaEmail({
    to: tx.email,
    name: input.full_name,
    coach_id,
  });

  return {
    athlete_id: tx.athlete_id,
    lead_id: String(lead_id),
    billing: 'comp',
    invite_url: buildAthleteInviteUrl(tx.token),
    expires_at: tx.expires_at.toISOString(),
    checkout_url: null,
    email_sent: email.sent,
  };
}

// ---------------------------------------------------------------------------
// STRIPE path (cobro) — pending sub + ad-hoc Checkout + acceptance email.
// The claim email is withheld until payment is confirmed by the webhook.
// ---------------------------------------------------------------------------
async function altaStripe(params: {
  lead_id: bigint;
  coach_id: bigint;
  input: AltaInput;
}): Promise<AltaResult> {
  const { lead_id, coach_id, input } = params;
  const amount_cents = Math.round((input.agreed_price_eur ?? 0) * 100);
  const founder = input.founder ?? false;

  // Fail CLEANLY before any DB write when Stripe is not configured — never
  // create a half-athlete on the paid path.
  const cfg = loadStripeConfig();
  if (!cfg.ok) {
    throw new AltaError(
      'stripe_not_configured',
      'El cobro por Stripe no está configurado en este entorno.',
      503,
    );
  }

  // Open the ad-hoc Checkout BEFORE the DB transaction so a Stripe failure never
  // leaves a half-athlete. The session id is what the webhook keys on to activate
  // the pending subscription and release the claim email.
  let checkout: { url: string; session_id: string };
  try {
    checkout = await createSubscriptionCheckoutAdHoc({
      customer_email: input.email,
      amount_cents,
      currency: ALTA_CURRENCY,
      founder,
      metadata: {
        fahybrik_flow: 'athlete_alta',
        fahybrik_lead_id: String(lead_id),
        ...(founder ? { fahybrik_founder: 'true' } : {}),
      },
    });
  } catch {
    throw new AltaError(
      'stripe_checkout_failed',
      'No se pudo iniciar el cobro con Stripe. Inténtalo de nuevo.',
      502,
    );
  }

  const billing: AthleteBillingSpec = {
    kind: 'stripe_pending',
    agreed_price_cents: amount_cents,
    currency: ALTA_CURRENCY,
    checkout_session_id: checkout.session_id,
  };

  const tx = await sql.begin((trx) =>
    createAthleteFromLead(trx, { lead_id, coach_id, input, billing }),
  );

  // Email the ACCEPTANCE (price + pay button). The claim link is NOT sent here —
  // the webhook sends it once Stripe confirms payment.
  const email = await sendAltaPaymentEmail({
    to: tx.email,
    name: input.full_name,
    amount_cents,
    currency: ALTA_CURRENCY,
    checkoutUrl: checkout.url,
    coach_id,
  });

  return {
    athlete_id: tx.athlete_id,
    lead_id: String(lead_id),
    billing: 'stripe',
    invite_url: buildAthleteInviteUrl(tx.token),
    expires_at: tx.expires_at.toISOString(),
    checkout_url: checkout.url,
    email_sent: email.sent,
  };
}

// ---------------------------------------------------------------------------
// Shared transaction: lock the lead, create the athlete carrying the onboarding
// data, mint the claim invite, stamp the alta as sent. NO email is sent here —
// each path decides which email to send after commit.
// ---------------------------------------------------------------------------
async function createAthleteFromLead(
  trx: TransactionClient,
  args: {
    lead_id: bigint;
    coach_id: bigint;
    input: AltaInput;
    billing: AthleteBillingSpec;
  },
): Promise<{ athlete_id: string; email: string; token: string; expires_at: Date }> {
  const { lead_id, coach_id, input, billing } = args;

  // 1) Lock the lead; it must exist and not be in a terminal state.
  const leadRows = await trx<
    Array<Record<string, unknown> & { id: string; status: string; email: string }>
  >`
    select
      id::text as id, status::text as status, email,
      objetivo, material, duracion_sesion, sueno, estres, wearable,
      flexibilidad_horaria, anos_entrenando,
      lesion_actual, lesion_zonas, lesiones_pasadas,
      carrera_mente, carrera_cual, carrera_cuando, categoria_objetivo, sexo
    from leads
    where id = ${Number(lead_id)}
    limit 1
    for update
  `;
  const lead = leadRows[0];
  if (!lead) {
    throw new AltaError('lead_not_found', 'Lead no encontrado', 404);
  }
  if (lead.status === 'convertido' || lead.status === 'descartado') {
    throw new AltaError(
      'lead_terminal',
      `El lead ya está "${lead.status}" — no se puede dar de alta.`,
      409,
    );
  }

  // 2) Create the athlete carrying the onboarding data, with the requested
  // billing (comp = active; stripe = pending sub with the agreed price).
  const funnel = buildFunnelProfile(lead);
  let athlete;
  try {
    athlete = await createCompAthlete({
      coach_id,
      client: trx,
      billing,
      input: { full_name: input.full_name, email: input.email, modality: input.modality },
      profile: {
        sex: input.sex ?? null,
        dob: ageToDobIso(input.edad ?? null),
        training_days_per_week: input.training_days_per_week ?? null,
        level_id: input.level_id ?? null,
        level_source: input.level_id != null ? 'self_reported' : null,
        intake_notes_json: {
          from_lead_id: lead.id,
          alta_notes: input.notes ?? '',
        },
        goal_type: funnel.goal_type,
        facility_type: funnel.facility_type,
        session_minutes: funnel.session_minutes,
        sleep_quality: funnel.sleep_quality,
        stress_level: funnel.stress_level,
        training_experience_years: funnel.training_experience_years,
        watch_brand: funnel.watch_brand,
        watch_model: funnel.watch_model,
        schedule_flexible: funnel.schedule_flexible,
        available_from: funnel.available_from,
        available_to: funnel.available_to,
        injuries_json: funnel.injuries,
        mark_onboarded: true,
      },
    });
  } catch (e) {
    if (e instanceof CompAthleteError) {
      throw new AltaError(e.code, e.message, e.status);
    }
    throw e;
  }

  // 2b) Carry the funnel's TARGET race (only when the lead named a known one).
  const targetRace = mapTargetRace(lead);
  if (targetRace) {
    await trx`
      insert into races (
        athlete_id, created_by_coach_id, name, event_type, format, division,
        gender_category, priority, race_date, status
      )
      select
        ${BigInt(athlete.id)}, null, ${targetRace.name}, ${targetRace.event_type}::race_event_type,
        ${targetRace.format}::race_format, ${targetRace.division}::race_division,
        ${targetRace.gender_category}::race_gender, 'target'::race_priority,
        ${targetRace.race_date}::date, 'planned'::race_status
      where not exists (
        select 1 from races where athlete_id = ${BigInt(athlete.id)} and name = ${targetRace.name}
      )
    `;
  }

  // 3) Mint the claim invite, stamped with the lead so redeem converts it.
  const inv = await createAthleteInvitation({
    athlete_id: BigInt(athlete.id),
    coach_id,
    lead_id,
    client: trx,
  });
  if (!inv.ok) {
    const status = inv.error.code === 'athlete_already_linked' ? 409 : 400;
    throw new AltaError(
      inv.error.code === 'athlete_already_linked' ? 'athlete_already_linked' : 'lead_not_found',
      inv.error.message,
      status,
    );
  }

  // 4) Mark the alta as sent (visible on the lead card). Status is untouched —
  //    the lead only becomes `convertido` when the invite is redeemed.
  await trx`
    update leads set alta_sent_at = now(), updated_at = now()
    where id = ${Number(lead_id)}
  `;

  return {
    athlete_id: athlete.id,
    email: input.email,
    token: inv.result.token,
    expires_at: inv.result.expires_at,
  };
}
