'use client';

// Una sección de filas de atleta (Acción / Vigilar / Por responder: el estado
// del atleta, las mismas palabras que Atletas). Vigilar se pliega a partir de 10
// con un «Ver N más» que SÍ despliega (el viejo «+ 38 más» no hacía nada).

import type { SignalAction } from '@fahybrid/shared/domain/coach/athlete-state';
import type { HoyProposal, HoyRow } from '@/lib/dashboard/hoy/hoy-types';
import { Button, List, SectionHeader } from '@/components/v2/ui';
import type { SnoozeUntil } from '@/components/v2/shared/SnoozeMenu';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { InboxRow } from './InboxRow';

export function RowSection({
  id,
  title,
  note,
  rows,
  fold,
  expanded,
  onExpand,
  activeId,
  selected,
  proposals,
  negocio,
  weekStart,
  onOpen,
  onToggle,
  onAction,
  onSnooze,
  onDone,
  onChange,
}: {
  id: string;
  title: string;
  /** Una nota corta tras la cifra («+6 con el pago vencido»). */
  note?: string | null;
  rows: ReadonlyArray<HoyRow>;
  /** Plegar a partir de N (null = nunca). */
  fold: number | null;
  expanded: boolean;
  onExpand: (open: boolean) => void;
  activeId: string | null;
  selected: ReadonlySet<string>;
  /** Lo contestado a «Proponer descarga» en esta visita (gana a lo del servidor). */
  proposals: ReadonlyMap<string, HoyProposal | 'enviando'>;
  negocio: boolean;
  weekStart: string;
  onOpen: (row: HoyRow) => void;
  onToggle: (row: HoyRow, checked: boolean, shift: boolean) => void;
  onAction: (row: HoyRow, action: SignalAction) => void;
  onSnooze: (row: HoyRow, until: SnoozeUntil) => void;
  onDone: (row: HoyRow) => void;
  onChange: () => void;
}) {
  if (rows.length === 0) return null;
  const folded = fold != null && !expanded && rows.length > fold;
  const shown = folded ? rows.slice(0, fold) : rows;
  const hiddenCount = rows.length - shown.length;

  return (
    <section className="flex flex-col gap-2" aria-labelledby={id}>
      <SectionHeader
        id={id}
        title={title}
        count={rows.length}
        action={note ? <span className="t-meta text-v2-faint t-tnum">{note}</span> : null}
      />
      <List aria-label={title} className="@container">
        <div data-hoy-list="" role="presentation" className="contents">
          {shown.map((row) => (
            <InboxRow
              key={row.athlete_id}
              row={row}
              active={activeId === row.athlete_id}
              selected={selected.has(row.athlete_id)}
              proposal={proposals.get(row.athlete_id) ?? row.proposal ?? null}
              negocio={negocio}
              weekStart={weekStart}
              onOpen={() => onOpen(row)}
              onToggle={(checked, shift) => onToggle(row, checked, shift)}
              onAction={(action) => onAction(row, action)}
              onSnooze={(until) => onSnooze(row, until)}
              onDone={() => onDone(row)}
              onChange={onChange}
            />
          ))}
        </div>
        {fold != null && rows.length > fold ? (
          <div role="listitem" className="border-t border-v2-border">
            <Button
              variant="ghost"
              size="md"
              iconEnd={folded ? ChevronDown : ChevronUp}
              aria-expanded={!folded}
              onClick={() => onExpand(folded)}
              className="h-10 w-full rounded-none"
            >
              {folded ? `Ver ${hiddenCount} más` : 'Ver menos'}
            </Button>
          </div>
        ) : null}
      </List>
    </section>
  );
}
