'use client';

// AthletePreviewLine — «El atleta ve», ahora como BARRA FIJA al pie del
// compositor (rediseño del editor de microciclos): la frase exacta que verá el
// atleta, generada de la prescripción tipada, siempre a la vista y actualizada
// en vivo con cada cambio, junto al «Guardar bloque». Si esa frase no se
// entiende en el box a la primera, la dosis está mal puesta — es el contrato de
// coherencia del editor.
//
// El formateador es el compartido `prescriptionToText` (el MISMO que usan el
// drawer de sesión y las tarjetas de semana — una sola fuente, nunca
// re-implementado). Para un bloque de varios ejercicios la frase se COMPONE con
// esas mismas piezas canónicas (formatTarget / formatDuration), no con un
// segundo formateador.
//
// En la biblioteca el bloque es agnóstico del atleta (no hay perfil contra el
// que resolver un %RM); con atleta en contexto, `athleteName` titula la barra.
// TODO(model): resolver objetivos relativos (%RM / zona) a absolutos (kg /
// ritmo) con el perfil del atleta cuando esté en contexto.

import type { Prescription } from '@fahybrid/shared/domain/prescription';
import {
  formatDuration,
  formatTarget,
  prescriptionToText,
  setMeasure,
  setTarget,
  showsStationOrder,
  stationOrderLabel,
} from '@fahybrid/shared/domain/prescription';
import type { EditorBlock, EditorItem } from '@/lib/dashboard/v2/editor-types';
import { MIcon } from '@/components/ui/MIcon';

// Con más estaciones que esto, la frase entera ya no cabe en una línea legible:
// se dice el recuento (honesto) en vez de un churro truncado (la sim HYROX
// trae 16 tramos).
const MAX_STATIONS_INLINE = 6;

/** La frase del bloque entero, compuesta SOLO con los formateadores canónicos. */
function stationOrderLead(block: EditorBlock): string | null {
  if (!showsStationOrder(block.format)) return null;
  return stationOrderLabel(block.format);
}

export function blockAthleteLine(block: EditorBlock): string {
  const items = block.items;
  if (items.length === 0) return '';
  const order = stationOrderLead(block);

  if (items.length === 1) {
    const it = items[0]!;
    const line = prescriptionToText(it.prescription);
    return [order, it.exercise_name, line].filter(Boolean).join(' · ');
  }

  const head = items[0]!.prescription;

  if (head.scheme === 'superset') {
    // La rotación: una serie de cada, encadenadas; el descanso es el de la vuelta.
    const parts = items.map((it) => {
      const { rest_s: _r, ...rest } = it.prescription;
      void _r;
      return [it.exercise_name || 'ejercicio', prescriptionToText(rest as Prescription)]
        .filter(Boolean)
        .join(' ');
    });
    const rest = items[0]!.prescription.rest_s;
    const restStr = rest !== undefined && rest > 0 ? `descanso ${formatDuration(rest)}` : '';
    return [parts.join(' + '), restStr].filter(Boolean).join(' · ');
  }

  // Componentes (WOD / circuito / EMOM / sim): el lead del formato + estaciones.
  const { sets: _s, ...headNoSets } = head;
  void _s;
  const lead = prescriptionToText(headNoSets as Prescription);
  if (items.length > MAX_STATIONS_INLINE) {
    return [order, lead, `${items.length} estaciones en orden`].filter(Boolean).join(' · ');
  }
  const stations = items.map((it) => stationText(it)).filter(Boolean);
  return [order, lead, stations.join(' + ')].filter(Boolean).join(' · ');
}

function stationText(item: EditorItem): string {
  const set = item.prescription.sets?.[0];
  const measure = set ? setMeasure(set) : undefined;
  const target = set ? setTarget(set) : undefined;
  // La medida se pinta con el MISMO renderer (un set suelto = solo su medida).
  const measureText = measure
    ? prescriptionToText({ scheme: 'sets', sets: [{ measure }] })
    : '';
  const base = [measureText, item.exercise_name || 'movimiento'].filter(Boolean).join(' ');
  return target ? `${base} @ ${formatTarget(target)}` : base;
}

/**
 * La barra fija: pegada al pie del contenedor con scroll del compositor
 * (`sticky bottom-0`), con el «Guardar bloque» cuando la superficie guarda
 * desde aquí (biblioteca); en el editor del día se guarda con el día.
 */
export function AthleteSeesBar({
  block,
  athleteName,
  onSave,
}: {
  block: EditorBlock;
  athleteName?: string;
  onSave?: () => void;
}) {
  const line = blockAthleteLine(block);

  return (
    <div className="sticky bottom-0 z-10 mt-auto flex items-center gap-3 border-t border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] py-3">
      <span aria-hidden className="shrink-0 text-[color:var(--v2-accent-text)]">
        <MIcon name="visibility" size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="v2-micro mb-0.5">
          {athleteName ? `El atleta ve · ${athleteName}` : 'El atleta ve'}
        </p>
        {line ? (
          <p className="v2-num truncate text-sm font-semibold leading-snug text-[color:var(--v2-fg)]" title={line}>
            <span aria-hidden className="text-[color:var(--v2-muted)]">
              «
            </span>
            {line}
            <span aria-hidden className="text-[color:var(--v2-muted)]">
              »
            </span>
          </p>
        ) : (
          <p className="text-sm leading-snug text-[color:var(--v2-muted)]">
            Ponle la dosis y aquí sale la frase.
          </p>
        )}
      </div>
      {onSave ? (
        <button
          type="button"
          onClick={onSave}
          className="v2-focus inline-flex shrink-0 items-center gap-1.5 rounded-[var(--v2-r-pill)] bg-[color:var(--v2-accent)] px-3.5 py-2 text-xs font-bold text-[color:var(--v2-accent-fg)] transition-colors hover:bg-[color:var(--v2-accent-press)]"
        >
          <MIcon name="check" size={15} />
          Guardar bloque
        </button>
      ) : null}
    </div>
  );
}
