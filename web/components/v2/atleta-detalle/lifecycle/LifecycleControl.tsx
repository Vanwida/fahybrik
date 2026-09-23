'use client';

// LifecycleControl (#13) — the coach's lifecycle actions in the ficha header. Renders
// only the transitions valid for the CURRENT state (lifecycleActionsFor):
//   activo   → [Pausar] [Dar de baja]
//   pausado  → [Reactivar] [Dar de baja]
//   baja     → [Re-alta]
// Pausar / Dar de baja / Re-alta open a dialog; Reactivar fires directly (auto-resume).
// Every mutation goes through the shared useLifecycleMutation hook (PATCH + refresh).

import { useState } from 'react';
import { PauseCircle, PlayCircle, RotateCcw, UserX, type LucideIcon } from 'lucide-react';
import type { MenuEntry } from '@/components/v2/ui';
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

const ICON: Record<LifecycleActionKind, LucideIcon> = {
  pause: PauseCircle,
  resume: PlayCircle,
  baja: UserX,
  re_alta: RotateCcw,
};

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
      <p className="t-body text-v2-muted">
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
      <p className="t-body text-v2-muted">
        Congela el plan y la factura sigue hasta el fin del periodo. El historial se conserva y
        podrás darle de re-alta más adelante.
      </p>
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
        <p className="t-body text-v2-warn">
          El atleta ya vuelve a estar activo, pero has superado tu cupo. Libera una plaza o ajusta
          tu capacidad cuando puedas.
        </p>
      ) : (
        <p className="t-body text-v2-muted">
          Vuelve a activar al atleta y reanuda su plan. Si con esto superas tu cupo te avisaremos,
          pero podrás continuar igualmente.
        </p>
      )}
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

/**
 * Las acciones de ciclo de vida para el menú ··· de la cabecera: solo las válidas
 * para el estado actual (activo → Pausar, Dar de baja · pausado → Reactivar, Dar
 * de baja · baja → Re-alta). Pausar / Baja / Re-alta abren su diálogo; Reactivar
 * va directa. Devuelve las entradas del menú y los diálogos a montar.
 */
export function useLifecycleMenu(athleteId: string, lifecycle: DetalleLifecycle) {
  const { mutate, error, setError } = useLifecycleMutation(athleteId);
  const [dialog, setDialog] = useState<LifecycleActionKind | null>(null);
  const actions = lifecycleActionsFor(lifecycle.status);

  const items: MenuEntry[] = actions.map((kind) => ({
    label: LIFECYCLE_ACTION_META[kind].label,
    icon: ICON[kind],
    danger: LIFECYCLE_ACTION_META[kind].tone === 'danger',
    onSelect: () => {
      setError(null);
      if (LIFECYCLE_ACTION_META[kind].needsDialog) setDialog(kind);
      else void mutate({ action: kind });
    },
  }));

  const dialogs = (
    <>
      {dialog === 'pause' ? <PauseDialog athleteId={athleteId} onClose={() => setDialog(null)} /> : null}
      {dialog === 'baja' ? <BajaDialog athleteId={athleteId} onClose={() => setDialog(null)} /> : null}
      {dialog === 're_alta' ? <ReAltaDialog athleteId={athleteId} onClose={() => setDialog(null)} /> : null}
    </>
  );

  return { items, dialogs, error: dialog === null ? error : null };
}
