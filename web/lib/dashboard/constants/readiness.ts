// Readiness buckets — single source of truth for the team-pulse distribution
// (Hoy right rail) and the roster `?readiness=` filter. Thresholds per the
// approved UX redesign (docs/design/ux-redesign/mockups/01-hoy.html):
//   ok ≥ 67 · caution 45–66 · low < 45.

export const READINESS_OK_MIN = 67;
export const READINESS_CAUTION_MIN = 45;

export type ReadinessBucket = 'ok' | 'caution' | 'low';

export const READINESS_BUCKETS: readonly ReadinessBucket[] = ['ok', 'caution', 'low'];

export function isReadinessBucket(v: string | null | undefined): v is ReadinessBucket {
  return v === 'ok' || v === 'caution' || v === 'low';
}

export function readinessBucket(score: number): ReadinessBucket {
  if (score >= READINESS_OK_MIN) return 'ok';
  if (score >= READINESS_CAUTION_MIN) return 'caution';
  return 'low';
}

/** Coach-facing label per bucket (rail legend + roster filter chips). */
export const READINESS_BUCKET_LABEL: Record<ReadinessBucket, string> = {
  ok: `Listos (≥ ${READINESS_OK_MIN}%)`,
  caution: `Con cautela (${READINESS_CAUTION_MIN}–${READINESS_OK_MIN - 1}%)`,
  low: `En rojo (< ${READINESS_CAUTION_MIN}%)`,
};
