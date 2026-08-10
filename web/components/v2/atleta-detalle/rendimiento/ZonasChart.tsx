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
// SE DIBUJA EN DOS SITIOS Y CON DOS PALETAS: la ficha del coach (`--v2-*`,
// medida grande) y dentro del móvil del atleta (`--twin-*`, medida embebida,
// tanto en la previa del compositor como en la nota que le llega). No conoce ni
// un color ni una altura: los recibe. Una copia por superficie sería la
// bifurcación de siempre — a los dos meses ya no son la misma gráfica, y la
// previa dejaría de servir para lo único que sirve.
//
// TRES DECISIONES QUE SE VEN:
//   · Una semana sin dato NO pinta barra. Deja su hueco y una marca fina BAJO la
//     línea base, donde no se puede confundir con un valor pequeño.
//   · El color de las bandas es la escala de FC del sistema (Z1 a Z5), la misma
//     del aro del reloj. El naranja no entra nunca dentro del área de datos:
//     ahí el naranja es el PLAN, y estructura y dato no se mezclan.
//   · Rótulo directo sólo en los dos extremos (el pico y la última semana con
//     dato). Un número sobre cada barra no lo lee nadie.

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  CHART_PAD_R,
  chartLayout,
  formatDuration,
  formatWeekShort,
  stackOf,
  tickStride,
  weekBreakdown,
  weekTotal,
  ZONE_METRICS_FULL,
  ZONE_TOKENS_V2,
  zoneScale,
  type ZoneChartMetrics,
  type ZoneChartTokens,
  type ZonePlanBand,
  type ZoneRangeBand,
  type ZoneWeekCell,
} from '@/lib/zones/chart';
import { BAND_H, CapaDeMarcado, PlanBand, RangoBandas } from './ZonasChartCapas';

const BOTTOM_PAD = 6;

/** Los números del eje, en la mono de la superficie que esté dibujando. Tabular
 *  para que las horas no bailen de una marca a la siguiente. */
const NUMERO = (tokens: ZoneChartTokens): CSSProperties => ({
  fontFamily: tokens.fontMono,
  fontVariantNumeric: 'tabular-nums',
});

export function ZonasChart({
  cells,
  bands,
  ranges = [],
  ariaLabel,
  tokens = ZONE_TOKENS_V2,
  metrics = ZONE_METRICS_FULL,
  marcando = false,
  desde = null,
  onElegirSemana,
}: {
  cells: ZoneWeekCell[];
  bands: ZonePlanBand[];
  /** Las marcas del coach, ya alineadas con las celdas (`rangeBands`). */
  ranges?: ZoneRangeBand[];
  ariaLabel: string;
  tokens?: ZoneChartTokens;
  metrics?: ZoneChartMetrics;
  /** Modo «Marcar»: cada semana se puede tocar. */
  marcando?: boolean;
  /** La semana de inicio ya elegida, si hay una marca a medias. */
  desde?: string | null;
  onElegirSemana?: (week_start: string) => void;
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

  const { slot, barW, width: W } = chartLayout(boxW, n, metrics);
  const hasBands = bands.length > 0;
  const bandY = metrics.plotH + 28;
  const xLabelY = metrics.plotH + 17;
  const H = hasBands ? bandY + BAND_H + BOTTOM_PAD : metrics.plotH + (metrics.compacta ? 16 : 26);

  const scale = zoneScale(Math.max(...cells.map((c) => (c.week ? weekTotal(c.week) : 0)), 1));
  const y = (seconds: number) =>
    metrics.plotH - (seconds / scale.max) * (metrics.plotH - metrics.top);
  const cx = (i: number) => metrics.padL + slot * i + slot / 2;

  const stride = tickStride(n, metrics.maxFechas);
  const labelled = metrics.rotulaExtremos ? directLabels(cells, slot) : new Set<number>();

  return (
    <div ref={boxRef} className="overflow-x-auto overscroll-x-contain">
      <div style={{ position: 'relative', width: W }}>
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
              <rect width="6" height="6" fill={tokens.hatchBg} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={tokens.hatchLine} strokeWidth="2" />
            </pattern>
          </defs>

          {/* Rejilla y marcas del eje Y */}
          {scale.ticks.map((t) => (
            <g key={t}>
              <line
                x1={metrics.padL}
                y1={y(t)}
                x2={W - CHART_PAD_R}
                y2={y(t)}
                stroke={tokens.grid}
                strokeWidth={1}
              />
              {metrics.ejeY ? (
                <text
                  x={metrics.padL - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  style={NUMERO(tokens)}
                  fontSize={11}
                  fill={tokens.faint}
                >
                  {formatDuration(t)}
                </text>
              ) : null}
            </g>
          ))}

          {/* Las marcas van DEBAJO de las barras: lo que tiene que leerse es el
              dato, y una banda encima lo teñiría. */}
          <RangoBandas
            ranges={ranges}
            slot={slot}
            padL={metrics.padL}
            metrics={metrics}
            tokens={tokens}
          />

          {cells.map((cell, i) => (
            <Bar
              key={cell.week_start}
              cell={cell}
              x={cx(i) - barW / 2}
              w={barW}
              y={y}
              hatchId={hatchId}
              metrics={metrics}
              tokens={tokens}
              label={labelled.has(i) ? formatDuration(cellTotal(cell)) : null}
              labelX={cx(i)}
            />
          ))}

          {/* La línea base, por encima de las barras: es el suelo de todas */}
          <line
            x1={metrics.padL}
            y1={metrics.plotH}
            x2={W - CHART_PAD_R}
            y2={metrics.plotH}
            stroke={tokens.axis}
            strokeWidth={1}
          />

          {cells.map((cell, i) =>
            i % stride === 0 || i === n - 1 ? (
              <text
                key={`x-${cell.week_start}`}
                x={cx(i)}
                y={xLabelY}
                textAnchor="middle"
                style={NUMERO(tokens)}
                fontSize={metrics.compacta ? 9.5 : 11}
                fill={tokens.faint}
              >
                {formatWeekShort(cell.week_start)}
              </text>
            ) : null,
          )}

          {hasBands ? (
            <PlanBand
              bands={bands}
              slot={slot}
              padL={metrics.padL}
              bandY={bandY}
              tokens={tokens}
            />
          ) : null}
        </svg>

        {marcando && onElegirSemana ? (
          <CapaDeMarcado
            weeks={cells.map((c) => c.week_start)}
            slot={slot}
            padL={metrics.padL}
            metrics={metrics}
            desde={desde}
            onElegir={onElegirSemana}
          />
        ) : null}
      </div>
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
  metrics,
  tokens,
  label,
  labelX,
}: {
  cell: ZoneWeekCell;
  x: number;
  w: number;
  y: (seconds: number) => number;
  hatchId: string;
  metrics: ZoneChartMetrics;
  tokens: ZoneChartTokens;
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
          y1={metrics.plotH + 4}
          x2={x + w}
          y2={metrics.plotH + 4}
          stroke={tokens.axis}
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
        const yy = isTop ? top : top + metrics.segGap;
        const h = Math.max(1, bottom - yy);
        const fill = part.key === 'no_hr' ? `url(#${hatchId})` : tokens.zone[part.key];
        return isTop && h > metrics.capR ? (
          <path key={part.key} d={capPath(x, yy, w, h, metrics.capR)} fill={fill} />
        ) : (
          <rect key={part.key} x={x} y={yy} width={w} height={h} fill={fill} />
        );
      })}
      {label ? (
        <text
          x={labelX}
          y={y(total) - 7}
          textAnchor="middle"
          style={NUMERO(tokens)}
          fontSize={11.5}
          fontWeight={600}
          fill={tokens.muted}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** Barra con las esquinas de arriba redondeadas y la base cuadrada. */
function capPath(x: number, yTop: number, w: number, h: number, capR: number): string {
  const r = Math.min(capR, w / 2, h);
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
