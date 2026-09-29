'use client';

// DIVERGENTE — la frescura alrededor de cero, día a día, con la proyección en
// contorno. Hoy, relleno pleno; lo pasado, atenuado.

import { useState } from 'react';
import type { PuntoSerie } from '@fahybrid/shared/domain/analytics/lectura';
import { fechaCorta } from '@/lib/formato';
import { diasEntre, escalaBonita } from '../escala';
import type { Piel } from '../piel';
import { Tooltip, anchoRotulo, r2, textoEje, useAncho } from './comun';
import type { MarcaVertical } from './lineas';

export function Divergente({
  piel,
  alto,
  puntos,
  proyeccion = null,
  marcas = [],
  formato,
  anchoInicial = 362,
  bandas = [],
  etiqueta = 'Frescura',
}: {
  piel: Piel;
  alto: number;
  puntos: PuntoSerie[];
  proyeccion?: PuntoSerie[] | null;
  marcas?: MarcaVertical[];
  formato: (v: number) => string;
  anchoInicial?: number;
  /** Cortes de las bandas del coach que la escala tiene que abarcar. */
  bandas?: Array<{ valor: number; etiqueta: string }>;
  /** Cómo se llama lo que se pinta (para el tooltip y la accesibilidad). */
  etiqueta?: string;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const [hover, setHover] = useState<string | null>(null);
  const todos = [...puntos, ...(proyeccion ?? [])];
  if (todos.length < 2 || puntos.length === 0) return null;
  const vals = todos.map((p) => p.v).filter((v): v is number => v != null);
  const lim = Math.max(10, ...vals.map(Math.abs), ...bandas.map((b) => Math.abs(b.valor)));
  const escala = escalaBonita(-lim, lim, 3);
  const padIzq = Math.max(...escala.ticks.map((t) => anchoRotulo(formato(t), piel.cuerpoEje))) + 8;
  const x0 = padIzq;
  const x1 = ancho - 4;
  const y0 = 4;
  const y1 = alto - 4;
  const orden = todos.map((p) => p.t).sort();
  const t0 = orden[0]!;
  const dias = Math.max(1, diasEntre(t0, orden[orden.length - 1]!));
  const x = (t: string) => r2(x0 + (diasEntre(t0, t) / dias) * (x1 - x0));
  const y = (v: number) => r2(y1 - ((v - escala.min) / (escala.max - escala.min)) * (y1 - y0));
  const cero = y(0);
  const anchoBarra = Math.max(1.5, Math.min(8, ((x1 - x0) / todos.length) * 0.7));
  const hoy = puntos[puntos.length - 1]!;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={`${etiqueta} día a día`}
        style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          let mejor = orden[0]!;
          let dist = Infinity;
          for (const t of orden) {
            const d = Math.abs(x(t) - px);
            if (d < dist) {
              dist = d;
              mejor = t;
            }
          }
          setHover(mejor);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {escala.ticks.map((t) => (
          <g key={t}>
            <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} stroke={t === 0 ? piel.tinta2 : piel.rejilla} strokeWidth={1} />
            <text x={x0 - 6} y={y(t) + piel.cuerpoEje * 0.36} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
              {formato(t)}
            </text>
          </g>
        ))}
        {puntos.map((p) =>
          p.v == null ? null : (
            <rect
              key={p.t}
              x={r2(x(p.t) - anchoBarra / 2)}
              y={r2(Math.min(cero, y(p.v)))}
              width={r2(anchoBarra)}
              height={r2(Math.max(1, Math.abs(y(p.v) - cero)))}
              fill={p.t === hoy.t ? piel.tinta : piel.tinta2}
              opacity={p.t === hoy.t ? 1 : 0.55}
            />
          ),
        )}
        {(proyeccion ?? []).map((p) =>
          p.v == null ? null : (
            <rect
              key={p.t}
              x={r2(x(p.t) - anchoBarra / 2)}
              y={r2(Math.min(cero, y(p.v)))}
              width={r2(anchoBarra)}
              height={r2(Math.max(1, Math.abs(y(p.v) - cero)))}
              fill="none"
              stroke={piel.proyeccion}
              strokeWidth={1}
              opacity={0.8}
            />
          ),
        )}
        {marcas.map((m) => (
          <line key={`${m.tipo}-${m.t}`} x1={x(m.t)} x2={x(m.t)} y1={y0} y2={y1} stroke={m.tipo === 'evento' ? piel.tinta : piel.tinta2} strokeWidth={m.tipo === 'evento' ? 1.5 : 1} strokeDasharray={m.tipo === 'hoy' ? '2 3' : undefined} />
        ))}
        {hover ? <line x1={x(hover)} x2={x(hover)} y1={y0} y2={y1} stroke={piel.tinta2} strokeWidth={1} /> : null}
      </svg>
      {hover
        ? (() => {
            const p = todos.find((q) => q.t === hover);
            return p && p.v != null ? (
              <Tooltip piel={piel} x={x(hover)} ancho={ancho} titulo={fechaCorta(hover)} filas={[{ etiqueta: proyeccion?.some((q) => q.t === hover) ? `${etiqueta} prevista` : etiqueta, valor: formato(p.v) }]} />
            ) : null;
          })()
        : null}
    </div>
  );
}
