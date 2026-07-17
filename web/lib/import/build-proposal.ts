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

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { parseNotationCell, type ParsedLine } from '@fahybrid/shared/domain/import/notation';
import { resolveExercise } from './exercise-resolve';
import type { ImportedWeek } from './xlsx-reader';
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

/** The block's format label = the dominant scheme among its items. */
function blockFormat(lines: ParsedLine[]): string | null {
  return lines[0]?.prescription.scheme ?? null;
}

function structureGroup(stimulus: string | null): StructureGroup {
  return 'principal';
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

  const outWeeks: ProposalWeek[] = [];
  for (const w of weeks) {
    const days: ProposalDay[] = [];
    for (const d of w.days) {
      const text = d.session_text?.trim() ?? '';
      if (!text || REST_RE.test(text)) {
        days.push({
          day_of_week: d.day_of_week,
          dow: d.dow,
          stimulus: d.stimulus,
          sessions: [],
          flags: [],
          state: 'rest',
        });
        continue;
      }

      // Grammar first (exact, no hallucination). Review lines get one LLM attempt
      // if an assist is wired — a successful, schema-valid LLM parse upgrades the
      // line; otherwise it stays 'review' for the coach (never fabricated).
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
        total += 1;
        if (ln.confidence === 'detected') detected += 1;
        else review += 1;
        if (isUnresolved) unresolved += 1;
      }

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
      });
    }
    outWeeks.push({ week: w.week, sheet: w.sheet, fell_back: w.fell_back, days });
  }

  return {
    weeks: outWeeks,
    summary: { total_items: total, detected, review, unresolved },
  };
}
