'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { TextSuggestInput } from '@/lib/dashboard/coach/text-ai-suggest';

interface TextAiSuggestButtonProps {
  surface: TextSuggestInput['surface'];
  context?: Record<string, unknown>;
  onSelect: (value: string) => void;
  label?: string;
}

export function TextAiSuggestButton({
  surface,
  context = {},
  onSelect,
  label = 'Pablo IA',
}: TextAiSuggestButtonProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const fetchSuggestions = () => {
    setLoading(true);
    startTransition(async () => {
      try {
        const res = await fetch('/api/coach/ai/text-suggest', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surface, context }),
        });
        const json = (await res.json()) as { suggestions?: string[] };
        setSuggestions(json.suggestions ?? []);
        setOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    });
  };

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        disabled={pending || loading}
        onClick={fetchSuggestions}
        className="rounded-[var(--r-m)] bg-[color:var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--accent-on)] disabled:opacity-50"
      >
        {loading || pending ? '…' : label}
      </button>

      {open && suggestions.length > 0 ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-[var(--r-m)] border border-[color:var(--hairline)] bg-[color:var(--surface-elevated)] p-2 shadow-lg">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--muted)]">
            Sugerencias
          </p>
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                  className="w-full rounded-[var(--r-m)] px-2 py-1.5 text-left text-xs hover:bg-[color:var(--surface)]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
