'use client';

// TagInput — a reusable chip/tag editor. Type + Enter (or comma) adds a tag;
// click ✕ or Backspace-on-empty removes the last. Optional one-tap suggestions.
// Used for both Especialidades and Certificaciones (one source, DRY). Limits are
// passed in from the shared profile schema so the UI never drifts from the
// server validator.

import { useId, useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export function TagInput({
  label,
  hint,
  values,
  placeholder,
  maxTags,
  maxTagLength,
  suggestions,
  onChange,
}: {
  label: string;
  hint?: string;
  values: string[];
  placeholder?: string;
  maxTags: number;
  maxTagLength: number;
  suggestions?: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const full = values.length >= maxTags;

  const has = (t: string) => values.some((v) => v.toLowerCase() === t.toLowerCase());

  const add = (raw: string) => {
    const t = raw.trim().slice(0, maxTagLength);
    setDraft('');
    if (!t || has(t) || values.length >= maxTags) return;
    onChange([...values, t]);
  };
  const remove = (i: number) => onChange(values.filter((_, idx) => idx !== i));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      remove(values.length - 1);
    }
  };

  const remainingSuggestions = (suggestions ?? []).filter((s) => !has(s));

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="v2-micro">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-2 py-1.5 focus-within:border-[color:var(--v2-border-strong)]">
        {values.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent-soft)] px-2 py-0.5 text-xs font-semibold text-[color:var(--v2-accent-text)]"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Quitar ${tag}`}
              className="v2-focus -mr-0.5 inline-flex items-center rounded-full hover:opacity-70"
            >
              <MIcon name="close" size={14} />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={draft}
          disabled={full}
          maxLength={maxTagLength}
          placeholder={full ? `Máximo ${maxTags}` : values.length === 0 ? placeholder : ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          className="v2-focus min-w-[8ch] flex-1 bg-transparent px-1 py-0.5 text-sm text-[color:var(--v2-fg)] outline-none placeholder:text-[color:var(--v2-faint)] disabled:cursor-not-allowed"
        />
      </div>
      {remainingSuggestions.length > 0 && !full ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {remainingSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className={cn(
                'v2-focus inline-flex items-center gap-1 rounded-[var(--v2-r-pill)] border border-dashed border-[color:var(--v2-border)]',
                'px-2 py-0.5 text-xs font-medium text-[color:var(--v2-muted)]',
                'hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent-text)]',
              )}
            >
              <MIcon name="add" size={13} />
              {s}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? <p className="text-label text-[color:var(--v2-muted)]">{hint}</p> : null}
    </div>
  );
}
