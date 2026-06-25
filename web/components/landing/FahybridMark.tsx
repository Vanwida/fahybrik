// FAHYBRID brand marks for the public landing.
//
// Two exports:
//   - FahybridMark      — the FH⊃ glyph as a CSS mask, so it recolors to any color
//                         (inherits currentColor by default). Single asset, any hue.
//   - FahybridWordmark  — the typographic "FAHYBRID" wordmark, matching the existing
//                         dashboard Wordmark treatment (orange lead letter) but reading
//                         FAHYBRID for this public surface.
//
// Note: this landing brand is "FAHYBRID" (the public name). The dashboard Wordmark
// reads "FAHYBRIK" — intentionally different; internal infra stays FAHYBRIK.

import { cn } from '@/lib/utils';

// Mask asset: alpha channel = the shape, so backgroundColor paints the glyph.
// 720×334 → aspect-ratio preserves proportions; height is set via className.
const FH_MARK_SRC = '/brand/fh-mark.png';
const FH_MARK_ASPECT = '1200 / 507';

interface FahybridMarkProps {
  className?: string;
  /** Glyph color. Defaults to currentColor so it inherits text color. */
  color?: string;
}

export function FahybridMark({ className, color }: FahybridMarkProps) {
  return (
    <span
      role="img"
      aria-label="FAHYBRID"
      className={cn('inline-block h-6', className)}
      style={{
        aspectRatio: FH_MARK_ASPECT,
        backgroundColor: color ?? 'currentColor',
        WebkitMaskImage: `url('${FH_MARK_SRC}')`,
        maskImage: `url('${FH_MARK_SRC}')`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

const WORDMARK_SIZE_CLASS = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl',
} as const;

interface FahybridWordmarkProps {
  className?: string;
  size?: keyof typeof WORDMARK_SIZE_CLASS;
}

export function FahybridWordmark({ className, size = 'md' }: FahybridWordmarkProps) {
  return (
    <span
      className={cn(
        'font-display italic font-black tracking-tight select-none',
        WORDMARK_SIZE_CLASS[size],
        className,
      )}
      aria-label="FAHYBRID"
    >
      <span className="text-[color:var(--accent)]">F</span>
      <span className="text-[color:var(--fg)]">AHYBRID</span>
    </span>
  );
}
