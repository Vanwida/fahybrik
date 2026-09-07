// Instants on the live save wire. iOS `ISO8601DateFormatter` with
// `.withInternetDateTime` emits `Z` from GMT and `±HH:MM` from a local TZ;
// `Date.toISOString()` emits fractional `Z`; some stacks emit `+0000` without
// a colon. Zod's default `datetime()` is Z-only — that subset used to 400 the
// whole POST when the phone was on CEST.

import { z } from 'zod';

const WIRE_INSTANT =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * True when `raw` is an ISO-8601 instant the save path can hand to Postgres
 * as `timestamptz`. Calendar-valid (Zod's datetime regex rejects 31 Feb);
 * offset may omit the colon (`+0000`).
 */
export function isWireInstant(raw: string): boolean {
  const m = WIRE_INSTANT.exec(raw);
  if (!m) return false;
  const normalized = `${m[1]}${m[2] ?? ''}${normalizeOffset(m[3]!)}`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms);
}

function normalizeOffset(offset: string): string {
  if (offset === 'Z') return 'Z';
  if (offset.length === 5 && (offset[0] === '+' || offset[0] === '-')) {
    return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  }
  return offset;
}

/** Instant string → canonical form Postgres accepts, or null if unusable. */
export function coerceWireInstant(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const m = WIRE_INSTANT.exec(raw);
  if (!m) return null;
  const normalized = `${m[1]}${m[2] ?? ''}${normalizeOffset(m[3]!)}`;
  return Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

export const wireInstant = z.string().refine(isWireInstant, {
  message: 'invalid instant',
});
