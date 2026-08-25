// #48 importer — GENERATE branch converter. Turns an AI-composed week
// (`suggest-week` → `WeekDay[]`, whose blocks already carry catalog-resolved
// exercise items) into the SAME typed `ImportProposal` the Excel/paste flows
// produce, so a generated week rides the identical review→confirm pipeline and
// the sacred gate ("nada se guarda sin ejercicio del catálogo") still holds.
//
// Pure + client-safe (no `server-only`, no I/O) so it is unit-tested directly.
// Block→editor materialisation reuses the #33 `weekDayPartsToEditorBlocks` twin
// (same field mapping the manual insert uses), so a generated day is byte-for-byte
// an editor day — no new block/prescription logic here.

import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import {
  editorSlotForSessionIndex,
  weekDayPartsToEditorBlocks,
} from '@/lib/dashboard/v2/ai-blocks-to-editor';
import type { EditorBlock, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';
import {
  blockingReasons,
  checkPrescriptionCompleteness,
  isExecutable,
} from '@fahybrid/shared/domain/prescription';
import type { WeekDay, WeekDayPart } from '@fahybrid/shared/schema/program-templates';
// Types only (erased at compile) — this stays free of the server-only orchestrator.
import type { ImportProposal, ProposalDay, ProposalFlag, ProposalWeek } from './build-proposal';

/**
 * Convert an AI-composed week into a one-week `ImportProposal`. Emits all seven
 * weekdays in order (Mon→Sun) so the review grid always shows a full week; days
 * with no session blocks become honest rest cells. Each item becomes a `detected`
 * flag; an item that somehow lacks a catalog id is flagged `unresolved` exactly
 * like the grammar path, so the confirm gate still catches it.
 */
export function weekDaysToProposal(params: {
  days: readonly WeekDay[];
  /** Grid subheader label — the generated week's name. */
  sheetLabel: string;
  /** Displayed week number (cosmetic; the client re-labels it to the target week). */
  weekNumber?: number;
  /** Lo que la IA no pudo honrar del foco — se enseña en la revisión. */
  notices?: WeekNotice[];
}): ImportProposal {
  const { days, sheetLabel, weekNumber = 1, notices } = params;

  const byDow = new Map<number, WeekDay>();
  for (const d of days) byDow.set(d.day_of_week, d);

  let total = 0;
  let detected = 0;
  let review = 0;
  let unresolved = 0;
  const outDays: ProposalDay[] = [];

  for (let dow = 1; dow <= 7; dow += 1) {
    const day = byDow.get(dow);
    const dowLabel = DAY_LABELS_FULL[dow - 1] ?? `Día ${dow}`;

    // Which blocks are the COACH's versus ours (composed by the model). His come
    // from either of his two libraries, and each leaves its own mark:
    //   · a session materialised from one of his TEMPLATES carries `template_id`
    //   · a part materialised from one of his BLOCKS carries `source_block_id`
    // Checking only `template_id` judged his 99 blocks by the AUTHORING bar and
    // flagged his own method for review (5 of 8 items on his real week). The two
    // sources get different bars, and conflating them is a defect in both
    // directions — see below.
    const libraryBlockUids = new Set<string>();
    for (const s of day?.sessions ?? []) {
      const fromTemplate = s.template_id != null;
      for (const b of s.blocks ?? []) {
        if (fromTemplate || b.source_block_id != null) libraryBlockUids.add(b.uid);
      }
    }

    // Una sesión por sesión REAL del día: dos sesiones = doble sesión (am+pm), y
    // el slot sale de la posición. Aplanarlas en una sola (el `slot:'am'` que
    // había aquí) convertía la doble sesión que pidió el coach en un mega-entreno
    // de mañana — otra forma de tirarle el foco a la basura.
    const outSessions: EditorSession[] = [];
    const flags: ProposalFlag[] = [];
    const daySessions = (day?.sessions ?? []).filter((s) => (s.blocks ?? []).length > 0);

    if (daySessions.length === 0) {
      outDays.push({
        day_of_week: dow,
        dow: dowLabel,
        stimulus: null,
        sessions: [],
        flags: [],
        state: 'rest',
        ...(day?.priority ? { priority: day.priority } : {}),
        ...(day?.substitute ? { substitute: day.substitute } : {}),
      });
      continue;
    }

    const dayFocus = day?.focus?.trim() || undefined;

    daySessions.forEach((s, sessionIndex) => {
      const parts: WeekDayPart[] = s.blocks ?? [];
      const blocks = weekDayPartsToEditorBlocks(parts);
      collectFlags(blocks, libraryBlockUids, flags);
      const sessionFocus = s.focus?.trim() || dayFocus;
      outSessions.push({
        uid: `gen-ses-d${dow}-${sessionIndex}`,
        slot: editorSlotForSessionIndex(sessionIndex),
        ...(sessionFocus ? { focus: sessionFocus } : {}),
        blocks,
      });
    });

    for (const f of flags) {
      total += 1;
      if (f.confidence === 'detected') detected += 1;
      else review += 1;
      if (f.unresolved_exercise) unresolved += 1;
    }

    outDays.push({
      day_of_week: dow,
      dow: dowLabel,
      stimulus: dayFocus ?? null,
      sessions: outSessions,
      flags,
      state: flags.some((f) => f.unresolved_exercise || f.confidence === 'review')
        ? 'review'
        : 'detected',
      ...(day?.priority ? { priority: day.priority } : {}),
      ...(day?.substitute ? { substitute: day.substitute } : {}),
    });
  }

  const week: ProposalWeek = {
    week: weekNumber,
    sheet: sheetLabel,
    fell_back: false,
    days: outDays,
  };
  return {
    weeks: [week],
    summary: { total_items: total, detected, review, unresolved },
    ...(notices && notices.length > 0 ? { notices } : {}),
  };
}

/**
 * Marca cada línea de una sesión. Extraído del bucle de días porque ahora hay N
 * sesiones por día y las marcas de todas cuelgan del mismo día (el gate de
 * revisión razona por día, no por sesión).
 */
function collectFlags(
  blocks: EditorBlock[],
  libraryBlockUids: Set<string>,
  out: ProposalFlag[],
): void {
  for (const b of blocks) {
    for (const it of b.items) {
      const isUnresolved = it.exercise_id == null || Number(it.exercise_id) <= 0;
      // A resolved exercise id is not a workout. "Back Squat" with no reps, no
      // load and no rest resolves perfectly and prescribes nothing — marking it
      // `detected` is how a week of bare names passed review as finished. The
      // dose has to clear the same bar as the id.
      const completeness = checkPrescriptionCompleteness(it.prescription, {
        modality: it.prescription.modality ?? null,
        role: b.group ?? 'principal',
      });
      // Which bar applies depends on WHO wrote the line.
      //  · We composed it → the STRICT bar. A model that writes "Back Squat 5×5"
      //    with no load has not finished the job; there is no coach behind it.
      //  · The coach's own template → the EXECUTABLE bar. His HYROX-sim run legs
      //    carry no pace on purpose (in a simulation the race IS the target).
      //    Holding his library to the authoring bar flagged 25 of his own items
      //    as "review" — lecturing him about his own plan, which is noise.
      const fromLibrary = libraryBlockUids.has(b.uid);
      const passes = fromLibrary ? isExecutable(completeness) : completeness.ok;
      const reasons = fromLibrary ? blockingReasons(completeness) : completeness.reasons;
      out.push({
        uid: it.uid,
        confidence: passes ? 'detected' : 'review',
        review_reasons: reasons,
        unresolved_exercise: isUnresolved,
        exercise_token: it.exercise_name,
      });
    }
  }
}
