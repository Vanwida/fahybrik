'use client';

import { AlertTriangle } from 'lucide-react';
import type { AlertReason } from '@/lib/coach/types';

interface AlertChipProps {
  alert: AlertReason | null;
  size?: 'sm' | 'md';
}

export function AlertChip({ alert, size = 'sm' }: AlertChipProps) {
  if (!alert) {
    return <span className="block size-1.5 rounded-full bg-transparent" aria-hidden />;
  }

  const isCritical = alert.severity === 'critical';
  const dot = (
    <span
      className={`inline-block size-1.5 rounded-full ${
        isCritical ? 'bg-[color:var(--accent)]' : 'bg-[color:var(--warning)]'
      }`}
      aria-hidden
    />
  );

  if (size === 'sm') {
    return (
      <span
        title={`${alert.label} · ${alert.detail}`}
        aria-label={`Alerta: ${alert.label}`}
        className="inline-flex items-center"
      >
        {dot}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wider ${
        isCritical
          ? 'bg-[color:var(--accent)]/12 text-[color:var(--accent)]'
          : 'bg-[color:var(--warning)]/12 text-[color:var(--warning)]'
      }`}
    >
      <AlertTriangle className="size-3" aria-hidden strokeWidth={2} />
      {alert.label}
    </span>
  );
}
