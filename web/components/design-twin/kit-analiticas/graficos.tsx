'use client';

// LOS GRÁFICOS — SVG a mano (como el resto de la casa), a escala REAL y con
// ejes de verdad. Fuera las series normalizadas 0..1 sin eje (P21).
//
// LO QUE TODOS CUMPLEN (skill dataviz + CONTRATO-UI §4):
//   · El texto del gráfico (ejes, leyenda, rótulos) va en tokens de texto
//     (tinta2), NUNCA en el color de la serie; la identidad la da la marca de
//     al lado. Cuerpo: el de la piel (15 pt iPhone · 12 px panel).
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
// tipografía y rompería el suelo de 15 pt.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import type { PuntoSerie } from './contrato';
import { PASOS_TIEMPO, diasEntre, escalaBonita, type Escala } from './mecanismo';
import { fechaCorta, mesCorto } from '../kit-composicion/formato';
import type { Piel } from './tokens';

// ---------------------------------------------------------------------------
// Medir el ancho
// ---------------------------------------------------------------------------

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

const r2 = (n: number) => Math.round(n * 100) / 100;

function textoEje(piel: Piel, extra?: CSSProperties): CSSProperties {
  return {
    font: `600 ${piel.cuerpoEje}px/1 ${piel.fuente}`,
    fontVariantNumeric: 'tabular-nums',
    ...extra,
  };
}

/** Ancho estimado de un rótulo de eje (cifras tabulares ≈ 0,6 em). */
function anchoRotulo(texto: string, cuerpo: number): number {
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

function Clave({ muestra, color, piel }: { muestra: Muestra; color: string; piel: Piel }) {
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

function Tooltip({ piel, x, ancho, titulo, filas }: { piel: Piel; x: number; ancho: number; titulo: string; filas: Array<{ clave?: ReactNode; etiqueta: string; valor: string }> }) {
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
        boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
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

function EjeY({ piel, escala, x0, x1, y, formato }: { piel: Piel; escala: Escala; x0: number; x1: number; y: (v: number) => number; formato: (v: number) => string }) {
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

/** Qué fechas rotular en X: la primera, la última y los cambios de mes que quepan. */
function rotulosX(fechas: string[], ancho: number, cuerpo: number): Array<{ i: number; texto: string }> {
  if (fechas.length === 0) return [];
  const minSep = cuerpo * 4.2;
  // El último rótulo («28 sep») se ancla a la derecha y crece hacia la izquierda: pide más sitio.
  const minSepUltimo = cuerpo * 6.5;
  const out: Array<{ i: number; texto: string }> = [{ i: 0, texto: fechaCorta(fechas[0]!) }];
  const paso = ancho / Math.max(1, fechas.length - 1);
  for (let i = 1; i < fechas.length - 1; i++) {
    const esMes = fechas[i]!.slice(8, 10) <= '07' && fechas[i]!.slice(5, 7) !== fechas[i - 1]!.slice(5, 7);
    if (!esMes) continue;
    const ultimo = out[out.length - 1]!;
    if ((i - ultimo.i) * paso < (ultimo.i === 0 ? minSepUltimo : minSep)) continue;
    if ((fechas.length - 1 - i) * paso < minSepUltimo) continue;
    out.push({ i, texto: mesCorto(fechas[i]!) });
  }
  if (fechas.length > 1) out.push({ i: fechas.length - 1, texto: fechaCorta(fechas[fechas.length - 1]!) });
  return out;
}

// ---------------------------------------------------------------------------
// LÍNEAS — forma/fatiga, tendencias, comparar periodos
// ---------------------------------------------------------------------------

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
    const orden = [...fechas].sort();
    const escala = escalaBonita(Math.min(...vals), Math.max(...vals), piel.id === 'iphone' ? 4 : 5, { desdeCero, pasos: escalaTiempo ? PASOS_TIEMPO : undefined });
    return { orden, escala };
  }, [series, banda, desdeCero, piel.id, escalaTiempo]);

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

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {leyenda && series.length + (series.some((s) => s.proyeccion?.length) ? 1 : 0) >= 2 ? (
        <div style={{ marginBottom: 8 }}>
          <Leyenda
            piel={piel}
            items={[
              ...series.map((s) => ({ etiqueta: s.etiqueta, muestra: (s.trazo === 'discontinuo' ? 'linea-discontinua' : 'linea') as Muestra, color: s.color })),
              ...(series.some((s) => s.proyeccion?.length) ? [{ etiqueta: 'Proyección', muestra: 'linea-discontinua' as Muestra, color: piel.proyeccion }] : []),
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
          <g key={m.t}>
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
            {s.proyeccion && s.proyeccion.length > 0 ? (
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
            .map((s) => ({ s, v: valorEn(s, hover) }))
            .filter((p) => p.v != null)
            .map(({ s, v }) => ({ clave: <Clave muestra="linea" color={s.color} piel={piel} />, etiqueta: s.etiqueta, valor: (s.formato ?? formatoY)(v!) }))}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COLUMNAS — por semana: plan (contorno) frente a hecho (relleno, apilado)
// ---------------------------------------------------------------------------

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
        {objetivo ? (
          <g>
            <line x1={x0} x2={x1} y1={y(objetivo.valor)} y2={y(objetivo.valor)} stroke={piel.tinta2} strokeWidth={1.5} />
            <text x={x1} y={y(objetivo.valor) - 4} textAnchor="end" fill={piel.tinta2} style={textoEje(piel)}>
              {objetivo.etiqueta}
            </text>
          </g>
        ) : null}
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
                  const alto = Math.max(0, yBase - yTop - (k > 0 ? HUECO : 0));
                  return (
                    <rect
                      key={p.code}
                      x={r2(cx - anchoBarra / 2)}
                      y={r2(yTop)}
                      width={r2(anchoBarra)}
                      height={r2(alto)}
                      rx={esUltima ? 4 : 0}
                      fill={p.color}
                    />
                  );
                })}
            </g>
          );
        })}
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
          titulo={`Semana del ${fechaCorta(h.t)}`}
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

// ---------------------------------------------------------------------------
// DIVERGENTE — la frescura alrededor de cero, con la proyección en contorno
// ---------------------------------------------------------------------------

export function Divergente({
  piel,
  alto,
  puntos,
  proyeccion = null,
  marcas = [],
  formato,
  anchoInicial = 362,
  bandas = [],
}: {
  piel: Piel;
  alto: number;
  puntos: PuntoSerie[];
  proyeccion?: PuntoSerie[] | null;
  marcas?: MarcaVertical[];
  formato: (v: number) => string;
  anchoInicial?: number;
  /** Cortes de las bandas del coach que se rotulan a la derecha (p. ej. −30, 5). */
  bandas?: Array<{ valor: number; etiqueta: string }>;
}) {
  const { ref, ancho } = useAncho<HTMLDivElement>(anchoInicial);
  const [hover, setHover] = useState<string | null>(null);
  const todos = [...puntos, ...(proyeccion ?? [])];
  if (todos.length < 2) return null;
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
        aria-label="Frescura día a día"
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
          <line key={m.t} x1={x(m.t)} x2={x(m.t)} y1={y0} y2={y1} stroke={m.tipo === 'evento' ? piel.tinta : piel.tinta2} strokeWidth={m.tipo === 'evento' ? 1.5 : 1} strokeDasharray={m.tipo === 'hoy' ? '2 3' : undefined} />
        ))}
        {hover ? <line x1={x(hover)} x2={x(hover)} y1={y0} y2={y1} stroke={piel.tinta2} strokeWidth={1} /> : null}
      </svg>
      {hover
        ? (() => {
            const p = todos.find((q) => q.t === hover);
            return p && p.v != null ? <Tooltip piel={piel} x={x(hover)} ancho={ancho} titulo={fechaCorta(hover)} filas={[{ etiqueta: proyeccion?.some((q) => q.t === hover) ? 'Frescura prevista' : 'Frescura', valor: formato(p.v) }]} /> : null;
          })()
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHISPA — la tendencia de una fila, sin texto (el dato va al lado)
// ---------------------------------------------------------------------------

export function Chispa({
  piel,
  puntos,
  ancho = 96,
  alto = 30,
  banda = null,
  color,
}: {
  piel: Piel;
  puntos: PuntoSerie[];
  ancho?: number;
  alto?: number;
  banda?: { lo: number; hi: number } | null;
  color?: string;
}) {
  const vals = puntos.map((p) => p.v).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals, banda?.lo ?? Infinity);
  const hi = Math.max(...vals, banda?.hi ?? -Infinity);
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
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden style={{ flex: '0 0 auto', display: 'block', overflow: 'visible' }}>
      {banda ? <rect x={0} y={y(banda.hi)} width={ancho} height={r2(Math.max(1, y(banda.lo) - y(banda.hi)))} rx={2} fill={piel.superficie2} /> : null}
      <path d={d.trim()} fill="none" stroke={tono} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
      {ultimo >= 0 ? <circle cx={x(ultimo)} cy={y(puntos[ultimo]!.v!)} r={4} fill={tono} stroke={piel.superficie} strokeWidth={2} /> : null}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BARRAS HORIZONTALES — el hueco por tramo de la carrera (positivo = te falta)
// ---------------------------------------------------------------------------

export function BarrasHueco({
  piel,
  filas,
  formato,
  anchoInicial = 362,
  altoFila = 30,
  anchoEtiqueta,
}: {
  piel: Piel;
  filas: Array<{ id: string; etiqueta: string; valor: number | null; color: string; nota?: string }>;
  formato: (v: number) => string;
  anchoInicial?: number;
  altoFila?: number;
  anchoEtiqueta?: number;
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
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Hueco por tramo" style={{ display: 'block', overflow: 'visible' }}>
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
      <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Tus mejores esfuerzos por distancia" style={{ display: 'block', overflow: 'visible' }}>
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
