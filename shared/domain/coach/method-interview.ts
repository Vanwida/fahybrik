// Respuestas de la entrevista «Cómo entrenas». Puro, sin I/O.
// Vacío = aún no ha dicho cómo programa. Plan/chat/MCP no imitan.

import {
  INTERVIEW_MIRROR_MAX,
  INTERVIEW_NOTE_MAX,
  INTERVIEW_QUESTIONS,
  MULTI_FIELDS,
  NOTE_FIELDS,
  OPTION_IDS,
  SINGLE_FIELDS,
  type MultiField,
  type NoteField,
  type SingleField,
} from './method-interview-catalog';
import {
  effectiveMirror,
  generateMirror,
} from './method-interview-mirror';

export {
  CHAPTER_IDS,
  INTERVIEW_CHAPTERS,
  INTERVIEW_MIRROR_MAX,
  INTERVIEW_NOTE_MAX,
  INTERVIEW_QUESTIONS,
  MULTI_FIELDS,
  NOTE_FIELDS,
  OPTION_IDS,
  SINGLE_FIELDS,
  isOptionId,
  questionById,
  questionsForChapter,
  type ChapterId,
  type InterviewChapterDef,
  type InterviewQuestionDef,
  type MultiField,
  type NoteField,
  type SingleField,
} from './method-interview-catalog';

export {
  SPEC_EXAMPLE_MIRROR,
  effectiveMirror,
  generateMirror,
  specExampleAnswers,
} from './method-interview-mirror';

export type SingleValue = string;
export type MultiValue = readonly string[];

export type CoachMethodAnswers = Record<SingleField, string | null> &
  Record<MultiField, readonly string[] | null> &
  Record<NoteField, string | null>;

export interface CoachMethodInterview {
  answers: CoachMethodAnswers;
  generated_mirror: string;
  mirror_text: string;
  mirror_is_edited: boolean;
}

export function emptyAnswers(): CoachMethodAnswers {
  const answers = {} as CoachMethodAnswers;
  for (const field of SINGLE_FIELDS) answers[field] = null;
  for (const field of MULTI_FIELDS) answers[field] = null;
  for (const field of NOTE_FIELDS) answers[field] = null;
  return answers;
}

export function emptyInterview(): CoachMethodInterview {
  return {
    answers: emptyAnswers(),
    generated_mirror: '',
    mirror_text: '',
    mirror_is_edited: false,
  };
}

export function normalizeNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, INTERVIEW_NOTE_MAX);
}

export function normalizeMirrorText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, INTERVIEW_MIRROR_MAX);
}

export function normalizeSingle(
  field: SingleField,
  raw: unknown,
): string | null {
  if (typeof raw !== 'string') return null;
  return (OPTION_IDS[field] as readonly string[]).includes(raw) ? raw : null;
}

export function normalizeMulti(field: MultiField, raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw)) return null;
  const allowed = OPTION_IDS[field] as readonly string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !allowed.includes(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  if (out.length === 0) return null;
  // «Casi no testeo» no convive con tests concretos.
  if (field === 'tests_used' && out.includes('almost_no_tests') && out.length > 1) {
    return out.filter((id) => id !== 'almost_no_tests');
  }
  return out;
}

export function normalizeAnswers(raw: Partial<CoachMethodAnswers> | null | undefined): CoachMethodAnswers {
  const next = emptyAnswers();
  if (!raw) return next;
  for (const field of SINGLE_FIELDS) {
    next[field] = normalizeSingle(field, raw[field]);
  }
  for (const field of MULTI_FIELDS) {
    next[field] = normalizeMulti(field, raw[field]);
  }
  for (const field of NOTE_FIELDS) {
    next[field] = normalizeNote(raw[field]);
  }
  return next;
}

export function answersEqual(a: CoachMethodAnswers, b: CoachMethodAnswers): boolean {
  for (const field of SINGLE_FIELDS) {
    if (a[field] !== b[field]) return false;
  }
  for (const field of MULTI_FIELDS) {
    const left = a[field] ?? [];
    const right = b[field] ?? [];
    if (left.length !== right.length) return false;
    if (left.some((id, i) => id !== right[i])) return false;
  }
  for (const field of NOTE_FIELDS) {
    if (a[field] !== b[field]) return false;
  }
  return true;
}

export function answeredQuestionCount(answers: CoachMethodAnswers): number {
  let n = 0;
  for (const q of INTERVIEW_QUESTIONS) {
    if (q.kind === 'multi') {
      if ((answers[q.id as MultiField] ?? []).length > 0) n += 1;
    } else if (answers[q.id as SingleField] != null) {
      n += 1;
    }
  }
  return n;
}

export function hasMethodInterview(input: {
  generated_mirror?: string | null;
  mirror_text?: string | null;
}): boolean {
  return effectiveMirror(input).length > 0;
}

export function isMirrorEdited(generated_mirror: string, mirror_text: string): boolean {
  return (normalizeMirrorText(mirror_text) ?? '') !== (normalizeMirrorText(generated_mirror) ?? '');
}

/**
 * Aplicar un PUT: respuestas nuevas + espejo opcional.
 * Si las casillas cambian y el coach no había tocado el párrafo, el espejo
 * se regenera. Si lo había editado, se conserva hasta que mande otro texto.
 */
export function applyInterviewUpdate(
  prev: CoachMethodInterview,
  patch: {
    answers?: Partial<CoachMethodAnswers> | CoachMethodAnswers;
    mirror_text?: string | null;
  },
): CoachMethodInterview {
  const answers = patch.answers
    ? normalizeAnswers({ ...prev.answers, ...patch.answers })
    : prev.answers;
  const generated_mirror = generateMirror(answers);
  const answersChanged = !answersEqual(answers, prev.answers);

  let mirror_text: string;
  if (patch.mirror_text !== undefined) {
    mirror_text = normalizeMirrorText(patch.mirror_text) ?? '';
  } else if (answersChanged && !prev.mirror_is_edited) {
    mirror_text = generated_mirror;
  } else {
    mirror_text = prev.mirror_text;
  }

  return {
    answers,
    generated_mirror,
    mirror_text,
    mirror_is_edited: isMirrorEdited(generated_mirror, mirror_text),
  };
}

export const INTERVIEW_QUESTION_COUNT = INTERVIEW_QUESTIONS.length;
