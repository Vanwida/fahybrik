'use client';

// MicrociclosPanel — la rejilla de MICROCICLOS: varias semanas de días, el
// peldaño más grande de la biblioteca. Lo que luego se ordena en Periodización.

import { MIcon } from '@/components/ui/MIcon';
import { EmptyState } from '@/components/v2/EmptyState';
import { TeachingEmptyState } from '@/components/v2/orientacion';
import { MicrocicloCard } from '@/components/v2/biblioteca/MicrocicloCard';
import type { V2MicrocicloItem } from '@/lib/dashboard/v2/biblioteca-data';
import { PagedGrid } from '@/components/v2/biblioteca/PagedGrid';

export function MicrociclosPanel({
  items,
  hasAny,
  onCreate,
}: {
  items: V2MicrocicloItem[];
  hasAny: boolean;
  onCreate: () => void;
}) {
  if (items.length === 0) {
    if (hasAny) {
      return (
        <EmptyState
          icon="search_off"
          title="Ningún microciclo coincide"
          description="Prueba con otro término de búsqueda."
        />
      );
    }
    return (
      <TeachingEmptyState
        icon="calendar_view_week"
        title="Aún no tienes microciclos"
        whatToDo={<>Un microciclo es una estructura de varias semanas — la unidad que vivirá tu atleta.</>}
        why={
          <>
            <b>Por qué importa:</b> son las piezas que luego encadenas en Periodización → Secuencias.
          </>
        }
        highlightStep="microciclos"
        action={
          <button
            type="button"
            onClick={onCreate}
            className="v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 text-sm font-semibold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
          >
            <MIcon name="add" size={18} />
            Crear mi primer microciclo
          </button>
        }
      />
    );
  }
  return (
    <PagedGrid total={items.length} noun="microciclos">
      {items.map((m, i) => (
        <MicrocicloCard key={m.id} microciclo={m} index={i} />
      ))}
    </PagedGrid>
  );
}
