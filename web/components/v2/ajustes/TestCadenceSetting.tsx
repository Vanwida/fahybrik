'use client';

// Cada cuánto repites un test: las opciones de «Repetir» al aplicar un test y,
// la más corta, cuándo salta «Toca test» (`coaches.test_retest_weeks`). Cada
// cambio se guarda entero (añadir o quitar una opción).

import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TEST_RETEST_OPTIONS_MAX, TEST_RETEST_WEEKS_MAX } from '@fahybrid/shared/domain/coach/test-cadence';
import { Button, IconButton, Input } from '@/components/v2/ui';
import { SettingRow, SettingsSection } from './SettingsKit';
import { sendJson, useSaveState } from './autosave';

type Cadence = { stored: number[] | null; effective: number[]; default_weeks: number[] };

const weeksLabel = (w: number) => `${w} ${w === 1 ? 'semana' : 'semanas'}`;

export function TestCadenceSetting({ initial }: { initial: Cadence }) {
  const id = useId();
  const [cadence, setCadence] = useState(initial);
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();
  const weeks = cadence.effective;
  const full = weeks.length >= TEST_RETEST_OPTIONS_MAX;

  const save = (next: number[] | null) =>
    run(async () => {
      const res = await sendJson<{ test_retest_weeks: Cadence }>('/api/coach/settings', 'PATCH', { test_retest_weeks: next });
      if (!res.ok) return res;
      setCadence(res.data.test_retest_weeks);
      return { ok: true };
    });

  const add = () => {
    const n = Number(draft.trim());
    if (!Number.isInteger(n) || n < 1 || n > TEST_RETEST_WEEKS_MAX) {
      setLocalError(`Entre 1 y ${TEST_RETEST_WEEKS_MAX} semanas.`);
      return;
    }
    setLocalError(null);
    setDraft('');
    if (weeks.includes(n)) return;
    void save([...weeks, n]);
  };

  const isDefault = cadence.stored == null;
  return (
    <SettingsSection title="Tests">
      <SettingRow
        label="Repetir un test a las"
        htmlFor={id}
        hintId={`${id}-hint`}
        status={localError ? 'error' : state}
        error={localError ?? error}
        hint={
          <>
            Son las opciones de «Repetir» al aplicar un test; «Toca test» salta al pasar la más corta ({weeksLabel(Math.min(...weeks))}).{' '}
            <span className="t-tnum">Por defecto: {cadence.default_weeks.join(' y ')} semanas.</span>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <ul className="flex flex-wrap gap-1.5" aria-label="Semanas">
            {weeks.map((w) => (
              <li
                key={w}
                className="inline-flex h-8 items-center gap-1 rounded-control border border-v2-border bg-v2-surface-2 pr-0.5 pl-2.5 t-body-sm text-v2-fg t-tnum"
              >
                {weeksLabel(w)}
                {weeks.length > 1 ? (
                  <IconButton
                    icon={X}
                    size="sm"
                    label={`Quitar ${weeksLabel(w)}`}
                    onClick={() => void save(weeks.filter((x) => x !== w))}
                    className="size-6 pointer-coarse:size-9"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {!full ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <Input
                id={id}
                inputMode="numeric"
                value={draft}
                placeholder="Semanas"
                aria-describedby={`${id}-hint`}
                invalid={Boolean(localError)}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (localError) setLocalError(null);
                }}
                className="w-24 t-tnum"
              />
              <IconButton type="submit" icon={Plus} label="Añadir" variant="secondary" disabled={draft.trim() === ''} />
            </form>
          ) : null}
          {!isDefault ? (
            <Button size="sm" variant="ghost" onClick={() => void save(null)}>
              Usar {cadence.default_weeks.join(' y ')}
            </Button>
          ) : null}
        </div>
      </SettingRow>
    </SettingsSection>
  );
}
