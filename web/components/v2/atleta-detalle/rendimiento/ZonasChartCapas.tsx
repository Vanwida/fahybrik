'use client';

// LAS CAPAS QUE VAN SOBRE (Y BAJO) LAS BARRAS.
//
// Viven aparte de `ZonasChart` porque son tres cosas que se pueden mirar sueltas
// y porque el dibujo de las barras ya tiene bastante:
//
//   · la ESPINA DEL PLAN, tumbada bajo el eje — estructura, no dato;
//   · las MARCAS del coach, bandas translúcidas con su etiqueta encima;
//   · la CAPA DE MARCADO, los botones invisibles con los que se eligen.
//
// La capa de marcado es HTML y no SVG a propósito: un `<button>` de verdad se
// tabula, se anuncia y coge el anillo de foco de la casa sin inventar nada. Un
// `<rect>` con `tabIndex` depende del navegador, y esto lo va a usar un coach
// con el teclado tanto como con el ratón.

import type { CSSProperties } from 'react';
import { RANGE_TONE_LABEL } from '@fahybrid/shared/domain/zone-chart';
import {
  formatWeekLong,
  type ZoneChartMetrics,
  type ZoneChartTokens,
  type ZonePlanBand,
  type ZoneRangeBand,
} from '@/lib/zones/chart';

/** Los cinco tonos de la espina, aquí como rampa de naranja por posición. */
const BAND_FILL_OPACITY = [0.3, 0.24, 0.18, 0.13, 0.09];
const BAND_STROKE_OPACITY = [0.75, 0.62, 0.5, 0.4, 0.32];

/** Ancho aproximado de un carácter del rótulo, para no recortar texto. */
const CHAR_W = 6.4;

/** Cuánto tiñe una marca. Muy poco a propósito: lo que tiene que leerse debajo
 *  son las barras, y una banda opaca convertiría el dato en decoración. */
const RANGO_FILL_OPACITY = 0.1;
const RANGO_STROKE_OPACITY = 0.55;

export const BAND_H = 22;

/** ¿Cabe el rótulo dentro de su hueco sin recortarlo? Si no cabe, no se pone:
 *  media palabra cortada es peor que ninguna, y el nombre sigue en el detalle. */
export function fits(text: string, width: number): boolean {
  return width > text.length * CHAR_W + 8;
}

/**
 * LAS MARCAS DEL COACH. Una banda translúcida sobre las semanas señaladas, con
 * su etiqueta arriba y en el color de su tono.
 *
 * El color lo pone el TONO y no la posición (al revés que la espina del plan):
 * aquí el color sí significa algo, porque es la única forma de distinguir de un
 * vistazo «esto hay que corregirlo» de «esto sostenlo». Qué está bien lo decide
 * el coach al elegir el tono; el sistema no opina, sólo lo pinta.
 */
export function RangoBandas({
  ranges,
  slot,
  padL,
  metrics,
  tokens,
}: {
  ranges: ZoneRangeBand[];
  slot: number;
  padL: number;
  metrics: ZoneChartMetrics;
  tokens: ZoneChartTokens;
}) {
  if (ranges.length === 0) return null;
  const alto = metrics.plotH - metrics.top;

  return (
    <g>
      {ranges.map((r) => {
        const x = padL + slot * r.from + 1;
        const w = Math.max(2, slot * (r.to - r.from + 1) - 2);
        const color = tokens.tone[r.tone];
        const tono = RANGE_TONE_LABEL[r.tone];
        const desc = [
          r.label,
          tono,
          `de la semana del ${formatWeekLong(r.week_start)} a la del ${formatWeekLong(r.week_end)}`,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <g key={r.key} role="img" aria-label={desc}>
            <title>{desc}</title>
            <rect
              x={x}
              y={metrics.top}
              width={w}
              height={alto}
              rx={4}
              fill={color}
              fillOpacity={RANGO_FILL_OPACITY}
              stroke={color}
              strokeOpacity={RANGO_STROKE_OPACITY}
              strokeWidth={1}
            />
            {metrics.compacta || !fits(r.label, w) ? null : (
              <text
                x={x + 5}
                y={metrics.top - 6}
                fontSize={12}
                fontWeight={600}
                fill={color}
              >
                {r.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * LOS BOTONES CON LOS QUE SE MARCA. Uno por semana, invisibles, del alto del
 * área de datos. El primer toque elige la semana de inicio y el segundo la de
 * fin; mientras hay una elegida, se resalta para que el coach vea desde dónde
 * está marcando.
 */
export function CapaDeMarcado({
  weeks,
  slot,
  padL,
  metrics,
  desde,
  onElegir,
}: {
  /** El lunes de cada celda, en orden. */
  weeks: string[];
  slot: number;
  padL: number;
  metrics: ZoneChartMetrics;
  /** La semana de inicio ya elegida, si el coach está a mitad de una marca. */
  desde: string | null;
  onElegir: (week_start: string) => void;
}) {
  const desdeIndex = desde ? weeks.indexOf(desde) : -1;

  return (
    <div
      className="absolute left-0 top-0 flex"
      style={{ height: metrics.plotH, paddingLeft: padL }}
      role="group"
      aria-label="Marcar un tramo de semanas"
    >
      {weeks.map((week, i) => {
        const elegida = i === desdeIndex;
        const estilo: CSSProperties = { width: slot };
        return (
          <button
            key={week}
            type="button"
            onClick={() => onElegir(week)}
            aria-pressed={elegida}
            aria-label={
              desde == null
                ? `Empezar la marca en la semana del ${formatWeekLong(week)}`
                : `Terminar la marca en la semana del ${formatWeekLong(week)}`
            }
            style={estilo}
            className={
              elegida
                ? 'v2-focus h-full shrink-0 rounded-[var(--v2-r-2xs)] bg-[color:var(--v2-accent)]/20 ring-1 ring-[color:var(--v2-accent)]'
                : 'v2-focus h-full shrink-0 rounded-[var(--v2-r-2xs)] hover:bg-[color:var(--v2-fg)]/8'
            }
          />
        );
      })}
    </div>
  );
}

/**
 * La espina del plan, tumbada bajo el eje. Tono por POSICIÓN del tramo (lo
 * resuelve `planPathTone` en el dominio, aquí sólo se escribe), relleno para lo
 * que rompe la rutina y borde entero para el tramo en el que está hoy.
 *
 * El rótulo va en tinta de texto y no en naranja: el color lo lleva la banda, y
 * un naranja sobre blanco no clava el contraste de un texto pequeño.
 */
export function PlanBand({
  bands,
  slot,
  padL,
  bandY,
  tokens,
}: {
  bands: ZonePlanBand[];
  slot: number;
  padL: number;
  bandY: number;
  tokens: ZoneChartTokens;
}) {
  const left = (i: number) => padL + slot * i + 1;
  const right = (i: number) => padL + slot * (i + 1) - 1;
  const first = bands[0]!.from;

  return (
    <g>
      {/* Lo que quedó antes de que hubiera plan se dice, no se deja en blanco */}
      {first > 0 ? (
        <g>
          <rect
            x={left(0)}
            y={bandY}
            width={Math.max(0, right(first - 1) - left(0))}
            height={BAND_H}
            rx={5}
            fill="none"
            stroke={tokens.grid}
            strokeWidth={1}
          />
          {fits('Antes del plan', right(first - 1) - left(0)) ? (
            <text
              x={(left(0) + right(first - 1)) / 2}
              y={bandY + BAND_H / 2 + 4}
              textAnchor="middle"
              fontSize={11.5}
              fill={tokens.faint}
            >
              Antes del plan
            </text>
          ) : null}
        </g>
      ) : null}

      {bands.map((band) => {
        const x = left(band.from);
        const w = Math.max(0, right(band.to) - x);
        const tone =
          ((band.tone % BAND_FILL_OPACITY.length) + BAND_FILL_OPACITY.length) %
          BAND_FILL_OPACITY.length;
        const desc = [band.weeks_label, band.title, band.detail].filter(Boolean).join(' · ');
        return (
          <g key={band.key} role="img" aria-label={desc}>
            <title>{desc}</title>
            <rect
              x={x}
              y={bandY}
              width={w}
              height={BAND_H}
              rx={5}
              fill={tokens.accent}
              fillOpacity={BAND_FILL_OPACITY[tone]}
              stroke={tokens.accent}
              strokeOpacity={band.current ? 1 : BAND_STROKE_OPACITY[tone]}
              strokeWidth={band.current ? 1.5 : 1}
            />
            {/* Rompe la rutina (un simulacro, unos tests): rombo relleno, el
                mismo lenguaje que el nodo destacado de la espina vertical */}
            {band.milestone ? (
              <rect
                x={x + 7}
                y={bandY + BAND_H / 2 - 3}
                width={6}
                height={6}
                transform={`rotate(45 ${x + 10} ${bandY + BAND_H / 2})`}
                fill={tokens.accent}
              />
            ) : null}
            {fits(band.title, w - (band.milestone ? 20 : 8)) ? (
              <text
                x={x + w / 2 + (band.milestone ? 6 : 0)}
                y={bandY + BAND_H / 2 + 4}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={600}
                fill={band.current ? tokens.fg : tokens.muted}
              >
                {band.title}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}
