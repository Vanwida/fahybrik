'use client';

// Plan del atleta — dos ajustes que deciden qué ve tu atleta y cuándo:
//   · cuándo se abre sola cada semana (N días antes de su lunes; las retenidas
//     no se abren nunca solas) — `coaches.auto_publish_days_before`;
//   · hasta dónde puede mirar por delante, entre las semanas ya visibles —
//     `coaches.plan_week_horizon`.
// Son capas distintas (DECISIONS 2026-09-23 «Grupos, asignar a varios y
// publicar por semana»): la primera abre semanas; la segunda limita cuántas de
// las abiertas puede ojear.

import { useId, useState } from 'react';
import {
  AUTO_PUBLISH_DAYS_MAX,
  AUTO_PUBLISH_DAYS_MIN,
} from '@fahybrid/shared/domain/coach/week-publishing';
import {
  PLAN_WEEK_HORIZON_OPTIONS,
  type PlanWeekHorizon,
} from '@fahybrid/shared/domain/coach/plan-week-horizon';
import type { AutoPublishSetting } from '@fahybrid/shared/schema/week-publishing';
import type { CoachPlanWeekHorizonResponse } from '@fahybrid/shared/schema/coach-plan-week-horizon';
import { Button, Input, Select } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

export function PlanAtletaSettings({
  autoPublish,
  horizon,
}: {
  autoPublish: AutoPublishSetting | null;
  horizon: CoachPlanWeekHorizonResponse | null;
}) {
  return (
    <SettingsSection title="Qué ve tu atleta">
      {autoPublish ? <AutoPublishRow initial={autoPublish} /> : <Unavailable label="Abrir cada semana" />}
      {horizon ? <HorizonRow initial={horizon.plan_week_horizon} /> : <Unavailable label="Cuánto puede mirar por delante" />}
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

function AutoPublishRow({ initial }: { initial: AutoPublishSetting }) {
  const id = useId();
  const [setting, setSetting] = useState(initial);
  const [draft, setDraft] = useState(String(initial.effective_days));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const save = async (days: number | null) => {
    const ok = await run(async () => {
      const res = await sendJson<AutoPublishSetting>('/api/coach/weeks/auto-publish', 'PATCH', {
        auto_publish_days_before: days,
      });
      if (!res.ok) return res;
      setSetting(res.data);
      setDraft(String(res.data.effective_days));
      return { ok: true };
    });
    if (!ok) setDraft(String(setting.effective_days));
  };

  const commit = () => {
    if (draft.trim() === String(setting.effective_days)) return;
    const n = Number(draft);
    if (!Number.isInteger(n) || n < AUTO_PUBLISH_DAYS_MIN || n > AUTO_PUBLISH_DAYS_MAX) {
      setLocalError(`Entre ${AUTO_PUBLISH_DAYS_MIN} (el mismo lunes) y ${AUTO_PUBLISH_DAYS_MAX}.`);
      return;
    }
    setLocalError(null);
    void save(n);
  };

  const n = setting.effective_days;
  return (
    <SettingRow
      layout="inline"
      label="Abrir cada semana"
      htmlFor={id}
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={
        <>
          Cada semana se hace visible sola {n === 0 ? 'el mismo lunes' : `${n} ${n === 1 ? 'día' : 'días'} antes de su lunes`};
          las que retengas no se abren.{' '}
          <span className="text-v2-faint t-tnum">Por defecto: {setting.default_days}.</span>
        </>
      }
    >
      {setting.auto_publish_days_before != null && setting.auto_publish_days_before !== setting.default_days ? (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          Usar {setting.default_days}
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
