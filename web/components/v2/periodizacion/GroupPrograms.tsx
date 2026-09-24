'use client';

// Los programas del plan, EN ORDEN: subir, bajar, quitar, añadir. Cada cambio se
// guarda al momento (el cursor de cada atleta sigue en el programa que hace).

import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type { GroupDetail } from '@fahybrid/shared/schema/groups';
import { Card, CardHeader, Combobox, IconButton, useToast } from '@/components/v2/ui';
import { groupApi } from './group-api';

export function GroupPrograms({ group, programs, onChanged }: { group: GroupDetail; programs: Array<{ id: string; name: string; weeks: number }>; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const refs: Array<{ program_id: string; item_id?: string }> = group.programs.map((p) => ({ program_id: p.program_id, item_id: p.item_id }));

  const save = async (next: typeof refs, label: string) => {
    setBusy(true);
    const r = await groupApi(`/api/coach/groups/${group.id}`, 'PATCH', { programs: next });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'danger' });
    toast({ title: label });
    onChanged();
  };
  const move = (i: number, d: -1 | 1) => {
    const next = refs.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    void save(next, 'Orden guardado');
  };

  return (
    <Card>
      <CardHeader title="Programas" subtitle={group.programs.length > 0 ? `${group.total_weeks} semanas en total` : undefined} />
      {group.programs.length === 0 ? <p className="mb-3 t-body-sm text-v2-muted">Sin programas todavía.</p> : null}
      <ol className="mb-3 flex flex-col divide-y divide-v2-border rounded-ctl border border-v2-border empty:hidden">
        {group.programs.map((p, i) => (
          <li key={p.item_id} className="flex items-center gap-2 py-1.5 pr-1 pl-3">
            <span className="w-4 shrink-0 t-meta text-v2-faint t-tnum">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate t-body-sm font-medium text-v2-fg">{p.name}</span>
            <span className="shrink-0 t-meta text-v2-faint t-tnum">{p.weeks} sem</span>
            <IconButton icon={ArrowUp} label="Subir" size="sm" disabled={busy || i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label="Bajar" size="sm" disabled={busy || i === group.programs.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={X} label={`Quitar «${p.name}» del plan`} size="sm" disabled={busy} onClick={() => void save(refs.filter((_, j) => j !== i), `«${p.name}» fuera del plan`)} />
          </li>
        ))}
      </ol>
      <Combobox
        aria-label="Añadir programa al plan"
        placeholder="Añadir programa…"
        value={null}
        disabled={busy}
        options={programs.map((p) => ({ value: p.id, label: p.name, hint: `${p.weeks} sem` }))}
        onValueChange={(id) => {
          if (!id) return;
          const p = programs.find((x) => x.id === id);
          void save([...refs, { program_id: id }], `«${p?.name ?? 'Programa'}» añadido al plan`);
        }}
      />
    </Card>
  );
}
