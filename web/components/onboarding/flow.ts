// Onboarding flow engine — pure logic (no React). Renders FROM the canonical
// question/flow definition in @fahybrid/shared so the questions, options, copy
// and branching are never re-typed here. Answers are keyed by DB COLUMN; the
// two request payloads are built to match the strict Zod schemas in
// @fahybrid/shared/schema (send exactly the allowed keys, omit the unanswered).

import {
  LEAD_QUESTIONS,
  LEAD_BLOCKS,
  visibleLeadQuestions,
  type LeadAnswers,
  type LeadQuestion,
  type LeadBlockKey,
} from '@fahybrid/shared/domain/leads/questions';

// Non-question screens that bookend the flow.
export const INTRO_ID = 'intro';
export const FINAL_ID = 'final';

export type StepId = string;
export type NavDir = 'fwd' | 'back';

// Endpoints (two-phase persistence).
const DRAFT_ENDPOINT = '/api/leads';
const COMPLETE_ENDPOINT = '/api/leads/complete';

// Columns stored as numbers by the schema (edad/fc_maxima). Everything else is a
// string, string[] or boolean.
const NUMERIC_KEYS = new Set(['edad', 'fc_maxima']);

// Whitelist sent on the phase-1 draft (end of bloque A). Kept explicit so a
// stray key can never sneak into the .strict() draft schema.
const DRAFT_KEYS = [
  'nombre',
  'objetivo',
  'carrera_mente',
  'carrera_cual',
  'carrera_cuando',
  'plazo',
  'motivo',
  'inicio',
] as const;

// ── Sequence / navigation ────────────────────────────────────────────────────
/** Ordered ids of every screen currently reachable, branching applied. */
export function visibleSequence(answers: LeadAnswers): StepId[] {
  return [INTRO_ID, ...visibleLeadQuestions(answers).map((q) => q.id), FINAL_ID];
}

/** The next reachable screen after `currentId`, or null at the end. */
export function nextStepId(currentId: StepId, answers: LeadAnswers): StepId | null {
  const seq = visibleSequence(answers);
  const i = seq.indexOf(currentId);
  if (i === -1) return null;
  return seq[i + 1] ?? null;
}

export function questionById(id: StepId): LeadQuestion | undefined {
  return LEAD_QUESTIONS.find((q) => q.id === id);
}

// ── Topbar (progress + block counter) ────────────────────────────────────────
export interface TopbarInfo {
  show: boolean;
  pct: number;
  label: string;
}

/**
 * Progress + block label, recomputed against the CURRENTLY visible question set
 * (branching-aware) — exactly like the mockup engine.
 */
export function topbarInfo(stepId: StepId, answers: LeadAnswers): TopbarInfo {
  if (stepId === INTRO_ID) return { show: false, pct: 0, label: '' };

  const formSteps = visibleLeadQuestions(answers);

  if (stepId === FINAL_ID) {
    return { show: true, pct: 100, label: 'Listo' };
  }

  const idx = formSteps.findIndex((q) => q.id === stepId);
  if (idx === -1) return { show: true, pct: 100, label: 'Listo' };

  const q = formSteps[idx];
  const pct = Math.round(((idx + 1) / formSteps.length) * 100);

  let label: string;
  if (q.block === 'start') {
    label = LEAD_BLOCKS.start;
  } else {
    const inBlock = formSteps.filter((s) => s.block === q.block);
    const pos = inBlock.findIndex((s) => s.id === stepId) + 1;
    label = `${LEAD_BLOCKS[q.block as LeadBlockKey]} · ${pos} de ${inBlock.length}`;
  }
  return { show: true, pct, label };
}

// ── Payload building ─────────────────────────────────────────────────────────
/** The DB column(s) a single question populates. */
export function questionColumnKeys(q: LeadQuestion): string[] {
  switch (q.kind) {
    case 'composite2':
      return (q.groups ?? []).map((g) => g.key);
    case 'numberfields':
      return (q.fields ?? []).map((f) => f.key);
    case 'datos':
      return ['edad', 'sexo', 'ubicacion'];
    case 'contacto':
      return ['telefono', 'consent_rgpd'];
    default:
      return q.key ? [q.key as string] : [];
  }
}

/** Every column reachable given the current branching — used to prune stale answers. */
export function visibleColumnKeys(answers: LeadAnswers): string[] {
  return visibleLeadQuestions(answers).flatMap(questionColumnKeys);
}

/**
 * Collect the given columns into a request body, including ONLY meaningful
 * values: omit undefined, empty strings and empty arrays; coerce numeric columns
 * to Number (dropped if not a finite integer); include booleans only when true.
 */
function collectAnswers(keys: string[], answers: LeadAnswers): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = answers[key];
    if (v === undefined || v === null) continue;

    if (Array.isArray(v)) {
      if (v.length > 0) out[key] = v;
      continue;
    }
    if (typeof v === 'boolean') {
      if (v) out[key] = true;
      continue;
    }
    if (typeof v === 'number') {
      if (!NUMERIC_KEYS.has(key) || Number.isInteger(v)) out[key] = v;
      continue;
    }
    // string
    const t = v.trim();
    if (!t) continue;
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(t);
      if (Number.isFinite(n) && Number.isInteger(n)) out[key] = n;
    } else {
      out[key] = t;
    }
  }
  return out;
}

/** Phase-1 draft body: email + honeypot + nombre + answered bloque-A codes. */
export function buildDraftBody(answers: LeadAnswers, email: string): Record<string, unknown> {
  // Only bloque-A keys that are BOTH whitelisted and still on the visible path.
  const visible = new Set(visibleColumnKeys(answers));
  const keys = DRAFT_KEYS.filter((k) => visible.has(k));
  return {
    email: email.trim(),
    website: '',
    ...collectAnswers(keys, answers),
  };
}

/** Phase-2 complete body: every answered column + required contact/consent fields. */
export function buildCompleteBody(answers: LeadAnswers): Record<string, unknown> {
  const body = collectAnswers(visibleColumnKeys(answers), answers);
  return {
    ...body,
    website: '',
    // These are required by leadSubmitInput; make them explicit and correctly typed.
    email: typeof answers.email === 'string' ? answers.email.trim() : '',
    telefono: typeof answers.telefono === 'string' ? answers.telefono.trim() : '',
    consent_rgpd: true as const,
  };
}

// ── Network (same-origin) ────────────────────────────────────────────────────
/** Fire-and-forget partial capture. Never blocks the user; failures are ignored. */
export function submitDraft(body: Record<string, unknown>): void {
  void fetch(DRAFT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {
    // Intentionally ignored — an abandoned/failed draft must not block onboarding.
  });
}

/**
 * Full submit. On success resolves the final-screen state the API decided:
 *   · `token`   — opaque booking credential, so the lead can pick a videollamada
 *     slot inline. Present ONLY when the coach has room (not waitlisted).
 *   · `waitlisted` — true when the coach is at capacity (#18): the lead joined the
 *     waitlist instead of booking, so the final screen shows the waitlist state and
 *     never a slot picker (a waitlisted response carries no token).
 *   · `waitlist_position` — the lead's 1-based place in the waitlist (only meaningful
 *     when `waitlisted`).
 */
export async function submitComplete(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; token?: string; waitlisted: boolean; waitlist_position?: number }> {
  try {
    const res = await fetch(COMPLETE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, waitlisted: false };
    let token: string | undefined;
    let waitlisted = false;
    let waitlist_position: number | undefined;
    try {
      const data = (await res.json()) as {
        token?: unknown;
        waitlisted?: unknown;
        waitlist_position?: unknown;
      };
      if (typeof data?.token === 'string') token = data.token;
      if (data?.waitlisted === true) waitlisted = true;
      if (typeof data?.waitlist_position === 'number') waitlist_position = data.waitlist_position;
    } catch {
      // Success without a parseable body — still advance, just without a token.
    }
    return { ok: true, token, waitlisted, waitlist_position };
  } catch {
    return { ok: false, waitlisted: false };
  }
}
