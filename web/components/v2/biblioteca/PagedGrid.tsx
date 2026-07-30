'use client';

// PagedGrid — la rejilla de la Biblioteca, servida por tandas.
//
// EXISTE PORQUE LA BIBLIOTECA SE PINTABA ENTERA: con 99 bloques la página medía
// 15.957 px de alto a 390 (diecinueve pantallas) y 5.855 a 1440, sin paginar ni
// virtualizar. El §9.4 lo dice literalmente: «una tabla que se lee bien con 3
// filas y pinta las 100 de golpe NO está diseñada». Y esto no es la escala de
// hoy: es la de lanzamiento, y el catálogo de un coach solo crece.
//
// Se sirve por tandas en vez de con números de página porque la Biblioteca se
// RECORRE (filtras, buscas, sigues bajando), no se consulta por índice: cortar el
// recorrido para elegir «página 4» sería peor que el problema. El conteo real va
// siempre a la vista, así que la tanda nunca miente sobre cuánto hay.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { GRID_CLS } from '@/components/v2/biblioteca/biblioteca-nav';
import { cn } from '@/lib/utils';

/** Cuántas tarjetas trae cada tanda. Treinta llenan diez filas a 1440 (tres por
 *  fila) — bastante para recorrer sin que el navegador monte cien tarjetas de
 *  golpe, y múltiplo de las tres anchuras de la rejilla (1 · 2 · 3), así que
 *  ninguna tanda deja una fila coja. */
export const TARJETAS_POR_TANDA = 30;

export function PagedGrid({
  total,
  noun,
  children,
  footer,
}: {
  /** Cuántas hay tras los filtros — el conteo NO puede ser el de la tanda. */
  total: number;
  /** «bloques», «sesiones»… para el conteo. */
  noun: string;
  children: React.ReactNode[];
  /** Lo que va SIEMPRE al final de la rejilla (p. ej. la tarjeta de «nuevo»). */
  footer?: React.ReactNode;
}) {
  const [tandas, setTandas] = useState(1);

  // Al cambiar de filtro o de búsqueda se vuelve a la primera tanda: seguir en la
  // cuarta después de filtrar enseñaría un trozo del medio sin decir por qué.
  // Se ajusta DURANTE el render comparando con lo último que llegó —la forma que
  // React recomienda para sincronizar estado con props—; en un efecto pintaría un
  // fotograma con la tanda vieja. Es el mismo patrón que ya usa MensajesScreen.
  const [totalPrevio, setTotalPrevio] = useState(total);
  if (totalPrevio !== total) {
    setTotalPrevio(total);
    setTandas(1);
  }

  const visibles = children.slice(0, tandas * TARJETAS_POR_TANDA);
  const restantes = children.length - visibles.length;

  return (
    <>
      <div className={GRID_CLS}>
        {visibles}
        {restantes === 0 ? footer : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="text-xs text-[color:var(--v2-faint)]">
          <span className="v2-num">{visibles.length}</span> de{' '}
          <span className="v2-num">{total}</span> {noun}
        </p>
        {restantes > 0 ? (
          <button
            type="button"
            onClick={() => setTandas((n) => n + 1)}
            className={cn(
              'v2-focus inline-flex h-8 items-center gap-1.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] px-3 text-body font-semibold',
              'text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            <MIcon name="expand_more" size={16} />
            Ver {Math.min(restantes, TARJETAS_POR_TANDA)} más
          </button>
        ) : null}
      </div>
    </>
  );
}
