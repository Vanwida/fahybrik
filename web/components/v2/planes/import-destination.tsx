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

import { MIcon } from '@/components/ui/MIcon';
import { DAY_LABELS_FULL } from '@/lib/dashboard/constants/calendar';
import type { MicroWeekRef } from '@/lib/dashboard/v2/import-review';

/** Container-week picker — shared by the paste (day) and generate (whole week) flows. */
export function WeekSelect({
  microWeeks,
  value,
  onChange,
  ariaLabel = 'Semana del microciclo',
}: {
  microWeeks: MicroWeekRef[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-fg)] outline-none focus:border-[color:var(--v2-accent)]"
    >
      {microWeeks.length === 0 ? (
        <option value="">— sin semanas —</option>
      ) : (
        microWeeks.map((mw) => (
          <option key={mw.id} value={mw.id}>
            Semana {mw.index + 1}
            {mw.label ? ` · ${mw.label}` : ''}
          </option>
        ))
      )}
    </select>
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
    <div className="rounded-[var(--v2-r-m)] border border-[color:var(--v2-accent)]/35 bg-[color:var(--v2-accent-soft)] p-3.5">
      <p className="v2-micro text-[color:var(--v2-accent)]">Dónde empieza</p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <WeekSelect
          microWeeks={microWeeks}
          value={weekId}
          onChange={onWeekId}
          ariaLabel="Semana del microciclo por la que empieza"
        />
        {/* El día va en trazo discontinuo porque es SECUNDARIO: vacío significa la
            semana entera, que es lo que pasa casi siempre. */}
        <select
          aria-label="Día por el que empieza (opcional)"
          value={weekday ?? ''}
          onChange={(e) => onWeekday(e.target.value ? Number(e.target.value) : null)}
          className="v2-focus w-full rounded-[var(--v2-r-s)] border border-dashed border-[color:var(--v2-border-strong)] bg-[color:var(--v2-surface-2)] px-3 py-2 text-sm font-semibold text-[color:var(--v2-muted)] outline-none focus:border-[color:var(--v2-accent)]"
        >
          <option value="">Día: toda la semana</option>
          {DAY_LABELS_FULL.map((label, i) => (
            <option key={label} value={i + 1}>
              Día: {label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2.5 text-xs leading-snug text-[color:var(--v2-muted)]">
        Si las capturas traen más días, se colocan a partir de ahí. Luego lo verás colocado y podrás
        moverlo.
      </p>
      {microWeeks.length === 0 ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-[color:var(--v2-warn)]">
          <MIcon name="info" size={14} className="mt-px shrink-0" />
          Este microciclo todavía no tiene semanas. Crea una y vuelve, que si no no hay dónde meter
          las fotos.
        </p>
      ) : null}
    </div>
  );
}
