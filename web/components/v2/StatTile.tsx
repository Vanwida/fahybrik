// StatTile — a micro-label over a big italic-display number, the v2 readout
// signature. `tone` lights the value in a semantic color; default is fg. Used in
// the Hoy top bar count chips and any KPI strip.

import { cn } from '@/lib/utils';

export type StatTone = 'fg' | 'accent' | 'ok' | 'warn' | 'danger' | 'info';

const TONE_VAR: Record<StatTone, string> = {
  fg: '--v2-fg',
  accent: '--v2-accent',
  ok: '--v2-ok',
  warn: '--v2-warn',
  danger: '--v2-danger',
  info: '--v2-info',
};

export function StatTile({
  label,
  value,
  tone = 'fg',
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span
        className="v2-display text-3xl tabular-nums"
        style={{ color: `var(${TONE_VAR[tone]})` }}
      >
        {value}
      </span>
      <span className="v2-micro">{label}</span>
    </div>
  );
}
