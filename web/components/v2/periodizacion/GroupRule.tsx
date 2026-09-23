'use client';

// Regla de pertenencia automática (opcional): nivel × días por semana. Con las
// dos puestas, «Asignar a nuevos» ofrece a quien la cumple y aún no tiene grupo.
// Sin regla, el grupo es de quien el coach mete a mano.

import { useState } from 'react';
import type { GroupDetail } from '@fahybrid/shared/schema/groups';
import { Button, Card, CardHeader, Field, Select, useToast } from '@/components/v2/ui';
import { groupApi } from './group-api';
import { useLevelAxisLabel } from '@/components/v2/controls/useLevelAxisLabel';

const NONE = '__none__';

export function GroupRule({ group, levels, onChanged }: { group: GroupDetail; levels: Array<{ id: string; name: string; label: string }>; onChanged: () => void }) {
  const { toast } = useToast();
  const axisLabel = useLevelAxisLabel();
  const [level, setLevel] = useState(group.level?.id ?? NONE);
  const [days, setDays] = useState(group.days_per_week ? String(group.days_per_week) : NONE);
  const [busy, setBusy] = useState(false);
  const dirty = level !== (group.level?.id ?? NONE) || days !== (group.days_per_week ? String(group.days_per_week) : NONE);
  const complete = (level === NONE) === (days === NONE);

  const save = async (lv: string, d: string) => {
    setBusy(true);
    const r = await groupApi(`/api/coach/groups/${group.id}`, 'PATCH', {
      level_id: lv === NONE ? null : lv,
      days_per_week: d === NONE ? null : Number(d),
    });
    setBusy(false);
    if (!r.ok) return toast({ title: r.error, tone: 'danger' });
    toast({ title: lv === NONE ? 'Regla quitada' : 'Regla guardada' });
    onChanged();
  };

  return (
    <Card>
      <CardHeader title="Regla de pertenencia automática" subtitle={group.auto_rule ? `${group.level?.name} · ${group.days_per_week} días por semana` : 'Opcional'} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={axisLabel}>
          {({ id }) => (
            <Select id={id} value={level} onValueChange={setLevel} options={[{ value: NONE, label: 'Sin regla' }, ...levels.map((l) => ({ value: l.id, label: l.name }))]} />
          )}
        </Field>
        <Field label="Días por semana">
          {({ id }) => (
            <Select id={id} value={days} onValueChange={setDays} options={[{ value: NONE, label: '—' }, ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))]} />
          )}
        </Field>
      </div>
      {!complete ? <p className="mt-2 t-meta text-v2-muted">La regla necesita {axisLabel.toLowerCase()} y días.</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        {group.auto_rule ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setLevel(NONE); setDays(NONE); void save(NONE, NONE); }}>
            Quitar regla
          </Button>
        ) : null}
        <Button size="sm" disabled={!dirty || !complete} loading={busy} onClick={() => void save(level, days)}>
          Guardar regla
        </Button>
      </div>
    </Card>
  );
}
