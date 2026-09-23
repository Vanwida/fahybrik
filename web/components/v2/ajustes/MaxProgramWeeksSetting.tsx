'use client';

// Cuánto puede durar un programa, en semanas (`coaches.max_microcycle_weeks`,
// NULL = defecto). Lo comprueban todos los caminos que crean o alargan un
// programa; los que ya pasan del tope nuevo no se tocan.

import { useId, useState } from 'react';
import { MICROCICLO_ABSOLUTE_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';
import { Button, Input } from '@/components/v2/ui';
import { SettingRow } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

type Setting = { stored: number | null; effective: number; default_weeks: number };
const MIN = 2;

export function MaxProgramWeeksSetting({ initial }: { initial: Setting }) {
  const id = useId();
  const [setting, setSetting] = useState(initial);
  const [draft, setDraft] = useState(String(initial.effective));
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const save = async (weeks: number | null) => {
    const ok = await run(async () => {
      const res = await sendJson<{ max_program_weeks: Setting }>('/api/coach/settings', 'PATCH', { max_program_weeks: weeks });
      if (!res.ok) return res;
      setSetting(res.data.max_program_weeks);
      setDraft(String(res.data.max_program_weeks.effective));
      return { ok: true };
    });
    if (!ok) setDraft(String(setting.effective));
  };

  const commit = () => {
    if (draft.trim() === String(setting.effective)) return;
    const n = Number(draft);
    if (!Number.isInteger(n) || n < MIN || n > MICROCICLO_ABSOLUTE_MAX_WEEKS) {
      setLocalError(`Entre ${MIN} y ${MICROCICLO_ABSOLUTE_MAX_WEEKS} semanas.`);
      return;
    }
    setLocalError(null);
    void save(n);
  };

  return (
    <SettingRow
      layout="inline"
      label="Duración máxima de un programa"
      htmlFor={id}
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={
        <>
          Nadie puede crear ni alargar un programa por encima.{' '}
          <span className="text-v2-faint t-tnum">Por defecto: {setting.default_weeks}.</span>
        </>
      }
    >
      {setting.stored != null ? (
        <Button size="sm" variant="ghost" onClick={() => void save(null)}>
          Usar {setting.default_weeks}
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
      <span className="w-24 t-body-sm text-v2-muted">semanas</span>
    </SettingRow>
  );
}
