'use client';

// Una pregunta de opción única de la entrevista: un grupo de radio con las
// opciones a la vista (no un desplegable: leerlas todas ES la pregunta). Tocar
// la elegida la desmarca. Flechas para moverse, como cualquier radio.

import { useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export function ChoiceList({
  label,
  options,
  value,
  onSelect,
  columns = 1,
}: {
  label: string;
  options: readonly { id: string; label: string }[];
  value: string | null;
  onSelect: (id: string) => void;
  columns?: 1 | 2;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.findIndex((o) => o.id === value));

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    refs.current[(i + delta + options.length) % options.length]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-1.5', columns === 2 && 'sm:grid-cols-2')}>
      {options.map((opt, i) => {
        const on = opt.id === value;
        return (
          <Button
            key={opt.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="radio"
            aria-checked={on}
            tabIndex={i === current ? 0 : -1}
            size="lg"
            onClick={() => onSelect(opt.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'h-auto min-h-10 justify-start gap-2 py-2 text-left font-normal whitespace-normal',
              on && 'border-v2-fg bg-v2-select font-medium',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border',
                on ? 'border-v2-fg bg-v2-fg text-v2-bg' : 'border-v2-border-strong',
              )}
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            {opt.label}
          </Button>
        );
      })}
    </div>
  );
}
