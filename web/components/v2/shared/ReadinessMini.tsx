'use client';

// Readiness de un atleta en poco sitio: valor 0–100 (sin %), tendencia de 14
// días y su base (la mediana de sus 28 días anteriores) como línea gris. Nunca
// un número sin fecha ni base (DECISIONS 2026-09-23): la fecha va al lado o en
// el tooltip, y si no hay base se dice.
//
//   <ReadinessMini readiness={row.readiness} today="2026-09-23" />            (fila, 40 px)
//   <ReadinessMini readiness={peek.readiness} today={…} size="panel" />       (vistazo / ficha)
//
// `readiness = null` → «sin datos» (no un 0).

import { Sparkline } from '@/components/v2/ui';
import { relativeDay } from '@fahybrid/shared/domain/coach/athlete-state';
import { readinessBaseText } from '@fahybrid/shared/domain/coach/readiness-evidence';
import { cn } from '@/lib/utils';
import { plusDays, shortDate } from './format';

export interface ReadinessMiniValue {
  value: number;
  baseline: number | null;
  /** 14 días, el más viejo primero (null = sin lectura). */
  trend_14d: (number | null)[];
  /** YYYY-MM-DD de la última lectura. */
  observed_at: string;
  /** Banda con los umbrales del coach, si el loader la trae. */
  band?: 'ok' | 'caution' | 'low';
  /** Lecturas previas con las que se calcula su base (para «1 de 7 lecturas»). */
  baseline_readings?: number;
}

const BAND_TEXT = { ok: 'text-v2-fg', caution: 'text-v2-warn', low: 'text-v2-danger' } as const;
const BAND_END = { ok: 'neutral', caution: 'warn', low: 'danger' } as const;

/** LA frase de la base (la misma que la evidencia de Hoy y del roster). */
function baseText(r: ReadinessMiniValue): string {
  if (r.baseline == null && r.baseline_readings == null) return 'aún sin su base';
  return readinessBaseText({ value: r.value, baseline: r.baseline, baseline_readings: r.baseline_readings ?? 0 });
}

export function ReadinessMini({
  readiness,
  today,
  size = 'row',
  className,
}: {
  readiness: ReadinessMiniValue | null;
  /** Hoy (YYYY-MM-DD) para decir «hoy», «ayer». Sin él, la fecha corta. */
  today?: string;
  size?: 'row' | 'panel';
  className?: string;
}) {
  if (!readiness) {
    return <span className={cn('t-meta text-v2-faint', className)}>sin datos</span>;
  }
  const band = readiness.band ?? 'ok';
  const when = today ? relativeDay(readiness.observed_at, today) : shortDate(readiness.observed_at);
  const base = baseText(readiness);
  const last = readiness.trend_14d.length;
  const end = today ?? readiness.observed_at;
  const labels = readiness.trend_14d.map((_, i) => shortDate(plusDays(end, i - (last - 1))));
  // Con menos de dos lecturas no hay tendencia que dibujar: un punto suelto no dice nada.
  const hasTrend = readiness.trend_14d.filter((v) => v != null).length >= 2;
  const lineBand =
    readiness.baseline != null ? { low: readiness.baseline - 0.5, high: readiness.baseline + 0.5 } : null;

  if (size === 'row') {
    return (
      <span
        className={cn('inline-flex items-center gap-2', className)}
        title={`Readiness ${readiness.value} ${when} · ${base}`}
      >
        <span className={cn('w-6 text-right t-body-sm font-semibold t-tnum', BAND_TEXT[band])}>{readiness.value}</span>
        {hasTrend ? (
          <Sparkline
            values={readiness.trend_14d}
            labels={labels}
            width={54}
            height={16}
            band={lineBand}
            endTone={BAND_END[band]}
            aria-label={`Readiness últimos 14 días, último ${readiness.value} (${when})`}
          />
        ) : (
          <span className="w-[54px] t-meta text-v2-faint">{when}</span>
        )}
      </span>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-label text-v2-faint">Readiness · 14 días</span>
        <span className="t-meta text-v2-faint">{when}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('t-num-l', BAND_TEXT[band])}>{readiness.value}</span>
        <span className="t-body-sm text-v2-muted">{base}</span>
      </div>
      {hasTrend ? (
        <Sparkline
          values={readiness.trend_14d}
          labels={labels}
          width={400}
          height={36}
          band={lineBand}
          endTone={BAND_END[band]}
          aria-label={`Readiness últimos 14 días, último ${readiness.value} (${when})`}
        />
      ) : null}
      {readiness.baseline != null && hasTrend ? (
        <span className="t-meta text-v2-faint">Línea gris = su base de 28 días</span>
      ) : null}
    </div>
  );
}
