// Status / severity semantics — the single source of truth that maps every
// coach-facing severity flavour to ONE semantic tier, and every tier to its
// color token, tint token, icon and label key (HOY redesign, SPEC §8/§9/§10).
//
// WHY THIS EXISTS
// ---------------
// The dashboard currently invents a tone per component: InboxItemCard has its
// own ChipTone (error/warning/accent/tertiary/neutral), cohort alerts carry a
// raw 'critical'|'warning' severity, the inbox carries 'critical'|'decision'|
// 'alert'|'message'. Nothing agrees on what color/icon/label a "warning" gets.
// This file collapses all of those onto FIVE semantic tiers so a StatusChip,
// a TriageCard and a roster row paint the same signal identically (SPEC §9
// "color + icono + label" — never color alone, WCAG 1.4.1).
//
// HARD RULE (SPEC §6/§9): the brand orange `--accent` is brand/selection only
// and is NEVER a status tier. Status uses the green/amber/red/blue/grey scale.
//
// Icons are Material Symbols name strings (the dashboard's icon system — see
// components/ui/MIcon.tsx). Label keys are next-intl message keys under
// the `coach.semantics` namespace; the raw enum keys are the contract, the copy
// lives in the locale files.

import {
  ALERT_KINDS,
  type AlertKind,
  type AlertReason,
} from '@fahybrid/shared/domain/coach/types';
import type { InboxSeverity } from '@/lib/dashboard/coach/inbox';

// ── Tiers ─────────────────────────────────────────────────────────────────────

/**
 * The five semantic tiers. `success/warning/error` carry the green/amber/red
 * scale; `info` is the neutral-blue context tier; `neutral` is the muted grey
 * "no signal / resting" tier. Orange (`--accent`) is deliberately absent.
 */
export const SEMANTIC_TIERS = [
  'success',
  'warning',
  'error',
  'info',
  'neutral',
] as const;

export type SemanticTier = (typeof SEMANTIC_TIERS)[number];

export interface SemanticTierMeta {
  /** Solid color CSS variable (foreground/border use). */
  token: string;
  /** Low-alpha fill CSS variable (chip/badge background). */
  tintToken: string;
  /** Material Symbols icon name (see MIcon). */
  icon: string;
  /** next-intl message key for the tier's default label. */
  labelKey: string;
}

/** Tier → visual + label metadata. Single source for chip/ring/dot styling. */
export const SEMANTIC_TIER_META: Record<SemanticTier, SemanticTierMeta> = {
  success: {
    token: 'var(--ok)',
    tintToken: 'var(--ok-tint)',
    icon: 'check_circle',
    labelKey: 'coach.semantics.tier.success',
  },
  warning: {
    token: 'var(--warning)',
    tintToken: 'var(--warning-tint)',
    icon: 'warning',
    labelKey: 'coach.semantics.tier.warning',
  },
  error: {
    token: 'var(--danger)',
    tintToken: 'var(--danger-tint)',
    icon: 'error',
    labelKey: 'coach.semantics.tier.error',
  },
  info: {
    token: 'var(--info)',
    tintToken: 'var(--info-tint)',
    icon: 'info',
    labelKey: 'coach.semantics.tier.info',
  },
  neutral: {
    token: 'var(--neutral)',
    tintToken: 'var(--neutral-tint)',
    icon: 'remove',
    labelKey: 'coach.semantics.tier.neutral',
  },
};

// ── Severity → tier ─────────────────────────────────────────────────────────
//
// Every severity vocabulary in the codebase maps onto a tier here, so callers
// never branch on raw severity strings again.

/** AlertReason.severity (cohort signals) → tier. */
const COHORT_SEVERITY_TO_TIER = {
  critical: 'error',
  warning: 'warning',
} as const satisfies Record<AlertReason['severity'], SemanticTier>;

/** InboxSeverity (coach inbox) → tier. */
const INBOX_SEVERITY_TO_TIER = {
  critical: 'error',
  decision: 'warning',
  alert: 'warning',
  message: 'info',
} as const satisfies Record<InboxSeverity, SemanticTier>;

/**
 * Unified severity → tier map. Keys are the union of every severity vocabulary
 * (cohort `AlertReason.severity` + coach `InboxSeverity`). `critical` and
 * `warning` are shared across both vocabularies and resolve identically.
 */
export const SEVERITY_TO_TIER = {
  ...INBOX_SEVERITY_TO_TIER,
  ...COHORT_SEVERITY_TO_TIER,
} as const satisfies Record<InboxSeverity | AlertReason['severity'], SemanticTier>;

export type KnownSeverity = keyof typeof SEVERITY_TO_TIER;

/** Resolve any known severity to its tier, falling back to `neutral`. */
export function tierForSeverity(severity: string): SemanticTier {
  return (SEVERITY_TO_TIER as Record<string, SemanticTier>)[severity] ?? 'neutral';
}

// ── Alert kind → meta ────────────────────────────────────────────────────────
//
// Per-kind tier + icon + label key, keyed by the shared ALERT_KINDS enum (NOT
// redefined here). The tier here is the kind's DEFAULT tier; a specific
// AlertReason may still carry its own severity (e.g. no_sync is critical at 48h,
// warning at 24h) — use `tierForSeverity(reason.severity)` for the live tier and
// fall back to this map's tier when no per-instance severity is present.

export interface AlertKindMeta {
  tier: SemanticTier;
  icon: string;
  labelKey: string;
}

export const ALERT_KIND_META: Record<AlertKind, AlertKindMeta> = {
  hrv_crash: { tier: 'error', icon: 'monitor_heart', labelKey: 'coach.semantics.alert.hrv_crash' },
  no_sync: { tier: 'warning', icon: 'sync_problem', labelKey: 'coach.semantics.alert.no_sync' },
  missed_sessions: {
    tier: 'warning',
    icon: 'event_busy',
    labelKey: 'coach.semantics.alert.missed_sessions',
  },
  video_review_pending: {
    tier: 'warning',
    icon: 'smart_display',
    labelKey: 'coach.semantics.alert.video_review_pending',
  },
  message_unanswered: {
    tier: 'info',
    icon: 'forum',
    labelKey: 'coach.semantics.alert.message_unanswered',
  },
  rpe_high: { tier: 'warning', icon: 'whatshot', labelKey: 'coach.semantics.alert.rpe_high' },
  transition_ready: {
    tier: 'info',
    icon: 'trending_up',
    labelKey: 'coach.semantics.alert.transition_ready',
  },
  checkin_skipped: {
    tier: 'warning',
    icon: 'assignment_late',
    labelKey: 'coach.semantics.alert.checkin_skipped',
  },
  block_phase: {
    tier: 'warning',
    icon: 'calendar_month',
    labelKey: 'coach.semantics.alert.block_phase',
  },
};

// Exhaustiveness guard: fails the build if ALERT_KINDS gains a member without a
// meta entry. (ALERT_KIND_META is typed Record<AlertKind, …>, but this also
// catches a stale enum at runtime in tests.)
export const ALERT_KIND_META_COMPLETE: boolean = ALERT_KINDS.every(
  (kind) => kind in ALERT_KIND_META,
);
