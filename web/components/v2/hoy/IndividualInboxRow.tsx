'use client';

import { useRef } from 'react';
import { Check, Clock, MoreHorizontal } from 'lucide-react';
import { ageLabel } from '@fahybrid/shared/domain/coach/athlete-state';
import { Link } from '@/i18n/navigation';
import { Avatar, Button, Checkbox, IconButton, ListRow, Menu, Tag, buttonVariants } from '@/components/v2/ui';
import { SIGNAL_ACTION_LABEL, SignalBadge } from '@/components/v2/shared';
import type { InboxRowProps } from './InboxRow';
import { actionHref, intakeQueueHref } from './hoy-model';
import { GroupAction } from './SystemicRow';

/** Una persona y sus causas completas. Cada control nombra su causa. */
export function IndividualInboxRow(props: InboxRowProps) {
  const { row, now, selected, active, negocio, proposal, onOpen, onToggle, onAction, onSnooze, onDone, onGroupAction } = props;
  const shift = useRef(false);
  return <ListRow active={active} selected={selected} density="compact"
    className="items-start py-3 [&_.truncate]:overflow-visible [&_.truncate]:whitespace-normal"
    leading={<>
      {row.snoozable ? <Checkbox aria-label={`Seleccionar a ${row.name}`} checked={selected}
        onClick={(e) => { shift.current = e.shiftKey; }} onCheckedChange={(checked) => {
          onToggle(checked, shift.current); shift.current = false;
        }} className="hidden @min-[480px]:flex" /> : null}
      <Avatar name={row.name} src={row.avatar_url} size="md" />
    </>}
    title={<span className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" onClick={onOpen} className="h-auto px-0 text-left whitespace-normal">{row.name}</Button>
      {row.level_label ? <Tag>{row.level_label}</Tag> : null}
    </span>}
    detail={<div className="flex w-full flex-col gap-3 whitespace-normal">
      {row.causes?.map(({ signal, group }) => {
        const deload = signal.action === 'proponer_descarga' ? proposal : null;
        const kept = deload && deload !== 'enviando' && deload.outcome === 'mantener' ? deload : null;
        const proposed = deload && deload !== 'enviando' && deload.outcome === 'propuesta';
        const href = proposed ? `/atletas/${row.athlete_id}` : actionHref(signal.action, row.athlete_id, negocio, signal.kind);
        const label = proposed ? 'Ver propuesta' : signal.kind === 'review_1on1_due' ? 'Revisar 1:1' : SIGNAL_ACTION_LABEL[signal.action];
        return <div key={`${signal.kind}:${signal.dedupe_key}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 basis-48 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <SignalBadge signal={signal} size="sm" />
              {signal.first_seen_at ? <span className="t-meta text-v2-faint t-tnum">{ageLabel(signal.first_seen_at, now)}</span> : null}
            </div>
            {(kept?.summary || signal.evidence) ? <span className="t-meta break-words text-v2-muted">{kept?.summary || signal.evidence}</span> : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {group ? <GroupAction group={group} negocio={negocio} queueHref={intakeQueueHref(group.athlete_ids)}
              onPublish={() => onGroupAction(group, 'publish')} onAssign={() => onGroupAction(group, 'assign')}
              onRemind={() => onGroupAction(group, 'remind')} />
              : kept ? <Button size="sm" variant="secondary" icon={Check} onClick={() => onDone(signal)}>Hecho</Button>
                : href ? <Link href={href} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>{label}</Link>
                  : <Button size="sm" variant="secondary" loading={deload === 'enviando'} onClick={() => onAction(signal.action, signal)}>{label}</Button>}
            {group ? null : <Menu align="end" width="min-w-52"
              trigger={<IconButton icon={MoreHorizontal} label={`Acciones: ${signal.label}`} size="sm" />}
              items={[
                { type: 'label', label: signal.label },
                { label: 'Hecho', icon: Check, onSelect: () => onDone(signal) },
                { type: 'separator' }, { type: 'label', label: 'Posponer' },
                { label: 'Hasta nueva señal', icon: Clock, onSelect: () => onSnooze('signal', signal) },
                { label: '1 día', onSelect: () => onSnooze('1d', signal) },
                { label: '3 días', onSelect: () => onSnooze('3d', signal) },
              ]} />}
          </div>
        </div>;
      })}
      {row.priority_signal ? <span className="t-meta text-v2-muted">También: {row.priority_signal.label} · {row.priority_signal.evidence}</span> : null}
    </div>} />;
}
