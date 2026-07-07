// LeadValue — renders a lead field value, or a muted em-dash when it is empty.
// `leadOptionLabel` returns '' for any unanswered field; this is the SINGLE place
// that turns that empty into a consistent "—" so no cell ever shows a blank gap.

import { cn } from '@/lib/utils';

export const LEAD_DASH = '—';

export function LeadValue({
  value,
  className,
  numeric = false,
}: {
  value: string | number | null | undefined;
  className?: string;
  /** Render with tabular mono numerals (.v2-num) — for ages, day counts, etc. */
  numeric?: boolean;
}) {
  const text = value == null ? '' : String(value).trim();
  if (!text) {
    return <span className="text-[color:var(--v2-faint)]">{LEAD_DASH}</span>;
  }
  return <span className={cn(numeric && 'v2-num', className)}>{text}</span>;
}
