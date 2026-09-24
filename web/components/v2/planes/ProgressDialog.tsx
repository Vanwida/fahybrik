'use client';

// «Progresar selección…»: carga +x por semana, +n series o descarga −x % de
// volumen sobre las líneas tipadas del rango seleccionado. Los pasos salen de
// los ajustes del coach (su método); aquí se pueden cambiar para esta vez. Antes
// de aplicar dice qué pasa semana a semana y cuántas líneas cambian.

import { useMemo, useState } from 'react';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import type { ProgressionSteps } from '@fahybrid/shared/domain/coach/progression-steps';
import { Button, Dialog, Field, Input, SegmentedControl } from '@/components/v2/ui';
import type { CellWrite, GridBounds, GridRange } from '@/lib/dashboard/programming/grid-model';
import { countChangedLines, progressRange, type ProgressOp } from '@/lib/dashboard/programming/progress-ops';
import { noChangeReason, type ProgressMode as Mode } from './progress-reason';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ',');

export function ProgressDialog({
  open,
  onOpenChange,
  grid,
  range,
  bounds,
  steps,
  initialMode = 'load',
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grid: WeekDay[][];
  range: GridRange;
  bounds: GridBounds;
  steps: ProgressionSteps;
  initialMode?: Mode;
  onApply: (writes: CellWrite[], label: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [load, setLoad] = useState(String(steps.load_step_pct).replace('.', ','));
  const [sets, setSets] = useState(String(steps.sets_step));
  const [deload, setDeload] = useState(String(steps.deload_volume_pct));

  const value = Number((mode === 'load' ? load : mode === 'sets' ? sets : deload).replace(',', '.'));
  const valid = Number.isFinite(value) && value !== 0 && (mode !== 'deload' || (value > 0 && value < 100));
  const op: ProgressOp = mode === 'load' ? { kind: 'load', pct: value } : mode === 'sets' ? { kind: 'sets', n: Math.round(value) } : { kind: 'deload', pct: value };
  const writes = useMemo(() => (valid ? progressRange(grid, range, op, bounds) : []), [grid, range, bounds, valid, op.kind, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = useMemo(() => countChangedLines(grid, writes), [grid, writes]);

  const rows = range.r1 - range.r0 + 1;
  const days = range.c1 - range.c0 + 1;
  const why = valid && changed === 0 ? noChangeReason(grid, range, bounds, mode) : null;
  const weeks = Array.from({ length: rows }, (_, i) => range.r0 + i);
  const perWeek = (i: number) => {
    if (!valid) return '—';
    if (mode === 'deload') return `−${fmt(value)} % vol.`;
    const k = rows === 1 ? 1 : i;
    if (k === 0) return 'base';
    const amount = mode === 'load' ? value * k : Math.round(value) * k;
    return `${amount > 0 ? '+' : '−'}${fmt(Math.abs(amount))}${mode === 'load' ? ' %' : amount === 1 || amount === -1 ? ' serie' : ' series'}`;
  };

  const label =
    mode === 'load' ? `Carga ${value > 0 ? '+' : '−'}${fmt(Math.abs(value))} %/sem` : mode === 'sets' ? `${value > 0 ? '+' : '−'}${Math.abs(Math.round(value))} serie/sem` : `Descarga −${fmt(value)} %`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Progresar selección"
      description={`${rows === 1 ? 'Semana' : 'Semanas'} ${rows === 1 ? range.r0 + 1 : `${range.r0 + 1}–${range.r1 + 1}`} · ${days === 7 ? 'toda la semana' : days === 1 ? '1 día' : `${days} días`}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!valid || changed === 0}
            onClick={() => {
              onApply(writes, label);
              onOpenChange(false);
            }}
          >
            {changed === 0 ? 'Nada que cambiar' : `Aplicar a ${changed} ${changed === 1 ? 'línea' : 'líneas'}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          aria-label="Qué progresar"
          value={mode}
          onValueChange={setMode}
          items={[
            { value: 'load', label: 'Carga' },
            { value: 'sets', label: 'Series' },
            { value: 'deload', label: 'Descarga' },
          ]}
        />
        {mode === 'load' ? (
          <Field label="Por semana" hint="%RM sube en puntos (75 → 77,5); los kilos, en porcentaje. RPE, RIR, zonas y ritmos no cambian.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} trailing="%" className="w-32" />
            )}
          </Field>
        ) : mode === 'sets' ? (
          <Field label="Series por semana" hint="Copia la última serie de trabajo. En series por rondas suma rondas.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} className="w-32" />
            )}
          </Field>
        ) : (
          <Field label="Menos volumen" hint="Quita series o rondas; en un trabajo continuo, tiempo o distancia. La intensidad no cambia.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} inputMode="numeric" value={deload} onChange={(e) => setDeload(e.target.value)} trailing="%" className="w-32" />
            )}
          </Field>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-ctl bg-v2-surface-2 px-3 py-2">
          {weeks.map((w, i) => (
            <div key={w} className="contents">
              <dt className="t-body-sm text-v2-muted t-tnum">Semana {w + 1}</dt>
              <dd className="t-body-sm font-medium text-v2-fg t-tnum">{perWeek(i)}</dd>
            </div>
          ))}
        </dl>
        {why ? (
          <p role="status" className="t-body-sm text-v2-muted">
            {why}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
