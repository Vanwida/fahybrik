// LeadOnboardingSummary — the full onboarding answers, grouped by block, as a set
// of Cards (one per block). Each card is a clean two-column definition list:
// question (muted) → answer (fg, mono for pure numbers). This is the sheet Pablo
// reads to prep the call. Codes are already mapped to Spanish labels upstream.

import { Card } from '@/components/ui/card';
import type { LeadSummaryGroup } from '@fahybrid/shared/domain/leads/summary';
import { cn } from '@/lib/utils';

// A purely numeric / time answer (e.g. "34", "3-4", "3:45", "12,5") gets tabular
// mono numerals so the column reads cleanly; mixed text ("34 kg") stays regular.
const NUMERIC_ANSWER = /^\d[\d\s.,:/-]*$/;

export function LeadOnboardingSummary({ summary }: { summary: LeadSummaryGroup[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {summary.map((group) => (
        <Card key={group.block} className="p-4 lg:p-5">
          <h3 className="v2-micro mb-3 text-[color:var(--v2-accent)]">{group.label}</h3>
          <dl className="flex flex-col gap-2.5">
            {group.rows.map((row, i) => (
              <div
                key={`${group.block}-${i}`}
                className="grid grid-cols-[minmax(0,9rem)_1fr] items-baseline gap-3"
              >
                <dt className="text-xs text-[color:var(--v2-muted)]">{row.question}</dt>
                <dd
                  className={cn(
                    'min-w-0 text-sm text-[color:var(--v2-fg)]',
                    NUMERIC_ANSWER.test(row.answer.trim()) && 'v2-num',
                  )}
                >
                  {row.answer}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </div>
  );
}
