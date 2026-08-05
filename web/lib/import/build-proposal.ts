import 'server-only';

// #28 — the IMPORT ORCHESTRATOR. Ties the three units into a typed, per-day
// proposal the coach reviews before anything is saved:
//   xlsx+range (ImportedWeek[]) → grammar (parseNotationCell) → exercise resolve
//   (per-coach synonym cascade) → EditorSession per day + review flags.
// Everything typed goes through prescriptionSchema (inside the grammar); dense
// lines the grammar can't type come back confidence='review' and OPTIONALLY get a
// second attempt from the LLM (Fork A: grammar first, IA only for the dense) via
// the injected `llmAssist` seam — kept injectable so this module stays pure-
// testable without a model and never hardcodes one.
//
// CARDS — a day is not always one block. Excel/pegado hand us ONE text blob per
// day (CAPA 2), which is why this module used to build exactly one block + one
// session, always. A photo reader sees the day as it really is: several DISTINCT
// session cards (`ImportedDay.cards`, see ./imported-week) — a mobility warm-up,
// an erg piece, a run, each with its own heading. Collapsing three into one block
// titled with the first line of the day's stimulus is a workout that never
// existed. When `cards` is present, this module builds ONE EditorBlock PER
// workout card instead, in order, each keeping its own title. The two paths are
// EXCLUSIVE (see `buildDayFromCards` below) — a source with no card structure
// (the spreadsheet) is untouched, byte for byte.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { parseNotationCell, type ParsedLine } from '@fahybrid/shared/domain/import/notation';
import { resolveExercise } from './exercise-resolve';
import { workoutCards, cardToSessionText, type ImportedCard, type ImportedWeek } from './imported-week';
import type { EditorSession, EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';

export interface ProposalFlag {
  uid: string;
  confidence: 'detected' | 'review';
  review_reasons: string[];
  /** The exercise token did not resolve to a catalog id — the coach must pick/create. */
  unresolved_exercise: boolean;
  resolved_via?: 'synonym' | 'alias' | 'name_exact' | 'name_substring';
  /** The raw token, so the review UI can offer "learn as synonym" on resolve. */
  exercise_token: string;
}

export interface ProposalDay {
  day_of_week: number;
  dow: string;
  /** Capa-1 stimulus line → the day/session focus (intent, not dosage). */
  stimulus: string | null;
  /**
   * The day's typed sessions. EMPTY = rest day / empty cell.
   *
   * An array, not a single session, because a day genuinely has N: one is the
   * normal case, TWO is a double session (am + pm) and the coach asks for it in
   * so many words. The slot is POSITIONAL here exactly like everywhere else in
   * the domain ([0]=am, [1]=pm — see `slotLabelForSessionIndex`), so this now
   * speaks the same language as `weekDaySchema.sessions` instead of flattening
   * every day into one `am` and quietly losing half the week.
   */
  sessions: EditorSession[];
  flags: ProposalFlag[];
  /** Overall day state for the review grid: green / amber / rest. */
  state: 'detected' | 'review' | 'rest';
  /**
   * Free text that names no work — a `note`-kind card ("Recuerda hidratar",
   * "Pesaje semanal el viernes"). Destined for `WeekDay.notes`
   * (shared/schema/program-templates.ts, `z.string().max(800)`). Reading it
   * into the review model and forwarding it in the confirm body is downstream
   * of this module (import-review.ts's `ReviewDay`/`ConfirmBody`, same as
   * `truncations` below) — not built here. Absent when the source carries no
   * `cards` at all or none of them are `note`-kind — never an empty string.
   */
  notes?: string;
  /**
   * Blocks a card left CUT OFF ("4 More" — `ImportedCard.truncated`), keyed by
   * the block's own uid. Matches the wire shape `web/lib/dashboard/v2/import-
   * review.ts` already reads (`BlockTruncation`/`TruncationWire`,
   * `dayHiddenCount`, `dayTone`) — that module was built to consume exactly
   * this field before this module produced it, so this is the EXISTING channel,
   * not a new one. `hidden_count: null` = the source cut the card but didn't
   * say how much it hid. Absent when nothing was truncated.
   */
  truncations?: Array<{ block_uid: string; hidden_count: number | null }>;
}

export interface ProposalWeek {
  week: number;
  sheet: string;
  fell_back: boolean;
  days: ProposalDay[];
}

export interface ImportProposal {
  weeks: ProposalWeek[];
  summary: { total_items: number; detected: number; review: number; unresolved: number };
  /**
   * Lo que NO se pudo honrar de lo que pidió el coach (contenido sin tipar, IA
   * caída…). Viaja con la propuesta para que la revisión lo enseñe: un hueco
   * rellenado en silencio es el fallo, no la falta de contenido.
   */
  notices?: WeekNotice[];
}

/** A rest-day cell — no session to type. */
const REST_RE = /descanso|rest\s*day|off\b/i;

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `imp-${prefix}-${seq}`;
}

/** Optional LLM second pass for a review line (Fork A). Injected so the module
 *  is testable without a model; the endpoint wires the real callCoachIaLlmJson. */
export type LlmAssist = (text: string) => Promise<ParsedLine[] | null>;

/**
 * The block's format label = the dominant scheme among its items.
 *
 * Cards call this exactly like the no-cards path does, per-card instead of
 * per-day — same criterion, just applied at the finer grain. NOT yet
 * `superset`-aware: recognising a coach's `A1/A2` rotation notation and
 * choosing that format is a grammar-level concern that lives in
 * `shared/domain/import/label.ts` (in progress in parallel right now). This is
 * the deliberate plug point — once that lands, swap the naive
 * `lines[0]?.prescription.scheme` read below for whatever it returns; nothing
 * else about the cards path needs to change.
 */
function blockFormat(lines: ParsedLine[]): string | null {
  return lines[0]?.prescription.scheme ?? null;
}

function structureGroup(stimulus: string | null): StructureGroup {
  return 'principal';
}

/** Grammar first (exact, no hallucination), then ONE optional LLM attempt for
 *  whatever the grammar left `review` (a successful, schema-valid parse
 *  upgrades the line; otherwise it stays `review`, never fabricated). The SAME
 *  step whether `text` is a whole day's session_text blob or one card's body —
 *  extracted so both paths run byte-identical logic. */
async function parseWithAssist(text: string, llmAssist?: LlmAssist): Promise<ParsedLine[]> {
  let lines = parseNotationCell(text);
  if (llmAssist) {
    const upgraded: ParsedLine[] = [];
    for (const ln of lines) {
      if (ln.confidence === 'review') {
        try {
          const alt = await llmAssist(ln.prescription.note ?? text);
          if (alt && alt.length > 0) {
            upgraded.push(...alt);
            continue;
          }
        } catch {
          // best-effort; keep the grammar's honest review line.
        }
      }
      upgraded.push(ln);
    }
    lines = upgraded;
  }
  return lines;
}

/** Resolve every parsed line against the coach's catalog, in order, and build
 *  its editor item + review flag. The SAME item/flag shape whether the lines
 *  came from a whole day or one card. */
async function resolveLines(
  coach_id: number,
  sql: Sql,
  lines: ParsedLine[],
): Promise<{ items: EditorItem[]; flags: ProposalFlag[] }> {
  const items: EditorItem[] = [];
  const flags: ProposalFlag[] = [];
  for (const ln of lines) {
    const hit = await resolveExercise(coach_id, ln.exercise_token, sql);
    const itemUid = uid('it');
    items.push({
      uid: itemUid,
      exercise_id: hit.exercise_id,
      exercise_name: ln.exercise_token,
      prescription: ln.prescription,
      notes: ln.prescription.note,
    });
    const isUnresolved = hit.exercise_id === null;
    flags.push({
      uid: itemUid,
      confidence: ln.confidence,
      review_reasons: ln.review_reasons,
      unresolved_exercise: isUnresolved,
      resolved_via: hit.exercise_id !== null ? hit.via : undefined,
      exercise_token: ln.exercise_token,
    });
  }
  return { items, flags };
}

/**
 * `note`-kind cards, joined — the one card kind with nowhere else to go (a
 * block would misrepresent it as work). Returns an object ready to SPREAD onto
 * the day, never a bare `notes: undefined` — a source with no `cards` at all
 * (or none of them `note`) must add NOTHING to the day's shape, or the
 * no-cards path stops being byte-identical to before.
 */
function dayNotesField(cards: readonly ImportedCard[] | undefined): { notes?: string } {
  const noteCards = (cards ?? []).filter((c) => c.kind === 'note');
  if (noteCards.length === 0) return {};
  const text = noteCards
    .map(cardToSessionText)
    .filter((t) => t.length > 0)
    .join('\n\n');
  return text.length > 0 ? { notes: text } : {};
}

/**
 * Build one card's block: parse → resolve → wrap. Whether the SOURCE cut the
 * card off is NOT this function's concern (it can only speak for the block it
 * built) — the caller reports that at the day level, see `ProposalDay.truncations`.
 */
async function buildCardBlock(
  coach_id: number,
  sql: Sql,
  card: ImportedCard,
  llmAssist: LlmAssist | undefined,
): Promise<{ block: EditorBlock; flags: ProposalFlag[] }> {
  const lines = await parseWithAssist(cardToSessionText(card), llmAssist);
  const { items, flags } = await resolveLines(coach_id, sql, lines);
  const block: EditorBlock = {
    uid: uid('blk'),
    // El título es el de LA TARJETA, no la primera línea del estímulo del día —
    // ese era el bug: tres tarjetas cayendo bajo el título de la primera.
    title: (card.title ?? 'Sesión').slice(0, 120),
    format: blockFormat(lines),
    group: structureGroup(card.title),
    items,
  };
  return { block, flags };
}

/**
 * The cards path: one block per workout card, in order. `session_text` is
 * IGNORED entirely here — the vision reader fills BOTH `cards` and
 * `session_text` (the latter is the concatenation of the workout cards, kept
 * so a reader with no cards-aware caller still gets a session), and running
 * both would double every block: once per card, once from the concatenated
 * blob. Exclusive by construction — this function is only called when there
 * is at least one workout card.
 *
 * A card the source cut off (`truncated`) reports its `block_uid` +
 * `hidden_count` into `ProposalDay.truncations` — the day-level channel
 * `import-review.ts` already reads, never a per-item hack — so a block that
 * lost content downstream of what the source showed can never look complete.
 */
async function buildDayFromCards(
  coach_id: number,
  sql: Sql,
  d: { day_of_week: number; dow: string; stimulus: string | null; cards: readonly ImportedCard[] },
  cards: readonly ImportedCard[],
  llmAssist: LlmAssist | undefined,
): Promise<{ day: ProposalDay; flags: ProposalFlag[] }> {
  const blocks: EditorBlock[] = [];
  const flags: ProposalFlag[] = [];
  const truncations: NonNullable<ProposalDay['truncations']> = [];
  for (const card of cards) {
    const built = await buildCardBlock(coach_id, sql, card, llmAssist);
    blocks.push(built.block);
    flags.push(...built.flags);
    if (card.truncated) {
      truncations.push({ block_uid: built.block.uid, hidden_count: card.hidden_count ?? null });
    }
  }

  const session: EditorSession = {
    uid: uid('ses'),
    slot: 'am',
    focus: d.stimulus?.split('\n')[0]?.slice(0, 120),
    blocks,
  };
  const dayNeedsReview =
    flags.some((f) => f.confidence === 'review' || f.unresolved_exercise) || truncations.length > 0;
  const day: ProposalDay = {
    day_of_week: d.day_of_week,
    dow: d.dow,
    stimulus: d.stimulus,
    sessions: [session],
    flags,
    state: dayNeedsReview ? 'review' : 'detected',
    ...(truncations.length > 0 ? { truncations } : {}),
    ...dayNotesField(d.cards),
  };
  return { day, flags };
}

export async function buildImportProposal(params: {
  coach_id: number;
  weeks: ImportedWeek[];
  llmAssist?: LlmAssist;
  client?: Sql;
}): Promise<ImportProposal> {
  const sql = params.client ?? defaultSql;
  const { coach_id, weeks, llmAssist } = params;

  let total = 0;
  let detected = 0;
  let review = 0;
  let unresolved = 0;

  function countFlags(flags: ProposalFlag[]): void {
    for (const f of flags) {
      total += 1;
      if (f.confidence === 'detected') detected += 1;
      else review += 1;
      if (f.unresolved_exercise) unresolved += 1;
    }
  }

  const outWeeks: ProposalWeek[] = [];
  for (const w of weeks) {
    const days: ProposalDay[] = [];
    for (const d of w.days) {
      // The two paths are EXCLUSIVE. A source with card structure and at least
      // one workout card takes it; everything else (no `cards`, or `cards`
      // present but nothing to train on — an empty day, or only note/metrics/
      // rest cards) falls to the untouched legacy path below, whose own empty-
      // text check already resolves a workout-less day to 'rest'.
      const cards = workoutCards(d);
      if (d.cards !== undefined && cards.length > 0) {
        const built = await buildDayFromCards(
          coach_id,
          sql,
          { day_of_week: d.day_of_week, dow: d.dow, stimulus: d.stimulus, cards: d.cards },
          cards,
          llmAssist,
        );
        countFlags(built.flags);
        days.push(built.day);
        continue;
      }

      const text = d.session_text?.trim() ?? '';
      if (!text || REST_RE.test(text)) {
        days.push({
          day_of_week: d.day_of_week,
          dow: d.dow,
          stimulus: d.stimulus,
          sessions: [],
          flags: [],
          state: 'rest',
          ...dayNotesField(d.cards),
        });
        continue;
      }

      const lines = await parseWithAssist(text, llmAssist);
      const { items, flags } = await resolveLines(coach_id, sql, lines);
      countFlags(flags);

      const block: EditorBlock = {
        uid: uid('blk'),
        title: (d.stimulus?.split('\n')[0] ?? 'Sesión').slice(0, 120),
        format: blockFormat(lines),
        group: structureGroup(d.stimulus),
        items,
      };
      const session: EditorSession = {
        uid: uid('ses'),
        slot: 'am',
        focus: d.stimulus?.split('\n')[0]?.slice(0, 120),
        blocks: [block],
      };
      const dayNeedsReview = flags.some((f) => f.confidence === 'review' || f.unresolved_exercise);
      days.push({
        day_of_week: d.day_of_week,
        dow: d.dow,
        stimulus: d.stimulus,
        // El Excel/pegado transcriben UNA sesión por día: eso es lo que el coach
        // escribió, y no se inventa una segunda.
        sessions: [session],
        flags,
        state: dayNeedsReview ? 'review' : 'detected',
        ...dayNotesField(d.cards),
      });
    }
    outWeeks.push({ week: w.week, sheet: w.sheet, fell_back: w.fell_back, days });
  }

  return {
    weeks: outWeeks,
    summary: { total_items: total, detected, review, unresolved },
  };
}
