'use client';

// LA GRÁFICA de tiempo en zonas: barras apiladas por semana, y debajo del eje la
// espina del plan tumbada. SVG a mano, como el resto de las gráficas de la casa
// (no hay librería y no se añade una para dibujar rectángulos).
//
// LO QUE ESTA PIEZA NO HACE: contar. Toda la aritmética (qué semanas faltan, el
// techo del eje, qué celdas ocupa un tramo, cómo se escribe una duración) viene
// resuelta de `lib/zones/chart.ts`, que sí tiene tests. Aquí sólo hay geometría
// de dibujo.
//
// TRES DECISIONES QUE SE VEN:
//   · Una semana sin dato NO pinta barra. Deja su hueco y una marca fina BAJO la
//     línea base, donde no se puede confundir con un valor pequeño.
//   · El color de las bandas es la escala de FC del sistema (--z1..--z5), la
//     misma del aro del reloj. El naranja no entra nunca dentro del área de
//     datos: aquí el naranja es el PLAN, y estructura y dato no se mezclan.
//   · Rótulo directo sólo en los dos extremos (el pico y la última semana con
//     dato). Un número sobre cada barra no lo lee nadie.

import { useEffect, useId, useRef, useState } from 'react';
import {
  CHART_PAD_L,
  CHART_PAD_R,
  chartLayout,
  formatDuration,
  formatWeekShort,
  stackOf,
  tickStride,
  weekBreakdown,
  weekTotal,
  ZONE_PART_COLOR_VAR,
  zoneScale,
  type ZonePlanBand,
  type ZoneWeekCell,
} from '@/lib/zones/chart';

// ── Geometría vertical. Los anchos los reparte `chartLayout`. ─────────────────
const PAD_L = CHART_PAD_L;
const PAD_R = CHART_PAD_R;
const PLOT_H = 236; // del borde de arriba a la línea base
const TOP = 22; // aire para el rótulo directo del pico
const SEG_GAP = 2; // separador entre bandas, en color de fondo
const CAP_R = 4; // redondeo del extremo de la barra
const X_LABEL_Y = PLOT_H + 17;
const BAND_Y = PLOT_H + 28;
const BAND_H = 22;
const BOTTOM_PAD = 6;

/** Los cinco tonos de la espina, aquí como rampa de naranja por posición. */
const BAND_FILL_OPACITY = [0.3, 0.24, 0.18, 0.13, 0.09];
const BAND_STROKE_OPACITY = [0.75, 0.62, 0.5, 0.4, 0.32];

/** Ancho aproximado de un carácter del rótulo del tramo, para no recortar texto. */
const BAND_CHAR_W = 6.4;

export function ZonasChart({
  cells,
  bands,
  ariaLabel,
}: {
  cells: ZoneWeekCell[];
  bands: ZonePlanBand[];
  ariaLabel: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  const rawId = useId();
  // useId trae dos puntos y `url(#…)` no los admite en todos los navegadores.
  const hatchId = `zonas-sin-zona-${rawId.replace(/:/g, '')}`;

  // La gráfica llena el ancho disponible y sólo scrollea cuando ya no cabe con
  // semanas legibles. Medir es la única forma: el SVG no puede estirar sus barras
  // sin estirar también su tipografía.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setBoxW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = cells.length;
  if (n === 0) return null;

  const { slot, barW, width: W } = chartLayout(boxW, n);
  const hasBands = bands.length > 0;
  const H = hasBands ? BAND_Y + BAND_H + BOTTOM_PAD : PLOT_H + 26;

  const scale = zoneScale(Math.max(...cells.map((c) => (c.week ? weekTotal(c.week) : 0)), 1));
  const y = (seconds: number) => PLOT_H - (seconds / scale.max) * (PLOT_H - TOP);
  const cx = (i: number) => PAD_L + slot * i + slot / 2;

  const stride = tickStride(n);
  const labelled = directLabels(cells, slot);

  return (
    <div ref={boxRef} className="overflow-x-auto overscroll-x-contain">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="group"
        aria-label={ariaLabel}
        style={{ display: 'block' }}
      >
        <defs>
          {/* El tiempo que no se pudo repartir va rayado, no en un gris liso: un
              bloque gris se lee como «una zona más» y esto es la ausencia de una. */}
          <pattern
            id={hatchId}
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" fill="var(--v2-surface-2)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--v2-faint)" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Rejilla y marcas del eje Y */}
        {scale.ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_L}
              y1={y(t)}
              x2={W - PAD_R}
              y2={y(t)}
              stroke="var(--v2-border)"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 8}
              y={y(t) + 4}
              textAnchor="end"
              className="v2-num"
              fontSize={11}
              fill="var(--v2-faint)"
            >
              {formatDuration(t)}
            </text>
          </g>
        ))}

        {cells.map((cell, i) => (
          <Bar
            key={cell.week_start}
            cell={cell}
            x={cx(i) - barW / 2}
            w={barW}
            y={y}
            hatchId={hatchId}
            label={labelled.has(i) ? formatDuration(cellTotal(cell)) : null}
            labelX={cx(i)}
          />
        ))}

        {/* La línea base, por encima de las barras: es el suelo de todas */}
        <line
          x1={PAD_L}
          y1={PLOT_H}
          x2={W - PAD_R}
          y2={PLOT_H}
          stroke="var(--v2-border-strong)"
          strokeWidth={1}
        />

        {cells.map((cell, i) =>
          i % stride === 0 || i === n - 1 ? (
            <text
              key={`x-${cell.week_start}`}
              x={cx(i)}
              y={X_LABEL_Y}
              textAnchor="middle"
              className="v2-num"
              fontSize={11}
              fill="var(--v2-faint)"
            >
              {formatWeekShort(cell.week_start)}
            </text>
          ) : null,
        )}

        {hasBands ? <PlanBand bands={bands} slot={slot} /> : null}
      </svg>
    </div>
  );
}

function cellTotal(cell: ZoneWeekCell): number {
  return cell.week ? weekTotal(cell.week) : 0;
}

/** Distancia mínima entre dos rótulos directos para que no se pisen. Es el ancho
 *  de «13h 15m» con aire a los lados. */
const MIN_LABEL_GAP_PX = 68;

/**
 * Qué barras llevan su valor escrito encima: la más alta y la última con dato,
 * los dos extremos que el plan pide rotular. Cuando caen pegadas se queda sólo
 * el pico: dos números encima de dos barras vecinas se solapan y no se lee
 * ninguno de los dos, que es peor que no rotular.
 */
function directLabels(cells: ZoneWeekCell[], slot: number): Set<number> {
  let peak = -1;
  let peakValue = 0;
  let last = -1;
  cells.forEach((c, i) => {
    const v = cellTotal(c);
    if (v <= 0) return;
    last = i;
    if (v > peakValue) {
      peakValue = v;
      peak = i;
    }
  });

  const out = new Set<number>();
  if (peak >= 0) out.add(peak);
  if (last >= 0 && Math.abs(last - peak) * slot >= MIN_LABEL_GAP_PX) out.add(last);
  return out;
}

/** Una semana. Con dato es una pila; sin dato es una marca bajo la línea base. */
function Bar({
  cell,
  x,
  w,
  y,
  hatchId,
  label,
  labelX,
}: {
  cell: ZoneWeekCell;
  x: number;
  w: number;
  y: (seconds: number) => number;
  hatchId: string;
  label: string | null;
  labelX: number;
}) {
  const desc = weekBreakdown(cell);

  if (!cell.week) {
    return (
      <g role="img" aria-label={desc}>
        <title>{desc}</title>
        {/* BAJO la base a propósito: ahí no se puede leer como un valor pequeño */}
        <line
          x1={x}
          y1={PLOT_H + 4}
          x2={x + w}
          y2={PLOT_H + 4}
          stroke="var(--v2-border-strong)"
          strokeWidth={1.5}
        />
      </g>
    );
  }

  const parts = stackOf(cell.week);
  const total = parts.length > 0 ? parts[parts.length - 1]!.to : 0;

  return (
    <g role="img" aria-label={desc}>
      <title>{desc}</title>
      {parts.map((part, i) => {
        const top = y(part.to);
        const bottom = y(part.from);
        const isTop = i === parts.length - 1;
        // El separador se le quita por arriba a cada banda menos a la de arriba
        // del todo: así el hueco cae siempre ENTRE dos colores.
        const yy = isTop ? top : top + SEG_GAP;
        const h = Math.max(1, bottom - yy);
        const fill =
          part.key === 'no_hr' ? `url(#${hatchId})` : `var(${ZONE_PART_COLOR_VAR[part.key]})`;
        return isTop && h > CAP_R ? (
          <path key={part.key} d={capPath(x, yy, w, h)} fill={fill} />
        ) : (
          <rect key={part.key} x={x} y={yy} width={w} height={h} fill={fill} />
        );
      })}
      {label ? (
        <text
          x={labelX}
          y={y(total) - 7}
          textAnchor="middle"
          className="v2-num"
          fontSize={11.5}
          fontWeight={600}
          fill="var(--v2-muted)"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Barra con las esquinas de arriba redondeadas y la base cuadrada. */
function capPath(x: number, yTop: number, w: number, h: number): string {
  const r = Math.min(CAP_R, w / 2, h);
  return [
    `M${x} ${yTop + h}`,
    `V${yTop + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${yTop}`,
    `H${x + w - r}`,
    `A${r} ${r} 0 0 1 ${x + w} ${yTop + r}`,
    `V${yTop + h}`,
    'Z',
  ].join('');
}

/**
 * La espina del plan, tumbada bajo el eje. Tono por POSICIÓN del tramo (lo
 * resuelve `planPathTone` en el dominio, aquí sólo se escribe), relleno para lo
 * que rompe la rutina y borde entero para el tramo en el que está hoy.
 *
 * El rótulo va en tinta de texto y no en naranja: el color lo lleva la banda, y
 * un naranja sobre blanco no clava el contraste de un texto pequeño.
 */
function PlanBand({ bands, slot }: { bands: ZonePlanBand[]; slot: number }) {
  const left = (i: number) => PAD_L + slot * i + 1;
  const right = (i: number) => PAD_L + slot * (i + 1) - 1;
  const first = bands[0]!.from;

  return (
    <g>
      {/* Lo que quedó antes de que hubiera plan se dice, no se deja en blanco */}
      {first > 0 ? (
        <g>
          <rect
            x={left(0)}
            y={BAND_Y}
            width={Math.max(0, right(first - 1) - left(0))}
            height={BAND_H}
            rx={5}
            fill="none"
            stroke="var(--v2-border)"
            strokeWidth={1}
          />
          {fits('Antes del plan', right(first - 1) - left(0)) ? (
            <text
              x={(left(0) + right(first - 1)) / 2}
              y={BAND_Y + BAND_H / 2 + 4}
              textAnchor="middle"
              fontSize={11.5}
              fill="var(--v2-faint)"
            >
              Antes del plan
            </text>
          ) : null}
        </g>
      ) : null}

      {bands.map((band) => {
        const x = left(band.from);
        const w = Math.max(0, right(band.to) - x);
        const tone = ((band.tone % BAND_FILL_OPACITY.length) + BAND_FILL_OPACITY.length) %
          BAND_FILL_OPACITY.length;
        const desc = [band.weeks_label, band.title, band.detail].filter(Boolean).join(' · ');
        return (
          <g key={band.key} role="img" aria-label={desc}>
            <title>{desc}</title>
            <rect
              x={x}
              y={BAND_Y}
              width={w}
              height={BAND_H}
              rx={5}
              fill="var(--v2-accent)"
              fillOpacity={BAND_FILL_OPACITY[tone]}
              stroke="var(--v2-accent)"
              strokeOpacity={band.current ? 1 : BAND_STROKE_OPACITY[tone]}
              strokeWidth={band.current ? 1.5 : 1}
            />
            {/* Rompe la rutina (un simulacro, unos tests): rombo relleno, el
                mismo lenguaje que el nodo destacado de la espina vertical */}
            {band.milestone ? (
              <rect
                x={x + 7}
                y={BAND_Y + BAND_H / 2 - 3}
                width={6}
                height={6}
                transform={`rotate(45 ${x + 10} ${BAND_Y + BAND_H / 2})`}
                fill="var(--v2-accent)"
              />
            ) : null}
            {fits(band.title, w - (band.milestone ? 20 : 8)) ? (
              <text
                x={x + w / 2 + (band.milestone ? 6 : 0)}
                y={BAND_Y + BAND_H / 2 + 4}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={600}
                fill={band.current ? 'var(--v2-fg)' : 'var(--v2-muted)'}
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

/** ¿Cabe el rótulo dentro de la banda sin recortarlo? Si no cabe, no se pone:
 *  media palabra cortada es peor que ninguna, y el nombre sigue en el detalle. */
function fits(text: string, width: number): boolean {
  return width > text.length * BAND_CHAR_W + 8;
}
