'use client';

// ‹ K · 5 de 14 · J › — recorrer la lista de la que vino el coach sin volver a
// ella. K = anterior, J = siguiente (como la bandeja de Hoy). Las teclas no
// cuentan mientras se escribe ni con un panel abierto encima.

import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { IconButton, Skeleton } from '@/components/v2/ui';

type Neighbour = { id: string; name: string } | null;

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function AthleteNav({
  prev,
  next,
  position,
  total,
  desde,
  view,
}: {
  prev: Neighbour;
  next: Neighbour;
  position: number | null;
  total: number;
  desde: string | null;
  /** Nombre de la lista de origen (vista de Atletas), si la hay. */
  view: string | null;
}) {
  const router = useRouter();
  const href = (id: string) => `/atletas/${id}${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || typing(e.target)) return;
      // Con un diálogo o panel modal abierto, las teclas son suyas.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'k' && prev) {
        e.preventDefault();
        router.push(href(prev.id));
      } else if (key === 'j' && next) {
        e.preventDefault();
        router.push(href(next.id));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // href depende de desde, que ya está en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev, next, desde, router]);

  return (
    <span className="inline-flex items-center gap-1">
      <IconButton
        icon={ChevronLeft}
        label={prev ? `Anterior: ${prev.name}` : 'No hay anterior'}
        shortcut="K"
        size="sm"
        disabled={!prev}
        onClick={() => prev && router.push(href(prev.id))}
      />
      <Link
        href={desde ? `/atletas?${desde}` : '/atletas'}
        className="min-w-12 rounded-ctl px-1 text-center t-meta text-v2-faint t-tnum outline-none hover:text-v2-fg focus-visible:shadow-[0_0_0_2px_var(--v2-accent)]"
        title="Volver a la lista"
      >
        {view ? `${view} · ` : ''}
        {position != null ? `${position} de ${total}` : total > 0 ? 'fuera de la lista' : ''}
      </Link>
      <IconButton
        icon={ChevronRight}
        label={next ? `Siguiente: ${next.name}` : 'No hay siguiente'}
        shortcut="J"
        size="sm"
        disabled={!next}
        onClick={() => next && router.push(href(next.id))}
      />
    </span>
  );
}

export function AthleteNavSkeleton() {
  return (
    <span role="status" aria-label="Cargando la lista" className="inline-flex items-center gap-2">
      <Skeleton className="size-7" />
      <Skeleton className="h-3 w-12" />
      <Skeleton className="size-7" />
    </span>
  );
}
