'use client';

// BloquesPanel — la rejilla de BLOQUES: las piezas reutilizables del coach
// (`blocks`). Un bloque es más pequeño que una sesión: es el ladrillo con el que
// se arman los días. Los entrenos importados del Excel del coach viven aquí.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { TeachingEmptyState } from '@/components/v2/orientacion';
import { BloqueCard } from '@/components/v2/biblioteca/BloqueCard';
import type { V2BloqueItem } from '@/lib/dashboard/v2/biblioteca-data';
import { NUEVO_BLOQUE_HREF } from '@/components/v2/biblioteca/biblioteca-nav';
import { PagedGrid } from '@/components/v2/biblioteca/PagedGrid';

export function BloquesPanel({ items, hasAny }: { items: V2BloqueItem[]; hasAny: boolean }) {
  if (items.length === 0) {
    // Filtrado a cero → aviso simple. Vacío de verdad → momento de enseñar.
    if (hasAny) {
      return (
        <EmptyState
          icon="filter_alt_off"
          title="Ningún bloque con estos filtros"
          description="Ajusta la modalidad, el objetivo o la búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="widgets"
        title="Aún no tienes bloques"
        whatToDo={<>Un bloque es una pieza reutilizable — un ladrillo con el que armas los días.</>}
        why={
          <>
            <b>Por qué importa:</b> los bloques se insertan en los días de tus microciclos, así no
            reescribes lo mismo cada semana.
          </>
        }
        highlightStep="sesiones"
        action={
          <Link
            href={NUEVO_BLOQUE_HREF}
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={16} />
            Crear mi primer bloque
          </Link>
        }
      />
    );
  }
  return (
    <PagedGrid
      total={items.length}
      noun="bloques"
      footer={
        <Link
          key="nuevo"
          href={NUEVO_BLOQUE_HREF}
          className="v2-focus flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[var(--v2-r-card)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
        >
          <MIcon name="add" size={22} />
          <span className="text-xs font-semibold">nuevo bloque</span>
        </Link>
      }
    >
      {items.map((b, i) => (
        <BloqueCard key={b.id} bloque={b} index={i} />
      ))}
    </PagedGrid>
  );
}
