// Presentation layer for injury management (#16). PURE, framework-free helpers so
// BOTH the server (roster badge derivation in atletas-row) and the client (the
// ficha panel) read the exact same status→tone, severity→tone, valid-transition
// and timeline logic. The domain truth (taxonomy, state machine, labels) lives in
// @fahybrid/shared/domain/coach/injury-taxonomy — this only shapes it for display.

import {
  INJURY_STATUSES,
  INJURY_STATUS_LABEL,
  INJURY_SEVERITY_LABEL,
  INJURY_ZONE_LABEL,
  canTransition,
  type InjuryStatus,
  type InjurySeverity,
  type InjuryZone,
} from '@fahybrid/shared/domain/coach/injury-taxonomy';
import type { InjuryDTO } from '@fahybrid/shared/schema/injuries';

/** Semantic tone shared with the Pill primitive (a subset we actually use here). */
export type InjuryTone = 'danger' | 'warn' | 'ok' | 'neutral';

// ── Status (lifecycle axis) ───────────────────────────────────────────────────────
const STATUS_TONE: Record<InjuryStatus, InjuryTone> = {
  activa: 'danger',
  en_recuperacion: 'warn',
  resuelta: 'ok',
};
export function statusMeta(status: InjuryStatus): { label: string; tone: InjuryTone } {
  return { label: INJURY_STATUS_LABEL[status], tone: STATUS_TONE[status] };
}

// ── Severity (independent axis) ────────────────────────────────────────────────────
// leve reads calm (ok), moderada cautionary (warn), severa alarming (danger) — mirrors
// the approved mockup's severity chips. NOT the same as status: a leve injury can be
// activa, a severa one resuelta.
const SEVERITY_TONE: Record<InjurySeverity, InjuryTone> = {
  leve: 'ok',
  moderada: 'warn',
  severa: 'danger',
};
export function severityMeta(severity: InjurySeverity): { label: string; tone: InjuryTone } {
  return { label: INJURY_SEVERITY_LABEL[severity], tone: SEVERITY_TONE[severity] };
}

/** The v2 color token backing a tone (for a left-accent border etc.). */
export function toneColorVar(tone: InjuryTone): string {
  switch (tone) {
    case 'danger':
      return '--v2-danger';
    case 'warn':
      return '--v2-warn';
    case 'ok':
      return '--v2-ok';
    default:
      return '--v2-muted';
  }
}

// ── Roster badge ───────────────────────────────────────────────────────────────────
/**
 * The at-a-glance roster chip for an OPEN injury. `activa` reads "Lesión · rodilla"
 * (danger); `en_recuperacion` reads "En retorno · isquios" (warn). Only ever called
 * for open episodes — a resolved injury shows no badge.
 */
export function injuryBadge(
  zone: InjuryZone,
  status: InjuryStatus,
): { label: string; tone: InjuryTone } {
  const zoneLabel = INJURY_ZONE_LABEL[zone];
  if (status === 'en_recuperacion') {
    return { label: `En retorno · ${zoneLabel}`, tone: 'warn' };
  }
  // activa (a resolved injury never reaches the badge)
  return { label: `Lesión · ${zoneLabel}`, tone: 'danger' };
}

// ── Valid transitions → action buttons ──────────────────────────────────────────────
export interface TransitionAction {
  to: InjuryStatus;
  label: string;
  icon: string;
  tone: InjuryTone;
}

// Copy + icon per target status (labels match the approved mockup).
const TRANSITION_META: Record<InjuryStatus, { label: string; icon: string; tone: InjuryTone }> = {
  en_recuperacion: { label: 'En recuperación', icon: 'trending_up', tone: 'warn' },
  resuelta: { label: 'Marcar alta', icon: 'check_circle', tone: 'ok' },
  activa: { label: 'Reactivar', icon: 'replay', tone: 'danger' },
};

/** The valid next-status buttons for an injury, straight from the canonical state machine. */
export function transitionsFor(status: InjuryStatus): TransitionAction[] {
  return INJURY_STATUSES.filter((to) => canTransition(status, to)).map((to) => ({
    to,
    ...TRANSITION_META[to],
  }));
}

// ── Timeline ────────────────────────────────────────────────────────────────────────
export interface InjuryTimelineEntry {
  key: string;
  /** ISO date (registration) or instant (updates). */
  at: string;
  by: 'athlete' | 'coach';
  note: string | null;
  /** The status this entry set, when it changed it (null = note-only / registration). */
  status: InjuryStatus | null;
  kind: 'created' | 'update';
}

/**
 * The chronological evolution of an injury: the registration itself (the injuries row,
 * which does NOT create an injury_updates entry) followed by every timeline update,
 * oldest→newest — the order a coach reads it. Registration carries the episode's
 * onset note; updates carry the coach/athlete follow-ups.
 */
export function buildTimeline(injury: InjuryDTO): InjuryTimelineEntry[] {
  const created: InjuryTimelineEntry = {
    key: `created-${injury.id}`,
    at: injury.onset_date,
    by: injury.registered_by,
    note: injury.note,
    status: null,
    kind: 'created',
  };
  const updates: InjuryTimelineEntry[] = injury.updates.map((u) => ({
    key: `u-${u.id}`,
    at: u.recorded_at,
    by: u.recorded_by,
    note: u.note,
    status: u.status,
    kind: 'update' as const,
  }));
  return [created, ...updates];
}

// ── Dates ─────────────────────────────────────────────────────────────────────────
/**
 * Render an ISO date/instant as "3 jul". A date-only string (YYYY-MM-DD) is built
 * from parts so it never shifts a day across timezones; an instant parses directly.
 * (Mirrors the #13 formatEsDate, kept pure/local so this stays framework-free.)
 */
export function formatInjuryDate(iso: string | null): string {
  if (!iso) return '—';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = dateOnly
    ? (() => {
        const [y, m, day] = iso.split('-').map(Number);
        return new Date(y!, m! - 1, day!);
      })()
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

/**
 * Whole CALENDAR days between an ISO date and today (negative = past, 0 = today).
 * Both endpoints are normalized to local midnight so "today" is 0 regardless of the
 * clock time — a date-only string never reads as yesterday late in the day. null on
 * bad input.
 */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const target = dateOnly
    ? (() => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y!, m! - 1, d!);
      })()
    : new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((t - today) / 86_400_000);
}

/** Days since onset, as "desde hace N d/sem". null when the date is unusable. */
export function sinceOnset(onsetIso: string | null): string | null {
  const d = daysUntil(onsetIso);
  if (d == null) return null;
  const ago = Math.max(0, -d);
  if (ago === 0) return 'desde hoy';
  if (ago === 1) return 'desde ayer';
  if (ago < 14) return `desde hace ${ago} d`;
  if (ago < 60) return `desde hace ${Math.round(ago / 7)} sem`;
  return `desde hace ${Math.round(ago / 30)} meses`;
}

/**
 * Whether to SUGGEST pausing the plan for this injury (fork 3: suggest, never auto).
 * True for a severe episode or a long expected layoff (> LONG_LAYOFF_DAYS out). The
 * button that this gates is always coach-confirmed — this only decides visibility.
 */
export const LONG_LAYOFF_DAYS = 21;
export function suggestsPause(severity: InjurySeverity, expectedReturn: string | null): boolean {
  if (severity === 'severa') return true;
  const d = daysUntil(expectedReturn);
  return d != null && d > LONG_LAYOFF_DAYS;
}
