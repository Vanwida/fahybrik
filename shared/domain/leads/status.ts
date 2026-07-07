// Lead pipeline status — SINGLE source of truth for label + tone + the transition
// rules, shared by web (coach dashboard) and future iOS coach. Framework-agnostic:
// `tone` is a semantic name (the web Pill/StatusDot map it to a --v2-* color; iOS
// maps it to its own palette). Mirrors the pg `lead_status` enum (migration 0092).

export type LeadStatus =
  | 'parcial'
  | 'nuevo'
  | 'contactado'
  | 'agendado'
  | 'convertido'
  | 'descartado';

/** Semantic tone (maps to the web Pill tones / iOS palette). */
export type LeadStatusTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'info';

export interface LeadStatusMeta {
  label: string;
  tone: LeadStatusTone;
  /** Render dimmed (secondary) — for the abandoned `parcial` state. */
  dim?: boolean;
  /** Strike-through the label — for `descartado`. */
  strikethrough?: boolean;
}

// Colors per product spec: nuevo = brand orange (needs attention), contactado = blue,
// agendado + convertido = green, parcial = dim neutral, descartado = struck-through grey.
export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusMeta> = {
  parcial: { label: 'Sin terminar', tone: 'neutral', dim: true },
  nuevo: { label: 'Nuevo', tone: 'accent' },
  contactado: { label: 'Contactado', tone: 'info' },
  agendado: { label: 'Cita agendada', tone: 'ok' },
  convertido: { label: 'Convertido', tone: 'ok' },
  descartado: { label: 'Descartado', tone: 'neutral', strikethrough: true },
};

/** Display/triage order for the list (most-actionable first; archived last). */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  'nuevo',
  'contactado',
  'agendado',
  'parcial',
  'convertido',
  'descartado',
];

/** Non-archived states (the default "active pipeline" view). */
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['nuevo', 'contactado', 'agendado', 'parcial'];

/** Archived states hidden from the default list view. */
export const ARCHIVED_LEAD_STATUSES: LeadStatus[] = ['convertido', 'descartado'];

/**
 * Statuses the coach may set from the dashboard. `convertido` is NOT here — it is set
 * by the alta flow (task #5) which creates the athlete. `parcial`/`nuevo` are system-set
 * by the onboarding.
 */
export const COACH_SETTABLE_LEAD_STATUSES: LeadStatus[] = ['contactado', 'agendado', 'descartado'];

export function isCoachSettableLeadStatus(s: string): s is LeadStatus {
  return (COACH_SETTABLE_LEAD_STATUSES as string[]).includes(s);
}

// Monotonic pipeline rank — the lead only ever moves FORWARD. `descartado` is a
// terminal side-exit (ranked above the pipeline so it's always a valid forward move
// from any live state); `convertido` is the terminal success (set by the alta flow).
const LEAD_PIPELINE_RANK: Record<LeadStatus, number> = {
  parcial: 0,
  nuevo: 1,
  contactado: 2,
  agendado: 3,
  convertido: 4,
  descartado: 99,
};

const TERMINAL_LEAD_STATUSES: LeadStatus[] = ['convertido', 'descartado'];

/**
 * NO-RETREAT rule (mirrors the store's "never downgrade a worked lead" philosophy):
 * a coach transition is valid iff the target is coach-settable, the lead is not already
 * terminal, and the target rank is strictly greater than the current rank. So
 * nuevo→contactado→agendado and any-live→descartado are allowed; agendado→contactado,
 * →nuevo, or anything out of convertido/descartado is NOT.
 */
export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  if (!isCoachSettableLeadStatus(to)) return false;
  if (TERMINAL_LEAD_STATUSES.includes(from)) return false;
  return LEAD_PIPELINE_RANK[to] > LEAD_PIPELINE_RANK[from];
}

/** The forward transitions the coach may take from `from`, in pipeline order. */
export function leadStatusAllowedNext(from: LeadStatus): LeadStatus[] {
  return COACH_SETTABLE_LEAD_STATUSES.filter((to) => canTransitionLead(from, to)).sort(
    (a, b) => LEAD_PIPELINE_RANK[a] - LEAD_PIPELINE_RANK[b],
  );
}

/**
 * Explicit HUMAN CORRECTION — reopen a mis-discarded lead (descartado → nuevo). This is
 * the ONE sanctioned exception to the no-retreat rule: a mis-tap on "Descartar" must not
 * kill a lead forever. It is deliberately NOT part of the automatic pipeline
 * (`canTransitionLead` still rejects every backwards move); it lives in its own function
 * with its own intent. Only `descartado` can be reopened — `convertido` stays terminal.
 */
export function canReopenLead(from: LeadStatus): boolean {
  return from === 'descartado';
}
