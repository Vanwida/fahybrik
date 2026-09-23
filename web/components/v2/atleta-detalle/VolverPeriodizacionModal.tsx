'use client';

// VOLVER A LA PERIODIZACIÓN (0166) — la inversa de "Personalizar plan": reactiva
// la secuencia (nivel×días) donde el atleta se quedó y retira el plan personal.
// Solo se ofrece cuando hay adónde volver (can_revert_to_sequence en el payload
// del plan) — un plan personal creado desde cero no tiene secuencia detrás, y
// ese caso no llega a ver este modal (usa "Borrar" en su lugar).

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Check, History, TriangleAlert } from 'lucide-react';
import { Button, Dialog } from '@/components/v2/ui';

export function VolverPeriodizacionModal({
  athleteId,
  athleteName,
  personalPlanName,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  /** Name of the personal plan being retired (for "dejar «X»"). */
  personalPlanName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/revert-to-sequence`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? 'No se pudo volver al plan de su grupo.');
        setSubmitting(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError('No se pudo volver al plan de su grupo. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
      title="Volver al plan de su grupo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={History} loading={submitting} onClick={confirm}>
            Volver al grupo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="t-body text-v2-fg">
          <span className="font-medium">{athleteName}</span> deja «{personalPlanName}» y vuelve a recibir los programas de
          su grupo, justo donde se quedó antes de personalizar.
        </p>
        <ul className="flex flex-col gap-2 t-body-sm text-v2-muted">
          <li className="flex items-start gap-2">
            <Check aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-ok" />
            Lo ya hecho en «{personalPlanName}» no se borra: queda en su historial.
          </li>
          <li className="flex items-start gap-2">
            <TriangleAlert aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-warn" />
            Los entrenos pendientes de «{personalPlanName}» se sustituyen por los de su grupo, empezando esta semana.
          </li>
        </ul>
        {error ? (
          <p role="alert" className="t-body-sm text-v2-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
