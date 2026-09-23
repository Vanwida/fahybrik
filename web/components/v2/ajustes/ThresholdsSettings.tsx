'use client';

// Umbrales de avisos y bandas de readiness — método del coach con defectos a
// la vista. Cada número se guarda al salir (PUT de UNA clave; null = volver al
// defecto). El servidor rechaza combinaciones incoherentes (cautela por encima
// de «bien») y la fila dice por qué. «Restaurar valores por defecto» deja todo
// como el producto, con deshacer.

import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  COACH_THRESHOLD_KEYS,
  COACH_THRESHOLD_SPEC,
  normalizedWeights,
  weightGroupOf,
  type CoachThresholdKey,
  type CoachThresholds,
} from '@fahybrid/shared/domain/coach/signal-thresholds';
import type { CoachSignalThresholdsResponse } from '@fahybrid/shared/schema/coach-signal-thresholds';
import { Button, Input, useToast } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';
import { THRESHOLD_COPY, THRESHOLD_SECTIONS } from './threshold-copy';

const ENDPOINT = '/api/coach/signal-thresholds';

function pick(res: CoachSignalThresholdsResponse): CoachThresholds {
  return Object.fromEntries(COACH_THRESHOLD_KEYS.map((k) => [k, res[k]])) as CoachThresholds;
}

/** Los pesos son relativos: lo que cuenta de verdad es su parte del total (entero %). */
function shareOf(values: CoachThresholds, k: CoachThresholdKey): number | null {
  const group = weightGroupOf(k);
  if (!group) return null;
  const w = normalizedWeights(values, group) as Record<string, number> | null;
  return w ? Math.round((w[k] ?? 0) * 100) : null;
}

export function ThresholdsSettings({ initial }: { initial: CoachSignalThresholdsResponse }) {
  const toast = useToast();
  const [values, setValues] = useState<CoachThresholds>(() => pick(initial));
  const [custom, setCustom] = useState<Set<CoachThresholdKey>>(() => new Set(initial.custom_keys));
  const [version, setVersion] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const defaults = initial.defaults;

  const apply = (res: CoachSignalThresholdsResponse) => {
    setValues(pick(res));
    setCustom(new Set(res.custom_keys));
  };

  const put = async (body: Partial<Record<CoachThresholdKey, number | null>>) => {
    const res = await sendJson<CoachSignalThresholdsResponse>(ENDPOINT, 'PUT', body);
    if (res.ok) apply(res.data);
    return res;
  };

  const restoreAll = async () => {
    const before = [...custom];
    if (before.length === 0) return;
    const previous = Object.fromEntries(before.map((k) => [k, values[k]])) as Partial<Record<CoachThresholdKey, number>>;
    setRestoring(true);
    const res = await put(Object.fromEntries(before.map((k) => [k, null])));
    setRestoring(false);
    setVersion((v) => v + 1);
    if (!res.ok) {
      toast.toast({ title: 'No se han podido restaurar', description: res.message, tone: 'danger' });
      return;
    }
    toast.toast({
      title: 'Valores por defecto restaurados',
      tone: 'ok',
      undo: async () => {
        await put(previous);
        setVersion((v) => v + 1);
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {THRESHOLD_SECTIONS.map((section, i) => (
        <SettingsSection
          key={section.title}
          title={section.title}
          action={
            i === 0 && custom.size > 0 ? (
              <Button size="sm" variant="ghost" icon={RotateCcw} loading={restoring} onClick={() => void restoreAll()}>
                Restaurar valores por defecto
              </Button>
            ) : undefined
          }
        >
          {section.keys.map((key) => (
            <ThresholdRow
              key={`${key}-${version}`}
              k={key}
              value={values[key]}
              fallback={defaults[key]}
              isCustom={custom.has(key)}
              share={shareOf(values, key)}
              save={(v) => put({ [key]: v })}
            />
          ))}
        </SettingsSection>
      ))}
    </div>
  );
}

function ThresholdRow({
  k,
  value,
  fallback,
  isCustom,
  share,
  save,
}: {
  k: CoachThresholdKey;
  value: number;
  fallback: number;
  isCustom: boolean;
  /** Para un peso: su parte del total ahora mismo, en %. */
  share: number | null;
  save: (v: number | null) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
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
      hint={
        <>
          {copy.hint}{' '}
          {share != null ? <span className="t-tnum">Ahora cuenta el {share} % del total. </span> : null}
          <span className="text-v2-faint t-tnum">Por defecto: {fallback}.</span>
        </>
      }
    >
      {isCustom ? (
        <Button size="sm" variant="ghost" onClick={() => void commit('', true)}>
          Usar {fallback}
        </Button>
      ) : null}
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
