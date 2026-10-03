'use client';

// «Hacer ahora»: las acciones que tocan a ESTE atleta, de las mismas señales que Hoy
// (ficha-actions.ts). Cada chip hace la cosa, no lleva a otra pantalla a buscarla.

import { useState, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { Button, StatusBadge, buttonVariants, useToast } from '@/components/v2/ui';
import { apiJson, errorMessage } from '@/components/v2/shared/api';
import { scrollExistingLinkAnchor } from '@/components/v2/shared/anchor-link';
import type { WeekPublishResult } from '@fahybrid/shared/schema/week-publishing';
import { buildHacerAhora, hacerAhoraCommand, partitionHacerAhora, type HacerAhoraChip } from '@/lib/dashboard/v2/ficha-actions';
import { weekRangeLabel } from '@/lib/dashboard/v2/ficha-format';
import { useFicha } from '../FichaContext';
import { cn } from '@/lib/utils';

function Chip({ chip, primary = false }: { chip: HacerAhoraChip; primary?: boolean }) {
  const { shell, openChat, openSession, openWeekTool, openAssign, bumpCalendar } = useFicha();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const variant = primary ? 'primary' : 'secondary';
  const command = hacerAhoraCommand(chip);
  if (command?.kind === 'link') {
    return (
      <Link href={command.href} onClick={(event) => scrollExistingLinkAnchor(event, command.href)} className={buttonVariants({ variant, size: 'sm' })}>
        {chip.label}
      </Link>
    );
  }

  const onClick = async () => {
    if (busy) return;
    if (command?.kind === 'chat') return openChat();
    if (command?.kind === 'session') return openSession(command.id);
    if (command?.kind === 'deload') return openWeekTool('deload', command.week_start);
    if (command?.kind === 'review_adjustment') return openWeekTool('revisar_ajuste', shell.today, { proposal_id: command.proposal_id });
    if (command?.kind === 'assign') return openAssign();
    if (command?.kind === 'publish') {
      setBusy(true);
      try {
        await apiJson<WeekPublishResult>(`/api/coach/athletes/${shell.athlete_id}/weeks/${command.week_start}/publish`, {
          method: 'POST',
        });
        toast({ title: `Semana ${weekRangeLabel(command.week_start)} visible`, tone: 'ok' });
        bumpCalendar();
      } catch (err) {
        toast({ title: 'No se ha podido publicar', description: errorMessage(err), tone: 'danger' });
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <Button size="sm" variant={variant} loading={busy} disabled={command === null} onClick={() => void onClick()}>
      {chip.label}
    </Button>
  );
}

function PendingRow({ chip, primary = false }: { chip: HacerAhoraChip; primary?: boolean }) {
  return <div role={chip.severity === 'critical' ? 'alert' : undefined}
    className={cn('flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2',
      chip.severity === 'critical' && 'rounded-ctl bg-v2-danger-soft px-3 py-2')}>
    <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="t-body-sm font-medium text-v2-fg">{chip.cause}</span>
        {chip.severity === 'critical' ? <StatusBadge tone="danger" label="Crítico" size="sm" /> : null}
      </div>
      {chip.evidence.map((e, i) => <span key={`${chip.key}-${i}`} className="t-meta break-words whitespace-normal text-v2-muted">{e}</span>)}
    </div>
    <Chip chip={chip} primary={primary} />
  </div>;
}

export function HacerAhora({ badge, summary }: { badge?: ReactNode; summary?: string } = {}) {
  const { shell } = useFicha();
  const chips = buildHacerAhora(shell);
  if (chips.length === 0 && !badge) return null;
  const { primary, critical, remaining } = partitionHacerAhora(chips);
  return (
    <div aria-label="Hacer ahora" className="flex min-w-0 flex-col gap-2">
      {badge || summary ? <div className="flex min-w-0 flex-wrap items-center gap-2">
        {badge}
        {summary ? <span className="t-meta text-v2-muted">{summary}</span> : null}
      </div> : null}
      {primary.map((c) => (
        <PendingRow key={c.key} chip={c} primary />
      ))}
      {critical.map((c) => <PendingRow key={c.key} chip={c} />)}
      {remaining.length > 0 ? (
        <details className="min-w-0">
          <summary className="cursor-pointer rounded-ctl py-2 t-body-sm text-v2-muted outline-none focus-visible:ring-2 focus-visible:ring-v2-accent">
            Más avisos y tareas ({remaining.length})
          </summary>
          <div className="flex min-w-0 flex-col gap-3 border-t border-v2-border pt-3 pb-1">
            {remaining.map((c) => <PendingRow key={c.key} chip={c} />)}
          </div>
        </details>
      ) : null}
    </div>
  );
}
