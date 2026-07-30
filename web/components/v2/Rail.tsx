'use client';

// Rail — the shared horizontal strip container (Hoy decision strips). One source
// for the scroll affordances the raw `overflow-x-auto` div lacked on touch:
// snap points, a fading right edge while there is more content, and position
// dots when the strip actually overflows. Desktop with everything visible
// renders exactly like the old plain div (no dots, no fade).

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export function Rail({
  children,
  className,
  wrap,
}: {
  children: React.ReactNode;
  className?: string;
  /** Reparte en varias líneas en vez de scrollear de lado. Un carril está bien
   *  para un puñado de tarjetas y mal para veinte: con veinte altas pendientes el
   *  coach deslizaba veinte veces y la tira no decía ni cuántas había. Ver
   *  DecisionStrip, que es quien decide cuándo toca. */
  wrap?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // pages = viewport-sized pages when overflowing; 0 = fits, no affordances.
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || wrap) return;
    const update = () => {
      const overflows = el.scrollWidth - el.clientWidth > 8;
      setPages(overflows && el.clientWidth > 0 ? Math.ceil(el.scrollWidth / el.clientWidth) : 0);
      setPage(el.clientWidth > 0 ? Math.round(el.scrollLeft / el.clientWidth) : 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [wrap]);

  return (
    <div className="relative">
      <div
        ref={ref}
        className={cn(
          'flex gap-2.5 pb-1',
          // Al repartir en líneas, las tarjetas crecen hasta llenar la suya: con
          // su ancho fijo, a 390 sobraban ~120 px a la derecha de cada una.
          wrap
            ? 'flex-wrap [&>*]:grow'
            : 'snap-x snap-proximity overflow-x-auto [&>*]:snap-start',
          className,
        )}
      >
        {children}
      </div>
      {/* Right-edge fade — "there is more"; gone at the end of the strip. */}
      {pages > 0 && !atEnd ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8"
          style={{ background: 'linear-gradient(to right, transparent, var(--v2-bg))' }}
        />
      ) : null}
      {pages > 1 ? (
        <div aria-hidden className="mt-1.5 flex justify-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              className="h-[5px] w-[5px] rounded-full transition-colors"
              style={{
                background: i === Math.min(page, pages - 1) ? 'var(--v2-accent)' : 'var(--v2-border-strong)',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
