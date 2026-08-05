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
import {
  parseNotationCell,
  type ParsedLine,
  type ParseNotationCellOptions,
} from '@fahybrid/shared/domain/import/notation';
import { parseStrength } from '@fahybrid/shared/domain/import/strength';
import { isNoiseLine, looksLikeBareMovementName } from '@fahybrid/shared/domain/import/label';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { resolveExercise } from './exercise-resolve';
import { workoutCards, cardToSessionText, type ImportedCard, type ImportedWeek } from './imported-week';
import { fillMissingWithDefaults } from './fill-defaults';
import { resolveImportDefaults } from '@/lib/coach/import-defaults';
import type { ImportDefaultsValues } from '@fahybrid/shared/domain/coach-import-defaults';
import type { EditorSession, EditorBlock, EditorItem, StructureGroup } from '@/lib/dashboard/v2/editor-types';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';

export interface ProposalFlag {
  uid: string;
  /**
   * `incomplete` (shared/domain/import/result.ts, cards-only via
   * `bareNamesAreExercises`) — the exercise IS known (a real movement name
   * off a photographed card), its dose is not: neither `detected` (full
   * confidence) nor `review` (nothing structured provable, verbatim text
   * only). The coach still needs to add sets/reps, same as `review` — every
   * `confidence !== 'detected'` check in this module treats the two alike.
   */
  confidence: 'detected' | 'review' | 'incomplete';
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
  /**
   * Values the importer PROPOSED because the photo didn't show them (rest
   * between sets, strength RIR, a rep range) — the coach confirms or overrides
   * them in review, never shipped un-reviewed. Same shape as `FilledField`
   * (web/lib/import/fill-defaults.ts) WITHOUT `reason` — the provenance never
   * leaves this module. Contract ratified with import-review.ts, which already
   * reads this field name. CARDS-ONLY, same as `truncations`: fill-defaults.ts
   * and coach-import-defaults.ts are both scoped to "what the PHOTO didn't
   * show" — the Excel/pegado path is the coach's own verbatim text and is never
   * filled. Absent when nothing was proposed.
   */
  filled?: Array<{ item_uid: string; field: 'reps' | 'rest' | 'intensity'; path: string }>;
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
 *  extracted so both paths run byte-identical logic. `parseOpts` is how the
 *  cards path turns on `bareNamesAreExercises` — the no-cards path never
 *  passes it, so Excel/pegado behavior is untouched. */
async function parseWithAssist(
  text: string,
  llmAssist?: LlmAssist,
  parseOpts?: ParseNotationCellOptions,
): Promise<ParsedLine[]> {
  let lines = parseNotationCell(text, parseOpts);
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
 * A CARD's dose can live on its OWN line instead of each movement's ("P:
 * Realiza 4 series de entre 12-15 repeticiones por ejercicio con 1 minuto de
 * descanso entre series." under three bare names) — common enough in this
 * source to name. The grammar types ONE line at a time (shared/domain/import/
 * notation.ts) so it never sees this: it correctly types the dose clause but,
 * having no movement of its own to attach it to, downgrades it to `review`
 * with an EMPTY token (`finalizeDetected`'s short-token guard, shared/domain/
 * import/result.ts — "P" and "90-90" are the two real cases it exists for).
 * This re-parses that SAME raw text with the grammar's OWN strength reader
 * (`parseStrength` — reused, not reinvented) to recover the sets it already
 * typed once, applies them to every bare-name (`incomplete`) line in the card,
 * and drops the now-redundant orphan.
 *
 * Conditions — anything outside these is left EXACTLY as the grammar produced
 * it, never guessed:
 *   · at least one `incomplete` line to receive the dose;
 *   · EXACTLY one orphan candidate — two would mean "which dose goes with
 *     which name?", genuinely unknowable, so both stay untouched;
 *   · the candidate's raw text must itself re-type as a real sets scheme
 *     (parseStrength succeeds with a non-empty `sets[]`) — prose that merely
 *     LOOKS orphaned (a dense WOD review line, "no confident dose recognized")
 *     is never coerced into a dose.
 *
 * The orphan's own raw text is returned too (`orphanText`) — not discarded.
 * The caller (`buildCardBlock`) carries it into `EditorBlock.coach_note`, the
 * SAME field a library block already uses for a verbatim prescription that
 * doesn't fit the structure (`WeekDayPart.coach_note`). This is not an
 * attempt to isolate "just the leftover, non-dose words" (no clean way to do
 * that against free text without re-implementing the grammar's own regex
 * cascade) — it keeps the coach's ORIGINAL phrasing visible next to the dose
 * it produced, which is strictly more transparent than silence.
 */
function redistributeOrphanDose(lines: ParsedLine[]): { lines: ParsedLine[]; orphanText?: string } {
  const hasIncomplete = lines.some((l) => l.confidence === 'incomplete');
  if (!hasIncomplete) return { lines };

  const candidates: Array<{ line: ParsedLine; dose: Prescription }> = [];
  for (const l of lines) {
    if (l.confidence !== 'review' || l.exercise_token !== '') continue;
    const parsed = parseStrength(l.prescription.note ?? '');
    if (parsed && parsed.prescription.sets && parsed.prescription.sets.length > 0) {
      candidates.push({ line: l, dose: parsed.prescription });
    }
  }
  if (candidates.length !== 1) return { lines };
  const { line: orphan, dose } = candidates[0]!;

  const nextLines = lines
    .filter((l) => l !== orphan)
    .map((l): ParsedLine => {
      if (l.confidence !== 'incomplete') return l;
      return { ...l, confidence: 'detected', review_reasons: [], prescription: structuredClone(dose) };
    });
  return { lines: nextLines, orphanText: orphan.prescription.note };
}

// "16 Sets 8 Exercises" / "0/10 Sets 0/5 Exercises" — a progress COUNTER, not
// content. Same shape `isNoiseLine` already drops it for (COUNTER_LINE_RE,
// shared/domain/import/label.ts) — reproduced narrowly here (not imported;
// that const isn't exported, and this pattern is small/stable enough to own).
const COUNTER_SHAPE_RE = /^\d+(?:\/\d+)?\s+sets?\s+\d+(?:\/\d+)?\s+exercises?\s*$/i;
// "Video ...", "Notas..." — a label pointing at something the photo didn't
// capture, not the content itself. Keeping it as a "note" would just repeat
// what the truncation signal already says. Same shape as label.ts's private
// METADATA_MARKER_RE, reproduced for the same reason as above.
const METADATA_ONLY_RE = /^(?:video|notas?|fotos?|link|enlace|url)\s*\.{0,3}$/i;

/**
 * A card's own text that `isNoiseLine` correctly keeps OUT of the exercise
 * grammar (it is not a movement, not a dose) but that then vanishes with
 * ZERO trace — not an item, not a flag, nowhere. Real example from the
 * fixture this was built against: a "Bici Libre Z2" card whose ONLY content
 * is "Hora y media de rodar libre soltando piernas, tranquilo." — a whole
 * card's prescription, in prose, gone today. Deliberately narrow: excludes
 * the metadata/counter shapes that ARE correctly meaningless (see the two
 * regexes above) and anything under 3 words (a stray fragment, not a note).
 */
function cardLostProse(card: ImportedCard): string | undefined {
  const titleFold = card.title?.trim().toLocaleLowerCase('es');
  const lost = card.lines.filter((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return false;
    if (titleFold && trimmed.toLocaleLowerCase('es') === titleFold) return false;
    if (looksLikeBareMovementName(trimmed)) return false; // becomes its own `incomplete` item
    if (!isNoiseLine(trimmed)) return false; // typed normally elsewhere — not lost
    if (COUNTER_SHAPE_RE.test(trimmed) || METADATA_ONLY_RE.test(trimmed)) return false;
    return trimmed.split(/\s+/).filter(Boolean).length >= 3;
  });
  return lost.length > 0 ? lost.join('\n') : undefined;
}

/**
 * `cardToSessionText` prepends the card's own TITLE so an ALL-CAPS one seeds
 * `isBlockTitle` (imported-week.ts's documented contract). But a title is not
 * always ALL-CAPS — the real fixture carries "Running", "Fuerza", "Metcon" —
 * and `isBlockTitle` requires it, so a short, dose-less, mixed-case title
 * slips past it. With `bareNamesAreExercises` on, that same title then reads
 * as a plausible bare movement name and fabricates a fake exercise called
 * "Running". A card's title is NEVER an exercise — it is the card's own
 * heading, by the data model's own contract (`ImportedCard.title`) — so an
 * `incomplete` line whose token IS the title, verbatim, is that misread, not
 * a movement. Dropped before anything downstream (redistribution, resolve)
 * ever sees it, so it cannot become a fake item nor a false "bare name" for
 * `redistributeOrphanDose` to count.
 */
function dropTitleMisreadAsExercise(lines: ParsedLine[], title: string | null): ParsedLine[] {
  if (!title) return lines;
  const titleFold = title.trim().toLocaleLowerCase('es');
  if (!titleFold) return lines;
  return lines.filter(
    (l) => !(l.confidence === 'incomplete' && l.exercise_token.trim().toLocaleLowerCase('es') === titleFold),
  );
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
  const parsed = await parseWithAssist(cardToSessionText(card), llmAssist, { bareNamesAreExercises: true });
  const withoutTitle = dropTitleMisreadAsExercise(parsed, card.title);
  const { lines, orphanText } = redistributeOrphanDose(withoutTitle);
  const { items, flags } = await resolveLines(coach_id, sql, lines);
  // Verbatim text the card carried that isn't dose, isn't a movement, and
  // isn't the title — the orphan's own line (when redistributed) plus any
  // other prose the grammar correctly keeps out of the exercise model. Same
  // field a library block already uses for verbatim prescription text
  // (WeekDayPart.coach_note) — never a new channel.
  const coachNote = [orphanText, cardLostProse(card)].filter((t): t is string => !!t).join('\n\n');
  const block: EditorBlock = {
    uid: uid('blk'),
    // El título es el de LA TARJETA, no la primera línea del estímulo del día —
    // ese era el bug: tres tarjetas cayendo bajo el título de la primera.
    title: (card.title ?? 'Sesión').slice(0, 120),
    format: blockFormat(lines),
    group: structureGroup(card.title),
    ...(coachNote ? { coach_note: coachNote } : {}),
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
 *
 * `defaults` fills whatever gap the photo left (rest / RIR / rep range) via
 * `fillMissingWithDefaults`, called AFTER the grammar + resolver so it works
 * on the FINAL typed prescriptions, and only for lines the grammar actually
 * typed — a `review`-confidence item is excluded (`review_item_uids`): there
 * is no structure to hang a default on, and filling over raw text would be
 * inventing on top of an unknown.
 */
async function buildDayFromCards(
  coach_id: number,
  sql: Sql,
  d: { day_of_week: number; dow: string; stimulus: string | null; cards: readonly ImportedCard[] },
  cards: readonly ImportedCard[],
  llmAssist: LlmAssist | undefined,
  defaults: ImportDefaultsValues,
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

  const rawSession: EditorSession = {
    uid: uid('ses'),
    slot: 'am',
    focus: d.stimulus?.split('\n')[0]?.slice(0, 120),
    blocks,
  };
  // `incomplete` excluded exactly like `review`: neither carries a typed dose
  // (`sets`) to hang a default on — `fillItem`'s own `sets.length === 0` early
  // return would already skip an `incomplete` item, but naming it here keeps
  // the exclusion's intent explicit instead of relying on that as a side effect.
  const noFillUids = flags
    .filter((f) => f.confidence === 'review' || f.confidence === 'incomplete')
    .map((f) => f.uid);
  const fillResult = fillMissingWithDefaults([rawSession], defaults, { review_item_uids: noFillUids });
  const session = fillResult.sessions[0]!;

  const dayNeedsReview =
    flags.some((f) => f.confidence !== 'detected' || f.unresolved_exercise) || truncations.length > 0;
  const day: ProposalDay = {
    day_of_week: d.day_of_week,
    dow: d.dow,
    stimulus: d.stimulus,
    sessions: [session],
    flags,
    state: dayNeedsReview ? 'review' : 'detected',
    ...(truncations.length > 0 ? { truncations } : {}),
    ...(fillResult.filled.length > 0
      ? { filled: fillResult.filled.map(({ item_uid, field, path }) => ({ item_uid, field, path })) }
      : {}),
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

  // Resolved LAZILY, once, on first use — an Excel/pegado-only import never
  // touches the cards path and so never pays this extra round trip.
  let importDefaults: ImportDefaultsValues | null = null;
  async function getImportDefaults(): Promise<ImportDefaultsValues> {
    importDefaults ??= await resolveImportDefaults(coach_id, sql);
    return importDefaults;
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
          await getImportDefaults(),
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
      // `!== 'detected'` (not `=== 'review'`): `bareNamesAreExercises` is never
      // passed here, so `incomplete` can't occur on this path today — this
      // guards against that changing under this code without anyone noticing,
      // for free, the same guard the cards path uses.
      const dayNeedsReview = flags.some((f) => f.confidence !== 'detected' || f.unresolved_exercise);
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
