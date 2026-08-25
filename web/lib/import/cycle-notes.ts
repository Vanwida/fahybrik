// Untyped cycle lines → DECLARED NOTE (card 133).
//
// A review/incomplete line is not a half-prescription. Folding it into
// `coach_note` (the same field the library already uses for verbatim
// prose) keeps the coach's words and keeps the typed items clean.
// Flags stay so the review grid can still say "mira esta línea".
//
// Client-safe: `import type` only from the server orchestrator.

import type { EditorBlock, EditorItem, EditorSession } from '@/lib/dashboard/v2/editor-types';
import type { ImportProposal, ProposalDay, ProposalFlag } from './build-proposal';

function itemTextToPreserve(item: EditorItem): string {
  const note = (item.notes ?? item.prescription.note ?? '').trim();
  if (note) return note;
  const name = item.exercise_name.trim();
  return name || '';
}

function foldBlock(block: EditorBlock, flagByUid: Map<string, ProposalFlag>): EditorBlock | null {
  const noteBits: string[] = [];
  if (block.coach_note?.trim()) noteBits.push(block.coach_note.trim());
  const kept: EditorItem[] = [];
  for (const item of block.items) {
    const flag = flagByUid.get(item.uid);
    if (flag && flag.confidence !== 'detected') {
      const text = itemTextToPreserve(item);
      if (text) noteBits.push(text);
      continue;
    }
    kept.push(item);
  }
  if (kept.length === 0 && noteBits.length === 0) return null;
  const next: EditorBlock = { ...block, items: kept };
  if (noteBits.length > 0) next.coach_note = noteBits.join('\n');
  else delete next.coach_note;
  return next;
}

function foldSession(session: EditorSession, flagByUid: Map<string, ProposalFlag>): EditorSession | null {
  const blocks = session.blocks
    .map((b) => foldBlock(b, flagByUid))
    .filter((b): b is EditorBlock => b != null);
  if (blocks.length === 0) return null;
  return { ...session, blocks };
}

function foldDay(day: ProposalDay): ProposalDay {
  const flagByUid = new Map(day.flags.map((f) => [f.uid, f]));
  const sessions = day.sessions
    .map((s) => foldSession(s, flagByUid))
    .filter((s): s is EditorSession => s != null);

  if (sessions.length === 0 && day.sessions.length > 0) {
    const leftover = day.sessions
      .flatMap((s) => s.blocks)
      .map((b) => foldBlock(b, flagByUid))
      .filter((b): b is EditorBlock => b != null)
      .map((b) => b.coach_note)
      .filter((n): n is string => !!n && n.trim().length > 0);
    const notes = [day.notes, ...leftover].filter((n): n is string => !!n && n.trim().length > 0);
    return {
      ...day,
      sessions: [],
      state: notes.length > 0 ? 'review' : 'rest',
      ...(notes.length > 0 ? { notes: notes.join('\n\n') } : {}),
    };
  }

  return { ...day, sessions };
}

/**
 * After the grammar has typed what it can: everything that is not `detected`
 * leaves the items list and becomes a declared note. Coverage (summary) does
 * not change — those lines still count as review.
 */
export function foldUntypedToDeclaredNotes(proposal: ImportProposal): ImportProposal {
  return {
    ...proposal,
    weeks: proposal.weeks.map((week) => ({
      ...week,
      days: week.days.map(foldDay),
    })),
  };
}
