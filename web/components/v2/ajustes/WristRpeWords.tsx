'use client';

// Las once palabras del RPE que dice el reloj al terminar («fuerte», «muy
// fuerte»…): método del coach con las de fábrica a la vista. Se guardan las
// once juntas al salir de cualquiera (el servidor no acepta media lista) y
// «Usar las de fábrica» vuelve a null.

import { useId, useState } from 'react';
import { WRIST_RPE_WORD_COUNT, WRIST_RPE_WORD_MAX_LENGTH } from '@fahybrid/shared/domain/coach/wrist-method';
import { Button, Input } from '@/components/v2/ui';
import { SettingRow } from './SettingsKit';
import { useSaveState, type SaveResult } from './autosave';

export function WristRpeWords({
  words,
  defaults,
  isCustom,
  save,
}: {
  words: string[];
  defaults: string[];
  isCustom: boolean;
  /** Las once palabras, o null para volver a las de fábrica. */
  save: (v: string[] | null) => Promise<SaveResult>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string[]>(words);
  const [saved, setSaved] = useState<string[]>(words);
  const [localError, setLocalError] = useState<string | null>(null);
  const { state, error, run } = useSaveState();

  const commit = async (next: string[] | null) => {
    let toSave: string[] | null = null;
    if (next) {
      toSave = next.map((w) => w.trim());
      if (toSave.some((w) => w === '')) {
        setLocalError('Cada RPE lleva su palabra.');
        return;
      }
      if (toSave.every((w, i) => w === saved[i])) {
        setDraft(toSave);
        return;
      }
    }
    setLocalError(null);
    const ok = await run(() => save(toSave));
    if (ok) {
      const shown = toSave ?? defaults;
      setDraft(shown);
      setSaved(shown);
    }
  };

  return (
    <SettingRow
      label="Las palabras del RPE"
      hintId={`${id}-hint`}
      status={localError ? 'error' : state}
      error={localError ?? error}
      hint={
        <>
          Lo que dice el reloj cuando el atleta puntúa su esfuerzo al terminar, del 0 al 10.{' '}
          <span className="text-v2-faint">Por defecto: {defaults.join(', ')}.</span>
        </>
      }
    >
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-describedby={`${id}-hint`}>
        {Array.from({ length: WRIST_RPE_WORD_COUNT }, (_, n) => (
          <li key={n} className="flex items-center gap-2">
            <span className="w-6 text-right t-body-sm text-v2-muted t-tnum">{n}</span>
            <Input
              aria-label={`RPE ${n}`}
              value={draft[n] ?? ''}
              maxLength={WRIST_RPE_WORD_MAX_LENGTH}
              invalid={Boolean(localError) && (draft[n] ?? '').trim() === ''}
              onChange={(e) => {
                setDraft((d) => d.map((w, i) => (i === n ? e.target.value : w)));
                if (localError) setLocalError(null);
              }}
              onBlur={() => void commit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                if (e.key === 'Escape') setDraft(saved);
              }}
            />
          </li>
        ))}
      </ol>
      {isCustom ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => void commit(null)}>
            Usar las de fábrica
          </Button>
        </div>
      ) : null}
    </SettingRow>
  );
}
