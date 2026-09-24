'use client';

// La previa de «Asignar programa» (el dry_run de POST /api/coach/assign): qué le
// pasa a cada atleta ANTES de tocar nada. Resumen por acción (una línea cada
// una) y, al abrir, la lista con el porqué de cada uno. Nada de párrafos.

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AssignAction, AssignPreview } from '@fahybrid/shared/schema/assign-many';
import { Button, StatusBadge, type StatusTone } from '@/components/v2/ui';
import { cn } from '@/lib/utils';
import { dateRange } from './format';
import { athleteLine, receivingCount } from './logic';

export { athleteLine, receivingCount };

const ACTION_VIEW: Record<AssignAction, { label: (n: number) => string; tone: StatusTone }> = {
  assign: { label: (n) => `${n} ${n === 1 ? 'empieza' : 'empiezan'} en la fecha`, tone: 'ok' },
  chain: { label: (n) => `${n} detrás de lo que ya ${n === 1 ? 'tiene' : 'tienen'}`, tone: 'info' },
  replace: {
    label: (n) => `${n} ${n === 1 ? 'sustituye' : 'sustituyen'} lo que ${n === 1 ? 'tiene' : 'tienen'}`,
    tone: 'warn',
  },
  adopt: {
    label: (n) => `${n} ya lo ${n === 1 ? 'hace' : 'hacen'}: lo ${n === 1 ? 'conserva' : 'conservan'}`,
    tone: 'neutral',
  },
  skip: { label: (n) => `${n} se ${n === 1 ? 'queda' : 'quedan'} como ${n === 1 ? 'está' : 'están'}`, tone: 'neutral' },
  blocked: { label: (n) => `${n} no se ${n === 1 ? 'puede' : 'pueden'} asignar`, tone: 'danger' },
};

const ORDER: AssignAction[] = ['assign', 'chain', 'replace', 'adopt', 'skip', 'blocked'];

export function AssignPreviewSummary({ preview, className }: { preview: AssignPreview; className?: string }) {
  const [open, setOpen] = useState<AssignAction | null>(null);
  const n = receivingCount(preview);
  const partnersMissing = preview.athletes.filter((a) => a.pair_partner && !a.pair_partner.included);
  return (
    <div className={cn('flex flex-col gap-3 rounded-panel bg-v2-surface-2 px-3.5 py-3', className)}>
      <p className="t-body text-v2-fg">
        <span className="font-semibold t-tnum">{n}</span> {n === 1 ? 'atleta' : 'atletas'} ×{' '}
        <span className="font-semibold t-tnum">{preview.weeks}</span> {preview.weeks === 1 ? 'semana' : 'semanas'} ·{' '}
        <span className="t-tnum">{preview.sessions_per_athlete}</span> entrenos cada uno ·{' '}
        <span className="text-v2-muted">
          {preview.counts.assign + preview.counts.replace > 0
            ? dateRange(preview.start_date, preview.end_date)
            : 'cada uno detrás de lo suyo'}
        </span>
      </p>
      <ul className="flex flex-col gap-1">
        {ORDER.filter((k) => preview.counts[k] > 0).map((k) => {
          const rows = preview.athletes.filter((a) => a.action === k);
          const expanded = open === k;
          return (
            <li key={k} className="flex flex-col">
              <Button
                size="sm"
                variant="ghost"
                icon={expanded ? ChevronDown : ChevronRight}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : k)}
                className="-ml-2 w-fit"
              >
                <StatusBadge tone={ACTION_VIEW[k].tone} label={ACTION_VIEW[k].label(preview.counts[k])} size="sm" />
              </Button>
              {expanded ? (
                <ul className="mt-1 mb-2 ml-5 flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {rows.map((a) => (
                    <li key={a.id} className="flex min-w-0 items-baseline gap-2 t-body-sm">
                      <span className="shrink-0 font-medium text-v2-fg">{a.name}</span>
                      <span className="min-w-0 truncate text-v2-muted">{athleteLine(a)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {partnersMissing.length > 0 ? (
        <p className="t-body-sm text-v2-warn">
          {partnersMissing.map((a) => `${a.name} entrena con ${a.pair_partner!.name}`).join(' · ')}: su pareja no va en
          este envío.
        </p>
      ) : null}
      <p className="t-meta text-v2-faint">Nadie pierde lo que ya ha entrenado.</p>
    </div>
  );
}
