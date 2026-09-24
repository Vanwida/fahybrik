'use client';

// import-destination — DÓNDE va lo que se importa.
//
// Es la única pregunta que la fuente no puede contestar sola. En una captura pone
// «SEMANA 12» y eso no dice nada de a qué semana del microciclo que el coach está
// montando va. Cuántos DÍAS trae sí lo sabe el lector, porque las cabeceras de día
// están en la propia foto — por eso el día es opcional y no se cuenta nada.
//
// Vive aparte de `ImportSourceForm` porque lo comparten tres de sus cuatro modos y
// porque aquel se pasaba de 500 líneas.

import { Info } from 'lucide-react';
import { Select } from '@/components/v2/ui';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import type { MicroWeekRef } from '@/lib/dashboard/v2/import-review';

/** Container-week picker — shared by the paste (day) and generate (whole week) flows. */
export function WeekSelect({
  microWeeks,
  value,
  onChange,
  ariaLabel = 'Semana del programa',
}: {
  microWeeks: MicroWeekRef[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      size="lg"
      className="w-full"
      placeholder="(sin semanas)"
      disabled={microWeeks.length === 0}
      value={microWeeks.some((mw) => mw.id === value) ? value : null}
      onValueChange={onChange}
      options={microWeeks.map((mw) => ({
        value: mw.id,
        label: `Semana ${mw.index + 1}${mw.label ? ` · ${mw.label}` : ''}`,
      }))}
    />
  );
}

/**
 * El destino de una tanda de FOTOS: por qué semana empieza y, opcionalmente, por
 * qué día. Un solo control cubre un día suelto, tres días, una semana o cinco.
 */
export function ImportPhotoDestination({
  microWeeks,
  weekId,
  onWeekId,
  weekday,
  onWeekday,
}: {
  microWeeks: MicroWeekRef[];
  weekId: string;
  onWeekId: (v: string) => void;
  /** `null` = toda la semana, que es el caso normal. */
  weekday: number | null;
  onWeekday: (v: number | null) => void;
}) {
  return (
    <div className="rounded-panel border border-v2-border bg-v2-surface-2 p-3">
      <p className="t-label text-v2-faint">Dónde empieza</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <WeekSelect
          microWeeks={microWeeks}
          value={weekId}
          onChange={onWeekId}
          ariaLabel="Semana del programa por la que empieza"
        />
        {/* El día es SECUNDARIO: «toda la semana» es lo que pasa casi siempre. */}
        <Select
          aria-label="Día por el que empieza (opcional)"
          size="lg"
          className="w-full"
          value={weekday == null ? 'all' : String(weekday)}
          onValueChange={(v) => onWeekday(v === 'all' ? null : Number(v))}
          options={[
            { value: 'all', label: 'Día: toda la semana' },
            ...DAY_LABELS_FULL.map((label, i) => ({ value: String(i + 1), label: `Día: ${label}` })),
          ]}
        />
      </div>
      <p className="mt-2 t-body-sm text-v2-muted">
        Si las capturas traen más días, se colocan a partir de ahí. Luego podrás moverlo.
      </p>
      {microWeeks.length === 0 ? (
        <p className="mt-2 flex items-start gap-1.5 t-body-sm text-v2-warn">
          <Info aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
          Este programa todavía no tiene semanas: crea una y vuelve.
        </p>
      ) : null}
    </div>
  );
}
