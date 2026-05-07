import { AlertTriangle, Info } from 'lucide-react';
import type { DeepDiveBanner as BannerData } from '@/lib/coach/deep-dive-types';

interface DeepDiveBannerProps {
  banner: BannerData;
}

export function DeepDiveBanner({ banner }: DeepDiveBannerProps) {
  const isCritical = banner.severity === 'critical';
  const isInfo = banner.severity === 'info';
  const Icon = isInfo ? Info : AlertTriangle;
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-[var(--r-l)] border px-4 py-2.5 text-[12px] ${
        isCritical
          ? 'border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-[color:var(--fg)]'
          : isInfo
            ? 'border-[color:var(--hairline)] bg-[color:var(--surface)] text-[color:var(--muted)]'
            : 'border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 text-[color:var(--fg)]'
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={`size-4 ${isCritical ? 'text-[color:var(--accent)]' : isInfo ? 'text-[color:var(--muted)]' : 'text-[color:var(--warning)]'}`}
          aria-hidden
          strokeWidth={1.75}
        />
        <span className="font-medium text-[color:var(--fg)]">{banner.title}</span>
        {banner.detail ? (
          <span className="text-[color:var(--muted)]">· {banner.detail}</span>
        ) : null}
      </span>
      {banner.cta_label ? (
        <button
          type="button"
          className="rounded-[var(--r-s)] border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-[color:var(--fg)] hover:bg-[color:var(--surface-elevated)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
        >
          {banner.cta_label}
        </button>
      ) : null}
    </div>
  );
}
