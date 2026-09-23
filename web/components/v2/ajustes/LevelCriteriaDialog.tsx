'use client';

// Qué marca abre un valor del eje del coach (un «nivel»): por cada marca que el
// sistema sabe leer, el corte de entrada — tiempos por sexo, sentadilla relativa
// al peso y años entrenando (estos últimos solo cuentan si no hay otra marca).
// Vacío = esa marca no cuenta para este valor. Los defectos del producto se ven
// como texto de ayuda y «Usar los de por defecto» los recupera.

import { useState } from 'react';
import {
  LEVEL_METRICS,
  LEVEL_METRIC_SPEC,
  defaultLevelCriteria,
  formatClock,
  parseClock,
  type LevelCriterion,
  type LevelMetric,
  type LevelSex,
  type ResolvedRung,
} from '@fahybrid/shared/domain/coach/level-criteria';
import { Button, Dialog, Input } from '@/components/v2/ui';

type Cell = `${LevelMetric}:${LevelSex | 'any'}`;

function cellsOf(metric: LevelMetric): Array<{ key: Cell; sex: LevelSex | null; label: string }> {
  return LEVEL_METRIC_SPEC[metric].by_sex
    ? [
        { key: `${metric}:male`, sex: 'male', label: 'Hombres' },
        { key: `${metric}:female`, sex: 'female', label: 'Mujeres' },
      ]
    : [{ key: `${metric}:any`, sex: null, label: 'Todos' }];
}

function show(metric: LevelMetric, v: number): string {
  return LEVEL_METRIC_SPEC[metric].kind === 'time' ? formatClock(v) : String(v).replace('.', ',');
}

function read(metric: LevelMetric, raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  if (LEVEL_METRIC_SPEC[metric].kind === 'time') return parseClock(t);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function draftFrom(criteria: readonly LevelCriterion[]): Record<Cell, string> {
  const out = {} as Record<Cell, string>;
  for (const metric of LEVEL_METRICS) {
    for (const cell of cellsOf(metric)) {
      const c = criteria.find((x) => x.metric === metric && x.sex === cell.sex);
      out[cell.key] = c ? show(metric, c.threshold) : '';
    }
  }
  return out;
}

export function LevelCriteriaDialog({
  open,
  onOpenChange,
  levelName,
  axisLabel,
  rung,
  save,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelName: string;
  axisLabel: string;
  rung: ResolvedRung;
  save: (criteria: LevelCriterion[] | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Record<Cell, string>>(() => draftFrom(rung.criteria));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaults = defaultLevelCriteria(rung.position);

  const submit = async (criteria: LevelCriterion[] | null) => {
    setBusy(true);
    const ok = await save(criteria);
    setBusy(false);
    if (!ok) setProblem('No se ha podido guardar. Revisa los valores.');
  };

  const onSave = () => {
    const out: LevelCriterion[] = [];
    for (const metric of LEVEL_METRICS) {
      const spec = LEVEL_METRIC_SPEC[metric];
      for (const cell of cellsOf(metric)) {
        const raw = draft[cell.key];
        if (raw.trim() === '') continue;
        const v = read(metric, raw);
        if (v == null || v < spec.min || v > spec.max) {
          setProblem(`${spec.label} (${cell.label.toLowerCase()}): ${spec.kind === 'time' ? `escríbelo como ${spec.unit}` : 'un número válido'}.`);
          return;
        }
        out.push({ metric, sex: cell.sex, threshold: v });
      }
    }
    setProblem(null);
    void submit(out);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Qué marca abre ${levelName}`}
      description={`Con estas marcas se sugiere ${axisLabel.toLowerCase()} a un atleta nuevo; tú lo confirmas. Vacío = esa marca no cuenta.`}
      footer={
        <>
          {!rung.is_default ? (
            <Button variant="ghost" onClick={() => void submit(null)} disabled={busy} className="mr-auto">
              Usar los de por defecto
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy} onClick={onSave}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {rung.position === 1 ? (
          <p className="t-body-sm text-v2-muted">
            Es el primero: aquí cae quien no llega a los siguientes, así que normalmente no lleva marcas.
          </p>
        ) : null}
        {LEVEL_METRICS.map((metric) => {
          const spec = LEVEL_METRIC_SPEC[metric];
          return (
            <fieldset key={metric} className="flex flex-col gap-1.5">
              <legend className="t-body font-medium text-v2-fg">
                {spec.label}
                <span className="t-meta font-normal text-v2-faint">
                  {' '}
                  · {spec.kind === 'time' ? `${spec.unit}, o menos` : `${spec.unit}, o más`}
                  {spec.fallback_only ? ' · solo si no hay otra marca' : ''}
                </span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {cellsOf(metric).map((cell) => {
                  const def = defaults.find((d) => d.metric === metric && d.sex === cell.sex);
                  return (
                    <label key={cell.key} className="flex min-w-36 flex-1 flex-col gap-1">
                      <span className="t-meta text-v2-muted">{cell.label}</span>
                      <Input
                        value={draft[cell.key]}
                        inputMode={spec.kind === 'time' ? 'text' : 'decimal'}
                        placeholder="—"
                        onChange={(e) => setDraft((d) => ({ ...d, [cell.key]: e.target.value }))}
                        className="t-tnum"
                      />
                      <span className="t-meta text-v2-faint">
                        Por defecto: {def ? show(metric, def.threshold) : 'ninguna'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {problem ? (
          <p role="alert" className="t-body-sm font-medium text-v2-danger">
            {problem}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
