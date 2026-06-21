// v2 · MENSAJES — shared types for the 3-column chat screen.
//
// The screen marries two real sources, keyed by athlete_id:
//   • chat threads (listThreadsForCoach)      → the conversation list.
//   • roster rows  (fetchAthletesForCoach)     → the context panel (level,
//     modality, adherence, readiness, phase, account status).
// Both are loaded server-side; this module is the wire contract between the
// server page and the client components. Snake_case fields (Swift convention).

import type { AthleteLevel } from '@/components/v2/LevelBadge';
import type { V2Status } from '@/components/v2/StatusDot';

/** One row in the conversation list — a thread plus the context the panel needs
 *  for the same athlete, pre-joined server-side so the client never re-queries. */
export interface MensajesThread {
  thread_id: string;
  athlete_id: string;
  athlete_name: string;
  /** Preview of the last message (body or "[adjunto]"); null on an empty thread. */
  last_message_body: string | null;
  /** ISO 8601 timestamp of the last message, or null when the thread is empty. */
  last_message_at: string | null;
  /** Coach-side unread count for this thread. */
  unread_count: number;
  /** Context for the right panel — null when the athlete is not in the roster
   *  load (e.g. a thread whose athlete was archived). */
  context: MensajesContext | null;
}

/** The roster-derived context for the active conversation's athlete. Everything
 *  here is REAL data already loaded for the roster table; we just project it. */
export interface MensajesContext {
  level: AthleteLevel;
  /** Account/training status dot (activa·atencion·alta·pausa). */
  status: V2Status;
  /** Human phase label, e.g. "Acumulación · sem 2/5"; null when unprogrammed. */
  phase_label: string | null;
  /** 30-day adherence / compliance %, 0–100; null when no scheduled work. */
  adherence_pct: number | null;
  /** Readiness / recovery score, 0–100; surfaced as the "VFC"-family signal
   *  until the real VFC column lands. Null when no recent snapshot. */
  readiness_score: number | null;
  /** A short attention note (e.g. "Fatiga CNS alta") or null when none. */
  alert_label: string | null;
}

/** The full server payload handed to the client screen. */
export interface MensajesData {
  threads: MensajesThread[];
  /** Total unread conversations (threads with unread_count > 0). */
  unread_threads: number;
}
