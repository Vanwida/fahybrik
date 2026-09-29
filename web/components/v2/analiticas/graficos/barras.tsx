'use client';

// BARRAS Y CHISPAS — la tendencia de una fila (chispa), el hueco por tramo de
// una carrera (barras divergentes alrededor de cero), un reparto al 100 % con
// el objetivo del coach, y las barras simples desde cero.

import type { PuntoSerie } from '@fahybrid/shared/domain/analytics/lectura';
import type { Piel } from '../piel';
import { Leyenda, anchoRotulo, r2, textoEje, useAncho, type Muestra } from './comun';

// ---------------------------------------------------------------------------
// CHISPA — la tendencia de una fila, sin texto (el dato va al lado)
// ---------------------------------------------------------------------------

export function Chispa({
  piel,
  puntos,
  ancho = 96,
  alto = 30,
  banda = null,
  referencia = null,
  color,
  etiqueta,
}: {
  piel: Piel;
  puntos: PuntoSerie[];
  ancho?: number;
  alto?: number;
  /** La franja normal (una banda lo–hi). */
  banda?: { lo: number; hi: number } | null;
  /** Una línea fina de referencia (la basal, el objetivo) en la unidad real. */
  referencia?: number | null;
  color?: string;
  /** Si se da, la chispa es una imagen con nombre; si no, es decoración (el dato ya está al lado). */
  etiqueta?: string;
}) {
  const vals = puntos.map((p) => p.v).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals, banda?.lo ?? Infinity, referencia ?? Infinity);
  const hi = Math.max(...vals, banda?.hi ?? -Infinity, referencia ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 4;
  const x = (i: number) => r2(pad + (i / (puntos.length - 1)) * (ancho - pad * 2));
  const y = (v: number) => r2(pad + (1 - (v - lo) / span) * (alto - pad * 2));
  let d = '';
  let pluma = false;
  puntos.forEach((p, i) => {
    if (p.v == null) {
      pluma = false;
      return;
    }
    d += `${pluma ? 'L' : 'M'}${x(i)} ${y(p.v)} `;
    pluma = true;
  });
  let ultimo = puntos.length - 1;
  while (ultimo >= 0 && puntos[ultimo]!.v == null) ultimo -= 1;
  const tono = color ?? piel.tinta;
  return (
    <svg
      width={ancho}
      height={alto}
      viewBox={`0 0 ${ancho} ${alto}`}
      role={etiqueta ? 'img' : undefined}
      aria-label={etiqueta}
      aria-hidden={etiqueta ? undefined : true}
      style={{ flex: '0 0 auto', display: 'block', overflow: 'visible' }}
    >
      {banda ? <rect x={0} y={y(banda.hi)} width={ancho} height={r2(Math.max(1, y(banda.lo) - y(banda.hi)))} rx={2} fill={piel.superficie2} /> : null}
      {referencia != null ? <line x1={0} x2={ancho} y1={y(referencia)} y2={y(referencia)} stroke={piel.tinta2} strokeWidth={1} strokeDasharray="2 3" /> : null}
      <path d={d.trim()} fill="none" stroke={tono} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      {ultimo >= 0 ? <circle cx={x(ultimo)} cy={y(puntos[ultimo]!.v!)} r={4} fill={tono} stroke={piel.superficie} strokeWidth={2} /> : null}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BARRAS HORIZONTALES — el hueco por tramo de la carrera (positivo = le falta)
// ---------------------------------------------------------------------------

export function BarrasHueco({
  piel,
  filas,
  formato,
  anchoInicial = 362,
  altoFila = 30,
  anchoEtiqueta,
  etiqueta = 'Hueco por tramo',
}: {
  piel: Piel;
  filas: Array<{ id: string; etiqueta: string; valor: number | null; color: string; nota?: string }>;
  formato: (v: number) => string;
  anchoInicial?: number;
  altoFila?: number;
  anchoEtiqueta?: number;
  etiqueta?: string;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const vals = filas.map((f) => f.valor).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  const lim = Math.max(1, ...vals.map(Math.abs));
  const etiqW = anchoEtiqueta ?? Math.min(ancho * 0.42, piel.cuerpoEje * 11);
  const rotuloW = anchoRotulo(formato(-lim), piel.cuerpoEje) + 6;
  const x0 = etiqW + rotuloW;
  const x1 = ancho - rotuloW;
  const cero = r2((x0 + x1) / 2);
  const medio = (x1 - x0) / 2;
  const x = (v: number) => r2(cero + (v / lim) * medio);
  const alto = filas.length * altoFila;
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta} style={{ display: 'block', overflow: 'visible' }}>
        <line x1={cero} x2={cero} y1={0} y2={alto} stroke={piel.tinta2} strokeWidth={1} />
        {filas.map((f, i) => {
          const yc = i * altoFila + altoFila / 2;
          return (
            <g key={f.id}>
              <text x={0} y={r2(yc + piel.cuerpoEje * 0.36)} fill={piel.tinta} style={textoEje(piel)}>
                {f.etiqueta}
              </text>
              {f.valor == null ? (
                <text x={cero + 6} y={r2(yc + piel.cuerpoEje * 0.36)} fill={piel.tinta2} style={textoEje(piel)}>
                  {f.nota ?? 'sin dato'}
                </text>
              ) : (
                <>
                  <rect
                    x={r2(Math.min(cero, x(f.valor)))}
                    y={r2(yc - 7)}
                    width={r2(Math.max(2, Math.abs(x(f.valor) - cero)))}
                    height={14}
                    rx={3}
                    fill={f.color}
                  />
                  <text
                    x={f.valor >= 0 ? x(f.valor) + 6 : x(f.valor) - 6}
                    y={r2(yc + piel.cuerpoEje * 0.36)}
                    textAnchor={f.valor >= 0 ? 'start' : 'end'}
                    fill={piel.tinta}
                    style={textoEje(piel)}
                  >
                    {formato(f.valor)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// REPARTO — una barra apilada al 100 % con la marca del objetivo del coach
// ---------------------------------------------------------------------------

export function BarraReparto({
  piel,
  partes,
  objetivo = null,
  alto = 22,
}: {
  piel: Piel;
  partes: Array<{ code: string; etiqueta: string; pct: number; color: string }>;
  /** El corte del objetivo del coach, en % desde la izquierda, con su texto. */
  objetivo?: { pct: number; etiqueta: string } | null;
  alto?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', paddingTop: objetivo ? 8 : 0 }}>
        <div style={{ display: 'flex', height: alto, borderRadius: 6, overflow: 'hidden', gap: 2, background: piel.carril }}>
          {partes.map((p) => (
            <div key={p.code} style={{ width: `${Math.max(0, p.pct)}%`, background: p.color }} title={`${p.etiqueta} ${Math.round(p.pct)} %`} />
          ))}
        </div>
        {objetivo ? (
          <div aria-hidden style={{ position: 'absolute', top: 0, bottom: -4, left: `${objetivo.pct}%`, width: 2, background: piel.tinta, transform: 'translateX(-1px)' }} />
        ) : null}
      </div>
      <Leyenda
        piel={piel}
        items={[
          ...partes.map((p) => ({ etiqueta: `${p.etiqueta} ${Math.round(p.pct)} %`, muestra: 'relleno' as Muestra, color: p.color })),
          ...(objetivo ? [{ etiqueta: objetivo.etiqueta, muestra: 'linea' as Muestra, color: piel.tinta }] : []),
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BARRAS SIMPLES — una cantidad por fila, desde cero, el valor al final
// ---------------------------------------------------------------------------

export function BarrasSimples({
  piel,
  filas,
  formato,
  anchoInicial = 362,
  altoFila = 30,
  anchoEtiqueta,
  marcar,
}: {
  piel: Piel;
  filas: Array<{ id: string; etiqueta: string; valor: number; color?: string }>;
  formato: (v: number) => string;
  anchoInicial?: number;
  altoFila?: number;
  anchoEtiqueta?: number;
  /** Rótulo destacado solo en estas filas (el máximo, el mínimo). */
  marcar?: string[];
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  if (filas.length === 0) return null;
  const max = Math.max(...filas.map((f) => f.valor), 1);
  const etiqW = anchoEtiqueta ?? Math.min(ancho * 0.36, piel.cuerpoEje * 9);
  const valW = Math.max(...filas.map((f) => anchoRotulo(formato(f.valor), piel.cuerpoEje))) + 8;
  const x0 = etiqW + 8;
  const x1 = ancho - valW;
  const alto = filas.length * altoFila;
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Una cantidad por fila" style={{ display: 'block', overflow: 'visible' }}>
        {filas.map((f, i) => {
          const yc = i * altoFila + altoFila / 2;
          const w = Math.max(2, ((x1 - x0) * f.valor) / max);
          const destacada = !marcar || marcar.includes(f.id);
          return (
            <g key={f.id}>
              <text x={0} y={r2(yc + piel.cuerpoEje * 0.36)} fill={piel.tinta} style={textoEje(piel, { fontVariantNumeric: undefined })}>
                {f.etiqueta}
              </text>
              <rect x={x0} y={r2(yc - 7)} width={r2(w)} height={14} rx={3} fill={f.color ?? piel.tinta2} opacity={destacada ? 1 : 0.55} />
              <text x={r2(x0 + w + 6)} y={r2(yc + piel.cuerpoEje * 0.36)} fill={destacada ? piel.tinta : piel.tinta2} style={textoEje(piel)}>
                {formato(f.valor)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
