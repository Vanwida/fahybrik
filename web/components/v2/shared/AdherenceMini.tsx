'use client';

// Adherencia due-only (§4.2) en una línea: barra + % + ventana. Solo cuenta lo
// que ya tocaba; sin nada debido es «—» (no un 0). La barra es tinta neutra: un
// 60 % no se pinta de rojo — lo que pide acción lo dice el estado, no el color
// de una barra (§3, «no red on a healthy week»).
//
//   <AdherenceMini adherence={row.adherence_14d} />                 «▬▬▬ 75 %»
//   <AdherenceMini adherence={…} showWindow />                      «▬▬▬ 75 % · 14 d»
//   <AdherenceMini adherence={…} detail />                          «▬▬▬ 75 % · 3 de 4 debidas · 14 d»

import { Meter } from '@/components/v2/ui';
import { cn } from '@/lib/utils';

export interface AdherenceMiniValue {
  pct: number | null;
  due: number;
  done: number;
}

export function AdherenceMini({
  adherence,
  windowDays = 14,
  showWindow = false,
  detail = false,
  width = 44,
  className,
}: {
  adherence: AdherenceMiniValue | null;
  windowDays?: number;
  showWindow?: boolean;
  /** Añade «3 de 4 debidas». */
  detail?: boolean;
  width?: number;
  className?: string;
}) {
  const pct = adherence?.pct ?? null;
  const explain =
    adherence == null
      ? `Sin plan en los últimos ${windowDays} días`
      : adherence.due === 0
        ? `Nada debido en ${windowDays} días`
        : `${adherence.done} de ${adherence.due} debidas hechas · ${windowDays} días`;
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={explain}>
      <Meter
        value={pct}
        label={`Adherencia ${windowDays} días`}
        valueLabel={pct != null ? `${pct} %` : undefined}
        width={width}
      />
      {detail && adherence && adherence.due > 0 ? (
        <span className="t-meta text-v2-faint t-tnum">
          {adherence.done} de {adherence.due} debidas
        </span>
      ) : null}
      {showWindow || detail ? <span className="t-meta text-v2-faint">{windowDays} d</span> : null}
    </span>
  );
}
