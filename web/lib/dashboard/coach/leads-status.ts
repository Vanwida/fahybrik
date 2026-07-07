// Web adapter over the shared lead-status domain (shared/domain/leads/status.ts —
// the single source of truth for label/tone + the no-retreat transition rules, shared
// with future iOS coach). This layer adds only the WEB-specific bits: the archived
// flag and the CSS accent variable used for row accents / dots.

import {
  ARCHIVED_LEAD_STATUSES,
  LEAD_STATUS_META as SHARED_LEAD_STATUS_META,
  type LeadStatus,
  type LeadStatusMeta as SharedLeadStatusMeta,
  type LeadStatusTone,
} from '@fahybrid/shared/domain/leads/status';

// Re-export the framework-agnostic pieces so web callers keep one import site.
export {
  ACTIVE_LEAD_STATUSES,
  ARCHIVED_LEAD_STATUSES,
  COACH_SETTABLE_LEAD_STATUSES,
  LEAD_STATUS_ORDER,
  canTransitionLead,
  isCoachSettableLeadStatus,
  leadStatusAllowedNext,
} from '@fahybrid/shared/domain/leads/status';
export type { LeadStatus, LeadStatusTone } from '@fahybrid/shared/domain/leads/status';

/** Semantic tone → V2 CSS variable (for row left-accents + status dots). */
const TONE_ACCENT_VAR: Record<LeadStatusTone, string> = {
  neutral: 'var(--v2-faint)',
  accent: 'var(--v2-accent)',
  ok: 'var(--v2-ok)',
  warn: 'var(--v2-warn)',
  info: 'var(--v2-info)',
};

export interface LeadStatusMetaWeb extends SharedLeadStatusMeta {
  archived: boolean;
  accentVar: string;
}

/** Shared label/tone augmented with the web-only `archived` flag + `accentVar`. */
export const LEAD_STATUS_META: Record<LeadStatus, LeadStatusMetaWeb> = Object.fromEntries(
  (Object.keys(SHARED_LEAD_STATUS_META) as LeadStatus[]).map((s) => [
    s,
    {
      ...SHARED_LEAD_STATUS_META[s],
      archived: ARCHIVED_LEAD_STATUSES.includes(s),
      accentVar: TONE_ACCENT_VAR[SHARED_LEAD_STATUS_META[s].tone],
    },
  ]),
) as Record<LeadStatus, LeadStatusMetaWeb>;
