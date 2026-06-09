'use client';

import { useEffect, useMemo, useState } from 'react';
import { Play, X } from 'lucide-react';
import { isValidYouTubeUrl } from '@fahybrid/shared/youtube';
import { YouTubeEmbed } from './YouTubeEmbed';
import { cn } from '@/lib/utils';

interface VideoUrlFieldProps {
  label: string;
  hint?: string;
  value: string | null;
  onChange: (url: string | null) => void;
  compact?: boolean;
}

/** Paste a YouTube link → inline preview. No typing essays — visual confirmation for Pablo. */
export function VideoUrlField({ label, hint, value, onChange, compact }: VideoUrlFieldProps) {
  const [draft, setDraft] = useState(value ?? '');
  // Sincroniza el draft con la prop `value` cuando el padre la cambia: sincronización
  // legítima a props, no un setState derivado en cada render. Disable acotado.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDraft(value ?? '');
  }, [value]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const valid = useMemo(() => draft.trim() !== '' && isValidYouTubeUrl(draft), [draft]);
  const showPreview = valid && (value ?? draft);

  const commit = (raw: string) => {
    setDraft(raw);
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    if (isValidYouTubeUrl(trimmed)) onChange(trimmed);
  };

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
          {label}
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              onChange(null);
            }}
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)] hover:text-[color:var(--danger)]"
          >
            <X className="size-3" aria-hidden />
            Quitar
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="text-xs text-[color:var(--muted)] leading-snug">{hint}</p>
      ) : null}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Play
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[color:var(--muted)]"
            aria-hidden
          />
          <input
            type="url"
            inputMode="url"
            value={draft}
            onChange={(e) => commit(e.target.value)}
            onBlur={() => commit(draft)}
            placeholder="youtube.com/watch?v=…"
            className={cn(
              'w-full rounded-md border border-[color:var(--outline)] bg-[color:var(--surface)] pl-8 pr-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]',
              draft.trim() && !valid && 'border-[color:var(--danger)]/50',
            )}
          />
        </div>
      </div>
      {draft.trim() && !valid ? (
        <p className="text-xs text-[color:var(--danger)]">Enlace de YouTube no válido</p>
      ) : null}
      {showPreview ? (
        <YouTubeEmbed url={value ?? draft} title={label} className={compact ? 'max-w-sm' : undefined} />
      ) : null}
    </div>
  );
}
