'use client';

// SesionesPanel — la rejilla de SESIONES: entrenos completos (`templates` madre).
// Una sesión es lo que ejecuta el atleta; al asignarla se forkea por atleta, y la
// biblioteca solo enseña las madre. Los tests de calibración NO salen aquí: un
// test mide al atleta, no es un entreno reutilizable.

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { TeachingEmptyState } from '@/components/v2/orientacion';
import { SesionCard } from '@/components/v2/biblioteca/SesionCard';
import type { V2SesionItem } from '@/lib/dashboard/v2/biblioteca-data';
import { GRID_CLS, NUEVA_SESION_HREF } from '@/components/v2/biblioteca/biblioteca-nav';

export function SesionesPanel({ items, hasAny }: { items: V2SesionItem[]; hasAny: boolean }) {
  if (items.length === 0) {
    if (hasAny) {
      return (
        <EmptyState
          icon="filter_alt_off"
          title="Ninguna sesión con estos filtros"
          description="Ajusta la modalidad, el objetivo o la búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="library_add"
        title="Aún no tienes sesiones"
        whatToDo={<>Una sesión es un entreno entero — lo que hace tu atleta un día.</>}
        why={
          <>
            <b>Por qué importa:</b> es el peldaño entre el bloque y el microciclo. Ármala con tus
            bloques y reutilízala en cualquier día.
          </>
        }
        highlightStep="sesiones"
        action={
          <Link
            href={NUEVA_SESION_HREF}
            className="v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] bg-[color:var(--v2-accent)] px-3 text-xs font-semibold text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={16} />
            Crear mi primera sesión
          </Link>
        }
      />
    );
  }
  return (
    <div className={GRID_CLS}>
      {items.map((s, i) => (
        <SesionCard key={s.id} sesion={s} index={i} />
      ))}
      <Link
        href={NUEVA_SESION_HREF}
        className="v2-focus flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[var(--v2-r-l)] border border-dashed border-[color:var(--v2-border)] text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]"
      >
        <MIcon name="add" size={22} />
        <span className="text-xs font-semibold">nueva sesión</span>
      </Link>
    </div>
  );
}
