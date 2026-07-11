import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  parseIsoDate,
} from '@fahybrid/shared/domain/dates';
import {
  evaluateAthleteWeek as _evaluateAthleteWeek,
  type FiredTrigger,
  type WeekFeedSummary,
  type WeeklyEvaluationResult,
  type WeeklyVerdict,
} from '@fahybrid/shared/domain/coach/weekly-evaluation';
import { type AthleteContextPack } from './coach-ia-context';
import {
  weekAdjustmentProposalJsonSchema,
  type WeekAdjustmentProposalJson,
} from '@fahybrid/shared/schema/week-adjustment';
import { recordLlmInvocation } from '@/lib/observability/llm-cost';

export type { WeeklyVerdict, WeeklyEvaluationResult };
export { defaultEvaluationWeekStart } from '@fahybrid/shared/domain/coach/weekly-evaluation';

export type WeekAdjustmentProposalRecord = {
  id: string;
  athlete_id: string;
  week_start: string;
  status: 'pending' | 'approved' | 'superseded';
  verdict: WeeklyVerdict;
  context_pack: AthleteContextPack;
  proposal: WeekAdjustmentProposalJson;
  evaluated_week_start: string;
  /** Señales del veredicto YA disparadas, con número real (para el panel del coach). */
  fired_triggers: FiredTrigger[];
  /** Sesiones de la semana evaluada (lun→dom) — "lo que hizo el atleta". */
  week_feed: WeekFeedSummary;
};

export type { FiredTrigger, WeekFeedSummary } from '@fahybrid/shared/domain/coach/weekly-evaluation';

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

export function evaluateAthleteWeek(params: {
  athlete_id: number | bigint;
  week_start?: string | undefined;
  client?: Sql | undefined;
}): Promise<WeeklyEvaluationResult> {
  // Omit week_start when undefined: the shared signature uses exactOptionalPropertyTypes
  // and treats the optional key as absent rather than explicitly undefined.
  return _evaluateAthleteWeek({
    athlete_id: params.athlete_id,
    client: params.client ?? defaultSql,
    ...(params.week_start !== undefined ? { week_start: params.week_start } : {}),
  });
}

/**
 * `JSON.stringify` LANZA sobre BigInt. Los `slot_changes` de la propuesta llevan
 * `from_template_id`/`to_template_id` coercionados a BigInt por `idSchema`
 * (`z.coerce.bigint()`). Los serializamos como Number para que entren en jsonb
 * sin reventar (se re-parsean a BigInt al leer). Mismo replacer bigint-safe que
 * usa `program-months` y el gemelo `lib/coach/ai-propose-week-adjustment`.
 */
function jsonSafeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? Number(v) : v));
}

/**
 * Evalúa la semana N y persiste una propuesta para la semana N+1 (la próxima
 * que Pablo aprobará). Si verdict==='ok', persiste también pero con
 * recommendation='keep' y sin slot_changes — sirve como log auditable.
 */
export async function proposeWeekAdjustment(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start?: string | undefined;
  client?: Sql | undefined;
}): Promise<WeekAdjustmentProposalRecord> {
  const client = params.client ?? defaultSql;

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id as number}
      and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (!owned[0]) throw new WeekAdjustmentError('not_found', 'Atleta no encontrado', 404);

  const evaluation = await evaluateAthleteWeek({
    athlete_id: params.athlete_id,
    week_start: params.week_start,
    client,
  });

  const nextWeekStart = isoDateString(addDays(parseIsoDate(evaluation.week_start), 7));

  let proposal: WeekAdjustmentProposalJson;
  if (evaluation.verdict === 'ok') {
    proposal = weekAdjustmentProposalJsonSchema.parse({
      recommendation: 'keep',
      rationale: 'Semana evaluada OK — mantener plan N+1 sin cambios',
      slot_changes: [],
      coach_summary: evaluation.context_pack.summary,
    });
  } else if (isCoachIaLlmConfigured()) {
    try {
      proposal = await buildLlmProposal({
        coach_id: params.coach_id,
        athlete_id: params.athlete_id,
        week_start: nextWeekStart,
        context_pack: evaluation.context_pack,
        client,
      });
    } catch (err) {
      console.warn(
        '[propose-week-adjustment] Coach IA LLM failed, fallback to heuristic:',
        err instanceof Error ? err.message : err,
      );
      proposal = await buildHeuristicProposal({
        athlete_id: params.athlete_id,
        week_start: nextWeekStart,
        context_pack: evaluation.context_pack,
        client,
      });
    }
  } else {
    proposal = await buildHeuristicProposal({
      athlete_id: params.athlete_id,
      week_start: nextWeekStart,
      context_pack: evaluation.context_pack,
      client,
    });
  }

  // Serializamos ANTES de tocar la DB: si la propuesta trae BigInt en los
  // slot_changes, `JSON.stringify` reventaría — y antes lo hacía DESPUÉS del
  // supersede, dejando al atleta con 0 propuestas pending. Con jsonSafeStringify
  // + transacción, supersede e insert son atómicos: si algo falla, NADA cambia.
  const status = evaluation.verdict === 'ok' ? 'approved' : 'pending';
  const contextPackJson = jsonSafeStringify(evaluation.context_pack);
  const proposalJson = jsonSafeStringify(proposal);

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
        ${status},
        ${evaluation.verdict === 'ok' ? 'ok' : 'needs_adjustment'},
        ${contextPackJson}::jsonb,
        ${proposalJson}::jsonb
      )
      returning id::text
    `;
  });

  return {
    id: ins[0]!.id,
    athlete_id: String(params.athlete_id),
    week_start: nextWeekStart,
    status,
    verdict: evaluation.verdict,
    context_pack: evaluation.context_pack,
    proposal,
    evaluated_week_start: evaluation.week_start,
    fired_triggers: evaluation.fired_triggers,
    week_feed: evaluation.week_feed,
  };
}

async function buildHeuristicProposal(params: {
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

  const recoveryTpl = await params.client<Array<{ id: string }>>`
    select id::text from templates
    where format::text = 'recovery' or name ilike '%recovery%' or name ilike '%recuper%'
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

// --------------------------------------------------------------------------
// LLM wiring — Brain rule: NEVER hardcode model/provider. Alex picks via env.
// Si no hay env → isCoachIaLlmConfigured() devuelve false → fallback heurístico.
// Wire genérico OpenRouter-compatible (fetch directo, sin SDKs extra).
// --------------------------------------------------------------------------

function isCoachIaLlmConfigured(): boolean {
  const model =
    (process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL)?.trim() ?? process.env.LLM_CHAT_MODEL?.trim();
  const key =
    (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY)?.trim() ??
    process.env.LLM_API_KEY?.trim() ??
    process.env.OPENROUTER_API_KEY?.trim();
  return Boolean(model && key);
}

type TemplateAlternative = { id: string; name: string; format: string | null };

async function loadAlternativeTemplates(
  coach_id: number | bigint,
  client: Sql,
  limit = 10,
): Promise<TemplateAlternative[]> {
  const rows = await client<
    Array<{ id: string; name: string; format: string | null }>
  >`
    select t.id::text as id, t.name, t.format::text as format
    from templates t
    where t.coach_id = ${coach_id as number} and t.archived_at is null
    order by t.updated_at desc
    limit ${limit}
  `;
  return rows;
}

async function loadPlannedWeekForLlm(
  athlete_id: number | bigint,
  week_start: string,
  client: Sql,
): Promise<Array<{ iso_date: string; slot: 'am' | 'pm'; template_id: string; template_name: string | null }>> {
  const weekEnd = isoDateString(addDays(parseIsoDate(week_start), 6));
  const rows = await client<
    Array<{ iso_date: string; template_id: string; template_name: string | null; notes: string | null }>
  >`
    select
      to_char(wa.scheduled_for, 'YYYY-MM-DD') as iso_date,
      wa.template_id::text,
      t.name as template_name,
      wa.notes
    from workout_assignments wa
    left join templates t on t.id = wa.template_id
    where wa.athlete_id = ${athlete_id as number}
      and wa.scheduled_for >= ${week_start}::date
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

async function buildLlmProposal(params: {
  coach_id: number | bigint;
  athlete_id: number | bigint;
  week_start: string;
  context_pack: AthleteContextPack;
  client: Sql;
}): Promise<WeekAdjustmentProposalJson> {
  const [baseWeek, alternatives] = await Promise.all([
    loadPlannedWeekForLlm(params.athlete_id, params.week_start, params.client),
    loadAlternativeTemplates(params.coach_id, params.client, 10),
  ]);

  // NO RAG en el paquete `coach/` — pgvector retrieve vive en el paquete web.
  // Cuando se unifiquen, importar retrieveRelevant aquí también.
  const rag_snippets: string[] = [];

  const raw = await callCoachIaLlm({
    context_pack: params.context_pack,
    rag_snippets,
    base_week: baseWeek,
    alternatives,
    coach_id: params.coach_id,
    athlete_id: params.athlete_id,
  });
  return weekAdjustmentProposalJsonSchema.parse(raw);
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

async function callCoachIaLlm(args: LlmCallArgs): Promise<unknown> {
  const provider = ((process.env.COACH_IA_PROVIDER ?? process.env.PABLO_IA_PROVIDER) ?? process.env.LLM_PROVIDER ?? 'openrouter')
    .trim()
    .toLowerCase();
  const model = ((process.env.COACH_IA_MODEL ?? process.env.PABLO_IA_MODEL) ?? process.env.LLM_CHAT_MODEL)!.trim();
  const apiKey = (
    (process.env.COACH_IA_API_KEY ?? process.env.PABLO_IA_API_KEY) ??
    process.env.LLM_API_KEY ??
    process.env.OPENROUTER_API_KEY
  )!.trim();

  const baseUrl =
    process.env.LLM_BASE_URL?.trim() ??
    (provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_APP_TITLE?.trim();
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(args) },
    ],
    temperature: 0.3,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.LLM_CHAT_TIMEOUT_MS ?? 120_000)),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Coach IA LLM request failed (${res.status}): ${text || res.statusText}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  // Best-effort cost telemetry (A7).
  if (json.usage) {
    void recordLlmInvocation({
      surface: 'weekly_eval',
      model,
      usage: json.usage,
      coach_id: args.coach_id,
      athlete_id: args.athlete_id,
    });
  }

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Coach IA LLM response empty');
  return JSON.parse(content);
}
