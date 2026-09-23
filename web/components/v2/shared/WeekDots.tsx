'use client';

// La semana de un atleta en 7 puntos (lun → dom): hecho ✓, sin hacer ✕,
// pendiente (vacío), descanso (–) y hoy con contorno. Cada punto dice su estado
// en texto (tooltip y lector): el color nunca va solo.

import { Check, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeekDay } from '@/lib/coach/athlete-peek';
import { weekdayDate, weekdayLetter } from './format';

export { weekDueSummary } from './logic';

export type WeekDot = Pick<PeekDay, 'date' | 'state' | 'is_today' | 'sessions'>;

const STATE_TEXT: Record<WeekDot['state'], string> = {
  done: 'hecho',
  missed: 'sin hacer',
  pending: 'pendiente',
  rest: 'descanso',
};

const DOT: Record<WeekDot['state'], string> = {
  done: 'bg-v2-ok text-v2-bg',
  missed: 'bg-v2-danger text-v2-danger-fg',
  pending: 'border border-v2-border-strong bg-v2-surface text-v2-faint',
  rest: 'bg-transparent text-v2-faint',
};

function dotTitle(d: WeekDot): string {
  const what = d.sessions.length > 0 ? d.sessions.map((s) => s.title).join(' + ') : 'sin entreno';
  return `${weekdayDate(d.date)}${d.is_today ? ' (hoy)' : ''} · ${what} · ${STATE_TEXT[d.state]}`;
}

export function WeekDots({ days, className }: { days: WeekDot[]; className?: string }) {
  return (
    <ol aria-label="Esta semana" className={cn('flex items-end gap-1.5', className)}>
      {days.map((d) => {
        const Icon = d.state === 'done' ? Check : d.state === 'missed' ? X : d.state === 'rest' ? Minus : null;
        return (
          <li key={d.date} className="flex flex-col items-center gap-1" title={dotTitle(d)} aria-label={dotTitle(d)}>
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-[5px]',
                DOT[d.state],
                d.is_today && 'outline outline-2 outline-offset-2 outline-v2-fg',
              )}
            >
              {Icon ? <Icon aria-hidden strokeWidth={2.5} className="size-3.5" /> : null}
            </span>
            <span className={cn('t-meta', d.is_today ? 'font-semibold text-v2-fg' : 'text-v2-faint')}>
              {weekdayLetter(d.date)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
