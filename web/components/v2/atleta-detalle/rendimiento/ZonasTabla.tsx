'use client';

// LA VISTA DE TABLA de la gráfica de zonas. No es un extra: una gráfica dice la
// forma y la tabla dice el número, y quien navega con teclado o con lector de
// pantalla llega aquí y tiene el dato entero, no un resumen.
//
// Las semanas sin dato SALEN, con su «sin datos» escrito. Filtrarlas dejaría una
// tabla que parece completa y no lo está, que es justo lo que la gráfica evita
// dejando el hueco.

import {
  formatDuration,
  formatWeekLong,
  stackOf,
  weekTotal,
  ZONE_PART_KEYS,
  ZONE_PART_LABEL,
  type ZoneWeekCell,
} from '@/lib/zones/chart';

export function ZonasTabla({ cells }: { cells: ZoneWeekCell[] }) {
  // De la más reciente hacia atrás: es el orden en el que el coach lee.
  const rows = [...cells].reverse();

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[560px] border-collapse text-xs">
        <caption className="sr-only">
          Tiempo semanal por zona de frecuencia cardiaca
        </caption>
        <thead>
          <tr className="border-b border-[color:var(--v2-border)]">
            <th scope="col" className="v2-micro py-2 pr-3 text-left font-medium">
              Semana
            </th>
            {ZONE_PART_KEYS.map((key) => (
              <th key={key} scope="col" className="v2-micro py-2 pl-3 text-right font-medium">
                {ZONE_PART_LABEL[key]}
              </th>
            ))}
            <th scope="col" className="v2-micro py-2 pl-3 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((cell) => {
            const seconds = new Map(
              (cell.week ? stackOf(cell.week) : []).map((p) => [p.key, p.seconds]),
            );
            return (
              <tr
                key={cell.week_start}
                className="border-b border-[color:var(--v2-border)] last:border-b-0"
              >
                <th
                  scope="row"
                  className="whitespace-nowrap py-1.5 pr-3 text-left font-medium text-[color:var(--v2-muted)]"
                >
                  {formatWeekLong(cell.week_start)}
                </th>
                {cell.week == null ? (
                  <td
                    colSpan={ZONE_PART_KEYS.length + 1}
                    className="py-1.5 pl-3 text-right text-[color:var(--v2-faint)]"
                  >
                    Sin datos
                  </td>
                ) : (
                  <>
                    {ZONE_PART_KEYS.map((key) => {
                      const v = seconds.get(key) ?? 0;
                      return (
                        <td
                          key={key}
                          className={
                            v > 0
                              ? 'v2-num py-1.5 pl-3 text-right text-[color:var(--v2-fg)]'
                              : 'v2-num py-1.5 pl-3 text-right text-[color:var(--v2-faint)]'
                          }
                        >
                          {v > 0 ? formatDuration(v) : '0'}
                        </td>
                      );
                    })}
                    <td className="v2-num py-1.5 pl-3 text-right font-semibold text-[color:var(--v2-fg)]">
                      {formatDuration(weekTotal(cell.week))}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
