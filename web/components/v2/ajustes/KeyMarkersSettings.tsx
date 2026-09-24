'use client';

// Los marcadores clave que ves en la ficha de cada atleta (FC máx, umbral,
// una marca de fuerza…). Elegir cuáles es método del coach (mig 0233): hasta
// seis, en orden de elección. Cada casilla se guarda al tocarla.

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { DEFAULT_KEY_MARKERS } from '@fahybrid/shared/domain/coach/key-markers';
import { Button, Checkbox } from '@/components/v2/ui';
import { SaveStatus, sendJson, useSaveState } from './autosave';
import { SettingsSection } from './SettingsKit';

interface Payload {
  selected: string[];
  catalog: { key: string; label: string }[];
  max: number;
}

export function KeyMarkersSettings({ initial }: { initial: Payload }) {
  const [selected, setSelected] = useState(initial.selected);
  const { state, error, run } = useSaveState();
  const isDefault = selected.length === DEFAULT_KEY_MARKERS.length && selected.every((k, i) => k === DEFAULT_KEY_MARKERS[i]);

  const save = async (keys: string[]) => {
    const previous = selected;
    setSelected(keys);
    const ok = await run(async () => {
      const res = await sendJson<Payload>('/api/coach/key-markers', 'POST', { keys });
      if (!res.ok) return res;
      setSelected(res.data.selected);
      return { ok: true };
    });
    if (!ok) setSelected(previous);
  };

  const toggle = (key: string) => {
    if (selected.includes(key)) {
      if (selected.length === 1) return;
      void save(selected.filter((k) => k !== key));
    } else if (selected.length < initial.max) {
      void save([...selected, key]);
    }
  };

  return (
    <SettingsSection
      title="Marcadores clave en la ficha"
      action={
        <span className="flex items-center gap-2">
          <SaveStatus state={state} error={error} />
          {!isDefault ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => void save([...DEFAULT_KEY_MARKERS])}>
              Restaurar
            </Button>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <p className="t-body-sm text-v2-muted">
          Los que ves junto a cada atleta, en este orden. Hasta {initial.max}; elegidos{' '}
          <span className="t-tnum text-v2-fg">{selected.length}</span>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {initial.catalog.map((m) => {
            const on = selected.includes(m.key);
            const pos = selected.indexOf(m.key);
            return (
              <Checkbox
                key={m.key}
                checked={on}
                disabled={(!on && selected.length >= initial.max) || (on && selected.length === 1)}
                onCheckedChange={() => toggle(m.key)}
                label={
                  <span className="flex items-baseline gap-1.5">
                    {m.label}
                    {on ? <span className="t-meta text-v2-faint t-tnum">{pos + 1}</span> : null}
                  </span>
                }
              />
            );
          })}
        </div>
      </div>
    </SettingsSection>
  );
}
