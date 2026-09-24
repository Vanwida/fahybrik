'use client';

// Lista de etiquetas (especialidades, titulaciones) que se guarda al añadir o
// quitar una: cada gesto es completo, así que no hay nada «pendiente de
// guardar». Enter o coma añade; Retroceso con el campo vacío quita la última.

import { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/v2/ui';
import { SettingRow } from './SettingsKit';
import { useSaveState, type SaveResult } from './autosave';

export function TagSetting({
  label,
  hint,
  values,
  save,
  placeholder,
  maxTags,
  maxTagLength,
  suggestions = [],
}: {
  label: string;
  hint?: string;
  values: string[];
  save: (next: string[]) => Promise<SaveResult>;
  placeholder?: string;
  maxTags: number;
  maxTagLength: number;
  suggestions?: string[];
}) {
  const id = useId();
  const [tags, setTags] = useState(values);
  const [draft, setDraft] = useState('');
  const { state, error, run } = useSaveState();

  const has = (t: string) => tags.some((v) => v.toLowerCase() === t.toLowerCase());
  const full = tags.length >= maxTags;

  const commit = async (next: string[]) => {
    const previous = tags;
    setTags(next);
    const ok = await run(() => save(next));
    if (!ok) setTags(previous);
  };

  const add = (raw: string) => {
    const t = raw.trim().slice(0, maxTagLength);
    setDraft('');
    if (!t || has(t) || full) return;
    void commit([...tags, t]);
  };
  const remove = (i: number) => void commit(tags.filter((_, idx) => idx !== i));

  const pending = suggestions.filter((s) => !has(s));

  return (
    <SettingRow label={label} hint={hint} status={state} error={error} htmlFor={id} hintId={`${id}-hint`}>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {tags.map((tag, i) => (
            <li
              key={tag}
              className="inline-flex h-7 items-center gap-1 rounded-ctl border border-v2-border bg-v2-surface-2 pr-1 pl-2.5 t-body-sm text-v2-fg"
            >
              {tag}
              <IconButton
                icon={X}
                label={`Quitar ${tag}`}
                size="sm"
                onClick={() => remove(i)}
                className="h-5 w-5 rounded-[4px] [&_svg]:size-3.5"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        size="lg"
        value={draft}
        disabled={full}
        maxLength={maxTagLength}
        aria-describedby={hint ? `${id}-hint` : undefined}
        placeholder={full ? `Máximo ${maxTags}` : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            remove(tags.length - 1);
          }
        }}
        onBlur={() => add(draft)}
      />
      {pending.length > 0 && !full ? (
        <div className="flex flex-wrap gap-1.5">
          {pending.map((s) => (
            <Button
              key={s}
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() => add(s)}
              className="border-dashed border-v2-border-strong"
            >
              {s}
            </Button>
          ))}
        </div>
      ) : null}
    </SettingRow>
  );
}
