'use client';

// LifecycleControl (#13) — the coach's lifecycle actions in the ficha header. Renders
// only the transitions valid for the CURRENT state (lifecycleActionsFor):
//   activo   → [Pausar] [Dar de baja]
//   pausado  → [Reactivar] [Dar de baja]
//   baja     → [Re-alta]
// Pausar / Dar de baja / Re-alta open a dialog; Reactivar fires directly (auto-resume).
// Every mutation goes through the shared useLifecycleMutation hook (PATCH + refresh).

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import type { PauseReason } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { DetalleLifecycle } from '@/lib/dashboard/v2/atleta-detalle-types';
import {
  LIFECYCLE_ACTION_META,
  lifecycleActionsFor,
  type LifecycleActionKind,
} from '@/lib/dashboard/v2/lifecycle-actions';
import { useLifecycleMutation } from './lifecycle-mutations';
import { LifecycleDialog } from './LifecycleDialog';
import {
  DATE_INPUT_CLS,
  DialogError,
  DialogField,
  DialogGhostButton,
  DialogPrimaryButton,
  ReasonChips,
  TEXTAREA_CLS,
  todayIsoLocal,
} from './lifecycle-ui';

const NOTE_MAX = 1000;

function ActionButton({
  kind,
  busy,
  onClick,
}: {
  kind: LifecycleActionKind;
  busy: boolean;
  onClick: () => void;
}) {
  const meta = LIFECYCLE_ACTION_META[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        meta.tone === 'danger'
          ? 'border-[color:var(--v2-border)] text-[color:var(--v2-danger)] hover:border-[color:var(--v2-danger)]'
          : 'border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
      )}
    >
      <MIcon name={busy ? 'progress_activity' : meta.icon} size={16} className={busy ? 'animate-spin' : undefined} />
      {meta.label}
    </button>
  );
}

// ── Pausar ──────────────────────────────────────────────────────────────────────
function PauseDialog({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const { mutate, busy, error } = useLifecycleMutation(athleteId);
  const [reason, setReason] = useState<PauseReason | null>(null);
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');

  async function confirm() {
    if (!reason) return;
    const res = await mutate({
      action: 'pause',
      reason,
      ...(endDate ? { end_date: endDate } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    if (res) onClose();
  }

  return (
    <LifecycleDialog
      title="Pausar atleta"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            disabled={!reason}
            busy={busy}
            icon="pause_circle"
            label="Pausar"
          />
        </>
      }
    >
      <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
        Congela su plan y excluye estos días de la adherencia. Podrás reactivarlo cuando quieras.
      </p>
      <DialogField label="Motivo" required>
        <ReasonChips value={reason} onChange={setReason} disabled={busy} />
      </DialogField>
      <DialogField label="Vuelve el" hint="opcional">
        <input
          type="date"
          value={endDate}
          min={todayIsoLocal()}
          disabled={busy}
          onChange={(e) => setEndDate(e.target.value)}
          className={DATE_INPUT_CLS}
          aria-label="Fecha de vuelta"
        />
      </DialogField>
      <DialogField label="Nota" hint="opcional">
        <textarea
          value={note}
          rows={2}
          maxLength={NOTE_MAX}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="p. ej. sobrecarga en el gemelo…"
          className={TEXTAREA_CLS}
        />
      </DialogField>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

// ── Dar de baja ─────────────────────────────────────────────────────────────────
function BajaDialog({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const { mutate, busy, error } = useLifecycleMutation(athleteId);
  const [reason, setReason] = useState<PauseReason | null>(null);

  async function confirm() {
    if (!reason) return;
    const res = await mutate({ action: 'baja', reason });
    if (res) onClose();
  }

  return (
    <LifecycleDialog
      title="Dar de baja"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onClose} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={confirm}
            disabled={!reason}
            busy={busy}
            icon="person_off"
            label="Dar de baja"
            tone="danger"
          />
        </>
      }
    >
      <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)]/30 bg-[color:var(--v2-warn-soft)] px-3.5 py-2.5">
        <MIcon name="info" size={18} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
        <p className="text-[13px] leading-relaxed text-[color:var(--v2-fg)]">
          Congela el plan y la factura sigue hasta el fin del periodo. El historial se conserva y
          podrás darle de re-alta más adelante.
        </p>
      </div>
      <DialogField label="Motivo" required>
        <ReasonChips value={reason} onChange={setReason} disabled={busy} />
      </DialogField>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

// ── Re-alta ─────────────────────────────────────────────────────────────────────
function ReAltaDialog({ athleteId, onClose }: { athleteId: string; onClose: () => void }) {
  const { mutate, busy, error } = useLifecycleMutation(athleteId);
  // Set once the transition committed but pushed the roster over cap — the athlete is
  // already active, so we keep the dialog open to surface the honest warning (it would
  // otherwise vanish on refresh, since re_alta is no longer an available action).
  const [overCapacity, setOverCapacity] = useState(false);

  async function confirm() {
    const res = await mutate({ action: 're_alta' });
    if (!res) return;
    if (res.over_capacity) setOverCapacity(true);
    else onClose();
  }

  return (
    <LifecycleDialog
      title="Dar de re-alta"
      onClose={onClose}
      busy={busy}
      footer={
        overCapacity ? (
          <DialogPrimaryButton onClick={onClose} icon="check" label="Entendido" />
        ) : (
          <>
            <DialogGhostButton onClick={onClose} disabled={busy}>
              Cancelar
            </DialogGhostButton>
            <DialogPrimaryButton onClick={confirm} busy={busy} icon="restart_alt" label="Re-alta" />
          </>
        )
      }
    >
      {overCapacity ? (
        <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-warn)]/40 bg-[color:var(--v2-warn-soft)] px-3.5 py-3">
          <MIcon name="warning" size={18} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
          <p className="text-[13px] leading-relaxed text-[color:var(--v2-fg)]">
            El atleta ya vuelve a estar activo, pero has superado tu cupo. Libera una plaza o ajusta
            tu capacidad cuando puedas.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[color:var(--v2-muted)]">
          Vuelve a activar al atleta y reanuda su plan. Si con esto superas tu cupo te avisaremos,
          pero podrás continuar igualmente.
        </p>
      )}
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

export function LifecycleControl({
  athleteId,
  lifecycle,
}: {
  athleteId: string;
  lifecycle: DetalleLifecycle;
}) {
  const { mutate, busy, error, setError } = useLifecycleMutation(athleteId);
  const [dialog, setDialog] = useState<LifecycleActionKind | null>(null);
  const actions = lifecycleActionsFor(lifecycle.status);

  function onAction(kind: LifecycleActionKind) {
    setError(null);
    if (LIFECYCLE_ACTION_META[kind].needsDialog) {
      setDialog(kind);
    } else {
      // resume — auto-resume, no data to collect.
      void mutate({ action: kind });
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {actions.map((k) => (
          <ActionButton key={k} kind={k} busy={busy} onClick={() => onAction(k)} />
        ))}
      </div>
      {/* Inline error for the direct (dialog-less) resume path. */}
      {error && dialog === null ? <DialogError>{error}</DialogError> : null}

      {dialog === 'pause' ? (
        <PauseDialog athleteId={athleteId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'baja' ? (
        <BajaDialog athleteId={athleteId} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 're_alta' ? (
        <ReAltaDialog athleteId={athleteId} onClose={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
