'use client';

// COLUMNAS — por semana: plan (contorno) frente a hecho (relleno, apilado por
// familia o por zona). La semana en curso lleva el plan a trazos.

import { useState } from 'react';
import { fechaCorta } from '@/lib/formato';
import { escalaBonita } from '../escala';
import type { Piel } from '../piel';
import { Clave, EjeY, Leyenda, Tooltip, anchoRotulo, r2, rotulosX, textoEje, useAncho, type Muestra } from './comun';

export interface Cubo {
  t: string;
  /** El plan de ese cubo, en la unidad del eje. Null = sin plan. */
  plan: number | null;
  /** Lo hecho, por partes apiladas (familias o zonas). Vacío = nada hecho. */
  partes: Array<{ code: string; etiqueta: string; valor: number; color: string }>;
  /** True si el cubo es el actual (en curso). */
  enCurso?: boolean;
}

export function Columnas({
  piel,
  alto,
  cubos,
  formatoY,
  leyenda,
  anchoInicial = 362,
  etiquetaPlan = 'Plan',
  objetivo = null,
  divisor = 1,
  tituloCubo = (t) => `Semana del ${fechaCorta(t)}`,
}: {
  piel: Piel;
  alto: number;
  cubos: Cubo[];
  formatoY: (v: number) => string;
  /** Las partes (familias o zonas) para la leyenda, en orden de apilado. */
  leyenda: Array<{ etiqueta: string; color: string }>;
  anchoInicial?: number;
  etiquetaPlan?: string;
  /** Una línea horizontal de referencia (la media del periodo anterior). */
  objetivo?: { valor: number; etiqueta: string } | null;
  /** La escala se hace «bonita» en la unidad dividida (3600 para horas desde segundos): marcas a 0, 3, 6, 9 h y no a 2,78 h. */
  divisor?: number;
  /** El título del tooltip de un cubo (por defecto, «Semana del 8 jul»). */
  tituloCubo?: (t: string) => string;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const [hover, setHover] = useState<number | null>(null);
  if (cubos.length === 0) return null;

  const totales = cubos.map((c) => c.partes.reduce((a, p) => a + p.valor, 0));
  const maximo = Math.max(...totales, ...cubos.map((c) => c.plan ?? 0), objetivo?.valor ?? 0, divisor);
  const bonita = escalaBonita(0, maximo / divisor, piel.id === 'iphone' ? 4 : 5, { desdeCero: true });
  const escala = { min: bonita.min * divisor, max: bonita.max * divisor, ticks: bonita.ticks.map((t) => t * divisor) };
  const padIzq = Math.max(...escala.ticks.map((t) => anchoRotulo(formatoY(t), piel.cuerpoEje))) + 8;
  const padDer = 4;
  const padAbajo = piel.cuerpoEje + 10;
  const x0 = padIzq;
  const x1 = ancho - padDer;
  const y0 = 6;
  const y1 = alto - padAbajo;
  const y = (v: number) => r2(y1 - ((v - escala.min) / (escala.max - escala.min)) * (y1 - y0));
  const ranura = (x1 - x0) / cubos.length;
  const anchoBarra = Math.min(24, Math.max(4, ranura * 0.62));
  const xc = (i: number) => r2(x0 + ranura * (i + 0.5));
  const hayPlan = cubos.some((c) => c.plan != null);
  const HUECO = 2;

  const fechas = cubos.map((c) => c.t);
  const rotulos = rotulosX(fechas, x1 - x0, piel.cuerpoEje);
  const h = hover != null ? cubos[hover]! : null;
  const anchoObjetivo = objetivo ? anchoRotulo(objetivo.etiqueta, piel.cuerpoEje) : 0;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div style={{ marginBottom: 8 }}>
        <Leyenda
          piel={piel}
          items={[
            ...(hayPlan ? [{ etiqueta: etiquetaPlan, muestra: 'contorno' as Muestra, color: piel.plan }] : []),
            ...leyenda.map((l) => ({ etiqueta: l.etiqueta, muestra: 'relleno' as Muestra, color: l.color })),
          ]}
        />
      </div>
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={`${cubos.length} periodos, ${hayPlan ? 'plan frente a hecho' : 'hecho'}`}
        style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const i = Math.floor((px - x0) / ranura);
          setHover(i >= 0 && i < cubos.length ? i : null);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <EjeY piel={piel} escala={escala} x0={x0} x1={x1} y={y} formato={formatoY} />
        {cubos.map((c, i) => {
          const cx = xc(i);
          let acumulado = 0;
          const activo = hover === i;
          return (
            <g key={c.t} opacity={hover != null && !activo ? 0.55 : 1}>
              {c.plan != null && c.plan > 0 ? (
                <rect
                  x={r2(cx - anchoBarra / 2 - 2)}
                  y={y(c.plan)}
                  width={r2(anchoBarra + 4)}
                  height={r2(Math.max(0, y1 - y(c.plan)))}
                  rx={4}
                  fill="none"
                  stroke={piel.plan}
                  strokeWidth={1.5}
                  strokeDasharray={c.enCurso ? '3 3' : undefined}
                />
              ) : null}
              {c.partes
                .filter((p) => p.valor > 0)
                .map((p, k, arr) => {
                  const yTop = y(acumulado + p.valor);
                  const yBase = y(acumulado);
                  acumulado += p.valor;
                  const esUltima = k === arr.length - 1;
                  const altoParte = Math.max(0, yBase - yTop - (k > 0 ? HUECO : 0));
                  return (
                    <rect
                      key={p.code}
                      x={r2(cx - anchoBarra / 2)}
                      y={r2(yTop)}
                      width={r2(anchoBarra)}
                      height={r2(altoParte)}
                      rx={esUltima ? 4 : 0}
                      fill={p.color}
                    />
                  );
                })}
            </g>
          );
        })}
        {objetivo ? (
          <g>
            {/* La referencia va ENCIMA de las barras y su rótulo con halo, a la izquierda: pisar la última barra lo hacía ilegible. */}
            <line x1={x0} x2={x1} y1={y(objetivo.valor)} y2={y(objetivo.valor)} stroke={piel.tinta2} strokeWidth={1.5} />
            <rect x={r2(x0 + 2)} y={r2(y(objetivo.valor) - piel.cuerpoEje - 7)} width={r2(anchoObjetivo + 4)} height={r2(piel.cuerpoEje + 5)} rx={4} fill={piel.superficie} />
            <text x={r2(x0 + 4)} y={y(objetivo.valor) - 5} textAnchor="start" fill={piel.tinta2} style={textoEje(piel)}>
              {objetivo.etiqueta}
            </text>
          </g>
        ) : null}
        {rotulos.map((rt) => (
          <text key={rt.i} x={xc(rt.i)} y={alto - 2} textAnchor={rt.i === 0 ? 'start' : rt.i === cubos.length - 1 ? 'end' : 'middle'} fill={piel.tinta2} style={textoEje(piel)}>
            {rt.texto}
          </text>
        ))}
      </svg>
      {h && hover != null ? (
        <Tooltip
          piel={piel}
          x={xc(hover)}
          ancho={ancho}
          titulo={tituloCubo(h.t)}
          filas={[
            ...(h.plan != null ? [{ clave: <Clave muestra="contorno" color={piel.plan} piel={piel} />, etiqueta: etiquetaPlan, valor: formatoY(h.plan) }] : []),
            { etiqueta: 'Hecho', valor: formatoY(totales[hover]!) },
            ...h.partes.filter((p) => p.valor > 0).map((p) => ({ clave: <Clave muestra="relleno" color={p.color} piel={piel} />, etiqueta: p.etiqueta, valor: formatoY(p.valor) })),
          ]}
        />
      ) : null}
    </div>
  );
}
