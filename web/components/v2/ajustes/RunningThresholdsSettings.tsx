'use client';

// Lecturas de carrera — los umbrales con los que el panel y la app del atleta
// juzgan la carrera (`coach_running_thresholds`): cuándo un porcentaje ya
// significa algo, cuándo la carga aprieta, desde qué pendiente el ritmo deja de
// compararse… Cada número se guarda al salir; «Usar N» vuelve a su defecto.

import { useId, useState } from 'react';
import type { CoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { RUNNING_THRESHOLD_BOUNDS } from '@fahybrid/shared/domain/methodology/method-editors';
import { Button, Input } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

type Key = keyof CoachRunningThresholds;
type Setting = { thresholds: CoachRunningThresholds; is_custom: boolean; defaults: CoachRunningThresholds };

const COPY: Record<Key, { label: string; hint: string; unit: string }> = {
  gradient_retires_pace_pct: {
    label: 'Pendiente que retira el ritmo',
    hint: 'Desde esta pendiente media, una serie se juzga por tiempo, no por ritmo.',
    unit: '%',
  },
  good_in_band_pct: {
    label: 'Clava lo que le pides',
    hint: 'Repeticiones dentro de su banda a partir de las que va bien.',
    unit: '% en banda',
  },
  min_reps_to_judge_band: {
    label: 'Repeticiones para juzgar la banda',
    hint: 'Con menos, el porcentaje se enseña sin color.',
    unit: 'repeticiones',
  },
  min_reps_per_position: {
    label: 'Repeticiones por posición',
    hint: 'Para dar porcentaje a la 1.ª, 2.ª… repetición de una serie.',
    unit: 'repeticiones',
  },
  min_series_for_calibration: {
    label: 'Series para la calibración',
    hint: 'Hasta llegar, la tarjeta dice cuántas lleva en vez de un porcentaje.',
    unit: 'series',
  },
  freshness_alert_tsb: {
    label: 'Aviso de carga',
    hint: 'Frescura (TSB) a partir de la cual la carga «está apretando».',
    unit: 'TSB',
  },
  min_pairs_for_compromised_trend: {
    label: 'Comparaciones para «correr cansado»',
    hint: 'Semanas con ritmo fresco y fatigado antes de dar la curva por buena.',
    unit: 'comparaciones',
  },
  min_weeks_to_judge: {
    label: 'Semanas para afirmar una tendencia',
    hint: 'Antes, «¿estoy mejorando?» dice que aún no.',
    unit: 'semanas',
  },
  meaningful_gain_s_per_km: {
    label: 'Mejora que cuenta',
    hint: 'Por debajo es ruido de medir en la calle.',
    unit: 's/km',
  },
  volume_surge_ratio: {
    label: 'Subida de volumen que avisa',
    hint: 'Solo avisa si además el ritmo empeora. 0,2 = +20 %.',
    unit: 'proporción',
  },
  same_hr_reference_zone: {
    label: 'Zona de «ritmo al mismo pulso»',
    hint: 'La zona de FC en la que se compara el ritmo semana a semana (Z2 a Z5).',
    unit: 'zona',
  },
  same_hr_tolerance_bpm: {
    label: 'Margen de pulso',
    hint: 'Tramos fuera de ± este margen no entran en la comparación.',
    unit: 'ppm',
  },
  same_hr_min_distance_m: {
    label: 'Tramo mínimo',
    hint: 'En un tramo más corto el pulso medio todavía va subiendo.',
    unit: 'm',
  },
};

const ORDER: Key[] = [
  'gradient_retires_pace_pct',
  'good_in_band_pct',
  'min_reps_to_judge_band',
  'min_reps_per_position',
  'min_series_for_calibration',
  'freshness_alert_tsb',
  'min_pairs_for_compromised_trend',
  'min_weeks_to_judge',
  'meaningful_gain_s_per_km',
  'volume_surge_ratio',
  'same_hr_reference_zone',
  'same_hr_tolerance_bpm',
  'same_hr_min_distance_m',
];

const fmt = (n: number) => String(n).replace('.', ',');

export function RunningThresholdsSettings({ initial }: { initial: Setting }) {
  const [values, setValues] = useState(initial.thresholds);
  const put = async (key: Key, v: number | null) => {
    const res = await sendJson<Setting>('/api/coach/running-thresholds', 'PUT', { [key]: v });
    if (!res.ok) return res;
    setValues(res.data.thresholds);
    return { ok: true as const, value: res.data.thresholds[key] };
  };
  return (
    <SettingsSection title="Lecturas de carrera">
      {ORDER.map((k) => (
        <Row key={k} k={k} value={values[k]} fallback={initial.defaults[k]} save={(v) => put(k, v)} />
      ))}
    </SettingsSection>
  );
}

function Row({
  k,
  value,
  fallback,
  save,
}: {
  k: Key;
  value: number;
  fallback: number;
  save: (v: number | null) => Promise<{ ok: true; value: number } | { ok: false; message: string }>;
}) {
  const id = useId();
  const copy = COPY[k];
  const b = RUNNING_THRESHOLD_BOUNDS[k];
  const [draft, setDraft] = useState(fmt(value));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const commit = async (reset = false) => {
    let next: number | null = null;
    if (!reset) {
      const n = Number(draft.replace(',', '.'));
      if (n === value) return;
      if (!Number.isFinite(n) || n < b.min || n > b.max || (b.int && !Number.isInteger(n))) {
        setLocalError(`Entre ${fmt(b.min)} y ${fmt(b.max)}${b.int ? ', sin decimales' : ''}.`);
        return;
      }
      next = n;
    }
    setLocalError(null);
    let saved: number | null = null;
    const ok = await run(async () => {
      const res = await save(next);
      if (!res.ok) return res;
      saved = res.value;
      return { ok: true };
    });
    setDraft(fmt(ok && saved != null ? saved : value));
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
          {copy.hint} <span className="text-v2-faint t-tnum">Por defecto: {fmt(fallback)}.</span>
        </>
      }
    >
      {value !== fallback ? (
        <Button size="sm" variant="ghost" onClick={() => void commit(true)}>
          Usar {fmt(fallback)}
        </Button>
      ) : null}
      <Input
        id={id}
        inputMode={b.int ? 'numeric' : 'decimal'}
        value={draft}
        invalid={Boolean(localError) || state === 'error'}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setDraft(e.target.value);
          if (localError) setLocalError(null);
        }}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(fmt(value));
        }}
        className="w-16 text-right t-tnum"
      />
      <span className="w-24 t-body-sm text-v2-muted">{copy.unit}</span>
    </SettingRow>
  );
}
