'use client';

// LOS DIBUJOS. Aquí vive el contenido de la pantalla, no en el texto.
//
// DOS REGLAS QUE VALEN PARA TODOS:
//
// 1 · **LO BUENO VA ARRIBA.** Una línea que sube significa que vas mejor, se
//     mida lo que se mida. En ritmo y en coste eso obliga a invertir el eje
//     (5:02 arriba, 5:14 abajo). Sin esto hay que leerse el eje antes de saber
//     si la línea que sube es buena noticia, y nadie se lee el eje.
//     Las BARRAS no lo siguen porque no juzgan: los kilómetros de una semana no
//     son buenos ni malos, son una cantidad.
//
// 2 · **LA COMPARACIÓN SE DIBUJA.** «Hace 4 semanas perdías 15,5» no es una
//     frase que haya que acortar: es un punto fantasma en la línea. El antes es
//     una sombra, un punto hueco o una marca sobre la barra — nunca una oración.
//
// Nada lleva naranja de marca (§9.1): el acento es para el instante en que algo
// se logra, no para un estado sostenido. El color que sí aparece es el de ZONA,
// y solo donde la zona es literalmente el sujeto.

import type { ReactNode } from 'react';
import { R, S } from '../../kit-composicion/tokens';

const W = 378;

function ruta(p: { x: number; y: number }[]): string {
  return p.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
}

function Pie({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: S.s }}>{children}</div>
  );
}

export function Marca({ children, tono = 'var(--twin-faint)' }: { children: ReactNode; tono?: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--twin-font-sans)',
        fontWeight: 600,
        fontSize: 10,
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
        color: tono,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LA LÍNEA — con el fantasma del principio, que es toda la comparación
// ---------------------------------------------------------------------------

export function Linea({
  puntos,
  color = 'var(--twin-fg)',
  formato,
  alto = 168,
}: {
  puntos: { semana: string; valor: number }[];
  color?: string;
  formato: (v: number) => string;
  alto?: number;
}) {
  if (puntos.length < 2) return null;

  const vals = puntos.map((p) => p.valor);
  const margen = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.3);
  const lo = Math.min(...vals) - margen;
  const hi = Math.max(...vals) + margen;
  const pad = { t: 14, b: 22, x: 3 };
  const util = alto - pad.t - pad.b;

  const px = (i: number) => pad.x + (i / (puntos.length - 1)) * (W - pad.x * 2);
  // Invertido: el número pequeño (mejor) arriba.
  const py = (v: number) => pad.t + ((v - lo) / (hi - lo)) * util;

  const serie = puntos.map((p, i) => ({ x: px(i), y: py(p.valor) }));
  const primero = serie[0]!;
  const ultimo = serie[serie.length - 1]!;
  const area = `${ruta(serie)} L${ultimo.x.toFixed(1)} ${alto - pad.b} L${primero.x.toFixed(1)} ${alto - pad.b} Z`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <svg
        viewBox={`0 0 ${W} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label={`De ${formato(puntos[0]!.valor)} a ${formato(puntos[puntos.length - 1]!.valor)}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`g-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* EL FANTASMA. La altura del primer punto, cruzando toda la caja: la
            distancia entre esa línea y el trazo ES la mejora. Cero palabras. */}
        <line x1={0} x2={W} y1={primero.y} y2={primero.y} stroke="var(--twin-faint)" strokeWidth={1} strokeDasharray="2 4" />

        <path d={area} fill={`url(#g-${color.replace(/[^a-z0-9]/gi, '')})`} />
        <path d={ruta(serie)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        <circle cx={primero.x} cy={primero.y} r={3.5} fill="var(--twin-bg)" stroke="var(--twin-faint)" strokeWidth={1.6} />
        <circle cx={ultimo.x} cy={ultimo.y} r={5} fill={color} />
        <circle cx={ultimo.x} cy={ultimo.y} r={9} fill={color} fillOpacity={0.2} />
      </svg>
      <Pie>
        <Marca>{formato(puntos[0]!.valor)}</Marca>
        <Marca tono={color}>{formato(puntos[puntos.length - 1]!.valor)}</Marca>
      </Pie>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA CURVA DE MEJORES ESFUERZOS — la sombra, y el hueco entre las dos
// ---------------------------------------------------------------------------

/**
 * El estándar de Strava y Golden Cheetah, adoptado tal cual: sustituye a los
 * tres récords sueltos de 1, 3 y 5 km. Un récord dice si ese día fue bueno; la
 * curva dice de qué está hecho el motor.
 *
 * El eje de distancia es logarítmico porque las distancias lo son. Y entre la
 * curva de hoy y la de hace un mes se RELLENA el hueco: esa mancha es la
 * mejora, y es la única manera de verla sin contarla.
 */
export function CurvaEsfuerzos({
  hoy,
  antes,
  alto = 190,
}: {
  hoy: { metros: number; segundos: number }[];
  antes: { metros: number; segundos: number }[];
  alto?: number;
}) {
  const todos = [...hoy, ...antes];
  if (todos.length < 2) return null;

  const skm = (e: { metros: number; segundos: number }) => (e.segundos / e.metros) * 1000;
  const ritmos = todos.map(skm);
  const margen = Math.max(6, (Math.max(...ritmos) - Math.min(...ritmos)) * 0.1);
  const lo = Math.min(...ritmos) - margen;
  const hi = Math.max(...ritmos) + margen;

  const metros = todos.map((e) => e.metros);
  const x0 = Math.log(Math.min(...metros));
  const x1 = Math.log(Math.max(...metros));
  const pad = { t: 12, b: 24, x: 3 };
  const util = alto - pad.t - pad.b;

  const px = (m: number) => pad.x + ((Math.log(m) - x0) / (x1 - x0)) * (W - pad.x * 2);
  const py = (r: number) => pad.t + ((r - lo) / (hi - lo)) * util;
  const punto = (e: { metros: number; segundos: number }) => ({ x: px(e.metros), y: py(skm(e)) });

  const serieHoy = hoy.map(punto);
  const serieAntes = antes.map(punto);
  const marcas = [400, 1000, 5000, 10000].filter((m) => m >= Math.min(...metros) && m <= Math.max(...metros));

  // El hueco entre las dos curvas, relleno. Solo si las dos existen.
  const banda = serieAntes.length > 1 ? `${ruta(serieHoy)} L${[...serieAntes].reverse().map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} Z` : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <svg
        viewBox={`0 0 ${W} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label={`Tus mejores esfuerzos de 400 metros a 10 kilómetros${antes.length ? ', con los de hace un mes por detrás' : ''}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {marcas.map((m) => (
          <line key={m} x1={px(m)} x2={px(m)} y1={pad.t - 6} y2={alto - pad.b} stroke="var(--twin-hairline)" strokeWidth={1} />
        ))}

        {banda && <path d={banda} fill="var(--twin-ok)" fillOpacity={0.13} />}

        {serieAntes.length > 1 && (
          <path d={ruta(serieAntes)} fill="none" stroke="var(--twin-faint)" strokeWidth={1.5} strokeDasharray="3 3" strokeLinejoin="round" />
        )}

        <path d={ruta(serieHoy)} fill="none" stroke="var(--twin-fg)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {serieHoy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--twin-bg)" stroke="var(--twin-fg)" strokeWidth={1.8} />
        ))}

        {marcas.map((m) => (
          <text key={m} x={px(m)} y={alto - 7} textAnchor="middle" fill="var(--twin-faint)" style={{ font: '600 10px var(--twin-font-sans)' }}>
            {m >= 1000 ? `${m / 1000}k` : m}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LAS BARRAS — una cantidad, sin juicio, con la media de partida marcada
// ---------------------------------------------------------------------------

export function Barras({ puntos, alto = 118 }: { puntos: { semana: string; valor: number }[]; alto?: number }) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.valor));
  const base = puntos.slice(0, 4).reduce((a, p) => a + p.valor, 0) / Math.min(4, puntos.length);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ position: 'relative', height: alto }} role="img" aria-label={`${puntos.length} semanas de kilómetros`}>
        {/* La media de las primeras semanas, cruzando: la subida se VE. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: `${(base / max) * 100}%`,
            borderTop: '1px dashed var(--twin-faint)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: '100%' }}>
          {puntos.map((p, i) => (
            <div
              key={p.semana}
              style={{
                flex: 1,
                minWidth: 0,
                height: `${Math.max(3, (p.valor / max) * 100)}%`,
                borderRadius: 4,
                background: i === puntos.length - 1 ? 'var(--twin-fg)' : 'var(--twin-hairline-strong)',
              }}
            />
          ))}
        </div>
      </div>
      <Pie>
        <Marca>{puntos[0]!.semana}</Marca>
        <Marca tono="var(--twin-fg)">{puntos[puntos.length - 1]!.semana}</Marca>
      </Pie>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL REPARTO — la barra de zonas, grande, con la marca del coach encima
// ---------------------------------------------------------------------------

/**
 * Los colores son los de siempre: un tramo ámbar es Z4 aquí, en el mapa y en el
 * resumen. El color es dato y no puede querer decir dos cosas (§9.1).
 *
 * Y el objetivo del coach es una MARCA sobre la barra, no la frase «te pide un
 * 80%»: la distancia entre la marca y donde acaba el azul es el desvío, y se ve.
 */
export function BarraReparto({
  segmentos,
  objetivoSuave,
}: {
  segmentos: { zona: number | null; pct: number; etiqueta: string }[];
  objetivoSuave: number;
}) {
  const suave = segmentos.filter((s) => s.zona != null && s.zona <= 2).reduce((a, s) => a + s.pct, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ position: 'relative', paddingTop: 10 }}>
        <div style={{ display: 'flex', height: 34, borderRadius: R.s, overflow: 'hidden' }}>
          {segmentos.map((s, i) => (
            <div
              key={i}
              style={{
                width: `${Math.max(0, s.pct)}%`,
                background: s.zona ? `var(--twin-z${s.zona})` : 'var(--twin-hairline-strong)',
              }}
            />
          ))}
        </div>
        {/* La marca del coach. Regla Nº0: es SU reparto, no un ideal universal. */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${objetivoSuave}%`, width: 2, background: 'var(--twin-fg)' }} />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${objetivoSuave}%`,
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid var(--twin-fg)',
          }}
        />
      </div>
      <Pie>
        <Marca tono={`var(--twin-z2)`}>{`${suave}% suave`}</Marca>
        <Marca>{`meta ${objetivoSuave}%`}</Marca>
      </Pie>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL ANILLO — el porcentaje en banda, a lo Whoop
// ---------------------------------------------------------------------------

export function Anillo({ pct, tono, alto = 132 }: { pct: number; tono: string; alto?: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" width={alto} height={alto} role="img" aria-label={`${pct} por ciento dentro de la banda`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--twin-hairline-strong)" strokeWidth="11" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke={tono}
        strokeWidth="11"
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 64 64)"
      />
      <text x="64" y="64" textAnchor="middle" dominantBaseline="central" fill={tono} style={{ fontFamily: 'var(--twin-font-mono)', fontWeight: 800, fontSize: 34, fontVariantNumeric: 'tabular-nums' }}>
        {pct}
      </text>
      <text x="64" y="88" textAnchor="middle" fill="var(--twin-faint)" style={{ font: '600 11px var(--twin-font-sans)' }}>
        %
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LA BARRA DIVERGENTE — el sesgo, sin decirlo
// ---------------------------------------------------------------------------

/**
 * El mismo 70% significa cosas opuestas según hacia dónde se falle: fallar
 * lento es que el ritmo te viene largo, fallar rápido es que sales pasado.
 * Antes esto era una frase; aquí es que un lado de la barra es más largo.
 */
export function Divergente({ lento, dentro, rapido }: { lento: number; dentro: number; rapido: number }) {
  const total = Math.max(1, lento + dentro + rapido);
  const w = (n: number) => `${(n / total) * 100}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', height: 20, borderRadius: R.s, overflow: 'hidden', gap: 2 }}>
        <div style={{ width: w(lento), background: 'var(--twin-z2)', opacity: 0.55 }} />
        <div style={{ width: w(dentro), background: 'var(--twin-ok)' }} />
        <div style={{ width: w(rapido), background: 'var(--twin-z5)', opacity: 0.75 }} />
      </div>
      <Pie>
        <Marca>{`${lento} lento`}</Marca>
        <Marca tono="var(--twin-z5)">{`${rapido} pasado`}</Marca>
      </Pie>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL PLAZO — «aún no» dibujado, no explicado
// ---------------------------------------------------------------------------

/** Lo que antes era «llevas 3 semanas, con 6 se ve una tendencia». */
export function Plazo({ llevas, hacen }: { llevas: number; hacen: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 4, height: 22 }}>
        {Array.from({ length: hacen }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: 3,
              background: i < llevas ? 'var(--twin-fg)' : 'transparent',
              border: i < llevas ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
            }}
          />
        ))}
      </div>
      <Marca>{`${llevas} de ${hacen} semanas`}</Marca>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BLOQUEADO — la lectura se enseña apagada, no se explica
// ---------------------------------------------------------------------------

/**
 * Una lectura sin cobertura no desaparece ni se cuenta en un párrafo: se pinta
 * su forma en gris con un candado. El atleta ve QUÉ le falta por la silueta, y
 * el único texto de todo el bloque es el botón.
 */
export function Bloqueado({ alto = 96 }: { alto?: number }) {
  return (
    <div
      style={{
        position: 'relative',
        height: alto,
        borderRadius: R.m,
        border: '1px dashed var(--twin-hairline-strong)',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
      }}
    >
      <svg viewBox={`0 0 ${W} ${alto}`} width="100%" height={alto} aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.32 }}>
        <path
          d={`M0 ${alto * 0.72} L${W * 0.2} ${alto * 0.6} L${W * 0.4} ${alto * 0.64} L${W * 0.6} ${alto * 0.44} L${W * 0.8} ${alto * 0.5} L${W} ${alto * 0.3}`}
          fill="none"
          stroke="var(--twin-faint)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>
      <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden style={{ position: 'relative' }}>
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="var(--twin-muted)" strokeWidth="1.5" />
        <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" fill="none" stroke="var(--twin-muted)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
