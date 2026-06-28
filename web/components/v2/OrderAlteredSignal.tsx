// order_altered — a SOFT INFO signal: the athlete COMPLETED this week's sessions
// but OUT of their planned order / on different days. It is NEVER a penalty and
// NEVER an error: adherencia counts WHETHER a due session got done, never WHEN
// within the week. So this renders in the calm `info` tone — never warn/danger,
// never red. Single-sources the icon + copy for BOTH surfaces that show it (the
// Hoy lane card chip + the athlete ficha notice) so they can never drift.

import { MIcon } from '@/components/ui/MIcon';
import { Pill } from '@/components/v2/Pill';

/** Material Symbol for "resequenced" — two vertical swap arrows. */
const ORDER_ALTERED_ICON = 'swap_vert';

/** Compact chip label for the Hoy lane card. */
const CHIP_LABEL = 'Cambió el orden';

/** Shared reassurance — it's information, not a penalty. Used as the chip's
 *  tooltip and inside the fuller ficha notice. */
const REASSURANCE =
  'Completó las sesiones de la semana en distinto orden o día del planificado. No afecta a la adherencia.';

/**
 * Tiny soft chip for a Hoy lane card. Calm `info` Pill with a reorder icon; the
 * tooltip carries the "it's fine, no penalty" reassurance. Caller renders it only
 * when the athlete's `order_altered` is true.
 */
export function OrderAlteredChip() {
  return (
    <Pill tone="info" variant="soft" title={REASSURANCE} className="shrink-0">
      <MIcon name={ORDER_ALTERED_ICON} size={13} aria-hidden />
      {CHIP_LABEL}
    </Pill>
  );
}

/**
 * Fuller calm notice for the athlete ficha (Plan actual / resumen). Same `info`
 * tone as the chip — it explains the athlete kept adherence but resequenced the
 * week, so the coach can decide whether it matters. Caller renders it only when
 * `order_altered` is true.
 */
export function OrderAlteredNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-m)] border border-[color:var(--v2-info)] bg-[color:var(--v2-info-soft)] p-3">
      <MIcon
        name={ORDER_ALTERED_ICON}
        size={18}
        className="mt-0.5 shrink-0 text-[color:var(--v2-info)]"
      />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-[color:var(--v2-fg)]">
          Cumplió, pero cambió el orden o los días
        </span>
        <span className="text-xs text-[color:var(--v2-muted)]">
          {REASSURANCE} Es solo información por si quieres tenerlo en cuenta.
        </span>
      </div>
    </div>
  );
}
