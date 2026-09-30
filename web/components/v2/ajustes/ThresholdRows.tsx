'use client';

// Las filas de Ajustes › Método › Umbrales: un número, un interruptor o una lista
// corta, según la unidad de la clave en `COACH_THRESHOLD_SPEC`. Las tres guardan
// como el resto de Ajustes (PUT de UNA clave, null = volver al defecto) y dicen
// el defecto a la vista.

import { useId, useState } from 'react';
import { COACH_THRESHOLD_SPEC, type CoachThresholdKey } from '@fahybrid/shared/domain/coach/signal-thresholds';
import { Button, Input, Select, Switch } from '@/components/v2/ui';
import { SettingRow } from './SettingsKit';
import { useSaveState, type SaveResult } from './autosave';
import { THRESHOLD_COPY } from './threshold-copy';

export interface ThresholdRowProps {
  k: CoachThresholdKey;
  value: number;
  fallback: number;
  isCustom: boolean;
  /** Para un peso: su parte del total ahora mismo, en %. */
  share: number | null;
  save: (v: number | null) => Promise<SaveResult>;
}

const SWITCH_WORDS = ['No', 'Sí'] as const;

/** El valor en palabras, para «Por defecto: …» y «Usar …» (un interruptor o una lista no se dicen con un número). */
function spoken(k: CoachThresholdKey, v: number): string {
  const spec = COACH_THRESHOLD_SPEC[k];
  if (spec.unit === 'si_no') return SWITCH_WORDS[v] ?? String(v);
  if (spec.unit === 'sentido') return THRESHOLD_COPY[k].options?.[v] ?? String(v);
  return String(v);
}

/** La fila que toca a esta clave. */
export function ThresholdRow(props: ThresholdRowProps) {
  const unit = COACH_THRESHOLD_SPEC[props.k].unit;
  if (unit === 'si_no') return <SwitchRow {...props} />;
  if (unit === 'sentido') return <ChoiceRow {...props} />;
  return <NumberRow {...props} />;
}

function Hint({ k, fallback, share }: { k: CoachThresholdKey; fallback: number; share: number | null }) {
  return (
    <>
      {THRESHOLD_COPY[k].hint}{' '}
      {share != null ? <span className="t-tnum">Ahora cuenta el {share} % del total. </span> : null}
      <span className="text-v2-faint t-tnum">Por defecto: {spoken(k, fallback)}.</span>
    </>
  );
}

function UseDefault({ k, fallback, onClick }: { k: CoachThresholdKey; fallback: number; onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      Usar {spoken(k, fallback)}
    </Button>
  );
}

function NumberRow({ k, value, fallback, isCustom, share, save }: ThresholdRowProps) {
  const id = useId();
  const spec = COACH_THRESHOLD_SPEC[k];
  const copy = THRESHOLD_COPY[k];
  const [draft, setDraft] = useState(String(value));
  const [saved, setSaved] = useState(String(value));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const commit = async (raw: string, reset = false) => {
    if (!reset && raw.trim() === saved) return;
    let next: number | null = null;
    if (!reset) {
      const n = Number(raw.replace(',', '.'));
      if (raw.trim() === '' || !Number.isInteger(n) || n < spec.min || n > spec.max) {
        setLocalError(`Entre ${spec.min} y ${spec.max}.`);
        return;
      }
      next = n;
    }
    setLocalError(null);
    const ok = await run(() => save(next));
    if (ok) {
      const shown = String(next ?? fallback);
      setDraft(shown);
      setSaved(shown);
    }
  };

  return (
    <SettingRow
      layout="inline"
      label={copy.label}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={<Hint k={k} fallback={fallback} share={share} />}
    >
      {isCustom ? <UseDefault k={k} fallback={fallback} onClick={() => void commit('', true)} /> : null}
      <Input
        id={id}
        inputMode="numeric"
        value={draft}
        invalid={Boolean(localError) || state === 'error'}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setDraft(e.target.value);
          if (localError) setLocalError(null);
        }}
        onBlur={() => void commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(saved);
        }}
        className="w-16 text-right t-tnum"
      />
      <span className="w-24 t-body-sm text-v2-muted">{copy.unit}</span>
    </SettingRow>
  );
}

function SwitchRow({ k, value, fallback, isCustom, save }: ThresholdRowProps) {
  const id = useId();
  const copy = THRESHOLD_COPY[k];
  const [on, setOn] = useState(value === 1);
  const { state, error, run } = useSaveState();

  const commit = async (next: number | null) => {
    const ok = await run(() => save(next));
    if (ok) setOn((next ?? fallback) === 1);
  };

  return (
    <SettingRow
      layout="inline"
      label={copy.label}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={state}
      error={error}
      hint={<Hint k={k} fallback={fallback} share={null} />}
    >
      {isCustom ? <UseDefault k={k} fallback={fallback} onClick={() => void commit(null)} /> : null}
      <Switch id={id} aria-label={copy.label} checked={on} onCheckedChange={(v) => void commit(v ? 1 : 0)} />
    </SettingRow>
  );
}

function ChoiceRow({ k, value, fallback, isCustom, save }: ThresholdRowProps) {
  const id = useId();
  const copy = THRESHOLD_COPY[k];
  const [current, setCurrent] = useState(value);
  const { state, error, run } = useSaveState();
  const options = (copy.options ?? []).map((label, i) => ({ value: i, label }));

  const commit = async (next: number | null) => {
    const ok = await run(() => save(next));
    if (ok) setCurrent(next ?? fallback);
  };

  return (
    <SettingRow
      layout="inline"
      label={copy.label}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={state}
      error={error}
      hint={<Hint k={k} fallback={fallback} share={null} />}
    >
      {isCustom ? <UseDefault k={k} fallback={fallback} onClick={() => void commit(null)} /> : null}
      <Select id={id} aria-label={copy.label} value={current} onValueChange={(v) => void commit(v)} options={options} className="w-56" />
    </SettingRow>
  );
}
