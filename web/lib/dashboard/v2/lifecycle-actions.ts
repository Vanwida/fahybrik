// Athlete lifecycle (#13) — the coach-facing ACTION model for the ficha. Pure +
// client-safe (no DB, no server-only): which transitions a coach may take from the
// athlete's CURRENT lifecycle state, plus the button label/icon/tone metadata. The
// valid-actions map MIRRORS the state machine in web/lib/coach/athlete-lifecycle.ts
// (activo→pause|baja · pausado→resume|baja · baja→re_alta) — single source so the UI
// can never offer a transition the backend would reject.

import type { AthleteLifecycleStatus } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

/** The four lifecycle transitions — matches the PATCH `action` enum on the endpoint. */
export type LifecycleActionKind = 'pause' | 'resume' | 'baja' | 're_alta';

/**
 * Which lifecycle actions a coach may take from `status`, primary-first (the
 * recovering / less-destructive action before the destructive one):
 *   activo   → [Pausar, Dar de baja]
 *   pausado  → [Reactivar, Dar de baja]
 *   baja     → [Re-alta]
 * Exactly the transitions the state machine accepts — no more, no less.
 */
export function lifecycleActionsFor(status: AthleteLifecycleStatus): LifecycleActionKind[] {
  switch (status) {
    case 'activo':
      return ['pause', 'baja'];
    case 'pausado':
      return ['resume', 'baja'];
    case 'baja':
      return ['re_alta'];
  }
}

export interface LifecycleActionMeta {
  /** Coach-facing button label (ES). */
  label: string;
  /** Material symbol name. */
  icon: string;
  /** danger = destructive (baja); default = neutral. */
  tone: 'default' | 'danger';
  /** true when the action opens a dialog (reason / confirm) before firing.
   *  resume fires directly — reactivation auto-resumes, nothing to collect. */
  needsDialog: boolean;
}

export const LIFECYCLE_ACTION_META: Record<LifecycleActionKind, LifecycleActionMeta> = {
  pause: { label: 'Pausar', icon: 'pause_circle', tone: 'default', needsDialog: true },
  resume: { label: 'Reactivar', icon: 'play_circle', tone: 'default', needsDialog: false },
  baja: { label: 'Dar de baja', icon: 'person_off', tone: 'danger', needsDialog: true },
  re_alta: { label: 'Re-alta', icon: 'restart_alt', tone: 'default', needsDialog: true },
};
