'use client';

import { useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import type { PendingAdjustment } from '@/lib/dashboard/coach/week-adjustments';

interface WeekReviewPanelProps {
  proposal: PendingAdjustment;
  highlighted?: boolean | undefined;
}

const REC_LABEL: Record<string, string> = {
  keep: 'Mantener',
  soften: 'Suavizar',
  swap: 'Cambiar',
  rest_day: 'Descanso',
};

export function WeekReviewPanel({ proposal, highlighted }: WeekReviewPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const act = (action: 'approve' | 'reject') => {
    startTransition(async () => {
      const res = await fetch(
        `/api/coach/athletes/${proposal.athlete_id}/week-adjustment/${proposal.id}/${action}`,
        { method: 'POST', credentials: 'include' },
      );
      if (res.ok) router.refresh();
    });
  };

  return (
    <section
      id="week-review-panel"
      className={`card-surface p-4 ${highlighted ? 'ring-2 ring-[color:var(--accent)]' : ''}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent)]">
            Pablo IA · semana {proposal.week_start}
          </p>
          <p className="mt-1 text-sm font-semibold">Propuesta de ajuste semanal</p>
        </div>
        <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--muted)]">
          {REC_LABEL[proposal.proposal.recommendation] ?? proposal.proposal.recommendation}
        </span>
      </header>

      {proposal.coach_summary ? (
        <p className="mt-3 text-sm">{proposal.coach_summary}</p>
      ) : null}
      <p className="mt-2 text-xs text-[color:var(--muted)]">{proposal.proposal.rationale}</p>

      {proposal.proposal.slot_changes.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[color:var(--muted)]">
                <th className="pb-1 pr-3 font-semibold">Día</th>
                <th className="pb-1 pr-3 font-semibold">Antes</th>
                <th className="pb-1 font-semibold">Propuesto</th>
              </tr>
            </thead>
            <tbody>
              {proposal.proposal.slot_changes.map((c, i) => (
                <tr key={i} className="border-t border-[color:var(--hairline)]">
                  <td className="py-1.5 pr-3 tabular-nums">{c.date}</td>
                  <td className="py-1.5 pr-3 text-[color:var(--muted)]">
                    {c.from_template_id ?? '—'}
                  </td>
                  <td className="py-1.5 font-semibold text-[color:var(--accent)]">
                    {c.to_template_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => act('approve')}
          className="rounded-[var(--r-m)] bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--accent-on)] disabled:opacity-50"
        >
          {pending ? '…' : 'Aprobar'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => act('reject')}
          className="rounded-[var(--r-m)] border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Rechazar
        </button>
      </div>
    </section>
  );
}
