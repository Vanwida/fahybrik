'use client';

interface SyncIndicatorProps {
  minutes_ago: number | null;
  label?: string;
}

// White → amber >24h → red >48h. Single visual signal Pablo can scan in <0.5s.
export function SyncIndicator({ minutes_ago, label }: SyncIndicatorProps) {
  if (minutes_ago == null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[color:var(--muted)] tabular-nums text-xs">
        <span className="size-1.5 rounded-full bg-[color:var(--muted)]/40" aria-hidden />
        —
      </span>
    );
  }

  const tier = staleness(minutes_ago);
  const dotColor =
    tier === 'fresh'
      ? 'bg-[color:var(--fg)]'
      : tier === 'amber'
        ? 'bg-[color:var(--warning)]'
        : 'bg-[color:var(--danger)]';
  const textColor =
    tier === 'fresh'
      ? 'text-[color:var(--fg)]'
      : tier === 'amber'
        ? 'text-[color:var(--warning)]'
        : 'text-[color:var(--danger)]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 tabular-nums text-xs ${textColor}`}
      title={`Última sync: ${label ?? formatRelative(minutes_ago)}`}
    >
      <span className={`size-1.5 rounded-full ${dotColor}`} aria-hidden />
      {label ?? formatRelative(minutes_ago)}
    </span>
  );
}

function staleness(min: number): 'fresh' | 'amber' | 'red' {
  if (min < 60 * 24) return 'fresh';
  if (min < 60 * 48) return 'amber';
  return 'red';
}

export function formatRelative(min: number): string {
  if (min < 60) return `${Math.max(0, Math.round(min))}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
