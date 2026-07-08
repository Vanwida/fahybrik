import 'server-only';

import { z } from 'zod';
import { sql } from '@/lib/db';
import { subscriptionPlanType } from '@fahybrid/shared/schema/_primitives';
import { createCompAthlete, CompAthleteError } from '@/lib/dashboard/coach/comp-athletes';
import { createAthleteInvitation } from '@/lib/athlete/invitations';
import { AUTH_CONFIG } from '@/lib/auth/config';
import { ageToDobIso } from './alta-mapping';
import { buildFunnelProfile, mapTargetRace } from './funnel-carry';
import { sendAltaEmail } from './alta-email';

// Alta del lead como atleta (funnel #5) — the coach confirms the pre-filled modal
// and this closes the loop: create the athlete (carrying the onboarding data), mint a
// claim invitation that remembers the lead, mark the alta as sent, and email the lead
// the link to download the app + sign in. The lead only flips to `convertido` LATER,
// when the invite is redeemed (see redeemAthleteInvitation) — sending the alta does
// not convert; claiming does.

/** Coach-confirmed athlete profile from the alta modal. Server-validated. */
export const altaInputSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  edad: z.coerce.number().int().min(12).max(100).nullable().optional(),
  sex: z.enum(['male', 'female', 'other']).nullable().optional(),
  training_days_per_week: z.coerce.number().int().min(1).max(14).nullable().optional(),
  level_id: z.coerce.number().int().positive().nullable().optional(),
  modality: subscriptionPlanType,
  notes: z.string().trim().max(4000).optional(),
});
export type AltaInput = z.infer<typeof altaInputSchema>;

export interface AltaResult {
  athlete_id: string;
  lead_id: string;
  invite_url: string;
  expires_at: string;
  email_sent: boolean;
}

export class AltaError extends Error {
  constructor(
    readonly code:
      | 'lead_not_found'
      | 'lead_terminal'
      | 'athlete_other_coach'
      | 'email_in_use'
      | 'athlete_already_linked',
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AltaError';
  }
}

/** Build the public universal-link the lead taps to claim + download the app. */
function inviteUrl(token: string): string {
  const base = AUTH_CONFIG.appUrl().replace(/\/$/, '');
  return `${base}/invite/${token}`;
}

/**
 * Give a lead the alta as an athlete. All DB writes run in ONE transaction (athlete
 * create + invite mint + alta stamp are atomic); the email is sent AFTER commit so a
 * transient email failure never rolls back a real alta — it just returns email_sent:false
 * and the coach can resend.
 */
export async function altaLeadAsAthlete(params: {
  lead_id: bigint;
  coach_id: bigint;
  input: AltaInput;
}): Promise<AltaResult> {
  const { lead_id, coach_id, input } = params;

  const tx = await sql
    .begin(async (trx) => {
      // 1) Lock the lead; it must exist and not be in a terminal state.
      const leadRows = await trx<Array<Record<string, unknown> & { id: string; status: string; email: string }>>`
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

      // 2) Create the athlete carrying the onboarding data (nested savepoint).
      // The coach-confirmed modal fields (sex, dob, days, level, modality) win;
      // the rest of the funnel intake is mapped onto structured columns so the
      // athlete skips the 19-step iOS onboarding (mark_onboarded → onboarded_at).
      const funnel = buildFunnelProfile(lead);
      let athlete;
      try {
        athlete = await createCompAthlete({
          coach_id,
          client: trx,
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
      // Mirrors the onboarding writer: created_by_coach_id null, priority target,
      // status planned; idempotent by (athlete, name) so a re-alta never dupes.
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
        // athlete_already_linked = this person already claimed an account.
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
    })
    .catch((e) => {
      if (e instanceof AltaError) throw e;
      throw e;
    });

  // 5) Email the lead the claim link (post-commit; non-fatal on failure).
  const email = await sendAltaEmail({
    to: tx.email,
    name: input.full_name,
    inviteUrl: inviteUrl(tx.token),
  });

  return {
    athlete_id: tx.athlete_id,
    lead_id: String(lead_id),
    invite_url: inviteUrl(tx.token),
    expires_at: tx.expires_at.toISOString(),
    email_sent: email.sent,
  };
}
