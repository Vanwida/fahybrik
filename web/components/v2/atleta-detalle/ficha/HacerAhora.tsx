'use client';

// «Hacer ahora»: las acciones que tocan a ESTE atleta, de las mismas señales que Hoy
// (ficha-actions.ts). Cada chip hace la cosa, no lleva a otra pantalla a buscarla.

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Button, buttonVariants, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import type { WeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import { buildHacerAhora, type HacerAhoraChip } from '@/lib/dashboard/v2/ficha-actions';
import { weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { useFicha } from '../FichaContext';

function Chip({ chip }: { chip: HacerAhoraChip }) {
  const { shell, openChat, openSession, openWeekTool, openAssign, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const base = `/atletas/${shell.athlete_id}`;

  if (chip.kind === 'alta') {
    return (
      <Link href={base} className={buttonVariants({ size: 'sm' })}>
        {chip.label}
      </Link>
    );
  }
  if (chip.kind === 'pago') {
    return (
      <Link href={`${base}?tab=perfil&seccion=pagos`} className={buttonVariants({ size: 'sm' })}>
        {chip.label}
      </Link>
    );
  }
  if (chip.kind === 'comunicado') {
    return (
      <Link href={`${base}?tab=perfil&seccion=historial&historial=comunicado`} className={buttonVariants({ size: 'sm' })}>
        {chip.label}
      </Link>
    );
  }

  const onClick = async () => {
    if (chip.kind === 'responder') return openChat();
    if (chip.kind === 'ajustar' && chip.session_id) return openSession(chip.session_id);
    if (chip.kind === 'descarga' && chip.week_start) return openWeekTool('deload', chip.week_start);
    if (chip.kind === 'evaluar' && chip.week_start) return openWeekTool('evaluar', chip.week_start);
    if (chip.kind === 'asignar') return openAssign();
    if (chip.kind === 'publicar' && chip.week_start) {
      setBusy(true);
      try {
        await apiJson<WeekPublishResult>(`/api/coach/athletes/${shell.athlete_id}/weeks/${chip.week_start}/publish`, {
          method: 'POST',
        });
        toast({ title: `Semana ${weekRangeLabel(chip.week_start)} visible`, tone: 'ok' });
        bumpCalendar();
      } catch (err) {
        toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Button size="sm" loading={busy} onClick={() => void onClick()}>
      {chip.label}
    </Button>
  );
}

export function HacerAhora() {
  const { shell } = useFicha();
  const chips = buildHacerAhora(shell);
  if (chips.length === 0) return null;
  return (
    <section aria-label="Hacer ahora" className="flex min-w-0 flex-wrap items-center gap-2">
      <h2 className="mr-1 t-label text-v2-faint">Hacer ahora</h2>
      {chips.map((c) => (
        <Chip key={c.key} chip={c} />
      ))}
    </section>
  );
}
