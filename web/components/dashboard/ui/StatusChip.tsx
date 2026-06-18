// StatusChip — the single status pill used across the /hoy triage surface.
// Consumes the SEMANTIC_TIER_META source of truth (status-semantics.ts) so a
// chip, a ring and a roster row paint the same signal identically. ALWAYS
// renders color FILL + icon + text label — never color alone (WCAG 1.4.1,
// SPEC §6/§9). Orange `--accent` is brand/selection only and is intentionally
// NOT reachable here: the tier enum has no orange member.

import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';
import { SEMANTIC_TIER_META } from '@/lib/dashboard/constants/status-semantics';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

export type StatusChipSize = 'sm' | 'md';

export interface StatusChipProps {
  /** Semantic tier — drives color token, tint fill and default icon. */
  tier: SemanticTier;
  /** Resolved label text (caller supplies copy; the tier never carries text). */
  label: string;
  /** Override the tier's default Material Symbols icon. */
  icon?: string;
  /**
   * Routine/at-rest states use the muted `*-tint` fill (low-alpha background +
   * colored text). Set `solid` for a higher-contrast filled pill on the rare
   * top-severity case. Default = tinted.
   */
  variant?: 'tint' | 'solid';
  size?: StatusChipSize;
  className?: string;
}

const SIZE_CLASS: Record<StatusChipSize, string> = {
  // ≥24px tall hit area on desktop (SPEC a11y floor). px/py tuned to match the
  // existing TypeChip rhythm in InboxItemCard.
  sm: 'gap-1 px-2 py-[3px] text-[10px] tracking-[0.08em]',
  md: 'gap-1.5 px-2.5 py-1 text-[11px] tracking-[0.06em]',
};

const ICON_SIZE: Record<StatusChipSize, number> = { sm: 12, md: 14 };

export function StatusChip({
  tier,
  label,
  icon,
  variant = 'tint',
  size = 'sm',
  className,
}: StatusChipProps) {
  const meta = SEMANTIC_TIER_META[tier];
  const iconName = icon ?? meta.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-[var(--r-s)] font-bold uppercase',
        SIZE_CLASS[size],
        className,
      )}
      style={
        variant === 'solid'
          ? { background: meta.token, color: 'var(--bg)' }
          : { background: meta.tintToken, color: meta.token }
      }
    >
      <MIcon name={iconName} size={ICON_SIZE[size]} weight={600} />
      {label}
    </span>
  );
}
