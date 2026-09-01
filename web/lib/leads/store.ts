// Lead persistence — two-phase upsert keyed by email (migration 0092_leads.sql).
//
//   • upsertLeadDraft    — end of bloque A (email captured). Writes contact + bloque A,
//     status='parcial'. Never regresses a further-along lead or nulls fields it doesn't own.
//   • upsertLeadComplete — full submit. Overwrites every answer with the authoritative
//     client state, sets status='nuevo' (unless already further), stamps consent + audit.
//   • transitionLeadStatus — coach pipeline move, enforcing the shared NO-RETREAT rule.
//
// All three keep the same "a lead never moves backwards" invariant (the upserts never
// downgrade a worked lead; the transition only advances). Single source of truth.
//
// DUEÑO (migración 0147): ambos upserts graban `coach_id` EN LA CAPTURA, a partir del
// enlace por el que entró el lead (`funnelCoachId()`). No se deduce después mirando
// quién hay en la base — la misma regla que la procedencia de una marca o el
// `recorded_via` de una ejecución. Sin enlace atribuible se queda NULL («sin asignar»)
// y lo asigna una persona; NULL nunca se rellena con un coach por descarte.
//
// Explicit columns (repo convention). Arrays → text[]; codes validated upstream by Zod.

import { sql, type Sql, type TransactionClient } from '@/lib/db';
import { recordAudit, type Actor } from '@/lib/audit/record-edit';
import { funnelCoachId } from './funnel-coach';
import type { LeadDraftInput, LeadSubmitInput } from '@fahybrid/shared/schema';
import {
  canReopenLead,
  canTransitionLead,
  isCoachSettableLeadStatus,
  type LeadStatus,
} from '@fahybrid/shared/domain/leads/status';

export interface LeadCaptureMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface LeadUpsertResult {
  id: string;
  status: string;
  /** Opaque public booking token (leads.token) — drives /es/cita/[token]. */
  token: string;
  /** true when this call created the row (no prior lead for that email). */
  created: boolean;
}

/** Partial capture at the email step — only touches contact + bloque A. */
export async function upsertLeadDraft(input: LeadDraftInput): Promise<LeadUpsertResult> {
  const coach_id = await funnelCoachId();
  const rows = await sql<{ id: string; status: string; token: string; created: boolean }[]>`
    insert into leads (
      email, nombre,
      objetivo, carrera_mente, carrera_cual, carrera_cuando, plazo, motivo, inicio,
      status, source, coach_id
    ) values (
      ${input.email}, ${input.nombre ?? null},
      ${input.objetivo ?? null}, ${input.carrera_mente ?? null}, ${input.carrera_cual ?? null},
      ${input.carrera_cuando ?? null}, ${input.plazo ?? null}, ${input.motivo ?? null},
      ${input.inicio ?? null},
      'parcial', 'onboarding_web', ${coach_id === null ? null : Number(coach_id)}
    )
    on conflict (email) do update set
      -- El dueño se graba en la PRIMERA captura y no se reescribe: a quien ya tenía
      -- dueño no se lo cambia una visita posterior, y a quien entró sin enlace
      -- atribuible se le puede poner después (a mano o al completar).
      coach_id       = coalesce(leads.coach_id, excluded.coach_id),
      nombre         = coalesce(excluded.nombre, leads.nombre),
      objetivo       = coalesce(excluded.objetivo, leads.objetivo),
      carrera_mente  = coalesce(excluded.carrera_mente, leads.carrera_mente),
      carrera_cual   = coalesce(excluded.carrera_cual, leads.carrera_cual),
      carrera_cuando = coalesce(excluded.carrera_cuando, leads.carrera_cuando),
      plazo          = coalesce(excluded.plazo, leads.plazo),
      motivo         = coalesce(excluded.motivo, leads.motivo),
      inicio         = coalesce(excluded.inicio, leads.inicio),
      updated_at     = now()
    returning id::text as id, status::text as status, token, (xmax = 0) as created
  `;
  return rows[0];
}

/** Full submit — authoritative overwrite of every answer + consent + audit. */
export async function upsertLeadComplete(
  input: LeadSubmitInput,
  meta: LeadCaptureMeta,
): Promise<LeadUpsertResult> {
  const coach_id = await funnelCoachId();
  const rows = await sql<{ id: string; status: string; token: string; created: boolean }[]>`
    insert into leads (
      email, nombre, telefono, edad, sexo, ubicacion,
      objetivo, carrera_mente, carrera_cual, carrera_cuando, plazo, motivo, inicio,
      competido, categorias_competido, marca_hyrox, dificultad, categoria_objetivo, dobles_pareja,
      anos_entrenando, deportes_origen, nivel, punto_fuerte, punto_debil, material,
      dias_semana, duracion_sesion, flexibilidad_horaria,
      lesion_actual, lesion_zonas, lesiones_pasadas, sueno, estres, alimentacion, recuperacion,
      wearable, marca_5k, marca_10k, marca_hyrox_deka, fc_maxima, estaciones_debiles,
      planes_previos, planes_fallo, espera_coaching, conocido, nota_libre,
      consent_rgpd, consent_at, consent_ip, consent_user_agent,
      submitted_at, submit_ip, submit_user_agent,
      status, source, coach_id
    ) values (
      ${input.email}, ${input.nombre ?? null}, ${input.telefono}, ${input.edad ?? null},
      ${input.sexo ?? null}, ${input.ubicacion ?? null},
      ${input.objetivo ?? null}, ${input.carrera_mente ?? null}, ${input.carrera_cual ?? null},
      ${input.carrera_cuando ?? null}, ${input.plazo ?? null}, ${input.motivo ?? null}, ${input.inicio ?? null},
      ${input.competido ?? null}, ${(input.categorias_competido ?? null) as string[] | null}::text[],
      ${input.marca_hyrox ?? null}, ${input.dificultad ?? null}, ${input.categoria_objetivo ?? null},
      ${input.dobles_pareja ?? null},
      ${input.anos_entrenando ?? null}, ${(input.deportes_origen ?? null) as string[] | null}::text[],
      ${input.nivel ?? null}, ${input.punto_fuerte ?? null}, ${input.punto_debil ?? null},
      ${input.material ?? null}, ${input.dias_semana ?? null}, ${input.duracion_sesion ?? null},
      ${input.flexibilidad_horaria ?? null},
      ${input.lesion_actual ?? null}, ${(input.lesion_zonas ?? null) as string[] | null}::text[],
      ${(input.lesiones_pasadas ?? null) as string[] | null}::text[],
      ${input.sueno ?? null}, ${input.estres ?? null}, ${input.alimentacion ?? null}, ${input.recuperacion ?? null},
      ${input.wearable ?? null}, ${input.marca_5k ?? null}, ${input.marca_10k ?? null},
      ${input.marca_hyrox_deka ?? null}, ${input.fc_maxima ?? null},
      ${(input.estaciones_debiles ?? null) as string[] | null}::text[],
      ${input.planes_previos ?? null}, ${(input.planes_fallo ?? null) as string[] | null}::text[],
      ${input.espera_coaching ?? null}, ${input.conocido ?? null}, ${input.nota_libre ?? null},
      true, now(), ${meta.ip}, ${meta.userAgent},
      now(), ${meta.ip}, ${meta.userAgent},
      'nuevo', 'onboarding_web', ${coach_id === null ? null : Number(coach_id)}
    )
    on conflict (email) do update set
      -- Ver upsertLeadDraft: la atribución es de la captura y no se pisa.
      coach_id             = coalesce(leads.coach_id, excluded.coach_id),
      nombre               = coalesce(excluded.nombre, leads.nombre),
      telefono             = excluded.telefono,
      edad                 = excluded.edad,
      sexo                 = excluded.sexo,
      ubicacion            = excluded.ubicacion,
      objetivo             = excluded.objetivo,
      carrera_mente        = excluded.carrera_mente,
      carrera_cual         = excluded.carrera_cual,
      carrera_cuando       = excluded.carrera_cuando,
      plazo                = excluded.plazo,
      motivo               = excluded.motivo,
      inicio               = excluded.inicio,
      competido            = excluded.competido,
      categorias_competido = excluded.categorias_competido,
      marca_hyrox          = excluded.marca_hyrox,
      dificultad           = excluded.dificultad,
      categoria_objetivo   = excluded.categoria_objetivo,
      dobles_pareja        = excluded.dobles_pareja,
      anos_entrenando      = excluded.anos_entrenando,
      deportes_origen      = excluded.deportes_origen,
      nivel                = excluded.nivel,
      punto_fuerte         = excluded.punto_fuerte,
      punto_debil          = excluded.punto_debil,
      material             = excluded.material,
      dias_semana          = excluded.dias_semana,
      duracion_sesion      = excluded.duracion_sesion,
      flexibilidad_horaria = excluded.flexibilidad_horaria,
      lesion_actual        = excluded.lesion_actual,
      lesion_zonas         = excluded.lesion_zonas,
      lesiones_pasadas     = excluded.lesiones_pasadas,
      sueno                = excluded.sueno,
      estres               = excluded.estres,
      alimentacion         = excluded.alimentacion,
      recuperacion         = excluded.recuperacion,
      wearable             = excluded.wearable,
      marca_5k             = excluded.marca_5k,
      marca_10k            = excluded.marca_10k,
      marca_hyrox_deka     = excluded.marca_hyrox_deka,
      fc_maxima            = excluded.fc_maxima,
      estaciones_debiles   = excluded.estaciones_debiles,
      planes_previos       = excluded.planes_previos,
      planes_fallo         = excluded.planes_fallo,
      espera_coaching      = excluded.espera_coaching,
      conocido             = excluded.conocido,
      nota_libre           = excluded.nota_libre,
      consent_rgpd         = excluded.consent_rgpd,
      consent_at           = excluded.consent_at,
      consent_ip           = excluded.consent_ip,
      consent_user_agent   = excluded.consent_user_agent,
      submitted_at         = excluded.submitted_at,
      submit_ip            = excluded.submit_ip,
      submit_user_agent    = excluded.submit_user_agent,
      -- advance to 'nuevo' only from an earlier state; never regress a worked lead
      status               = case when leads.status in ('parcial', 'nuevo')
                                  then 'nuevo'::lead_status else leads.status end,
      updated_at           = now()
    returning id::text as id, status::text as status, token, (xmax = 0) as created
  `;
  return rows[0];
}

// ── Ownership (multi-tenancy) ────────────────────────────────────────────────────
/**
 * True when `coachId` may act on `leadId` — the coach-side authorization guard
 * (mirror of `coachOwnsAthlete`, lib/injuries). THE ownership rule for leads:
 *
 *   • `leads.coach_id = coachId` — el lead se atribuyó a este club en la captura
 *     (migración 0147: el enlace del embudo tiene dueño).
 *   • `leads.coach_id IS NULL` — «sin asignar» (entró sin enlace atribuible).
 *     Deliberadamente accionable por CUALQUIER club autenticado: alguien tiene que
 *     triarlo, y la captura es el negocio (misma lectura fail-open que el cupo en
 *     lib/leads/funnel-coach.ts). Hoy hay un solo club, así que esto ES el
 *     comportamiento actual; cuando llegue el multi-club, lo sin-asignar pasa a una
 *     superficie de asignación explícita en vez de este fallback.
 *
 * Un lead ASIGNADO a otro club es invisible: los callers mapean `false` a 404
 * (nunca 403 — la existencia no se filtra). Toda consulta coach-facing sobre un
 * lead concreto usa este mismo predicado inline (getLeadDetail, transition/reopen,
 * appointmentWithLead) — esta función es la regla escrita una vez.
 */
export async function coachOwnsLead(
  coachId: bigint | number,
  leadId: bigint,
  client: Sql = sql,
): Promise<boolean> {
  const rows = await client<{ id: string }[]>`
    select id::text as id from leads
    where id = ${Number(leadId)} and (coach_id = ${Number(coachId)} or coach_id is null)
    limit 1
  `;
  return rows.length > 0;
}

// ── Coach pipeline transition ────────────────────────────────────────────────────
export class LeadTransitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'LeadTransitionError';
  }
}

/**
 * Move a lead to a new pipeline status, enforcing the shared NO-RETREAT rule
 * (canTransitionLead): a lead only ever advances (nuevo→contactado→agendado) or is
 * discarded; it never regresses and never leaves a terminal state (convertido/descartado).
 * `convertido` is set by the alta flow (task #5), never here — the seam is noted below.
 * Same "never backwards" invariant as the upserts above; one source of truth.
 *
 * Scoped to the acting coach (the `coachOwnsLead` rule): another club's lead reads as
 * nonexistent → not_found 404.
 */
export async function transitionLeadStatus(args: {
  id: bigint;
  to: string;
  /** The acting coach (session.coach_id) — the lead must be theirs or unassigned. */
  coach_id: bigint;
  /** Who moved it (#43) — recorded on the transition event + audit trail. */
  actor: Actor;
}): Promise<{ id: string; status: LeadStatus }> {
  if (!isCoachSettableLeadStatus(args.to)) {
    throw new LeadTransitionError('invalid_status', 'Estado no válido para el coach', 400);
  }
  const to = args.to; // narrowed to LeadStatus

  // One transaction: re-read + guard, advance, and record WHO moved it (the lead
  // timeline event + last_edited stamp + audit) so the status change and its
  // provenance commit together.
  return await sql.begin(async (tx) => {
    // Ownership predicate inline (same rule as coachOwnsLead) so the guard and the
    // read are ONE roundtrip inside the tx; an alien lead is indistinguishable from
    // a missing one.
    const current = await tx<{ status: LeadStatus }[]>`
      select status::text as status from leads
      where id = ${Number(args.id)}
        and (coach_id = ${Number(args.coach_id)} or coach_id is null)
      limit 1
    `;
    const row = current[0];
    if (!row) throw new LeadTransitionError('not_found', 'Lead no encontrado', 404);

    if (!canTransitionLead(row.status, to)) {
      throw new LeadTransitionError(
        'invalid_transition',
        `El estado del lead no puede pasar de "${row.status}" a "${to}" (solo avanza, nunca retrocede)`,
        409,
      );
    }

    // Optimistic guard: only update if the status is still what we validated against.
    const updated = await tx<{ id: string; status: LeadStatus }[]>`
      update leads
         set status = ${to}::lead_status,
             last_edited_by_user_id = ${args.actor.user_id},
             last_edited_by_kind = ${args.actor.kind},
             updated_at = now()
       where id = ${Number(args.id)} and status = ${row.status}::lead_status
      returning id::text as id, status::text as status
    `;
    if (!updated[0]) throw new LeadTransitionError('conflict', 'El estado cambió, recarga la página', 409);

    await recordLeadTransition(tx, {
      lead_id: args.id,
      from: row.status,
      to,
      actor: args.actor,
    });
    return updated[0];
  });

  // SEAM (task #5): the alta flow sets status='convertido' + creates the athlete row in
  // one transaction. That transition is intentionally NOT reachable from this function.
}

/**
 * Append a lead transition to the timeline (lead_status_events) + the permanent
 * audit trail, in the caller's transaction. The ONE place both are written so a
 * status move can never land without its provenance.
 */
async function recordLeadTransition(
  tx: TransactionClient,
  params: { lead_id: bigint; from: string | null; to: string; actor: Actor },
): Promise<void> {
  await tx`
    insert into lead_status_events (lead_id, from_status, to_status, changed_by_user_id, changed_by_kind)
    values (${Number(params.lead_id)}, ${params.from}, ${params.to}, ${params.actor.user_id}, ${params.actor.kind})
  `;
  await recordAudit(tx, {
    entity_type: 'leads',
    entity_id: params.lead_id,
    action: 'update',
    actor: params.actor,
    diff: { from: params.from, to: params.to },
  });
}

/**
 * Reopen a mis-discarded lead (descartado → nuevo). HUMAN CORRECTION only — separate from
 * the no-retreat pipeline above (which forbids every backwards move). Guarded to only ever
 * act on a `descartado` lead so it can't be used to regress a live or converted one.
 * Scoped to the acting coach (coachOwnsLead rule) — another club's lead → 404.
 */
export async function reopenLead(args: {
  id: bigint;
  /** The acting coach (session.coach_id) — the lead must be theirs or unassigned. */
  coach_id: bigint;
  /** Who reopened it (#43). */
  actor: Actor;
}): Promise<{ id: string; status: LeadStatus }> {
  return await sql.begin(async (tx) => {
    const current = await tx<{ status: LeadStatus }[]>`
      select status::text as status from leads
      where id = ${Number(args.id)}
        and (coach_id = ${Number(args.coach_id)} or coach_id is null)
      limit 1
    `;
    const row = current[0];
    if (!row) throw new LeadTransitionError('not_found', 'Lead no encontrado', 404);
    if (!canReopenLead(row.status)) {
      throw new LeadTransitionError('invalid_reopen', 'Solo se puede reabrir un lead descartado', 409);
    }
    const updated = await tx<{ id: string; status: LeadStatus }[]>`
      update leads
         set status = 'nuevo'::lead_status,
             last_edited_by_user_id = ${args.actor.user_id},
             last_edited_by_kind = ${args.actor.kind},
             updated_at = now()
       where id = ${Number(args.id)} and status = 'descartado'
      returning id::text as id, status::text as status
    `;
    if (!updated[0]) throw new LeadTransitionError('conflict', 'El estado cambió, recarga la página', 409);

    await recordLeadTransition(tx, {
      lead_id: args.id,
      from: row.status,
      to: 'nuevo',
      actor: args.actor,
    });
    return updated[0];
  });
}
