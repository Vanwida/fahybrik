import {
  showsStationOrder,
  stationOrderLabel,
} from '@fahybrid/shared/domain/prescription';

/** Palabra del format guardado: circuito, seguido o no lo sé. */
export function StationOrderMark({
  format,
  always = false,
}: {
  format: string | null | undefined;
  always?: boolean;
}) {
  if (!always && !showsStationOrder(format)) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-[var(--v2-r-2xs)] bg-[color:var(--v2-accent-soft)] px-1.5 py-[3px] text-nano font-extrabold lowercase leading-none tracking-wide text-[color:var(--v2-accent-text)]">
      {stationOrderLabel(format)}
    </span>
  );
}
