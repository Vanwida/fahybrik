'use client';

// LeadStatusControl — moves a lead through the sales pipeline. Shows the current
// status (highlighted) + the valid coach-settable transitions as buttons. On click
// it PATCHes /api/coach/leads/{id}; on success it router.refresh()es so the server
// re-renders the detail with the new status; on error it shows an inline message.
// Buttons disable while a change is in flight. `convertido` (the alta flow) and
// `parcial` (system-only) are never settable here — the backend is the source of
// truth for what's allowed.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';
import {
  LEAD_STATUS_META,
  leadStatusAllowedNext,
  type LeadStatus,
} from '@/lib/dashboard/coach/leads-status';
import { cn } from '@/lib/utils';

// Icon + verb-form action label per settable status. Only the coach-settable states
// (contactado/agendado/descartado) are ever rendered; the rest are '' for type-completeness.
const ACTION_ICON: Record<LeadStatus, string> = {
  parcial: '',
  nuevo: '',
  contactado: 'call',
  agendado: 'event_available',
  convertido: '',
  descartado: 'block',
};

const ACTION_LABEL: Record<LeadStatus, string> = {
  parcial: '',
  nuevo: '',
  contactado: 'Marcar contactado',
  agendado: 'Cita agendada',
  convertido: '',
  descartado: 'Descartar',
};

export function LeadStatusControl({
  leadId,
  currentStatus,
}: {
  leadId: string;
  currentStatus: LeadStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fetching, setFetching] = useState(false);
  const [savingTo, setSavingTo] = useState<LeadStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = isPending || fetching;
  const meta = LEAD_STATUS_META[currentStatus];

  async function setStatus(status: LeadStatus) {
    if (busy || status === currentStatus) return;
    setError(null);
    setSavingTo(status);
    setFetching(true);
    try {
      const res = await fetch(`/api/coach/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        let message = 'No se pudo actualizar el estado. Reintenta.';
        try {
          const body = (await res.json()) as { error?: { message?: string } };
          if (body?.error?.message) message = body.error.message;
        } catch {
          /* keep the default message */
        }
        setError(message);
        setFetching(false);
        setSavingTo(null);
        return;
      }
      // Re-render the server component so the header pill + control reflect the
      // new status. isPending stays true across the refresh → buttons stay disabled.
      setFetching(false);
      startTransition(() => router.refresh());
    } catch {
      setError('Error de red. Reintenta.');
      setFetching(false);
      setSavingTo(null);
    }
  }

  // Forward-only transitions per the shared NO-RETREAT rule (leadStatusAllowedNext):
  // nuevo→contactado→agendado, plus →descartado; never backwards, never out of a
  // terminal state. `convertido` (the alta flow, task #5) and `parcial` are not settable.
  const actions = leadStatusAllowedNext(currentStatus);

  const isConverted = currentStatus === 'convertido'; // terminal, untouchable
  const isDiscarded = currentStatus === 'descartado'; // terminal in the pipeline, but reopenable
  const reopening = busy && savingTo === 'nuevo';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="v2-micro">Estado actual</span>
        <Pill tone={meta.tone} variant="solid">
          {meta.label}
        </Pill>
      </div>

      {isConverted ? (
        <p className="text-xs text-[color:var(--v2-muted)]">Este lead ya se convirtió en atleta.</p>
      ) : isDiscarded ? (
        // Discarded is terminal in the pipeline, but a mis-tap must be undoable →
        // the explicit "Reabrir" human correction (descartado → nuevo).
        <div className="flex flex-col gap-1.5">
          <span className="v2-micro">Descartado</span>
          <button
            type="button"
            onClick={() => setStatus('nuevo')}
            disabled={busy}
            className={cn(
              'v2-focus inline-flex h-9 w-fit items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-body font-semibold text-[color:var(--v2-fg)] transition-colors hover:border-[color:var(--v2-border-strong)] disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <MIcon
              name={reopening ? 'progress_activity' : 'restart_alt'}
              size={16}
              className={reopening ? 'animate-spin' : undefined}
            />
            Reabrir
          </button>
          <p className="text-xs text-[color:var(--v2-muted)]">Corrección: devuelve el lead a “Nuevo”.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="v2-micro">Mover a</span>
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((s) => {
              const isDiscard = s === 'descartado';
              const spinning = busy && savingTo === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  disabled={busy}
                  className={cn(
                    'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border px-3 text-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    isDiscard
                      ? 'border-[color:var(--v2-border)] text-[color:var(--v2-danger)] hover:border-[color:var(--v2-danger)]'
                      : 'border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
                  )}
                >
                  <MIcon
                    name={spinning ? 'progress_activity' : ACTION_ICON[s]}
                    size={16}
                    className={spinning ? 'animate-spin' : undefined}
                  />
                  {ACTION_LABEL[s]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
