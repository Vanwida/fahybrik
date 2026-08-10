'use client';

// DE QUÉ DOS PERIODOS HABLAMOS — el editor a medida, uno solo para los dos sitios
// donde se eligen: el mando «Comparar» de la ficha y la sección con forma de
// comparativa del compositor. Con una copia por sitio, el ajuste al lunes o el
// catálogo de largos acabarían siendo distintos en cada punta y el coach
// aprobaría un periodo que después no se guarda igual.
//
// LA FECHA SE AJUSTA AL LUNES en cuanto se escribe, y no al guardar. La
// agregación trunca por semana: un martes sumaría una primera semana a medias en
// un lado y entera en el otro, y eso no se ve — se cuela.
//
// LOS DOS LADOS MIDEN LO MISMO y por eso hay un solo selector de largo. No es
// ahorro de campos: catorce semanas le ganan a diez siempre.

import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import { COMPARE_WINDOWS, type ParDePeriodos } from '@/lib/zones/comparativa';
import { formatWeekLong, mondayOf } from '@/lib/zones/chart';
import { finDeComparacion } from '@fahybrid/shared/domain/zone-compare';

export function SelectorDePeriodos({
  periodos,
  idp,
  onCambiar,
}: {
  periodos: ParDePeriodos;
  /** Prefijo para los ids de los campos, cuando hay varios en la misma pantalla. */
  idp: string;
  onCambiar: (siguiente: ParDePeriodos) => void;
}) {
  const cambiar = (patch: Partial<ParDePeriodos>) => {
    const next = { ...periodos, ...patch };
    onCambiar({
      ...next,
      a_start: mondayOf(next.a_start),
      b_start: mondayOf(next.b_start),
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-3">
        <CampoFecha
          id={`${idp}-a`}
          etiqueta="El antes empieza"
          value={periodos.a_start}
          onChange={(a_start) => cambiar({ a_start })}
        />
        <CampoFecha
          id={`${idp}-b`}
          etiqueta="El después empieza"
          value={periodos.b_start}
          onChange={(b_start) => cambiar({ b_start })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="v2-micro">De cuánto es cada lado</span>
        <ChipGroup
          options={COMPARE_WINDOWS.map((w) => ({ value: String(w.weeks), label: w.label }))}
          value={String(periodos.weeks)}
          onChange={(v) => cambiar({ weeks: Number(v) })}
          ariaLabel="De cuántas semanas es cada periodo"
          mono={false}
        />
      </div>

      <p className="text-label text-[color:var(--v2-faint)]">
        {resumen(periodos)} Los dos lados miden lo mismo a propósito: con ventanas distintas, el
        total diría que el calendario es más largo, no que ha entrenado más.
      </p>
    </div>
  );
}

/** De cuándo a cuándo va cada lado, en palabras. Es lo que deja ver de un vistazo
 *  que la fecha se ajustó al lunes sin tener que releer el campo. */
function resumen(p: ParDePeriodos): string {
  const finA = formatWeekLong(finDeComparacion(p.a_start, p.weeks));
  const finB = formatWeekLong(finDeComparacion(p.b_start, p.weeks));
  return `Antes: de la semana del ${formatWeekLong(p.a_start)} a la del ${finA}. Después: de la del ${formatWeekLong(p.b_start)} a la del ${finB}.`;
}

function CampoFecha({
  id,
  etiqueta,
  value,
  onChange,
}: {
  id: string;
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="v2-micro">
        {etiqueta}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value || value)}
        className="v2-focus v2-num h-9 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-2.5 text-body text-[color:var(--v2-fg)]"
      />
    </div>
  );
}
