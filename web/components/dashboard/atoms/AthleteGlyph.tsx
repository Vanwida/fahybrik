'use client';

// AthleteGlyph — the scannable athlete identity unit for the /hoy triage queue
// and rail (SPEC §6 "glifos escaneables"). Composes the existing AthleteAvatar
// with (a) a readiness ring framing the avatar and (b) a single status badge for
// the athlete's HIGHEST-severity signal. Severity hierarchy (worst first) comes
// from the semantic tiers — never color alone: the badge is a colored icon and
// the glyph's aria-label spells the signal out.
//
// Presentational/controlled: the composing page resolves the highest-severity
// tier (e.g. via SEVERITY_TO_TIER / ALERT_KIND_META) and passes it in. The glyph
// does not fetch or rank server data itself.

import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';
import { SEMANTIC_TIER_META } from '@/lib/dashboard/constants/status-semantics';
import {
  type ReadinessBucket,
  readinessBucket,
} from '@/lib/dashboard/constants/readiness';
import { AthleteAvatar, type AthleteAvatarSize } from '@/components/dashboard/atoms/AthleteAvatar';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export type AthleteGlyphSize = Extract<AthleteAvatarSize, 'sm' | 'md' | 'lg'>;

export interface AthleteGlyphStatus {
  /** Highest-severity tier for this athlete (resolved by the caller). */
  tier: SemanticTier;
  /** Accessible description of the signal, e.g. "Caída de HRV". */
  label: string;
  /** Optional icon override; defaults to the tier icon. */
  icon?: string;
}

export interface AthleteGlyphProps {
  name: string;
  avatarUrl?: string | null;
  /** 0–100; drives the ring band color (green/amber/red, never orange). */
  readinessScore?: number | null;
  /** Single highest-severity status to badge; omit for a clean glyph. */
  status?: AthleteGlyphStatus | null;
  size?: AthleteGlyphSize;
  className?: string;
}

const RING_BUCKET_TOKEN: Record<ReadinessBucket, string> = {
  ok: 'var(--ok)',
  caution: 'var(--warning)',
  low: 'var(--danger)',
};

// Ring inset so the colored frame sits just outside the avatar border.
const RING_PADDING: Record<AthleteGlyphSize, string> = {
  sm: 'p-[2px]',
  md: 'p-[2.5px]',
  lg: 'p-[3px]',
};

const BADGE_SIZE: Record<AthleteGlyphSize, { box: string; icon: number }> = {
  sm: { box: 'h-3.5 w-3.5', icon: 10 },
  md: { box: 'h-4 w-4', icon: 11 },
  lg: { box: 'h-5 w-5', icon: 13 },
};

export function AthleteGlyph({
  name,
  avatarUrl,
  readinessScore,
  status,
  size = 'md',
  className,
}: AthleteGlyphProps) {
  const hasReadiness = readinessScore != null && Number.isFinite(readinessScore);
  const bucket = hasReadiness ? readinessBucket(readinessScore!) : null;
  const ringColor = bucket ? RING_BUCKET_TOKEN[bucket] : 'var(--border-subtle)';

  const badgeMeta = status ? SEMANTIC_TIER_META[status.tier] : null;
  const badge = BADGE_SIZE[size];

  const ariaParts = [name];
  if (hasReadiness) ariaParts.push(`readiness ${Math.round(readinessScore!)}`);
  if (status) ariaParts.push(status.label);

  return (
    <span
      className={cn('relative inline-flex shrink-0', className)}
      role="img"
      aria-label={ariaParts.join(', ')}
    >
      {/* Readiness ring frame. */}
      <span
        className={cn('inline-flex rounded-full', RING_PADDING[size])}
        style={{ background: hasReadiness ? ringColor : 'transparent', border: hasReadiness ? undefined : '1px dashed var(--border-subtle)' }}
      >
        <AthleteAvatar name={name} avatarUrl={avatarUrl} size={size} variant="default" />
      </span>

      {/* Highest-severity status badge (color + icon; label in aria-label). */}
      {status && badgeMeta ? (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 inline-flex items-center justify-center rounded-full',
            'ring-2 ring-[color:var(--surface-card)]',
            badge.box,
          )}
          style={{ background: badgeMeta.token, color: 'var(--bg)' }}
        >
          <MIcon name={status.icon ?? badgeMeta.icon} size={badge.icon} weight={700} filled />
        </span>
      ) : null}
    </span>
  );
}
