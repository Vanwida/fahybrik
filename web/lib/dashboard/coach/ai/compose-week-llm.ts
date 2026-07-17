import 'server-only';

import { z } from 'zod';
import { blockUseModifiersSchema, type BlockUseModifiers } from '@fahybrid/shared/schema/program-templates';
import { callCoachIaLlmJson, CoachIaLlmError } from './llm';
import type { ComposableBlock, MethodologyGroup } from './blocks-catalog';
import {
  buildDay,
  emptyWorkoutDay,
  restDay,
  type BlockPick,
  type ComposeResult,
  type MatchedBlock,
  type ProgramLevel,
  type SessionPick,
  type SuggestedWeekDay,
} from './compose-week-parts';

/**
 * Composer con MODELO: la IA ELIGE y COLOCA los bloques del coach según su foco.
 *
 * Su trabajo NO es escribir entrenos — el contenido ya está escrito, es de Pablo.
 * Es elegir cuál de SUS bloques va cada día y en qué sesión, leyendo lo que el
 * coach pidió. Por eso el prompt es minúsculo: sus títulos + el foco → una lista
 * de ids. Nunca redacta prescripciones, así que no puede alucinar un entreno.
 *
 * Sobre el famoso "revienta el timeout de 120s": es FALSO, y medido. Con los 99
 * bloques reales de Pablo el modelo responde en ~2s (prompt ≈ 4.3k tokens). Lo
 * que reventaba era `max_tokens: 2048` en un modelo que RAZONA: el razonamiento
 * consume el mismo presupuesto que la respuesta, se lo comía entero
 * (finish_reason: "length", ~2k tokens de razonamiento y 74 caracteres de JSON
 * truncado) y el JSON inválido caía al fallback mudo. No era lentitud: era un
 * presupuesto mal puesto. Con holgura (`MAX_TOKENS_WEEK`) responde entero, en los
 * mismos 2s. Ojo: cada provider de OpenRouter cuenta el razonamiento distinto
 * (Alibaba lo mete en max_tokens, GMICloud no), así que el presupuesto se pone
 * para el caso malo.
 */

/**
 * Presupuesto de salida. Cubre razonamiento + JSON de una semana con doble
 * sesión (7 días × 2 sesiones). Medido: ~1.4-2k de razonamiento + ~2.1k de JSON.
 * Quedarse corto NO da un JSON más corto: da un JSON TRUNCADO, que es basura.
 */
const MAX_TOKENS_WEEK = Number(process.env.LLM_CHAT_MAX_TOKENS_WEEK ?? 8192);

const llmBlockRefSchema = z.object({
  block_id: z.number().int().positive(),
  // Mismos modificadores que la inserción manual (intensidad/nivel/duración/
  // rondas). Reutilizamos el schema compartido para no divergir validaciones.
  modifiers: blockUseModifiersSchema.optional(),
});

const llmSessionSchema = z.object({
  blocks: z.array(llmBlockRefSchema).max(4).optional(),
  block_ids: z.array(z.number().int().positive()).max(4).optional(),
  focus: z.string().max(120).optional(),
});

const llmDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  kind: z.enum(['rest', 'workout']),
  /** Doble sesión = dos entradas aquí. Posicional: [0]=am, [1]=pm. */
  sessions: z.array(llmSessionSchema).max(3).optional(),
  // Compat: un día de UNA sesión puede venir con los bloques colgando del día.
  blocks: z.array(llmBlockRefSchema).max(4).optional(),
  block_ids: z.array(z.number().int().positive()).max(4).optional(),
  focus: z.string().max(120).optional(),
});

const llmWeekSchema = z.object({ days: z.array(llmDaySchema).min(1).max(7) });

export interface LlmComposeArgs {
  /** Solo bloques USABLES (tipados): no se le ofrece lo que no se puede insertar. */
  blocks: ComposableBlock[];
  groups: readonly MethodologyGroup[];
  training_days: number[];
  focus: string;
  level: ProgramLevel;
  sessions_per_day: number;
  coach_id: number | bigint;
}

export async function composeWeekLlm(args: LlmComposeArgs): Promise<ComposeResult> {
  const isDouble = args.sessions_per_day >= 2;

  const system = [
    'Eres un coach de HYROX y entrenamiento híbrido de élite.',
    'Compones una SEMANA SELECCIONANDO bloques EXACTOS de la biblioteca del coach.',
    'NUNCA inventas contenido de entreno: solo eliges block_id que existan en el catálogo dado.',
    'Respondes JSON y nada más:',
    '{ "days": [{ "day_of_week": 1-7, "kind": "rest"|"workout", "sessions": [{ "blocks": [{ "block_id": N, "modifiers"?: { "intensity_pct"?, "duration_min"?, "rounds"?, "level"? } }], "focus"?: "texto corto" }] }] }',
    'Reglas:',
    '- Devuelve los 7 días (1=lunes…7=domingo). Un día de descanso es kind:"rest" y sin sessions.',
    '- Usa SOLO block_id del catálogo. No repitas el mismo bloque en la semana.',
    '- Cada sesión lleva 1-2 bloques. Varía los grupos; no apiles fuerza-fuerza-fuerza.',
    '- Sesión dura → recuperación / Z2 al día siguiente.',
    '- `modifiers` es opcional: ajústalo al nivel del atleta solo si aporta.',
  ].join('\n');

  // Las restricciones que el coach pidió, explícitas y numeradas: son órdenes,
  // no sugerencias. La estructura (sesiones/día, qué días) además se GARANTIZA
  // fuera del modelo — esto es para que ELIJA en consecuencia.
  const requirements: string[] = [
    `- Días de entreno EXACTOS: ${args.training_days.join(', ')} (el resto, kind:"rest").`,
  ];
  if (isDouble) {
    requirements.push(
      `- DOBLE SESIÓN: cada día de entreno lleva EXACTAMENTE ${args.sessions_per_day} sesiones en "sessions" ([0]=mañana, [1]=tarde), con bloques DISTINTOS y complementarios (no dos veces el mismo estímulo).`,
    );
  } else {
    requirements.push('- Una sola sesión por día de entreno.');
  }

  const groupName = new Map(args.groups.map((g) => [g.id, g.name_es]));
  const catalog = args.blocks
    .map(
      (b) =>
        `- id=${b.id} | "${b.title}" | grupo=${b.methodology_group_id} (${groupName.get(b.methodology_group_id) ?? '?'})`,
    )
    .join('\n');

  const user = [
    `FOCO DEL COACH (mándalo tú a rajatabla): ${args.focus}`,
    `Nivel del atleta: ${args.level}`,
    '',
    'Requisitos:',
    ...requirements,
    '',
    'Catálogo de bloques del coach (usa SOLO estos block_id):',
    catalog,
  ].join('\n');

  const raw = await callCoachIaLlmJson({
    system,
    user,
    meta: { surface: 'suggest_week_blocks', coach_id: args.coach_id, athlete_id: null },
    temperature: 0.3,
    max_tokens: MAX_TOKENS_WEEK,
  });

  const parsed = llmWeekSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachIaLlmError('invalid_json', `LLM blocks-week schema inválido: ${parsed.error.message}`);
  }

  return materializeLlmWeek(parsed.data, args);
}

interface SessionRefs {
  refs: Array<{ block_id: number; modifiers: BlockUseModifiers | null }>;
  focus?: string | undefined;
}

/**
 * Normaliza la respuesta a sesiones. Acepta el shape nuevo (`sessions[]`) y, por
 * compatibilidad, el viejo de un día de una sola sesión (`blocks`/`block_ids`
 * colgando del día). Un modelo que responde bien de dos formas distintas no es
 * motivo para tirar la semana.
 */
function sessionRefsOf(day: z.infer<typeof llmDaySchema>): SessionRefs[] {
  const toRefs = (s: {
    blocks?: Array<{ block_id: number; modifiers?: BlockUseModifiers }> | undefined;
    block_ids?: number[] | undefined;
  }): Array<{ block_id: number; modifiers: BlockUseModifiers | null }> =>
    s.blocks && s.blocks.length > 0
      ? s.blocks.map((r) => ({ block_id: r.block_id, modifiers: r.modifiers ?? null }))
      : (s.block_ids ?? []).map((id) => ({ block_id: id, modifiers: null }));

  if (day.sessions && day.sessions.length > 0) {
    return day.sessions.map((s) => ({ refs: toRefs(s), focus: s.focus ?? day.focus }));
  }
  const refs = toRefs(day);
  return refs.length > 0 ? [{ refs, focus: day.focus }] : [];
}

/**
 * Resuelve los block_id del LLM contra el catálogo real. block_ids inexistentes
 * se descartan (anotados); días sin ningún match válido → hueco pendiente.
 * Exportada para tests del parseo de la respuesta.
 */
export function materializeLlmWeek(
  data: z.infer<typeof llmWeekSchema>,
  args: Pick<LlmComposeArgs, 'blocks' | 'training_days'>,
): ComposeResult {
  const byId = new Map(args.blocks.map((b) => [b.id, b]));
  const llmByDow = new Map(data.days.map((d) => [d.day_of_week, d]));

  const days: SuggestedWeekDay[] = [];
  const matched: MatchedBlock[] = [];
  const rest_days: number[] = [];
  const missingIds = new Set<number>();
  const usedBlockIds = new Set<number>();

  for (let dow = 1; dow <= 7; dow += 1) {
    const item = llmByDow.get(dow);
    const sessionRefs = item ? sessionRefsOf(item) : [];

    if (!item || item.kind === 'rest' || sessionRefs.length === 0) {
      rest_days.push(dow);
      days.push(restDay(dow));
      continue;
    }

    const sessions: SessionPick[] = [];
    for (const s of sessionRefs) {
      const picked: BlockPick[] = [];
      for (const ref of s.refs) {
        const block = byId.get(ref.block_id);
        if (!block) {
          missingIds.add(ref.block_id);
          continue;
        }
        if (usedBlockIds.has(block.id)) continue; // no repetir el mismo bloque
        usedBlockIds.add(block.id);
        picked.push({ block, modifiers: ref.modifiers });
      }
      if (picked.length > 0) sessions.push({ picked, focus: s.focus });
    }

    if (sessions.length === 0) {
      // Todos los ids inventados/duplicados → hueco anotado, no descanso (el
      // modelo SÍ quería entreno aquí; se deja el slot para que el coach lo llene).
      days.push(emptyWorkoutDay(dow, 'Sesión pendiente (sin bloque válido)', item.focus));
      continue;
    }

    const built = buildDay(dow, sessions);
    days.push(built.day);
    matched.push(...built.matched);
  }

  const notes =
    missingIds.size > 0
      ? `El LLM referenció block_id inexistentes (${[...missingIds].join(', ')}); descartados.`
      : undefined;

  return { days, matched, rest_days, notices: [], notes };
}
