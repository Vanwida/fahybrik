'use client';

// PERSONALIZAR PLAN (0164, camino principal) — confirmation before forking the
// athlete's CURRENT microciclo (from the week they're living onward) into a
// bespoke plan just for them. This is a real, stated-up-front side effect (the
// athlete stops receiving auto-assigned microciclos by level×días), so the
// coach reads it in plain language before confirming — never a silent flip.

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Check, TriangleAlert, WandSparkles } from 'lucide-react';
import { Button, Dialog, SegmentedControl } from '@/components/v2/ui';

type StartChoice = 'current_week' | 'next_week';

const startOptions = [
  { value: 'current_week' as const, label: 'Esta semana' },
  { value: 'next_week' as const, label: 'La semana que viene' },
];

export function PersonalizarPlanModal({
  athleteId,
  athleteName,
  currentBlockName,
  currentWeek,
  onClose,
}: {
  athleteId: string;
  athleteName: string;
  /** Name of the CURRENT microciclo being forked (for "a partir de «X»"). */
  currentBlockName: string;
  /** 1-based week within that microciclo the fork starts at. */
  currentWeek: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [start, setStart] = useState<StartChoice>('current_week');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/coach/athletes/${athleteId}/personalize-plan`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start }),
      });
      const body = (await res.json().catch(() => null)) as
        | { personalize?: { month_template_id: string }; error?: { message?: string } }
        | null;
      if (!res.ok || !body?.personalize) {
        setError(body?.error?.message ?? 'No se pudo personalizar el plan.');
        setSubmitting(false);
        return;
      }
      router.push(`/programar/programas/${body.personalize.month_template_id}`);
    } catch {
      setError('No se pudo personalizar el plan. Inténtalo de nuevo.');
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !submitting) onClose();
      }}
      title="Personalizar plan"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" icon={WandSparkles} loading={submitting} onClick={confirm}>
            Personalizar y editar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="t-body text-v2-fg">
          Vas a coger el programa de <span className="font-medium">{athleteName}</span>: «{currentBlockName}»
          {currentWeek != null ? ` (semana ${currentWeek})` : ''}, y convertirlo en un plan solo para {athleteName}.
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="t-meta text-v2-muted">Empieza</span>
          <SegmentedControl
            items={startOptions}
            value={start}
            onValueChange={setStart}
            aria-label="Cuándo empieza el plan personal"
            className="self-start"
          />
        </div>
        <ul className="flex flex-col gap-2 t-body-sm text-v2-muted">
          <li className="flex items-start gap-2">
            <Check aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-ok" />
            {start === 'next_week'
              ? 'Esta semana sigue igual: lo ya hecho nunca cambia.'
              : 'Lo ya hecho no cambia: solo se copia desde la semana en curso.'}
          </li>
          <li className="flex items-start gap-2">
            <Check aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-ok" />
            El programa original de la biblioteca queda intacto: esto es una copia.
          </li>
          <li className="flex items-start gap-2">
            <TriangleAlert aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-v2-warn" />
            {athleteName} deja de recibir los programas de su grupo: a partir de ahora sigue este plan a medida.
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
