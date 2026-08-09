'use client';

// La cadena de una secuencia, dibujada como el camino que va a recorrer el
// atleta — la MISMA espina (`web/components/plan-espina`) que ve él en su móvil
// y que sale en la nota de su coach, con los tokens del dashboard.
//
// Antes era una fila horizontal de tarjetas de 188 px separadas por flechas
// naranjas, más una barra gris de proporciones sin un solo nombre dentro. Se
// veía cuántos trozos hay; no se veía por dónde pasa el atleta. Ahora el coach
// monta la secuencia leyendo exactamente lo que su atleta va a leer: «S1-S4 ·
// Primer mes», «S5-S8 · Base 1».
//
// LA EDICIÓN NO SE TOCA: reordenar arrastrando, reordenar con los botones (que
// es el camino accesible de verdad), quitar de la cadena y añadir al final
// siguen siendo lo mismo y guardan igual. Lo que cambia es cómo se VE.
//
// Los controles cuelgan del nodo (`contenido` de la espina) en vez de estar el
// nodo dentro de un botón: un botón dentro de otro botón no es HTML válido, y
// además aquí el nodo no es una acción — las acciones son suyas.

import { MIcon } from '@/components/ui/MIcon';
import { Espina, TONOS_V2, TOKENS_V2, colorDelTono, type TramoEspina } from '@/components/plan-espina';
import { cn } from '@/lib/utils';
import { nodosDeCadena, type EslabonCadena, type NodoCadena } from './cadena';

/** El microciclo que falta se pinta como lo que es: un error que hay que quitar. */
const COLOR_FALTA = 'var(--v2-danger)';

export function CadenaEspina({
  eslabones,
  onMove,
  onRemove,
  onAdd,
  levelName,
  days,
}: {
  eslabones: EslabonCadena[];
  /** Intercambia con el vecino. Misma firma que antes: el editor no cambia. */
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (clave: string) => void;
  onAdd: () => void;
  levelName: string;
  days: number;
}) {
  const nodos = nodosDeCadena(eslabones);
  const tramos: TramoEspina[] = nodos.map((nodo, i) => ({
    clave: nodo.clave,
    semanas: nodo.semanas,
    titulo: nodo.titulo,
    detalle: nodo.detalle,
    color: nodo.tono === null ? COLOR_FALTA : colorDelTono(TONOS_V2, nodo.tono),
    etiqueta: nodo.etiqueta,
    contenido: (
      <Controles
        nodo={nodo}
        index={i}
        total={nodos.length}
        onMove={onMove}
        onRemove={() => onRemove(nodo.clave)}
      />
    ),
  }));

  return (
    <div>
      {nodos.length > 0 ? <Espina tokens={TOKENS_V2} tramos={tramos} /> : null}
      <Anadir onClick={onAdd} levelName={levelName} days={days} vacia={nodos.length === 0} />
    </div>
  );
}

// ── Los controles de un eslabón ───────────────────────────────────────────────

function Controles({
  nodo,
  index,
  total,
  onMove,
  onRemove,
}: {
  nodo: NodoCadena;
  index: number;
  total: number;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  // Arrastrar y soltar sobre otro eslabón: se intercambia paso a paso con el
  // vecino hasta llegar, que es la misma mecánica de `ReorderRow` y la que ya
  // entiende el guardado (el servidor deriva las posiciones del orden del array).
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const from = Number.parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!Number.isFinite(from) || from === index) return;
    const delta: -1 | 1 = from < index ? 1 : -1;
    let cur = from;
    while (cur !== index) {
      onMove(cur, delta);
      cur += delta;
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="mt-1.5 flex items-center gap-1.5"
    >
      <span
        className="shrink-0 cursor-grab select-none text-[color:var(--v2-faint)] active:cursor-grabbing"
        title="Arrastra para reordenar"
        aria-hidden
      >
        <MIcon name="drag_indicator" size={15} />
      </span>
      <BotonMover
        icono="arrow_upward"
        etiqueta={`Mover «${nodo.titulo}» antes`}
        disabled={index === 0}
        onClick={() => onMove(index, -1)}
      />
      <BotonMover
        icono="arrow_downward"
        etiqueta={`Mover «${nodo.titulo}» después`}
        disabled={index === total - 1}
        onClick={() => onMove(index, 1)}
      />
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar «${nodo.titulo}» de la cadena (no lo borra de la biblioteca)`}
        title="Quitar de la cadena (no lo borra de la biblioteca)"
        className="v2-focus inline-flex h-[22px] items-center gap-1 rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border)] px-1.5 text-label font-semibold text-[color:var(--v2-muted)] transition-colors hover:border-[color:var(--v2-danger)] hover:text-[color:var(--v2-danger)]"
      >
        <MIcon name="close" size={13} /> Quitar
      </button>
    </div>
  );
}

function BotonMover({
  icono,
  etiqueta,
  disabled,
  onClick,
}: {
  icono: string;
  etiqueta: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      className={cn(
        'v2-focus inline-flex h-[22px] w-[26px] items-center justify-center rounded-[var(--v2-r-xs)] border border-[color:var(--v2-border)] text-[color:var(--v2-faint)] transition-colors',
        disabled ? 'cursor-not-allowed opacity-30' : 'hover:text-[color:var(--v2-fg)]',
      )}
    >
      <MIcon name={icono} size={14} />
    </button>
  );
}

// ── El final de la cadena ─────────────────────────────────────────────────────

/**
 * Añadir vive al FINAL del camino y no flotando al lado: la cadena se monta en
 * orden, y el sitio donde entra el siguiente microciclo es justo debajo del
 * último.
 */
function Anadir({
  onClick,
  levelName,
  days,
  vacia,
}: {
  onClick: () => void;
  levelName: string;
  days: number;
  vacia: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="v2-focus flex w-full max-w-[460px] items-center gap-2.5 rounded-[var(--v2-r-m)] border border-dashed border-[color:var(--v2-border)] px-3 py-2.5 text-left text-[color:var(--v2-faint)] transition-colors hover:border-[color:var(--v2-accent)] hover:text-[color:var(--v2-accent)]"
    >
      <MIcon name="add" size={20} />
      <span className="flex min-w-0 flex-col">
        <span className="text-label font-bold">Añadir microciclo</span>
        {vacia ? (
          <span className="text-eyebrow font-normal leading-snug">
            Encadena microciclos para montar la periodización de {levelName} · {days} días
          </span>
        ) : null}
      </span>
    </button>
  );
}
