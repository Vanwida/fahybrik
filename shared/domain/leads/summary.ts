// Lead answers → ordered, block-grouped "question → answer" summary (codes mapped
// to Spanish labels). SINGLE source used by BOTH the coach notification email
// (web/lib/leads/email.ts) and the coach dashboard lead detail. Works on any flat
// record whose keys are the lead DB columns (the submit input OR a DB row).

import {
  LEAD_BLOCKS,
  LEAD_QUESTIONS,
  type LeadBlockKey,
  leadOptionLabel,
  leadOptionLabels,
  resolveLeadTitle,
} from './questions';

export interface LeadSummaryRow {
  block: LeadBlockKey;
  question: string;
  answer: string;
}

export interface LeadSummaryGroup {
  block: LeadBlockKey;
  label: string;
  rows: { question: string; answer: string }[];
}

/**
 * Flatten a lead's answers into ordered rows, skipping unanswered fields. Contact
 * identity (nombre, email, telefono) is intentionally excluded — surface it in the
 * header, not the body.
 */
export function summarizeLead(answers: Record<string, unknown>): LeadSummaryRow[] {
  const rows: LeadSummaryRow[] = [];
  const push = (block: LeadBlockKey, question: string, answer: string | undefined | null) => {
    if (answer && String(answer).trim()) rows.push({ block, question, answer: String(answer).trim() });
  };

  for (const q of LEAD_QUESTIONS) {
    if (q.id === 'q-nombre' || q.id === 'q-email') continue; // header, not body
    const title = resolveLeadTitle(q, '').replace(/\?+$/, '');

    if (q.kind === 'composite2' && q.groups) {
      for (const g of q.groups) {
        push(q.block, g.label, leadOptionLabel(g.key, answers[g.key] as string | undefined));
      }
    } else if (q.kind === 'numberfields' && q.fields) {
      for (const f of q.fields) push(q.block, f.label, answers[f.key] as string | undefined);
    } else if (q.kind === 'datos') {
      push(q.block, 'Edad', answers.edad != null ? String(answers.edad) : undefined);
      push(q.block, 'Sexo', leadOptionLabel('sexo', answers.sexo as string | undefined));
      push(q.block, 'Ubicación', leadOptionLabel('ubicacion', answers.ubicacion as string | undefined));
    } else if (q.kind === 'contacto') {
      // teléfono lives in the header
    } else if (q.optionsKey && q.kind === 'multi') {
      const labels = leadOptionLabels(q.optionsKey, answers[q.key as string] as string[] | undefined);
      push(q.block, title, labels.join(', '));
    } else if (q.optionsKey && q.kind === 'single') {
      push(q.block, title, leadOptionLabel(q.optionsKey, answers[q.key as string] as string | undefined));
    } else if (q.key) {
      push(q.block, title, answers[q.key] as string | undefined); // free text
    }
  }
  return rows;
}

/** Group the flat summary rows by block, in flow order, dropping empty blocks. */
export function groupLeadSummary(rows: LeadSummaryRow[]): LeadSummaryGroup[] {
  const order: LeadBlockKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'Z'];
  return order
    .map((block) => ({ block, label: LEAD_BLOCKS[block], rows: rows.filter((r) => r.block === block) }))
    .filter((g) => g.rows.length > 0);
}
