'use client';

// LO COMÚN DE LOS GRÁFICOS — SVG a mano (como el resto de la casa), a escala
// REAL y con ejes de verdad. Fuera las series normalizadas 0..1 sin eje (P21).
//
// LO QUE TODOS CUMPLEN (skill dataviz + CONTRATO-UI §4):
//   · El texto del gráfico (ejes, leyenda, rótulos) va en tokens de texto
//     (tinta2), NUNCA en el color de la serie; la identidad la da la marca de
//     al lado. Cuerpo: el de la piel (12 px en el panel · 15 pt en el iPhone).
//   · Rejilla y ejes: una línea fina, SÓLIDA, un paso por encima de la
//     superficie. El trazo discontinuo se reserva a la proyección.
//   · Líneas de 2 px, marcadores ≥ 8 px con anillo de superficie, barras
//     ≤ 24 px con el extremo redondeado y hueco de 2 px entre segmentos.
//   · Rótulo directo SOLO donde importa (el último punto, el extremo).
//   · Leyenda siempre que haya ≥ 2 series; ninguna con una sola.
//   · Capa de hover por defecto: crosshair + valor en líneas, valor por marca
//     en barras. El dedo hace lo mismo que el ratón.
//   · El plan es CONTORNO; lo hecho, RELLENO; la proyección, DISCONTINUA.
//   · Un dato a null es un hueco: la línea se corta, la barra no se pinta.
//
// El ancho se MIDE (ResizeObserver): un SVG con viewBox estirado escalaría la
// tipografía y rompería el suelo.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fechaCorta, mesCorto } from '@/lib/formato';
import { diasEntre, type Escala } from '../escala';
import type { Piel } from '../piel';

/** El ancho real del contenedor; `inicial` sirve para el render de servidor. */
export function useAncho<T extends HTMLElement>(inicial: number): { ref: React.RefObject<T | null>; ancho: number } {
  const ref = useRef<T | null>(null);
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const w = el.clientWidth;
      if (w > 0) setAncho(w);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ancho };
}

export const r2 = (n: number) => Math.round(n * 100) / 100;

export function textoEje(piel: Piel, extra?: CSSProperties): CSSProperties {
  return {
    font: `600 ${piel.cuerpoEje}px/1 ${piel.fuente}`,
    fontVariantNumeric: 'tabular-nums',
    ...extra,
  };
}

/** Ancho estimado de un rótulo de eje (cifras tabulares ≈ 0,6 em). */
export function anchoRotulo(texto: string, cuerpo: number): number {
  return texto.length * cuerpo * 0.6 + 4;
}

// ---------------------------------------------------------------------------
// Leyenda
// ---------------------------------------------------------------------------

export type Muestra = 'linea' | 'linea-discontinua' | 'relleno' | 'contorno' | 'punto';

export function Leyenda({ piel, items }: { piel: Piel; items: Array<{ etiqueta: string; muestra: Muestra; color: string }> }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `6px ${piel.id === 'iphone' ? 16 : 12}px`, alignItems: 'center' }} aria-label="Leyenda">
      {items.map((it) => (
        <span key={it.etiqueta} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: piel.tinta2, font: `600 ${piel.cuerpoEtiqueta}px/1.2 ${piel.fuente}`, whiteSpace: 'nowrap' }}>
          <Clave muestra={it.muestra} color={it.color} piel={piel} />
          {it.etiqueta}
        </span>
      ))}
    </div>
  );
}

export function Clave({ muestra, color, piel }: { muestra: Muestra; color: string; piel: Piel }) {
  const w = 18;
  const h = 12;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ flex: '0 0 auto' }}>
      {muestra === 'linea' && <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke={color} strokeWidth={piel.trazo} strokeLinecap="round" />}
      {muestra === 'linea-discontinua' && <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke={color} strokeWidth={piel.trazo} strokeDasharray="4 3" strokeLinecap="round" />}
      {muestra === 'relleno' && <rect x={0} y={0} width={w} height={h} rx={3} fill={color} />}
      {muestra === 'contorno' && <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={3} fill="none" stroke={color} strokeWidth={1.5} />}
      {muestra === 'punto' && <circle cx={w / 2} cy={h / 2} r={4} fill={color} />}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tooltip — HTML sobre el SVG, en la tipografía de la piel
// ---------------------------------------------------------------------------

export function Tooltip({ piel, x, ancho, titulo, filas }: { piel: Piel; x: number; ancho: number; titulo: string; filas: Array<{ clave?: ReactNode; etiqueta: string; valor: string }> }) {
  const aLaDerecha = x < ancho / 2;
  return (
    <div
      role="presentation"
      style={{
        position: 'absolute',
        top: 0,
        left: aLaDerecha ? x + 10 : undefined,
        right: aLaDerecha ? undefined : ancho - x + 10,
        maxWidth: Math.max(120, ancho / 2 - 12),
        padding: '8px 10px',
        borderRadius: 10,
        background: piel.superficie2,
        color: piel.tinta,
        font: `500 ${piel.cuerpoEtiqueta}px/1.3 ${piel.fuente}`,
        boxShadow: piel.sombra,
        pointerEvents: 'none',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: piel.tinta2, fontWeight: 600 }}>{titulo}</span>
      {filas.map((f, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {f.clave}
          <span style={{ color: piel.tinta2 }}>{f.etiqueta}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, marginLeft: 'auto' }}>{f.valor}</span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ejes
// ---------------------------------------------------------------------------

export function EjeY({ piel, escala, x0, x1, y, formato }: { piel: Piel; escala: Escala; x0: number; x1: number; y: (v: number) => number; formato: (v: number) => string }) {
  return (
    <g aria-hidden>
      {escala.ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={r2(y(t))} y2={r2(y(t))} stroke={piel.rejilla} strokeWidth={1} />
          <text x={x0 - 6} y={r2(y(t)) + piel.cuerpoEje * 0.36} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
            {formato(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Una etiqueta de fecha de eje: «8 jul»; con el año (dos cifras) cuando el eje abarca casi un año o más. */
function fechaEje(iso: string, conAno: boolean): string {
  return conAno ? `${fechaCorta(iso)} ${iso.slice(2, 4)}` : fechaCorta(iso);
}

/** Qué fechas rotular en X: la primera, la última y los cambios de mes que quepan. */
export function rotulosX(fechas: string[], ancho: number, cuerpo: number): Array<{ i: number; texto: string }> {
  if (fechas.length === 0) return [];
  const conAno = fechas.length > 1 && diasEntre(fechas[0]!, fechas[fechas.length - 1]!) > 330;
  const minSep = cuerpo * 4.2;
  // El último rótulo («28 sep») se ancla a la derecha y crece hacia la izquierda: pide más sitio.
  const minSepUltimo = cuerpo * (conAno ? 8 : 6.5);
  const out: Array<{ i: number; texto: string }> = [{ i: 0, texto: fechaEje(fechas[0]!, conAno) }];
  const paso = ancho / Math.max(1, fechas.length - 1);
  for (let i = 1; i < fechas.length - 1; i++) {
    const esMes = fechas[i]!.slice(8, 10) <= '07' && fechas[i]!.slice(5, 7) !== fechas[i - 1]!.slice(5, 7);
    if (!esMes) continue;
    const ultimo = out[out.length - 1]!;
    if ((i - ultimo.i) * paso < (ultimo.i === 0 ? minSepUltimo : minSep)) continue;
    if ((fechas.length - 1 - i) * paso < minSepUltimo) continue;
    out.push({ i, texto: mesCorto(fechas[i]!) });
  }
  if (fechas.length > 1) out.push({ i: fechas.length - 1, texto: fechaEje(fechas[fechas.length - 1]!, conAno) });
  return out;
}
