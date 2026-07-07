// Shared building blocks for the onboarding screen renderers: the callback
// contract, the answers-store readers, and the two structural components
// (Frame + Head). Kept in one place so every screen renders identically and
// reads/writes answers the same way (DRY). Pure presentational — no hooks.

import {
  LEAD_OPTIONS,
  resolveLeadTitle,
  type LeadAnswers,
  type LeadAnswerValue,
  type LeadColumn,
  type LeadOption,
  type LeadQuestion,
} from '@fahybrid/shared/domain/leads/questions';

// A partial update to the answers store. `undefined` deletes the key.
export type AnswerPatch = Record<string, LeadAnswerValue>;

export interface ScreenCallbacks {
  onStart: () => void;
  onAdvance: (patch: AnswerPatch) => void;
  onEmailAdvance: (email: string) => void;
  onComplete: (patch: AnswerPatch) => Promise<boolean>;
  locale: string;
}

// Props shared by every question-screen renderer.
export interface ScreenProps {
  question: LeadQuestion;
  answers: LeadAnswers;
  nombre: string;
  cb: ScreenCallbacks;
}

// Time an auto-advancing single-select stays highlighted before moving on.
export const AUTO_ADVANCE_MS = 240;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Answers-store readers ────────────────────────────────────────────────────
export function readString(answers: LeadAnswers, key: string): string {
  const v = answers[key];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}
export function readArray(answers: LeadAnswers, key: string): string[] {
  const v = answers[key];
  return Array.isArray(v) ? v : [];
}
export function optionsFor(key: LeadColumn | undefined): readonly LeadOption[] {
  return key ? (LEAD_OPTIONS[key] as readonly LeadOption[]) : [];
}

// ── Structural components ────────────────────────────────────────────────────
/** The two grid children of `.ob-screen`: a scrollable body + a fixed actions row. */
export function Frame({ body, actions }: { body: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <>
      <div className="ob-scroll">{body}</div>
      <div className="ob-actions">{actions}</div>
    </>
  );
}

/** Personalised title (+ optional sub) for a question screen. */
export function Head({ question, nombre }: { question: LeadQuestion; nombre: string }) {
  return (
    <>
      <h1 className="ob-title">{resolveLeadTitle(question, nombre)}</h1>
      {question.sub ? <p className="ob-sub">{question.sub}</p> : null}
    </>
  );
}
