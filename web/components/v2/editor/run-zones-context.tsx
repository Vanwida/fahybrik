'use client';

// La regla del ritmo (editor redesign, §4 of the mockup) — while the coach types
// a pace (or picks a zone) for a RUN segment, a strip shows where that effort
// lands inside THIS athlete's reality: his zone bands from his own test, with the
// target as a marker. Prescribing while looking at the athlete, not at a void.
//
// Context, not prop-drilling: the per-athlete day editor provides the zones; the
// LIBRARY editor provides nothing, so the ruler simply never renders there —
// a template has no athlete to be true about.

import { createContext, useContext, type ReactNode } from 'react';
import type { SegmentTarget } from '@fahybrid/shared/domain/prescription';
import { zoneSoftVar } from '@/lib/dashboard/v2/zone-view';

/** One resolved band, athlete-absolute. fast_s < slow_s; slow_s null = open (Z1). */
export interface RunZoneBand {
  code: string;
  fast_s: number;
  slow_s: number | null;
}

interface RunZonesValue {
  athlete_name: string;
  /** Slow → fast, as resolved from the athlete's run test. Empty = no profile. */
  zones: RunZoneBand[];
}

const RunZonesContext = createContext<RunZonesValue | null>(null);

export function RunZonesProvider({ value, children }: { value: RunZonesValue | null; children: ReactNode }) {
  return <RunZonesContext.Provider value={value}>{children}</RunZonesContext.Provider>;
}

function clock(totalS: number): string {
  const s = Math.max(0, Math.round(totalS));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The Z1 band is open-ended (slow_s null) — give it a finite edge for drawing. */
const OPEN_BAND_PAD_S = 60;

/**
 * El tinte de una banda sale del EJE DE ZONA compartido (`zoneSoftVar` →
 * `--v2-z1..z6-soft`), la misma escala que pintan la calculadora de zonas y las
 * tarjetas de sesión, ya resuelta para tema claro y oscuro.
 *
 * Antes eran seis `rgba()` clavados aquí, y uno era el naranja de MARCA
 * (`rgba(240,106,42,.33)`): globals.css:44 lo prohíbe como color de dato
 * ("HR zones — workout charts ONLY (orange forbidden here)") porque el naranja
 * significa "seleccionado/marca" en toda la app.
 *
 * El número de zona se lee del `code` de la banda ("Z4" → 4), no de su posición,
 * para que la regla del ritmo pinte la Z4 del atleta con el MISMO color que su
 * ficha aunque su perfil tenga cinco zonas en vez de seis.
 */
function bandTint(band: RunZoneBand, index: number): string {
  const n = Number(/^z(\d+)$/i.exec(band.code.trim())?.[1]);
  return `var(${zoneSoftVar(Number.isFinite(n) ? n : index + 1)})`;
}

/**
 * The ruler itself. Renders ONLY when the surrounding surface provided zones AND
 * the open segment targets a pace or a pace zone — RPE and FC say nothing about
 * where a pace lands, and inventing a position would be lying with pixels.
 */
export function PaceRuler({ target }: { target: SegmentTarget | null }) {
  const ctx = useContext(RunZonesContext);
  if (!ctx || ctx.zones.length === 0 || !target) return null;
  if (target.type !== 'pace' && target.type !== 'pace_zone') return null;

  // Slowest on the LEFT, fastest on the RIGHT (mockup): order by fast bound desc.
  const bands = [...ctx.zones].sort((a, b) => b.fast_s - a.fast_s);
  const slowestEdge = Math.max(...bands.map((b) => b.slow_s ?? b.fast_s + OPEN_BAND_PAD_S));
  const fastestEdge = Math.min(...bands.map((b) => b.fast_s));
  const span = Math.max(1, slowestEdge - fastestEdge);
  const positionOf = (pace_s: number): number =>
    Math.min(100, Math.max(0, ((slowestEdge - pace_s) / span) * 100));

  // Where the target sits + the caption that translates it to the athlete.
  let markerPct: number | null = null;
  let caption: string;
  if (target.type === 'pace') {
    const value = target.value_s ?? (target.min_s !== undefined && target.max_s !== undefined ? (target.min_s + target.max_s) / 2 : (target.min_s ?? target.max_s));
    if (value === undefined) return null;
    markerPct = positionOf(value);
    const band = bands.find((b) => value >= b.fast_s && value <= (b.slow_s ?? Number.POSITIVE_INFINITY));
    caption = band
      ? `${clock(value)}/km cae en su ${band.code} (${clock(band.fast_s)}–${band.slow_s ? clock(band.slow_s) : '∞'})`
      : `${clock(value)}/km queda fuera de sus zonas — más rápido que su ${bands[bands.length - 1]!.code}`;
  } else {
    const band = bands.find((b) => b.code.toUpperCase() === `Z${target.zone}`) ?? bands[Math.min(target.zone - 1, bands.length - 1)];
    if (!band) return null;
    const mid = band.slow_s ? (band.fast_s + band.slow_s) / 2 : band.fast_s + OPEN_BAND_PAD_S / 2;
    markerPct = positionOf(mid);
    caption = `${band.code} de ${ctx.athlete_name}: ${clock(band.fast_s)}–${band.slow_s ? clock(band.slow_s) : '∞'}/km`;
  }

  return (
    <div className="mt-2.5 rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.1em] text-[color:var(--v2-faint)]">
        <span>Dónde cae para {ctx.athlete_name}</span>
        <span>sus zonas reales</span>
      </div>
      <div className="relative flex h-5 overflow-hidden rounded-[6px]">
        {bands.map((b, i) => {
          const bandSpan = (b.slow_s ?? b.fast_s + OPEN_BAND_PAD_S) - b.fast_s;
          return (
            <div
              key={b.code}
              style={{ width: `${(bandSpan / span) * 100}%`, background: bandTint(b, i) }}
            />
          );
        })}
        {markerPct !== null ? (
          <div
            aria-hidden
            className="absolute bottom-0 top-0 w-[3px] rounded-full bg-[color:var(--v2-fg)]"
            style={{ left: `calc(${markerPct}% - 1.5px)` }}
          />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[color:var(--v2-faint)]">
        {bands.map((b) => (
          <span key={b.code}>
            {b.code} · {clock(b.fast_s)}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-[color:var(--v2-muted)]">{caption}</p>
    </div>
  );
}
