'use client';

// DecisionStrip — la tira de decisiones de Hoy: cabecera (icono · rótulo ·
// contador · salida opcional) y las tarjetas.
//
// EXISTE PORQUE ERA LA MISMA TIRA ESCRITA CINCO VECES (altas sin revisar, nivel
// sugerido, asignación sugerida, siguiente microciclo, ajuste de semana). Cinco
// copias del mismo encabezado y del mismo carril: muy por encima del umbral de
// extraer. Ahora un arreglo llega a las cinco a la vez — y el que sigue nace bien.
//
// Y ARREGLA LO QUE MEDÍA MAL: las tiras eran carriles horizontales SIEMPRE. Con
// tres tarjetas está bien; con veinte altas pendientes el coach deslizaba veinte
// veces y la tira ni siquiera decía cuántas había (medido en el roster de 100:
// «asignación sugerida · 103» con veinte páginas de puntos). Un carril esconde su
// propio tamaño, que es justo lo contrario de lo que hace una bandeja.
//
// La regla: hasta un puñado, carril (es cómodo y no ocupa alto). A partir de ahí
// se reparte en varias líneas y se corta, con una salida que dice cuántas quedan.

import { useState } from 'react';
import { MIcon } from '@/components/ui/MIcon';
import { Rail } from '@/components/v2/Rail';

/** Hasta aquí la tira es un carril: a 1440 caben sin deslizar y no roba alto al
 *  tablero. Pasando de aquí, deslizar deja de ser cómodo y pasa a esconder. */
const TARJETAS_EN_CARRIL = 4;

/** Cuántas se enseñan cuando la tira ya no es un carril. Ocho llenan dos líneas a
 *  1440 y siguen dejando sitio al tablero; el resto se pide. */
const TARJETAS_ANTES_DE_CORTAR = 8;

export function DecisionStrip({
  icon,
  label,
  count,
  action,
  children,
}: {
  icon: string;
  label: string;
  /** Cuántas hay DE VERDAD — el corte no puede mentir sobre el tamaño de la cola. */
  count: number;
  /** Salida opcional de la cabecera («Ver todas»). */
  action?: React.ReactNode;
  children: React.ReactNode[];
}) {
  const [expandida, setExpandida] = useState(false);
  if (count === 0) return null;

  const enCarril = count <= TARJETAS_EN_CARRIL;
  const visibles = enCarril || expandida ? children : children.slice(0, TARJETAS_ANTES_DE_CORTAR);
  const restantes = count - visibles.length;

  return (
    <section aria-label={label} className="mt-4">
      <div className="mb-2 flex items-center gap-2">
        <MIcon name={icon} size={16} className="text-[color:var(--v2-accent)]" />
        <span className="v2-micro">{label}</span>
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-eyebrow font-bold"
          style={{ background: 'var(--v2-accent-soft)', color: 'var(--v2-accent)' }}
        >
          {count}
        </span>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>

      <Rail wrap={!enCarril}>{visibles}</Rail>

      {restantes > 0 ? (
        <button
          type="button"
          onClick={() => setExpandida(true)}
          className="v2-focus mt-1.5 rounded-[var(--v2-r-pill)] px-1.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:text-[color:var(--v2-fg)]"
        >
          + {restantes} más
        </button>
      ) : null}
    </section>
  );
}
