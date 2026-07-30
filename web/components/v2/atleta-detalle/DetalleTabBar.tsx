'use client';

// DetalleTabBar — la navegación de pestañas de la ficha del atleta. Cada pestaña
// es un Link que fija `?tab=<id>`, así que la vista activa la manda la URL
// (compartible, con botón atrás, renderizada en servidor).
//
// LO QUE DESBORDA LLEVA INDICADOR (§9.3): eran diez pestañas dentro de un
// `overflow-x-auto` pelado, así que a 390 se veían TRES y las otras siete no
// existían para el coach — nada decía que hubiera más. El contenedor con scroll
// horizontal del dashboard ya existía y ya resolvía esto (Rail: puntos de
// posición, snap y difuminado al borde mientras queda contenido). No había que
// inventar nada: había que usarlo (§0).

import { useEffect, useRef } from 'react';
import { Link } from '@/i18n/navigation';
import { Rail } from '@/components/v2/Rail';
import { ATLETA_TABS, type AtletaTab } from '@/lib/dashboard/v2/atleta-detalle-types';
import { cn } from '@/lib/utils';

const TAB_LABEL: Record<AtletaTab, string> = {
  perfil: 'Perfil & objetivos',
  plan: 'Plan actual',
  ritmos: 'Ritmos / Zonas',
  carreras: 'Carreras',
  historico: 'Histórico',
  sesiones: '1:1',
  biometria: 'Biometría',
  rendimiento: 'Rendimiento',
  pagos: 'Pagos',
  mensajes: 'Mensajes',
};

export function DetalleTabBar({
  athlete_id,
  active,
}: {
  athlete_id: string;
  active: AtletaTab;
}) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  // La pestaña abierta se trae a la vista al entrar: aterrizar en «Pagos» y ver
  // la tira empezada en «Perfil» es no saber dónde estás.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <nav aria-label="Secciones del atleta" className="border-b border-[color:var(--v2-border)]">
      <Rail className="gap-1 pb-0">
        {ATLETA_TABS.map((tab) => {
          const isActive = tab === active;
          return (
            <Link
              key={tab}
              ref={isActive ? activeRef : undefined}
              href={`/atletas/${athlete_id}?tab=${tab}`}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'v2-focus relative shrink-0 whitespace-nowrap px-3 py-2.5 text-body font-semibold transition-colors',
                isActive
                  ? 'text-[color:var(--v2-fg)]'
                  : 'text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
              )}
            >
              {TAB_LABEL[tab]}
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
      </Rail>
    </nav>
  );
}
