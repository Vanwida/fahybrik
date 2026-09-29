'use client';

// LOS GRÁFICOS DE UNA SESIÓN — el eje X es el TIEMPO de la sesión (segundos),
// no una fecha: la curva del pulso o del ritmo con la banda prescrita dibujada
// (lo que se pidió, en contorno), las líneas de referencia y el hover. Y otra
// sesión encima, a trazos, para comparar dos (el coach).

import { useState, type PointerEvent } from 'react';
import { reloj } from '@/lib/formato';
import { PASOS_TIEMPO, escalaBonita } from '../escala';
import type { Piel } from '../piel';
import { anchoRotulo, r2, textoEje, useAncho } from './comun';

export interface CurvaTiempo {
  puntos: Array<{ t: number; v: number }>;
  /** «Lo bueno arriba»: ritmos y splits invertidos. */
  invertido?: boolean;
  formato: (v: number) => string;
  /** La banda prescrita [lo, hi] en la unidad de la curva. */
  banda?: [number, number] | null;
  /** Una referencia horizontal rotulada (la media, el inicio de una zona). */
  referencias?: Array<{ valor: number; etiqueta: string }>;
  color?: string;
}

/** Marcas de tiempo redondas: cada 3, 5, 10 o 15 min según la duración; el final siempre, y la marca anterior se quita si le pisa. */
function marcasTiempo(duracion: number): number[] {
  const paso = duracion <= 900 ? 180 : duracion <= 1800 ? 300 : duracion <= 3600 ? 600 : 900;
  const out: number[] = [];
  for (let t = 0; t <= duracion; t += paso) out.push(t);
  if (out[out.length - 1] !== duracion) {
    if (duracion - out[out.length - 1]! < paso * 0.45) out.pop();
    out.push(duracion);
  }
  return out;
}

export function LineaTiempo({
  piel,
  alto,
  curva,
  duracion,
  anchoInicial = 362,
  etiqueta,
  segunda = null,
}: {
  piel: Piel;
  alto: number;
  curva: CurvaTiempo;
  duracion: number;
  anchoInicial?: number;
  etiqueta: string;
  /** Otra sesión o test encima, en contorno discontinuo: comparar dos (el coach). */
  segunda?: { puntos: Array<{ t: number; v: number }>; etiqueta: string } | null;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const [hover, setHover] = useState<number | null>(null);
  if (curva.puntos.length < 2 || duracion <= 0) return null;
  const vals = curva.puntos.map((p) => p.v);
  if (curva.banda) vals.push(curva.banda[0], curva.banda[1]);
  for (const r of curva.referencias ?? []) vals.push(r.valor);
  for (const p of segunda?.puntos ?? []) vals.push(p.v);
  // Un ritmo o un split es un tiempo: marcas a 15 s, 30 s, 1 min. El pulso y los vatios, redondos a secas.
  const escala = escalaBonita(Math.min(...vals), Math.max(...vals), 4, { pasos: curva.invertido ? PASOS_TIEMPO : undefined });
  const padIzq = Math.max(...escala.ticks.map((t) => anchoRotulo(curva.formato(t), piel.cuerpoEje))) + 8;
  const x0 = padIzq;
  const x1 = ancho - 6;
  const y0 = 8;
  const y1 = alto - piel.cuerpoEje - 10;
  const x = (t: number) => r2(x0 + (Math.min(t, duracion) / duracion) * (x1 - x0));
  const y = (v: number) => {
    const f = (v - escala.min) / (escala.max - escala.min);
    return r2(curva.invertido ? y0 + f * (y1 - y0) : y1 - f * (y1 - y0));
  };
  const camino = curva.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t)} ${y(p.v)}`).join(' ');
  const color = curva.color ?? piel.tinta;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const t = ((px - x0) / (x1 - x0)) * duracion;
    let mejor = curva.puntos[0]!;
    for (const p of curva.puntos) if (Math.abs(p.t - t) < Math.abs(mejor.t - t)) mejor = p;
    setHover(mejor.t);
  };
  const h = hover != null ? curva.puntos.find((p) => p.t === hover) : null;
  const ticksT = marcasTiempo(duracion);
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta} style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {curva.banda ? (
          <rect x={x0} y={r2(Math.min(y(curva.banda[0]), y(curva.banda[1])))} width={r2(x1 - x0)} height={r2(Math.abs(y(curva.banda[0]) - y(curva.banda[1])))} fill="none" stroke={piel.plan} strokeWidth={1.5} strokeDasharray="4 3" />
        ) : null}
        {escala.ticks.map((t) => (
          <g key={t}>
            <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke={piel.rejilla} strokeWidth={1} />
            <text x={x0 - 6} y={y(t) + piel.cuerpoEje * 0.36} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
              {curva.formato(t)}
            </text>
          </g>
        ))}
        {ticksT.map((t, i) => (
          <text key={t} x={x(t)} y={alto - 2} textAnchor={i === 0 ? 'start' : i === ticksT.length - 1 ? 'end' : 'middle'} fill={piel.tinta2} style={textoEje(piel)}>
            {reloj(t)}
          </text>
        ))}
        {(curva.referencias ?? []).map((r) => (
          <g key={r.etiqueta}>
            <line x1={x0} x2={x1} y1={y(r.valor)} y2={y(r.valor)} stroke={piel.tinta2} strokeWidth={1} />
            {/* Halo de superficie: el rótulo no puede camuflarse contra la curva justo cuando pasa por su media. */}
            <rect x={r2(x1 - anchoRotulo(r.etiqueta, piel.cuerpoEje) - 2)} y={r2(y(r.valor) - piel.cuerpoEje - 6)} width={r2(anchoRotulo(r.etiqueta, piel.cuerpoEje) + 4)} height={r2(piel.cuerpoEje + 4)} rx={4} fill={piel.superficie} />
            <text x={x1} y={y(r.valor) - 4} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
              {r.etiqueta}
            </text>
          </g>
        ))}
        {segunda && segunda.puntos.length > 1 ? (
          <path d={segunda.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t)} ${y(p.v)}`).join(' ')} fill="none" stroke={piel.tinta2} strokeWidth={piel.trazo} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        <path d={camino} fill="none" stroke={color} strokeWidth={piel.trazo} strokeLinejoin="round" strokeLinecap="round" />
        {h ? (
          <g>
            <line x1={x(h.t)} x2={x(h.t)} y1={y0} y2={y1} stroke={piel.tinta2} strokeWidth={1} />
            <circle cx={x(h.t)} cy={y(h.v)} r={5} fill={color} stroke={piel.superficie} strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {h ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: x(h.t) < ancho / 2 ? x(h.t) + 10 : undefined,
            right: x(h.t) < ancho / 2 ? undefined : ancho - x(h.t) + 10,
            padding: '6px 10px',
            borderRadius: 10,
            background: piel.superficie2,
            color: piel.tinta,
            boxShadow: piel.sombra,
            font: `600 ${piel.cuerpoEtiqueta}px/1.3 ${piel.fuente}`,
            fontVariantNumeric: 'tabular-nums',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {reloj(h.t)} · {curva.formato(h.v)}
        </div>
      ) : null}
      {curva.banda || segunda ? (
        <div style={{ marginTop: 6, color: piel.tinta2, font: `600 ${piel.cuerpoEtiqueta}px/1.2 ${piel.fuente}`, display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
          {curva.banda ? <span>La franja a trazos es lo pedido: {curva.formato(curva.banda[0])} a {curva.formato(curva.banda[1])}</span> : null}
          {segunda ? <span>— — {segunda.etiqueta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
