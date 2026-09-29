'use client';

// LÍNEAS — forma y fatiga con su proyección, tendencias, la previsión de una
// carrera. Eje X de fechas (días o lunes), eje Y en la unidad real de la serie.

import { useMemo, useState, type PointerEvent } from 'react';
import type { PuntoSerie } from '@fahybrid/shared/domain/analytics/lectura';
import { fechaCorta } from '@/lib/formato';
import { PASOS_TIEMPO, diasEntre, escalaBonita } from '../escala';
import type { Piel } from '../piel';
import { Clave, EjeY, Leyenda, Tooltip, anchoRotulo, r2, rotulosX, textoEje, useAncho, type Muestra } from './comun';

export interface SerieLinea {
  id: string;
  etiqueta: string;
  puntos: PuntoSerie[];
  color: string;
  trazo?: 'solido' | 'discontinuo';
  /** La continuación futura: mismo color, trazo discontinuo. */
  proyeccion?: PuntoSerie[] | null;
  /** Sombra tenue bajo la línea (una sola serie). */
  area?: boolean;
  formato?: (v: number) => string;
  /** Rótulo directo al final. */
  rotuloFinal?: boolean;
}

export interface MarcaVertical {
  t: string;
  etiqueta: string;
  /** `hoy` separa pasado de proyección; `evento` es la carrera o un test. */
  tipo: 'hoy' | 'evento';
}

export function Lineas({
  piel,
  alto,
  series,
  formatoY,
  banda = null,
  referencias = [],
  marcas = [],
  invertido = false,
  desdeCero = false,
  anchoInicial = 362,
  leyenda = true,
  padY = 8,
  escalaTiempo = false,
}: {
  piel: Piel;
  alto: number;
  series: SerieLinea[];
  formatoY: (v: number) => string;
  banda?: { lo: number; hi: number; etiqueta?: string } | null;
  /** Líneas horizontales de referencia en la unidad real (el objetivo, la basal), rotuladas a la derecha. */
  referencias?: Array<{ valor: number; etiqueta: string }>;
  marcas?: MarcaVertical[];
  /** «Lo bueno arriba» para ritmos y tiempos: el número menor queda arriba. */
  invertido?: boolean;
  desdeCero?: boolean;
  anchoInicial?: number;
  leyenda?: boolean;
  padY?: number;
  /** El eje Y es un tiempo (ritmo, split, un tiempo de carrera): marcas a 15 s, 30 s, 1 min… */
  escalaTiempo?: boolean;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const [hover, setHover] = useState<string | null>(null);

  const modelo = useMemo(() => {
    const fechas = new Set<string>();
    const vals: number[] = [];
    for (const s of series) {
      for (const p of s.puntos) {
        fechas.add(p.t);
        if (p.v != null) vals.push(p.v);
      }
      for (const p of s.proyeccion ?? []) {
        fechas.add(p.t);
        if (p.v != null) vals.push(p.v);
      }
    }
    if (banda) vals.push(banda.lo, banda.hi);
    for (const r of referencias) vals.push(r.valor);
    const orden = [...fechas].sort();
    const escala = escalaBonita(Math.min(...vals), Math.max(...vals), piel.id === 'iphone' ? 4 : 5, { desdeCero, pasos: escalaTiempo ? PASOS_TIEMPO : undefined });
    return { orden, escala };
  }, [series, banda, referencias, desdeCero, piel.id, escalaTiempo]);

  const { orden, escala } = modelo;
  if (orden.length < 2) return null;

  const padIzq = Math.max(...escala.ticks.map((t) => anchoRotulo(formatoY(t), piel.cuerpoEje))) + 8;
  const padDer = 10;
  const padAbajo = piel.cuerpoEje + 10;
  const x0 = padIzq;
  const x1 = ancho - padDer;
  const y0 = padY;
  const y1 = alto - padAbajo;
  const t0 = orden[0]!;
  const dias = Math.max(1, diasEntre(t0, orden[orden.length - 1]!));
  const x = (t: string) => r2(x0 + (diasEntre(t0, t) / dias) * (x1 - x0));
  const y = (v: number) => {
    const f = (v - escala.min) / (escala.max - escala.min);
    return r2(invertido ? y0 + f * (y1 - y0) : y1 - f * (y1 - y0));
  };

  const camino = (puntos: PuntoSerie[]) => {
    let d = '';
    let pluma = false;
    for (const p of puntos) {
      if (p.v == null) {
        pluma = false;
        continue;
      }
      d += `${pluma ? 'L' : 'M'}${x(p.t)} ${y(p.v)} `;
      pluma = true;
    }
    return d.trim();
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
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
  };

  const rotulos = rotulosX(orden, x1 - x0, piel.cuerpoEje);
  const valorEn = (s: SerieLinea, t: string): number | null => {
    const p = s.puntos.find((q) => q.t === t) ?? s.proyeccion?.find((q) => q.t === t);
    return p?.v ?? null;
  };
  const hayProyeccion = series.some((s) => s.proyeccion?.length);

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {leyenda && series.length + (hayProyeccion ? 1 : 0) >= 2 ? (
        <div style={{ marginBottom: 8 }}>
          <Leyenda
            piel={piel}
            items={[
              ...series.map((s) => ({ etiqueta: s.etiqueta, muestra: (s.trazo === 'discontinuo' ? 'linea-discontinua' : 'linea') as Muestra, color: s.color })),
              ...(hayProyeccion ? [{ etiqueta: 'Proyección', muestra: 'linea-discontinua' as Muestra, color: piel.proyeccion }] : []),
            ]}
          />
        </div>
      ) : null}
      <svg
        width={ancho}
        height={alto}
        viewBox={`0 0 ${ancho} ${alto}`}
        role="img"
        aria-label={series.map((s) => s.etiqueta).join(', ')}
        style={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {banda ? <rect x={x0} y={r2(Math.min(y(banda.lo), y(banda.hi)))} width={x1 - x0} height={r2(Math.abs(y(banda.lo) - y(banda.hi)))} fill={piel.superficie2} /> : null}
        <EjeY piel={piel} escala={escala} x0={x0} x1={x1} y={y} formato={formatoY} />
        {referencias.map((r) => (
          <g key={r.etiqueta}>
            <line x1={x0} x2={x1} y1={y(r.valor)} y2={y(r.valor)} stroke={piel.tinta2} strokeWidth={1} strokeDasharray="2 3" />
            <rect x={r2(x1 - anchoRotulo(r.etiqueta, piel.cuerpoEje) - 2)} y={r2(y(r.valor) - piel.cuerpoEje - 6)} width={r2(anchoRotulo(r.etiqueta, piel.cuerpoEje) + 4)} height={r2(piel.cuerpoEje + 4)} rx={4} fill={piel.superficie} />
            <text x={x1} y={y(r.valor) - 4} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
              {r.etiqueta}
            </text>
          </g>
        ))}
        {rotulos.map((rt) => (
          <text
            key={rt.i}
            x={x(orden[rt.i]!)}
            y={alto - 2}
            textAnchor={rt.i === 0 ? 'start' : rt.i === orden.length - 1 ? 'end' : 'middle'}
            fill={piel.tinta2}
            style={textoEje(piel)}
          >
            {rt.texto}
          </text>
        ))}
        {marcas.map((m) => (
          <g key={`${m.tipo}-${m.t}`}>
            <line x1={x(m.t)} x2={x(m.t)} y1={y0} y2={y1} stroke={m.tipo === 'evento' ? piel.tinta : piel.tinta2} strokeWidth={m.tipo === 'evento' ? 1.5 : 1} strokeDasharray={m.tipo === 'hoy' ? '2 3' : undefined} />
            {/* «hoy» se rotula abajo, a la izquierda de su línea; el evento arriba, a la izquierda de la suya: no pueden pisarse. */}
            <text
              x={x(m.t) - 5}
              y={m.tipo === 'hoy' ? y1 - 4 : y0 + piel.cuerpoEje}
              fill={m.tipo === 'evento' ? piel.tinta : piel.tinta2}
              style={textoEje(piel)}
              textAnchor="end"
            >
              {m.etiqueta}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.id}>
            {s.area && s.puntos.length > 1 ? (
              <path
                d={`${camino(s.puntos)} L${x(s.puntos[s.puntos.length - 1]!.t)} ${y1} L${x(s.puntos[0]!.t)} ${y1} Z`}
                fill={s.color}
                fillOpacity={0.1}
              />
            ) : null}
            <path d={camino(s.puntos)} fill="none" stroke={s.color} strokeWidth={piel.trazo} strokeDasharray={s.trazo === 'discontinuo' ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {s.proyeccion && s.proyeccion.length > 0 && s.puntos.length > 0 ? (
              <path
                d={camino([s.puntos[s.puntos.length - 1]!, ...s.proyeccion])}
                fill="none"
                stroke={s.color}
                strokeWidth={piel.trazo}
                strokeDasharray="5 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {(() => {
              const ultimo = [...s.puntos].reverse().find((p) => p.v != null);
              if (!ultimo) return null;
              const rotulo = (s.formato ?? formatoY)(ultimo.v!);
              const w = anchoRotulo(rotulo, piel.cuerpoEje);
              return (
                <g>
                  <circle cx={x(ultimo.t)} cy={y(ultimo.v!)} r={4.5} fill={s.color} stroke={piel.superficie} strokeWidth={2} />
                  {s.rotuloFinal ? (
                    <g>
                      {/* Un halo de superficie detrás del rótulo: sin él se camufla contra la línea de «hoy» o contra la otra serie. */}
                      <rect x={r2(x(ultimo.t) - 12 - w)} y={r2(y(ultimo.v!) - piel.cuerpoEje * 1.55)} width={r2(w + 4)} height={r2(piel.cuerpoEje * 1.3)} rx={4} fill={piel.superficie} />
                      <text x={x(ultimo.t) - 10} y={y(ultimo.v!) - piel.cuerpoEje * 0.55} textAnchor="end" fill={piel.tinta} style={textoEje(piel, { fontWeight: 700 })}>
                        {rotulo}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })()}
          </g>
        ))}
        {hover ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={y0} y2={y1} stroke={piel.tinta2} strokeWidth={1} />
            {series.map((s) => {
              const v = valorEn(s, hover);
              return v == null ? null : <circle key={s.id} cx={x(hover)} cy={y(v)} r={5} fill={s.color} stroke={piel.superficie} strokeWidth={2} />;
            })}
          </g>
        ) : null}
      </svg>
      {hover ? (
        <Tooltip
          piel={piel}
          x={x(hover)}
          ancho={ancho}
          titulo={fechaCorta(hover)}
          filas={series
            .map((s) => ({ s, v: valorEn(s, hover), prevista: s.proyeccion?.some((q) => q.t === hover) ?? false }))
            .filter((p) => p.v != null)
            .map(({ s, v, prevista }) => ({
              clave: <Clave muestra={prevista ? 'linea-discontinua' : 'linea'} color={s.color} piel={piel} />,
              etiqueta: prevista ? `${s.etiqueta} prevista` : s.etiqueta,
              valor: (s.formato ?? formatoY)(v!),
            }))}
        />
      ) : null}
    </div>
  );
}
