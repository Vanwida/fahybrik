'use client';

// ImportNotices — lo que la IA NO pudo honrar del foco, delante del coach y antes
// de que revise nada.
//
// Existe por un fallo real: el coach pidió "doble sesión de running e híbrido
// enfocado en HYROX" y la app le devolvió una semana genérica sin decirle que sus
// 14 simulaciones y sus 9 WODs están sin tipar y por eso no se podían usar. La
// semana parecía correcta. Un hueco relleno en silencio es peor que un error:
// el coach no tiene forma de saber que le falta algo.

import Link from 'next/link';
import type { WeekNotice } from '@/lib/dashboard/coach/ai/week-notices';
import { MIcon } from '@/components/ui/MIcon';

const TONE_STYLE: Record<WeekNotice['tone'], { wrap: string; icon: string; name: string }> = {
  warning: {
    wrap: 'border-[color:var(--v2-warn)]/40 bg-[color:var(--v2-warn)]/8',
    icon: 'text-[color:var(--v2-warn)]',
    name: 'warning',
  },
  info: {
    wrap: 'border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)]',
    icon: 'text-[color:var(--v2-muted)]',
    name: 'info',
  },
};

export function ImportNotices({ notices }: { notices: WeekNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Avisos de la generación">
      {notices.map((n) => {
        const tone = TONE_STYLE[n.tone];
        return (
          <li
            key={n.code}
            className={`flex items-start gap-2.5 rounded-[var(--v2-r-m)] border p-3 ${tone.wrap}`}
          >
            <MIcon name={tone.name} size={16} className={`mt-px shrink-0 ${tone.icon}`} />
            <div className="min-w-0 space-y-1.5">
              <p className="text-[12.5px] leading-snug text-[color:var(--v2-fg)]">{n.message}</p>
              {n.href && n.cta ? (
                <Link
                  href={n.href}
                  className="v2-focus inline-flex items-center gap-1 text-[11.5px] font-bold text-[color:var(--v2-accent)] hover:underline"
                >
                  {n.cta}
                  <MIcon name="arrow_forward" size={13} />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
