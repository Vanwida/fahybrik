'use client';

// LA GRÁFICA DEL PULSO DE TODA LA SESIÓN — la capa que Alex pidió más alto:
// «falta la gráfica del pulso a lo largo del entreno». `Curva` (lectura-carrera)
// hace esto para el RITMO de una carrera con su franja objetivo; esta es su
// prima simplificada para el PULSO de una sesión que no tiene un solo eje que
// comparar — aquí no hay banda que dibujar, solo la media y la máxima
// marcadas, que es lo único que se pidió.
//
// El trazo puede ser RECONSTRUIDO cuando la base solo guardó el agregado por
// bloque (`senal.ts`, siempre declarado en la `procedencia` de quien llama).

import type { Muestra } from '../lectura-carrera/modelo';
import { reloj } from '../../kit-composicion/formato';

const ANCHO = 378;
const ALTO = 132;
const MARGEN = { arriba: 10, abajo: 22, izquierda: 8, derecha: 8 };
const CAJA = {
  x: MARGEN.izquierda,
  y: MARGEN.arriba,
  ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
  alto: ALTO - MARGEN.arriba - MARGEN.abajo,
};

/** Redondeado a dos decimales — servidor y cliente no pueden escribir el mismo
 *  cálculo con un dígito de diferencia sin que React cante hidratación. */
const pt = (v: number) => Math.round(v * 100) / 100;

export function GraficaPulso({
  muestras,
  mediaPpm,
  maxPpm,
  duracionS,
}: {
  muestras: Muestra[];
  /** Los reales de la sesión — se ROTULAN tal cual, nunca recalculados de la
   *  curva de abajo (que puede ser reconstruida y no exacta al ppm). */
  mediaPpm: number;
  maxPpm: number;
  duracionS: number;
}) {
  if (muestras.length < 2) return null;

  const valores = muestras.map((m) => m.v);
  // El dominio incluye SIEMPRE la media y la máxima reales, aunque la curva
  // reconstruida se quede corta: la referencia no puede caer fuera del dibujo.
  const min = Math.min(...valores, mediaPpm);
  const max = Math.max(...valores, maxPpm);
  const margen = (max - min) * 0.12 || 4;
  const dominio = { min: min - margen, max: max + margen };

  const x = (t: number) => pt(CAJA.x + (t / duracionS) * CAJA.ancho);
  const y = (v: number) => pt(CAJA.y + CAJA.alto - ((v - dominio.min) / (dominio.max - dominio.min)) * CAJA.alto);

  const camino = muestras.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m.t)},${y(m.v)}`).join(' ');
  const minutos = [0, duracionS / 2, duracionS];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <svg
        role="img"
        aria-label={`Pulso de toda la sesión: media ${Math.round(mediaPpm)} ppm, máxima ${Math.round(maxPpm)} ppm`}
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        width="100%"
        height={ALTO}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Las líneas de referencia van DEBAJO del trazo: cruzarlo es lo
            correcto, es lo que dice si el pulso estuvo por encima o por
            debajo de su media en cada tramo. */}
        <LineaReferencia y={y(maxPpm)} color="var(--twin-warning)" />
        <LineaReferencia y={y(mediaPpm)} color="var(--twin-muted)" />

        <path d={camino} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Los RÓTULOS van ENCIMA del trazo — si fueran antes, el propio
            pulso los tapaba justo cuando el trazo pasaba cerca de su media,
            que es precisamente cuando más falta hace leerlos. */}
        <RotuloReferencia y={y(maxPpm)} etiqueta={`${Math.round(maxPpm)} máx`} color="var(--twin-warning)" />
        <RotuloReferencia y={y(mediaPpm)} etiqueta={`${Math.round(mediaPpm)} media`} color="var(--twin-muted)" />
      </svg>
      {/* El eje de tiempo — pie de gráfica, suelo de 15 pt (§4.1). */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {minutos.map((t, i) => (
          <span
            key={i}
            style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'var(--twin-font-mono)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--twin-muted)',
            }}
          >
            {reloj(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineaReferencia({ y, color }: { y: number; color: string }) {
  return <line x1={CAJA.x} y1={y} x2={CAJA.x + CAJA.ancho} y2={y} stroke={color} strokeWidth={1} strokeDasharray="3 4" strokeOpacity={0.8} />;
}

function RotuloReferencia({ y, etiqueta, color }: { y: number; etiqueta: string; color: string }) {
  // Un halo sólido detrás del rótulo: sin él, «156 media» se camufla contra
  // el propio trazo del pulso justo cuando la curva pasa cerca de su línea —
  // que es precisamente cuando más falta hace leerlo.
  const anchoHalo = etiqueta.length * 8.6 + 8;
  return (
    <g>
      <rect
        x={pt(CAJA.x + CAJA.ancho - anchoHalo)}
        y={pt(y - 17)}
        width={pt(anchoHalo)}
        height={16}
        rx={4}
        fill="var(--twin-surface)"
      />
      <text
        x={CAJA.x + CAJA.ancho}
        y={pt(y - 4)}
        textAnchor="end"
        style={{ font: '700 15px var(--twin-font-mono)', fill: color, fontVariantNumeric: 'tabular-nums' }}
      >
        {etiqueta}
      </text>
    </g>
  );
}
