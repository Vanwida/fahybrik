// Triage item model — the unified shape the /hoy queue renders. The queue blends
// THREE F1 sources (SPEC §4): the precomputed attention store (biometric /
// operational SIGNALS, snooze/dismiss/bulk via the override endpoints), the
// legacy coach inbox (DECISION items — intake / week-adjustment / monthly-block —
// which keep their rich proposal payload and existing approve endpoints) and the
// chat threads (MESSAGE items — an unanswered athlete message is a first-class
// line, replied INLINE via the ThreadDrawer, never a separate module). All three
// collapse to one ordered, severity-sorted list of `TriageItem`s here so the
// queue, cards, keyboard layer and bulk bar reason over one type.

import type { AttentionCard } from '@/lib/coach/attention/queue';
import type {
  InboxIntakeItem,
  InboxWeekAdjustmentItem,
  InboxMonthlyBlockItem,
} from '@/lib/dashboard/coach/inbox';
import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';

/** Severity tier for queue grouping — 2 live tiers (SPEC §10). */
export type TriageTier = 'critico' | 'vigilar';

/** Snooze presets (SPEC §4: "Posponer 2d ▾" / Hoy / 1sem). */
export interface SnoozePreset {
  key: string;
  label: string;
  /** Hours from now to set snoozed_until. */
  hours: number;
}

export const SNOOZE_PRESETS: ReadonlyArray<SnoozePreset> = [
  { key: 'today', label: 'Hoy', hours: 6 },
  { key: '2d', label: '2 días', hours: 48 },
  { key: '1w', label: '1 semana', hours: 168 },
];

/**
 * A SIGNAL item from the attention store. Resolve = dismiss; Posponer = snooze;
 * both go through /api/coach/inbox/{snooze,bulk} keyed by (athlete_id, signal_kind).
 */
export interface TriageSignalItem {
  kind: 'signal';
  /** Stable queue id, e.g. "signal:hrv_crash:42". */
  id: string;
  tier: TriageTier;
  athlete_id: string;
  athlete_name: string;
  signal_kind: string;
  /** Color/icon/label tier for the reason chip. */
  reason_tier: SemanticTier;
  reason_label: string;
  reason_icon: string;
  /** Evidence mini-line (the signal's delta/detail). */
  evidence: string;
  readiness_score: number | null;
  other_signal_count: number;
  /** Deep-link target for "Abrir". */
  open_href: string;
  /** Whether this signal can be snoozed/dismissed (every store signal can). */
  snoozable: true;
}

/** A DECISION item from the coach inbox (keeps the rich payload + approve flow). */
export interface TriageDecisionItem {
  kind: 'decision';
  /** Stable queue id, reuses the inbox id, e.g. "week_adjustment:42". */
  id: string;
  tier: TriageTier;
  athlete_id: string;
  athlete_name: string;
  reason_tier: SemanticTier;
  reason_label: string;
  reason_icon: string;
  evidence: string;
  readiness_score: number | null;
  open_href: string;
  /** The underlying inbox payload (drives the side-panel detail + approve). */
  payload: InboxIntakeItem | InboxWeekAdjustmentItem | InboxMonthlyBlockItem;
  /** Approve endpoint (week-adjustment / monthly-block) or null (intake = review only). */
  approve_endpoint: string | null;
}

/**
 * A MESSAGE item from a chat thread with unread athlete messages. Unlike signals
 * and decisions it has no resolve/approve endpoint: it leaves the queue when the
 * coach REPLIES (or marks read) in the inline ThreadDrawer — that drawer is "cómo
 * se responde", never leaving /hoy. The `message_unanswered` SIGNAL kind is
 * dropped from the attention queue (see hoy-data INBOX_OWNED_SIGNAL_KINDS) so a
 * waiting message surfaces ONCE, here, never also as a signal.
 */
export interface TriageMessageItem {
  kind: 'message';
  /** Stable queue id, e.g. "message:1234" (the thread id). */
  id: string;
  tier: TriageTier;
  athlete_id: string;
  athlete_name: string;
  /** The chat thread to open in the drawer. */
  thread_id: string;
  /** Last message body, one line (truncated by the card). */
  preview: string;
  /** Unread athlete messages on the thread (badge shows when >1). */
  unread_count: number;
  /** Short age of the last message, e.g. "hace 3 h". */
  age_label: string;
  /** Minutes since the last message — drives the age sort within a tier. */
  age_minutes: number;
  /** Color/icon/label tier for the reason chip ("Mensaje"). */
  reason_tier: SemanticTier;
  reason_label: string;
  reason_icon: string;
  readiness_score: number | null;
  /** Deep-link to the athlete's ficha (the quiet "Ficha" link). */
  open_href: string;
}

export type TriageItem = TriageSignalItem | TriageDecisionItem | TriageMessageItem;

/** The full data the queue consumes, already split by tier + sorted worst-first. */
export interface TriageData {
  critico: TriageItem[];
  vigilar: TriageItem[];
  /** Count of trivially auto-resolved athletes today (collapsed drawer). */
  auto_resolved_count: number;
  /** Truncated-by-cap count (overflow beyond queue_card_limit). */
  overflow: number;
}

/** Re-export for the page-side adapter. */
export type { AttentionCard };
