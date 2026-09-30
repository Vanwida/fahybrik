'use client';

// Plan del atleta — ajustes que deciden qué ve tu atleta y cuándo:
//   · cuándo se abre sola cada semana (N días antes de su lunes; las retenidas
//     no se abren nunca solas) — `coaches.auto_publish_days_before`;
//   · hasta dónde puede mirar por delante, entre las semanas ya visibles —
//     `coaches.plan_week_horizon`;
//   · cuánto antes de que acabe su plan se prepara la vuelta siguiente de un
//     grupo que repite o sube de nivel — `coaches.plan_renewal_days_before`.
// Son capas distintas (DECISIONS 2026-09-23 «Grupos, asignar a varios y
// publicar por semana»): la primera abre semanas; la segunda limita cuántas de
// las abiertas puede ojear.

import { useId, useState, type ReactNode } from 'react';
import {
  AUTO_PUBLISH_DAYS_MAX,
  AUTO_PUBLISH_DAYS_MIN,
} from '@fahybrid/shared/domain/coach/week-publishing';
import {
  PLAN_WEEK_HORIZON_OPTIONS,
  type PlanWeekHorizon,
} from '@fahybrid/shared/domain/coach/plan-week-horizon';
import {
  PLAN_RENEWAL_DAYS_MAX,
  PLAN_RENEWAL_DAYS_MIN,
} from '@fahybrid/shared/domain/coach/plan-renewal';
import type { AutoPublishSetting } from '@fahybrid/shared/schema/week-publishing';
import type { PlanRenewalSetting } from '@fahybrid/shared/schema/plan-renewal';
import type { CoachPlanWeekHorizonResponse } from '@fahybrid/shared/schema/coach-plan-week-horizon';
import { Button, Input, Select } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

export function PlanAtletaSettings({
  autoPublish,
  horizon,
  renewal,
}: {
  autoPublish: AutoPublishSetting | null;
  horizon: CoachPlanWeekHorizonResponse | null;
  renewal: PlanRenewalSetting | null;
}) {
  return (
    <SettingsSection title="Qué ve tu atleta">
      {autoPublish ? <AutoPublishRow initial={autoPublish} /> : <Unavailable label="Abrir cada semana" />}
      {horizon ? <HorizonRow initial={horizon.plan_week_horizon} /> : <Unavailable label="Cuánto puede mirar por delante" />}
      {renewal ? <PlanRenewalRow initial={renewal} /> : <Unavailable label="Renovar el plan de un grupo" />}
    </SettingsSection>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <SettingRow label={label} status="error" error="No se ha podido cargar. Recarga la página.">
      {null}
    </SettingRow>
  );
}

/** Lo que necesita una fila «N días antes»: el ajuste tal como lo devuelve la API. */
interface DaysSetting {
  stored: number | null;
  effective: number;
  default_days: number;
}

/**
 * Una fila de «N días antes» (número entero, autoguardado al salir del campo, con
 * «Usar el defecto»). La comparten «Abrir cada semana» y «Renovar el plan»: cambia
 * la ruta, el campo, el rango y el texto, no la mecánica.
 */
function DaysBeforeRow<T>({
  initial,
  read,
  endpoint,
  field,
  min,
  max,
  label,
  minHint,
  hint,
}: {
  initial: T;
  read: (setting: T) => DaysSetting;
  endpoint: string;
  field: string;
  min: number;
  max: number;
  label: string;
  /** Cómo se llama el mínimo en el aviso de rango (p. ej. «el mismo lunes»). */
  minHint: string;
  hint: (days: number) => ReactNode;
}) {
  const id = useId();
  const [setting, setSetting] = useState(initial);
  const current = read(setting);
  const [draft, setDraft] = useState(String(current.effective));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const save = async (days: number | null) => {
    const ok = await run(async () => {
      const res = await sendJson<T>(endpoint, 'PATCH', { [field]: days });
      if (!res.ok) return res;
      setSetting(res.data);
      setDraft(String(read(res.data).effective));
      return { ok: true };
    });
    if (!ok) setDraft(String(current.effective));
  };

  const commit = () => {
    if (draft.trim() === String(current.effective)) return;
    const n = Number(draft);
    if (!Number.isInteger(n) || n < min || n > max) {
      setLocalError(`Entre ${min} (${minHint}) y ${max}.`);
      return;
    }
    setLocalError(null);
    void save(n);
  };

  return (
    <SettingRow
      layout="inline"
      label={label}
      htmlFor={id}
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={
        <>
          {hint(current.effective)} <span className="text-v2-faint t-tnum">Por defecto: {current.default_days}.</span>
        </>
      }
    >
      {current.stored != null && current.stored !== current.default_days ? (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          Usar {current.default_days}
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
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        }}
        className="w-16 text-right t-tnum"
      />
      <span className="w-24 t-body-sm text-v2-muted">días antes</span>
    </SettingRow>
  );
}

function AutoPublishRow({ initial }: { initial: AutoPublishSetting }) {
  return (
    <DaysBeforeRow
      initial={initial}
      read={(s) => ({ stored: s.auto_publish_days_before, effective: s.effective_days, default_days: s.default_days })}
      endpoint="/api/coach/weeks/auto-publish"
      field="auto_publish_days_before"
      min={AUTO_PUBLISH_DAYS_MIN}
      max={AUTO_PUBLISH_DAYS_MAX}
      label="Abrir cada semana"
      minHint="el mismo lunes"
      hint={(n) => (
        <>
          Cada semana se hace visible sola {n === 0 ? 'el mismo lunes' : `${n} ${n === 1 ? 'día' : 'días'} antes de su lunes`};
          las que retengas no se abren.
        </>
      )}
    />
  );
}

function PlanRenewalRow({ initial }: { initial: PlanRenewalSetting }) {
  return (
    <DaysBeforeRow
      initial={initial}
      read={(s) => ({ stored: s.plan_renewal_days_before, effective: s.effective_days, default_days: s.default_days })}
      endpoint="/api/coach/plan-renewal"
      field="plan_renewal_days_before"
      min={PLAN_RENEWAL_DAYS_MIN}
      max={PLAN_RENEWAL_DAYS_MAX}
      label="Renovar el plan de un grupo"
      minHint="el día que acaba"
      hint={(n) => (
        <>
          Si un grupo repite o sube de nivel al acabar, la vuelta siguiente se prepara sola{' '}
          {n === 0 ? 'el día que acaba el plan de cada atleta' : `${n} ${n === 1 ? 'día' : 'días'} antes de que acabe`}
          . Nunca menos que los días con que se abre cada semana.
        </>
      )}
    />
  );
}

/** Qué ve el atleta con cada opción, en el vocabulario del panel (visible / oculta). */
const HORIZON_LINE: Record<PlanWeekHorizon, string> = {
  this_week: 'Solo la semana en curso, aunque las siguientes ya sean visibles.',
  next_week: 'La semana en curso y la siguiente, si ya es visible.',
  two_weeks: 'Hasta dos semanas por delante, las que ya sean visibles.',
  one_month: 'Hasta cuatro semanas por delante, las que ya sean visibles.',
};

function HorizonRow({ initial }: { initial: PlanWeekHorizon }) {
  const id = useId();
  const [value, setValue] = useState<PlanWeekHorizon>(initial);
  const { state, error, run } = useSaveState();

  const choose = async (next: PlanWeekHorizon) => {
    if (next === value) return;
    const previous = value;
    setValue(next);
    const ok = await run(async () => {
      const res = await sendJson<CoachPlanWeekHorizonResponse>('/api/coach/plan-week-horizon', 'PATCH', {
        plan_week_horizon: next,
      });
      return res.ok ? { ok: true } : res;
    });
    if (!ok) setValue(previous);
  };

  return (
    <SettingRow
      layout="inline"
      label="Cuánto puede mirar por delante"
      htmlFor={id}
      hintId={`${id}-hint`}
      status={state}
      error={error}
      hint={HORIZON_LINE[value]}
    >
      <Select
        id={id}
        size="lg"
        value={value}
        onValueChange={(v) => void choose(v)}
        options={PLAN_WEEK_HORIZON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        className="w-60"
      />
    </SettingRow>
  );
}
