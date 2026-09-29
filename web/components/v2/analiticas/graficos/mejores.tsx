'use client';

// MEJORES Y CUMPLIMIENTO — la curva de mejores esfuerzos (eje de distancia
// logarítmico, con el periodo anterior en contorno) y los puntos de una serie
// de repeticiones (dentro · menos · más de lo pedido).

import { PASOS_TIEMPO, escalaBonita } from '../escala';
import type { Piel } from '../piel';
import { EjeY, Leyenda, anchoRotulo, r2, textoEje, useAncho } from './comun';

// ---------------------------------------------------------------------------
// PUNTOS — una repetición, un punto: dentro · menos · más de lo pedido
// ---------------------------------------------------------------------------

export function PuntosCumplimiento({ piel, dentro, menos, mas, talla = 14 }: { piel: Piel; dentro: number; menos: number; mas: number; talla?: number }) {
  const celdas = [
    ...Array.from({ length: dentro }, () => ({ fill: piel.tinta, stroke: 'none' })),
    ...Array.from({ length: menos }, () => ({ fill: 'none', stroke: piel.tinta2 })),
    ...Array.from({ length: mas }, () => ({ fill: piel.tinta2, stroke: 'none' })),
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} role="img" aria-label={`${dentro} dentro, ${menos} por debajo, ${mas} por encima`}>
        {celdas.map((c, i) => (
          <span key={i} style={{ width: talla, height: talla, borderRadius: 999, background: c.fill, border: c.stroke === 'none' ? undefined : `2px solid ${c.stroke}`, boxSizing: 'border-box' }} />
        ))}
      </div>
      <Leyenda
        piel={piel}
        items={[
          { etiqueta: `${dentro} dentro`, muestra: 'punto', color: piel.tinta },
          { etiqueta: `${menos} menos de lo pedido`, muestra: 'contorno', color: piel.tinta2 },
          { etiqueta: `${mas} más de lo pedido`, muestra: 'punto', color: piel.tinta2 },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CURVA DE MEJORES ESFUERZOS — eje de distancia logarítmico, con el periodo
// anterior en contorno y el hueco entre las dos como progreso
// ---------------------------------------------------------------------------

export function CurvaMejores({
  piel,
  alto,
  hoy,
  antes,
  formatoRitmo,
  anchoInicial = 362,
  marcas = [400, 1000, 5000, 10000],
  etiquetaAntes = 'Periodo anterior',
}: {
  piel: Piel;
  alto: number;
  hoy: Array<{ metros: number; segundos: number }>;
  antes: Array<{ metros: number; segundos: number }>;
  formatoRitmo: (sKm: number) => string;
  anchoInicial?: number;
  marcas?: number[];
  etiquetaAntes?: string;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const todos = [...hoy, ...antes];
  if (hoy.length < 2) return null;
  const skm = (e: { metros: number; segundos: number }) => (e.segundos / e.metros) * 1000;
  const ritmos = todos.map(skm);
  const escala = escalaBonita(Math.min(...ritmos) - 5, Math.max(...ritmos) + 5, 4, { pasos: PASOS_TIEMPO });
  const metros = todos.map((e) => e.metros);
  const lx0 = Math.log(Math.min(...metros));
  const lx1 = Math.log(Math.max(...metros));
  const padIzq = Math.max(...escala.ticks.map((t) => anchoRotulo(formatoRitmo(t), piel.cuerpoEje))) + 8;
  const x0 = padIzq;
  const x1 = ancho - 8;
  const y0 = 6;
  const y1 = alto - piel.cuerpoEje - 10;
  const px = (m: number) => r2(x0 + ((Math.log(m) - lx0) / (lx1 - lx0 || 1)) * (x1 - x0));
  // Invertido: menos segundos por km (mejor) arriba.
  const py = (s: number) => r2(y0 + ((s - escala.min) / (escala.max - escala.min)) * (y1 - y0));
  const camino = (serie: Array<{ metros: number; segundos: number }>) => serie.map((e, i) => `${i === 0 ? 'M' : 'L'}${px(e.metros)} ${py(skm(e))}`).join(' ');
  const banda = antes.length > 1 ? `${camino(hoy)} L${[...antes].reverse().map((e) => `${px(e.metros)} ${py(skm(e))}`).join(' L')} Z` : null;
  const visibles = marcas.filter((m) => m >= Math.min(...metros) && m <= Math.max(...metros));
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {antes.length > 1 ? (
        <div style={{ marginBottom: 8 }}>
          <Leyenda piel={piel} items={[{ etiqueta: 'Esta ventana', muestra: 'linea', color: piel.tinta }, { etiqueta: etiquetaAntes, muestra: 'linea-discontinua', color: piel.tinta2 }]} />
        </div>
      ) : null}
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Mejores esfuerzos por distancia" style={{ display: 'block', overflow: 'visible' }}>
        <EjeY piel={piel} escala={escala} x0={x0} x1={x1} y={py} formato={formatoRitmo} />
        {visibles.map((m) => (
          <g key={m}>
            <line x1={px(m)} x2={px(m)} y1={y0} y2={y1} stroke={piel.rejilla} strokeWidth={1} />
            <text x={px(m)} y={alto - 2} textAnchor="middle" fill={piel.tinta2} style={textoEje(piel)}>
              {m >= 1000 ? `${m / 1000} km` : `${m} m`}
            </text>
          </g>
        ))}
        {banda ? <path d={banda} fill={piel.tinta} fillOpacity={0.08} /> : null}
        {antes.length > 1 ? <path d={camino(antes)} fill="none" stroke={piel.tinta2} strokeWidth={piel.trazo} strokeDasharray="5 4" strokeLinejoin="round" /> : null}
        <path d={camino(hoy)} fill="none" stroke={piel.tinta} strokeWidth={piel.trazo} strokeLinejoin="round" strokeLinecap="round" />
        {hoy.map((e) => (
          <circle key={e.metros} cx={px(e.metros)} cy={py(skm(e))} r={4} fill={piel.tinta} stroke={piel.superficie} strokeWidth={2} />
        ))}
      </svg>
    </div>
  );
}
