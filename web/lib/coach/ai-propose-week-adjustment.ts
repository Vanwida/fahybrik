import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { type AthleteContextPack } from './coach-ia-context';
import { evaluateAthleteWeek } from './weekly-evaluation';
import { notifyCoach } from '@/lib/notifications/dispatch';
import { chatCompletion, isChatConfigured } from './ai-chat';
import { retrieveRelevant } from '@/lib/rag/retrieve';
import { coerceJson, toJsonValue } from '@/lib/json-column';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import {
  weekAdjustmentProposalJsonSchema,
  type WeekAdjustmentProposalJson,
} from '@fahybrid/shared/schema/week-adjustment';

export type WeekAdjustmentProposalRecord = {
  id: string;
  athlete_id: string;
  week_start: string;
  status: string;
  verdict: string;
  context_pack: AthleteContextPack;
  proposal: WeekAdjustmentProposalJson;
};

export class WeekAdjustmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'WeekAdjustmentError';
  }
}

// --------------------------------------------------------------------------
// LLM wiring — Brain rule: NEVER hardcode model/provider. Alex picks via env.
// --------------------------------------------------------------------------
//
// Two-tier config:
//   1) COACH_IA_MODEL (o PABLO_IA_MODEL, fallback) → optional override SOLO para esta tarea (semana adapt)
//   2) Fallback: LLM_CHAT_MODEL + LLM_API_KEY (shared OpenRouter wiring,
//      same as ai-chat). Reusamos chatCompletion() en lugar de duplicar fetch.
//
// Si nada está configurado o la llamada falla → fallback heurístico
// (comportamiento actual, cero regresión).

function isCoachIaLlmConfigured(): boolean {
  // Si Alex puso COACH_IA_MODEL (o PABLO_IA_MODEL) + alguna API key específica → ready.
  const hasCoachIaOverride =
    Boolean((process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL)?.trim()) &&
    Boolean(
      (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY)?.trim() ??
        process.env.LLM_API_KEY?.trim() ??
        process.env.OPENROUTER_API_KEY?.trim(),
    );
  if (hasCoachIaOverride) return true;
  // Si no, reutiliza el chat estándar.
  return isChatConfigured();
}

function isRagConfigured(): boolean {
  return (
    Boolean(process.env.LLM_PROVIDER?.trim()) &&
    Boolean(process.env.LLM_EMBEDDING_MODEL?.trim()) &&
    Boolean(process.env.LLM_API_KEY?.trim())
  );
}

type TemplateAlternative = {
  id: string;
  name: string;
  format: string | null;
};

async function loadAlternativeTemplates(params: {
  coach_id: number | bigint;
  client: Sql;
  limit?: number;
}): Promise<TemplateAlternative[]> {
  const limit = params.limit ?? 10;
  const rows = await params.client<
    Array<{ id: string; name: string; format: string | null }>
  >`
    select t.id::text as id, t.name, t.format::text as format
    from templates t
    where t.coach_id = ${params.coach_id as number} and t.archived_at is null
    order by t.updated_at desc
    limit ${limit}
  `;
  return rows;
}

async function retrieveMethodologySnippets(params: {
  coach_id: number | bigint;
  context_pack: AthleteContextPack;
  top_k?: number;
}): Promise<string[]> {
  if (!isRagConfigured()) return [];
  try {
    const weakness = params.context_pack.hyrox.weak.join(' ');
    const query = [
      params.context_pack.summary,
      `progression=${params.context_pack.progression_verdict}`,
      `block=${params.context_pack.identity.block_type ?? ''}`,
      weakness,
    ]
      .filter(Boolean)
      .join(' ');
    const chunks = await retrieveRelevant({
      coach_id: BigInt(params.coach_id as number),
      query: query || 'ajuste semanal HYROX metodología del coach',
      top_k: params.top_k ?? 2,
    });
    return chunks.map((c) => c.content.slice(0, 600));
  } catch {
    // RAG sin configurar o fallo → seguimos sin snippets.
    return [];
  }
}

async function loadPlannedWeek(params: {
  athlete_id: number | bigint;
  week_start: string;
  client: Sql;
}): Promise<
  Array<{ iso_date: string; slot: 'am' | 'pm'; template_id: string; template_name: string | null }>
> {
  const weekEnd = isoDateString(addDays(parseIsoDate(params.week_start), 6));
  const rows = await params.client<
    Array<{
      iso_date: string;
      template_id: string;
      template_name: string | null;
      notes: string | null;
    }>
  >`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      wa.template_id::text,
      t.name as template_name,
      wa.notes
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${params.week_start}::date
      and wa.scheduled_for <= ${weekEnd}::date
      and wa.status = 'scheduled'
    order by wa.scheduled_for asc
  `;
  return rows.map((r) => ({
    iso_date: r.iso_date,
    slot: r.notes?.includes('pm') ? 'pm' : 'am',
    template_id: r.template_id,
    template_name: r.template_name,
  }));
}

type LlmCallArgs = {
  context_pack: AthleteContextPack;
  rag_snippets: string[];
  base_week: Array<{
    iso_date: string;
    slot: 'am' | 'pm';
    template_id: string;
    template_name: string | null;
  }>;
  alternatives: TemplateAlternative[];
  /** Cost-telemetry context (A7). */
  coach_id: number | bigint;
  athlete_id: number | bigint;
};

function buildSystemPrompt(): string {
  return [
    'Eres un coach senior de HYROX y entrenamiento híbrido.',
    'Tu único output es un objeto JSON válido con este shape exacto:',
    '{',
    '  "recommendation": "keep" | "soften" | "swap" | "rest_day",',
    '  "rationale": string (máx 2000 caracteres, en español),',
    '  "slot_changes": Array<{ date: "YYYY-MM-DD", slot: "am"|"pm", from_template_id: string|null, to_template_id: string|null }>,',
    '  "coach_summary": string (máx 500 caracteres, en español, accionable para el coach)',
    '}',
    'Reglas:',
    '- Conservador. Si dudas, recomienda "soften", no "swap".',
    '- Solo usa to_template_id de la lista de alternatives proporcionada.',
    '- Máximo 14 slot_changes. Justifica cada cambio en rationale.',
    '- Usa la terminología de fases del propio coach; no impongas un vocabulario de periodización concreto.',
    '- NO inventes nombres de templates ni IDs.',
  ].join('\n');
}

function buildUserPrompt(args: LlmCallArgs): string {
  return JSON.stringify(
    {
      context_pack: args.context_pack,
      methodology_snippets: args.rag_snippets,
      planned_week: args.base_week,
      template_alternatives: args.alternatives,
    },
    null,
    2,
  );
}

async function callCoachIaLlm(args: LlmCallArgs): Promise<WeekAdjustmentProposalJson> {
  // Override puntual de modelo para la IA del coach si Alex lo setea. Si no,
  // chatCompletion() lee LLM_CHAT_MODEL del entorno (estándar del repo).
  const prevModel = process.env.LLM_CHAT_MODEL;
  const prevKey = process.env.LLM_API_KEY;
  const override = (process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL)?.trim();
  const overrideKey = (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY)?.trim();
  try {
    if (override) process.env.LLM_CHAT_MODEL = override;
    if (overrideKey) process.env.LLM_API_KEY = overrideKey;

    const raw = await chatCompletion({
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(args) },
      ],
      json_mode: true,
      temperature: 0.3,
      max_tokens: 2048,
      meta: {
        surface: 'propose_week_adjustment',
        coach_id: args.coach_id,
        athlete_id: args.athlete_id,
      },
    });
    const parsed = JSON.parse(raw) as unknown;
    return validateProposalJson(parsed);
  } finally {
    if (override) {
      if (prevModel === undefined) delete process.env.LLM_CHAT_MODEL;
      else process.env.LLM_CHAT_MODEL = prevModel;
    }
    if (overrideKey) {
      if (prevKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = prevKey;
    }
  }
}

function validateProposalJson(raw: unknown): WeekAdjustmentProposalJson {
  return weekAdjustmentProposalJsonSchema.parse(raw);
}

// --------------------------------------------------------------------------
// Public entrypoint
// --------------------------------------------------------------------------

export async function proposeWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start?: string;
  client?: Sql;
}): Promise<WeekAdjustmentProposalRecord> {
  const client = params.client ?? defaultSql;

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id as number} and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!owned[0]) throw new WeekAdjustmentError('not_found', 'Athlete not found', 404);

  const evaluation = await evaluateAthleteWeek({
    athlete_id: params.athlete_id,
    week_start: params.week_start,
    client,
  });

  const nextWeekStart = isoDateString(addDays(parseIsoDate(evaluation.week_start), 7));

  let proposal: WeekAdjustmentProposalJson;

  if (evaluation.verdict === 'ok') {
    proposal = {
      recommendation: 'keep',
      rationale: 'Semana evaluada OK — mantener plan N+1 sin cambios',
      slot_changes: [],
      coach_summary: evaluation.context_pack.summary,
    } satisfies WeekAdjustmentProposalJson;
  } else if (isCoachIaLlmConfigured()) {
    // Va mal + LLM disponible → intento LLM, fallback heurístico si falla.
    try {
      const [ragSnippets, baseWeek, alternatives] = await Promise.all([
        retrieveMethodologySnippets({
          coach_id: params.coach_id,
          context_pack: evaluation.context_pack,
          top_k: 2,
        }),
        loadPlannedWeek({
          athlete_id: params.athlete_id,
          week_start: nextWeekStart,
          client,
        }),
        loadAlternativeTemplates({ coach_id: params.coach_id, client, limit: 10 }),
      ]);
      proposal = await callCoachIaLlm({
        context_pack: evaluation.context_pack,
        rag_snippets: ragSnippets,
        base_week: baseWeek,
        alternatives,
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
      });
    } catch (err) {
      console.warn(
        '[propose-week-adjustment] Coach IA LLM failed, fallback to heuristic:',
        err instanceof Error ? err.message : err,
      );
      proposal = await buildHeuristicProposal({
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        week_start: nextWeekStart,
        context_pack: evaluation.context_pack,
        client,
      });
    }
  } else {
    // Sin LLM configurado → heurística (comportamiento actual).
    proposal = await buildHeuristicProposal({
      coach_id: params.coach_id,
      athlete_id: params.athlete_id,
      week_start: nextWeekStart,
      context_pack: evaluation.context_pack,
      client,
    });
  }

  // Serializamos ANTES de tocar la DB: si la propuesta trae BigInt en los
  // slot_changes, `JSON.stringify` reventaría — y antes lo hacía DESPUÉS del
  // supersede, dejando al atleta con 0 propuestas pending. Con toJsonValue
  // + transacción, supersede e insert son atómicos: si algo falla, NADA cambia.
  const contextPackJson = toJsonValue(evaluation.context_pack);
  const proposalJson = toJsonValue(proposal);

  // Supersede + insert en UNA transacción: el supersede de la propuesta pending
  // previa NO se confirma hasta que la nueva se inserta con éxito. Un fallo en
  // el insert revierte el supersede → el atleta nunca se queda sin propuesta.
  const ins = await client.begin(async (tx) => {
    await tx`
      update week_adjustment_proposals
      set status = 'superseded', updated_at = now()
      where athlete_id = ${params.athlete_id as number}
        and week_start = ${nextWeekStart}::date
        and status = 'pending'
    `;
    return tx<Array<{ id: string }>>`
      insert into week_adjustment_proposals (
        athlete_id, week_start, status, verdict, context_pack_json, proposal_json
      )
      values (
        ${params.athlete_id as number},
        ${nextWeekStart}::date,
        'pending',
        ${evaluation.verdict === 'ok' ? 'ok' : 'needs_adjustment'},
        ${tx.json(contextPackJson)},
        ${tx.json(proposalJson)}
      )
      returning id::text
    `;
  });

  // Best-effort notify the coach: in-app inbox is the durable channel — a
  // failed notify must not roll back the proposal itself.
  const athleteRows = await client<Array<{ full_name: string }>>`
    select full_name from athletes where id = ${params.athlete_id as number} limit 1
  `;
  const athleteName = athleteRows[0]?.full_name ?? 'Atleta';
  try {
    await notifyCoach({
      sql: client,
      athlete_id: BigInt(params.athlete_id as number),
      type: 'week_adjustment_pending',
      payload: {
        proposal_id: ins[0]!.id,
        athlete_id: String(params.athlete_id),
        athlete_name: athleteName,
        week_start: nextWeekStart,
        verdict: evaluation.verdict === 'ok' ? 'ok' : 'needs_adjustment',
        deep_link: `/es/atletas/${params.athlete_id}/plan?focus=review`,
      },
    });
  } catch {
    // swallow — inbox row is the source of truth; proposal already persisted
  }

  return {
    id: ins[0]!.id,
    athlete_id: String(params.athlete_id),
    week_start: nextWeekStart,
    status: 'pending',
    verdict: evaluation.verdict === 'ok' ? 'ok' : 'needs_adjustment',
    context_pack: evaluation.context_pack,
    proposal,
  };
}

async function buildHeuristicProposal(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  context_pack: AthleteContextPack;
  client: Sql;
}): Promise<WeekAdjustmentProposalJson> {
  const weekEnd = isoDateString(addDays(parseIsoDate(params.week_start), 6));

  const assignments = await params.client<
    Array<{ iso_date: string; template_id: string; notes: string | null }>
  >`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      wa.template_id::text,
      wa.notes
    from workout_assignments wa
    where wa.athlete_id = ${params.athlete_id as number}
      and wa.scheduled_for >= ${params.week_start}::date
      and wa.scheduled_for <= ${weekEnd}::date
      and wa.status = 'scheduled'
    order by wa.scheduled_for asc
  `;

  // The swap target is a template of THIS coach's LIBRARY: owner in the WHERE
  // (never another club's, never a free athlete's instance — 0141 made those
  // real rows), instances excluded, archived excluded. Lowest id = deterministic.
  const recoveryTpl = await params.client<Array<{ id: string }>>`
    select id::text from templates
    where coach_id = ${params.coach_id as number}
      and instance_athlete_id is null
      and archived_at is null
      and (format::text = 'recovery' or name ilike '%recovery%' or name ilike '%recuper%')
    order by id asc limit 1
  `;
  const recoveryId = recoveryTpl[0]?.id ?? null;

  const slotChanges: WeekAdjustmentProposalJson['slot_changes'] = [];
  if (recoveryId && assignments.length > 0) {
    const hardest = assignments[0]!;
    const slot = hardest.notes?.includes('pm') ? 'pm' : 'am';
    slotChanges.push({
      date: hardest.iso_date,
      slot,
      from_template_id: BigInt(hardest.template_id),
      to_template_id: BigInt(recoveryId),
    });
  }

  return weekAdjustmentProposalJsonSchema.parse({
    recommendation: slotChanges.length > 0 ? 'soften' : 'keep',
    rationale: `Coach IA: ${params.context_pack.summary}. Sugerencia conservadora v1.`,
    slot_changes: slotChanges,
    coach_summary: slotChanges.length
      ? 'Va mal — suavizar primera sesión dura de la semana.'
      : 'Va mal — revisar manualmente.',
  });
}

export async function approveWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  proposal_id: number | bigint;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;

  const rows = await client<Array<{ proposal_json: unknown }>>`
    select p.proposal_json
    from week_adjustment_proposals p
    join athletes a on a.id = p.athlete_id
    where p.id = ${params.proposal_id as number}
      and p.athlete_id = ${params.athlete_id as number}
      and a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new WeekAdjustmentError('not_found', 'Proposal not found', 404);

  const proposal = weekAdjustmentProposalJsonSchema.parse(coerceJson(row.proposal_json));

  for (const change of proposal.slot_changes) {
    if (!change.to_template_id) continue;
    // Per-athlete plan bifurcation: fork the swapped-in library template into a
    // private per-athlete INSTANCE per matched assignment (never a shared ref).
    const targets = await client<Array<{ id: string }>>`
      select id::text as id
      from workout_assignments
      where athlete_id = ${params.athlete_id as number}
        and scheduled_for = ${change.date}::date
        and status = 'scheduled'
        and notes ilike ${'%' + change.slot + '%'}
    `;
    for (const target of targets) {
      const instance = await cloneTemplateAsInstance({
        client,
        source_template_id: Number(change.to_template_id),
        athlete_id: params.athlete_id,
      });
      if (!instance) continue;
      await client`
        update workout_assignments
        set template_id = ${instance.template_id},
            template_version = ${instance.version},
            updated_at = now()
        where id = ${Number(target.id)}
      `;
    }
  }

  await client`
    update week_adjustment_proposals
    set status = 'approved', reviewed_by_coach_id = ${params.coach_id as number}, reviewed_at = now()
    where id = ${params.proposal_id as number}
  `;
}

export async function rejectWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  proposal_id: number | bigint;
  client?: Sql;
}): Promise<void> {
  const client = params.client ?? defaultSql;
  const rows = await client<Array<{ id: string }>>`
    update week_adjustment_proposals p
    set status = 'rejected', reviewed_by_coach_id = ${params.coach_id as number}, reviewed_at = now()
    from athletes a
    where p.id = ${params.proposal_id as number}
      and p.athlete_id = ${params.athlete_id as number}
      and a.id = p.athlete_id
      and a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    returning p.id::text
  `;
  if (!rows[0]) throw new WeekAdjustmentError('not_found', 'Proposal not found', 404);
}

export async function listPendingWeekAdjustments(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<WeekAdjustmentProposalRecord[]> {
  const client = params.client ?? defaultSql;
  const rows = await client<
    Array<{
      id: string;
      athlete_id: string;
      week_start: string;
      status: string;
      verdict: string;
      context_pack_json: AthleteContextPack;
      proposal_json: unknown;
    }>
  >`
    select
      p.id::text,
      p.athlete_id::text,
      to_char(p.week_start, 'YYYY-MM-DD') as week_start,
      p.status::text,
      p.verdict,
      p.context_pack_json,
      p.proposal_json
    from week_adjustment_proposals p
    join athletes a on a.id = p.athlete_id
    where a.coach_id = ${params.coach_id as number}
      and p.status = 'pending'
    order by p.week_start asc
  `;

  return rows.map((r) => ({
    id: r.id,
    athlete_id: r.athlete_id,
    week_start: r.week_start,
    status: r.status,
    verdict: r.verdict,
    context_pack: r.context_pack_json,
    proposal: weekAdjustmentProposalJsonSchema.parse(coerceJson(r.proposal_json)),
  }));
}
