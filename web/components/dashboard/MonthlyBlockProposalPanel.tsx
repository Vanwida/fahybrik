'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import type { MonthlyBlockProposal } from '@/lib/dashboard/coach/monthly-block-proposal';

interface MonthlyBlockProposalPanelProps {
  athlete_id: string;
  proposal: MonthlyBlockProposal | null;
}

export function MonthlyBlockProposalPanel({
  athlete_id,
  proposal,
}: MonthlyBlockProposalPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const generate = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/coach/athletes/${athlete_id}/monthly-block`,
        { method: 'POST', credentials: 'include' },
      );
      if (res.ok) {
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setMessage(json?.error?.message ?? 'No se pudo generar la propuesta.');
    });
  };

  const act = (action: 'approve' | 'reject') => {
    if (!proposal) return;
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/coach/athletes/${athlete_id}/monthly-block/${proposal.id}/${action}`,
        { method: 'POST', credentials: 'include' },
      );
      if (res.ok) {
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setMessage(
        json?.error?.message ??
          (action === 'approve'
            ? 'No se pudo aprobar la propuesta.'
            : 'No se pudo rechazar la propuesta.'),
      );
    });
  };

  if (!proposal) {
    return (
      <section className="card-surface p-4">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent)]">
            Bloque mensual
          </p>
          <p className="mt-1 text-sm font-semibold">
            Fin de microciclo — generar propuesta para el mes siguiente
          </p>
        </header>
        <p className="mt-2 text-xs text-[color:var(--muted)]">
          Cuando lo lances, Pablo IA evaluará readiness, cumplimiento y nivel
          del atleta y propondrá el mes plantilla que mejor encaja.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={generate}
            className="rounded-[var(--r-m)] bg-[color:var(--accent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--accent-on)] disabled:opacity-50"
          >
            {pending ? '…' : 'Generar propuesta mes siguiente'}
          </button>
          {message ? (
            <span className="text-xs text-[color:var(--muted)]">{message}</span>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section
      id="monthly-block-panel"
      className="card-surface p-4 ring-2 ring-[color:var(--accent)]"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[color:var(--accent)]">
            Pablo IA · bloque mensual
          </p>
          <p className="mt-1 text-sm font-semibold">
            Propuesta mes siguiente · {proposal.month_name}
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--hairline)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--muted)]">
          Inicio {proposal.proposed_start_date}
        </span>
      </header>

      {proposal.rationale ? (
        <p className="mt-3 text-xs text-[color:var(--muted)]">
          {proposal.rationale}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          disabled={pending}
          onClick={generate}
          className="rounded-[var(--r-m)] border border-[color:var(--hairline)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          title="Regenerar la propuesta con datos actuales"
        >
          Regenerar
        </button>
        {message ? (
          <span className="text-xs text-[color:var(--muted)]">{message}</span>
        ) : null}
      </div>
    </section>
  );
}
