'use client';

// FH-79 — un control por alcance, no por celda. Sesión (assignment_id) y día
// (sin id) hablan el mismo PATCH. Confirmación modal (LifecycleDialog), nunca
// wipe silencioso. Vocabulario: «Quitar sesión» / «Marcar día descanso».

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { LifecycleDialog } from '@/components/v2/atleta-detalle/lifecycle/LifecycleDialog';
import {
  DIALOG_OUTLINE_CLS,
  DialogError,
  DialogGhostButton,
  DialogPrimaryButton,
} from '@/components/v2/atleta-detalle/lifecycle/lifecycle-ui';
import { cn } from '@/lib/utils';

type RestErrorBody = { error?: { message?: string } } | null;

async function patchDayRest(params: {
  athleteId: string;
  isoDate: string;
  assignmentId?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const body =
    params.assignmentId != null
      ? { kind: 'rest', assignment_id: params.assignmentId }
      : { kind: 'rest' };
  try {
    const res = await fetch(`/api/coach/athletes/${params.athleteId}/plan/day/${params.isoDate}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as RestErrorBody;
    if (!res.ok) {
      return { ok: false, message: json?.error?.message ?? 'No se pudo completar la acción' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'No se pudo completar la acción' };
  }
}

function RestConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <LifecycleDialog
      title={title}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <DialogGhostButton onClick={onCancel} disabled={busy}>
            Cancelar
          </DialogGhostButton>
          <DialogPrimaryButton
            onClick={onConfirm}
            busy={busy}
            icon="delete"
            label={confirmLabel}
            tone="danger"
          />
        </>
      }
    >
      <p className="text-sm text-[color:var(--v2-fg)]">{body}</p>
      {error ? <DialogError>{error}</DialogError> : null}
    </LifecycleDialog>
  );
}

export function QuitarEstaSesionButton({
  athleteId,
  isoDate,
  assignmentId,
  onDone,
}: {
  athleteId: string;
  isoDate: string;
  assignmentId: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await patchDayRest({ athleteId, isoDate, assignmentId });
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.refresh();
    setOpen(false);
    setBusy(false);
    onDone?.();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
        aria-label="Quitar esta sesión"
        className={cn(DIALOG_OUTLINE_CLS, 'disabled:opacity-50')}
      >
        <MIcon name="delete" size={16} />
        Quitar esta sesión
      </button>
      <p className="text-xs text-[color:var(--v2-muted)]">
        Solo esta sesión. Las otras del mismo día se quedan.
      </p>
      {open ? (
        <RestConfirmDialog
          title="¿Quitar esta sesión?"
          body="Solo esta sesión. Las otras del mismo día se quedan."
          confirmLabel="Quitar sesión"
          busy={busy}
          error={error}
          onCancel={() => !busy && setOpen(false)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}

export function MarcarDiaDescansoButton({
  athleteId,
  isoDate,
  scheduledCount,
}: {
  athleteId: string;
  isoDate: string;
  scheduledCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wipeAll = scheduledCount > 1;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await patchDayRest({ athleteId, isoDate });
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }
    router.refresh();
    setOpen(false);
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={busy}
        aria-label="Marcar día descanso"
        className={cn(DIALOG_OUTLINE_CLS, 'disabled:opacity-50')}
      >
        <MIcon name="bedtime" size={16} />
        Marcar día descanso
      </button>
      {open ? (
        <RestConfirmDialog
          title={wipeAll ? '¿Quitar todas?' : '¿Marcar día descanso?'}
          body={
            wipeAll
              ? `Se quitan las ${scheduledCount} sesiones pendientes de este día. Las ya hechas se quedan.`
              : 'Se quita la sesión pendiente de este día. Las ya hechas se quedan.'
          }
          confirmLabel={wipeAll ? 'Quitar todas' : 'Marcar día descanso'}
          busy={busy}
          error={error}
          onCancel={() => !busy && setOpen(false)}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </div>
  );
}
