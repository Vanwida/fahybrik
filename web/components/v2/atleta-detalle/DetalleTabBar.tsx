'use client';

// DetalleTabBar — the sub-tab underline nav for the athlete detail screen.
// Each tab is a Link that sets ?tab=<id> on the current athlete route, so the
// active view is URL-driven (shareable, back-button friendly, server-rendered).
// The active tab carries an accent underline + filled label; the rest stay quiet.

import { Link } from '@/i18n/navigation';
import {
  visibleAtletaTabs,
  type AtletaTab,
  type DetalleHeader,
} from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const TAB_LABEL: Record<AtletaTab, string> = {
  perfil: 'Perfil & objetivos',
  plan: 'Plan actual',
  ritmos: 'Ritmos / Zonas',
  rendimiento: 'Rendimiento',
  historico: 'Histórico',
  biometria: 'Biometría',
  dobles: 'Dobles',
  mensajes: 'Mensajes',
};

export function DetalleTabBar({
  header,
  active,
}: {
  header: DetalleHeader;
  active: AtletaTab;
}) {
  const athlete_id = header.athlete_id;
  return (
    <nav
      aria-label="Secciones del atleta"
      className="flex items-center gap-1 overflow-x-auto border-b border-[color:var(--v2-border)]"
    >
      {visibleAtletaTabs(header).map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={`/v2/atletas/${athlete_id}?tab=${tab}`}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'v2-focus relative -mb-px shrink-0 whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold transition-colors',
              isActive
                ? 'text-[color:var(--v2-fg)]'
                : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {TAB_LABEL[tab]}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
              style={{ background: 'var(--v2-accent)' }}
            />
          </Link>
        );
      })}
    </nav>
  );
}
