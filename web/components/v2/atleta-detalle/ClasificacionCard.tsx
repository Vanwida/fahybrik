'use client';

// CLASIFICACIÓN — nivel + días/semana in ONE place. These are the two axes the
// assignment resolver needs: an athlete only becomes assignable once BOTH are set
// (resolveSequenceForAthlete returns 'not_classified' without a level and
// 'no_training_days' without días). Each control persists immediately:
//   · Nivel → PATCH /api/coach/athletes/{id}/level
//   · Días  → PATCH /api/coach/athletes/{id}/training-days
// After a successful save we router.refresh() so the resolver-derived surfaces
// (header phase, Hoy's "Asignación sugerida") pick up the new value.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, StatusBadge } from '@/components/v2/ui';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import type { ClasificacionData } from '@/lib/dashboard/v2/atleta-detalle-types';

type Field = 'level' | 'days';

export function ClasificacionCard({
  athleteId,
  data,
  planPersonal = false,
}: {
  athleteId: string;
  data: ClasificacionData;
  /** Plan personal: la matriz nivel×días NO le asigna nada mientras tanto. */
  planPersonal?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Optimistic local state so the picked chip lights up instantly; reconciled by
  // the server refresh.
  const [levelId, setLevelId] = useState<string | null>(data.level_id);
  const [days, setDays] = useState<number | null>(data.training_days_per_week);

  const dayOptions: number[] = [];
  for (let d = data.days_band.min; d <= data.days_band.max; d += 1) dayOptions.push(d);

  const bothSet = levelId != null && days != null;

  async function persist(field: Field, body: Record<string, unknown>, apply: () => void) {
    if (saving) return;
    setSaving(field);
    setError(null);
    const path =
      field === 'level'
        ? `/api/coach/athletes/${athleteId}/level`
        : `/api/coach/athletes/${athleteId}/training-days`;
    try {
      const res = await fetch(path, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(payload?.error?.message ?? 'No se pudo guardar. Inténtalo de nuevo.');
        return;
      }
      apply();
      startTransition(() => router.refresh());
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(null);
    }
  }

  function chooseLevel(id: string) {
    if (id === levelId) return;
    void persist('level', { level_id: Number(id) }, () => setLevelId(id));
  }

  function chooseDays(d: number) {
    if (d === days) return;
    void persist('days', { training_days_per_week: d }, () => setDays(d));
  }

  const busy = saving != null || isPending;
  const showSuggestion =
    levelId == null && data.suggested_level_id != null && data.suggested_level_name != null;

  const axis = data.level_axis_label;
  const axisLower = axis.toLowerCase();

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        title={`${axis} y días`}
        className="mb-0"
        action={
        planPersonal ? (
          // Con plan personal la secuencia por nivel está en pausa: decir «lista
          // para asignar» aquí mentiría. El nivel/días siguen siendo dato real.
          <StatusBadge variant="soft" size="sm" tone="neutral" label="Plan personal · el grupo no asigna" />
        ) : bothSet ? null : (
          <StatusBadge
            variant="soft"
            size="sm"
            tone="warn"
            label={
              levelId == null && days == null
                ? `Falta ${axisLower} y días`
                : levelId == null
                  ? `Falta ${axisLower}`
                  : 'Faltan días'
            }
          />
        )
        }
      />
      <div className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="t-meta text-v2-muted">{axis}</span>
          {showSuggestion ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => chooseLevel(data.suggested_level_id!)} className="pointer-coarse:h-11">
              Sugerido: {data.suggested_level_name}
            </Button>
          ) : null}
        </div>
        {showSuggestion && data.suggested_level_reason ? (
          <p className="t-meta text-v2-faint">{data.suggested_level_reason}</p>
        ) : null}
        {data.levels.length === 0 ? (
          <p className="t-body-sm text-v2-faint">Todavía no tienes valores de {axisLower}.</p>
        ) : (
          <ChipGroup
            mono={false}
            ariaLabel={axis}
            value={levelId}
            onChange={chooseLevel}
            options={data.levels.map((lvl) => ({
              value: lvl.id,
              label: lvl.name,
              hint: lvl.label && lvl.label !== lvl.name ? lvl.label : undefined,
              disabled: busy,
            }))}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="t-meta text-v2-muted">Días de entreno por semana</span>
        <ChipGroup
          ariaLabel="Días de entreno por semana"
          value={days}
          onChange={chooseDays}
          options={dayOptions.map((d) => ({ value: d, label: String(d), disabled: busy }))}
        />
      </div>

      {error ? (
        <p role="alert" className="t-body-sm text-v2-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
