'use client';

// Los pasos de «Progresar selección…» en el editor de programas: cuánto sube
// la carga por semana, cuántas series se añaden y cuánto baja el volumen en una
// descarga. Método del coach (mig 0237) con los defectos a la vista; se guarda
// cada número al salir (PATCH /api/coach/editor/progression-steps, uno a uno).

import { useId, useState } from 'react';
import {
  DEFAULT_DELOAD_VOLUME_PCT,
  DEFAULT_PROGRESSION_LOAD_STEP_PCT,
  DEFAULT_PROGRESSION_SETS_STEP,
  DELOAD_VOLUME_MAX,
  DELOAD_VOLUME_MIN,
  PROGRESSION_LOAD_STEP_MAX,
  PROGRESSION_SETS_STEP_MAX,
  type ProgressionSteps,
} from '@fahybrid/shared/domain/coach/progression-steps';
import { Button, Input } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

type Key = keyof ProgressionSteps;

const FIELDS: ReadonlyArray<{
  key: Key;
  label: string;
  unit: string;
  hint: string;
  def: number;
  min: number;
  max: number;
  decimals: boolean;
}> = [
  {
    key: 'load_step_pct',
    label: 'Subir la carga',
    unit: '% por semana',
    hint: 'En porcentaje del máximo y en kilos. RPE, RIR, zonas y ritmos no se tocan.',
    def: DEFAULT_PROGRESSION_LOAD_STEP_PCT,
    min: 0.5,
    max: PROGRESSION_LOAD_STEP_MAX,
    decimals: true,
  },
  {
    key: 'sets_step',
    label: 'Añadir series',
    unit: 'por semana',
    hint: 'Copia la última serie de trabajo; en formatos por rondas, suma rondas.',
    def: DEFAULT_PROGRESSION_SETS_STEP,
    min: 1,
    max: PROGRESSION_SETS_STEP_MAX,
    decimals: false,
  },
  {
    key: 'deload_volume_pct',
    label: 'Descarga: bajar el volumen',
    unit: '%',
    hint: 'Series, rondas, duración o distancia. La intensidad se queda como está.',
    def: DEFAULT_DELOAD_VOLUME_PCT,
    min: DELOAD_VOLUME_MIN,
    max: DELOAD_VOLUME_MAX,
    decimals: false,
  },
];

export function ProgressionSettings({ initial }: { initial: ProgressionSteps }) {
  return (
    <SettingsSection title="Progresar en el editor de programas">
      {FIELDS.map((f) => (
        <StepRow key={f.key} field={f} initial={initial[f.key]} />
      ))}
    </SettingsSection>
  );
}

function fmt(n: number): string {
  return String(n).replace('.', ',');
}

function StepRow({ field, initial }: { field: (typeof FIELDS)[number]; initial: number }) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(fmt(initial));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const save = async (next: number | null) => {
    const ok = await run(async () => {
      const res = await sendJson<{ steps: ProgressionSteps }>('/api/coach/editor/progression-steps', 'PATCH', {
        [field.key]: next,
      });
      if (!res.ok) return res;
      setValue(res.data.steps[field.key]);
      setDraft(fmt(res.data.steps[field.key]));
      return { ok: true };
    });
    if (!ok) setDraft(fmt(value));
  };

  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (n === value) return;
    if (!Number.isFinite(n) || n < field.min || n > field.max || (!field.decimals && !Number.isInteger(n))) {
      setLocalError(`Entre ${fmt(field.min)} y ${fmt(field.max)}${field.decimals ? '' : ', sin decimales'}.`);
      return;
    }
    setLocalError(null);
    void save(n);
  };

  return (
    <SettingRow
      layout="inline"
      label={field.label}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={
        <>
          {field.hint} <span className="text-v2-faint t-tnum">Por defecto: {fmt(field.def)}.</span>
        </>
      }
    >
      {value !== field.def ? (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          Usar {fmt(field.def)}
        </Button>
      ) : null}
      <Input
        id={id}
        inputMode={field.decimals ? 'decimal' : 'numeric'}
        value={draft}
        invalid={Boolean(localError) || state === 'error'}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setDraft(e.target.value);
          if (localError) setLocalError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        className="w-16 text-right t-tnum"
      />
      <span className="w-24 t-body-sm text-v2-muted">{field.unit}</span>
    </SettingRow>
  );
}
