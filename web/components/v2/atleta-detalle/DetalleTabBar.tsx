'use client';

// Cinco pestañas. Mensajes no está aquí: es el botón de cabecera.

import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { ATLETA_TABS, type AtletaTab, type AtletaVista } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const TAB_LABEL: Record<AtletaTab, string> = {
  resumen: 'Resumen',
  plan: 'Plan',
  rendimiento: 'Rendimiento',
  'del-coach': 'Del coach',
  atleta: 'Atleta',
};

export function DetalleTabBar({
  athlete_id,
  active,
  badges,
}: {
  athlete_id: string;
  active: AtletaVista;
  badges?: Partial<Record<AtletaTab, number>>;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <nav aria-label="Secciones del atleta" className="border-b border-[color:var(--v2-border)]">
      <div className="flex gap-1 overflow-x-auto">
        {ATLETA_TABS.map((tab) => {
          const isActive = tab === active || (active === 'mensajes' && tab === 'resumen');
          const badge = badges?.[tab] ?? 0;
          return (
            <Link
              key={tab}
              ref={isActive ? activeRef : undefined}
              href={`/atletas/${athlete_id}?tab=${tab}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'v2-focus relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-[13.5px] font-semibold transition-colors',
                isActive
                  ? 'text-[color:var(--v2-fg)]'
                  : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              {TAB_LABEL[tab]}
              {badge > 0 ? (
                <span
                  aria-label={`${badge} sin resolver`}
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[var(--v2-r-pill)] px-1 text-[10px] font-bold"
                  style={{ background: 'var(--v2-accent)', color: 'var(--v2-accent-fg)' }}
                >
                  {badge}
                </span>
              ) : null}
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
                style={{ background: 'var(--v2-accent)' }}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
