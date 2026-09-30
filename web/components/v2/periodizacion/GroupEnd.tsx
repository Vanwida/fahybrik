'use client';

// Qué pasa al acabar el plan del grupo: repetir, subir de nivel o parar. Se guarda
// al momento. «Subir de nivel» pide que el grupo tenga nivel y días (la regla de
// abajo): sin ellos se ofrece apagado y con el motivo, no se deja elegir para que
// falle.

import { useState } from 'react';
import type { GroupDetail } from '@fahybrid/shared/schema/groups';
import { Card, CardHeader, Field, Select, useToast } from '@/components/v2/ui';
import { groupApi } from './group-api';
import { END_POLICY_ORDER, END_POLICY_VIEW, type GroupEndPolicy } from './group-end-policy';

export function GroupEnd({ group, onChanged }: { group: GroupDetail; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const hasRule = group.level != null && group.days_per_week != null;

  const choose = async (next: GroupEndPolicy) => {
    if (next === group.end_policy) return;
    setBusy(true);
    const r = await groupApi(`/api/coach/groups/${group.id}`, 'PATCH', { end_policy: next });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'danger' });
    toast({ title: `Al acabar el plan: ${END_POLICY_VIEW[next].label.toLowerCase()}` });
    onChanged();
  };

  return (
    <Card>
      <CardHeader title="Al acabar el plan" subtitle="Qué pasa cuando un atleta llega al final" />
      <Field label="Después del último programa" hint={END_POLICY_VIEW[group.end_policy].help}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={group.end_policy}
            disabled={busy}
            onValueChange={(v) => void choose(v as GroupEndPolicy)}
            options={END_POLICY_ORDER.map((value) => ({
              value,
              label: END_POLICY_VIEW[value].label,
              disabled: value === 'level_up' && !hasRule,
              hint: value === 'level_up' && !hasRule ? 'Necesita nivel y días' : undefined,
            }))}
          />
        )}
      </Field>
    </Card>
  );
}
