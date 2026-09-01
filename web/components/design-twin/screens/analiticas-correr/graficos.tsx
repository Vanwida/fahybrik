'use client';

// LOS DIBUJOS. Aquí vive el contenido de la pantalla, no en el texto.
//
// EL ACABADO SALE DE `lectura-carrera`, que Alex aprobó. Lo que se copió de
// allí, mirándola y no de memoria (12-ago):
//
//   · Fondo TINTADO por el dato, no negro plano. Es lo que más hace que una
//     pantalla parezca esta app y no un panel cualquiera.
//   · Trazos finos y claros SOBRE el tinte. Nada de rellenos sólidos de color:
//     allí la curva de ritmo es una línea blanca fina y el pulso una más tenue.
//   · Los ejes son dos cifras diminutas en mono pegadas al borde izquierdo.
//   · Ni una caja, ni un borde redondeado, ni una línea divisoria. Separan la
//     etiqueta en versalita y el aire.
//
// DOS REGLAS PROPIAS DE ESTA PANTALLA:
//
// 1 · **LO BUENO VA ARRIBA.** Una línea que sube significa que vas mejor, se
//     mida lo que se mida. En ritmo y en coste eso obliga a invertir el eje.
//     Las BARRAS no lo siguen porque no juzgan: los kilómetros de una semana no
//     son buenos ni malos, son una cantidad.
//
// 2 · **LA COMPARACIÓN SE DIBUJA.** El antes es una línea fantasma, una sombra
//     o una marca sobre la barra. Nunca una oración.
//
// COLOR. Solo donde es dato: el tinte del fondo ES el veredicto, las bandas de
// zona llevan su color de siempre, y el verde de «dentro» es un veredicto por
// repetición. Un VO₂máx no es una zona y va en tinta normal. El naranja de
// marca se reserva para la acción, como en la referencia.

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';

const W = 378;

function ruta(p: { x: number; y: number }[]): string {
  return p.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
}

export function Marca({ children, tono = 'var(--twin-faint)' }: { children: ReactNode; tono?: string }) {
  return (
    <span
      style={{
        fontFamily: 'var(--twin-font-mono)',
        fontWeight: 600,
        fontSize: 10,
        letterSpacing: '0.06em',
        fontVariantNumeric: 'tabular-nums',
        color: tono,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL FONDO — el tinte ES el veredicto
// ---------------------------------------------------------------------------

/**
 * Misma receta que `Ambiente` de `kit-vivo` (radial arriba + rasante abajo, con
 * la mezcla partida por apariencia porque en claro el mismo porcentaje
 * emborrona el lienzo). Allí el tinte lo pone la ZONA de pulso; aquí no hay una
 * zona que valga para toda la pantalla, así que lo pone el VEREDICTO — que es
 * el sujeto de esta pantalla igual que la zona lo es de la de en vivo.
 *
 * No se reutiliza `Ambiente` tal cual porque su firma es `zona`, no un tono
 * libre, y generalizarla toca las quince pantallas que la importan. Es UNA
 * repetición y va anotada: si aparece un tercer llamante, se generaliza allí.
 *
 * Sin veredicto (el recién llegado) el tono es el apagado y el lienzo queda
 * prácticamente neutro. Es lo correcto: sin dato no hay color.
 */
export function Fondo({ tono, appearance }: { tono: string; appearance: TwinAppearance }) {
  const m = appearance === 'dark' ? { centro: 26, suelo: 12 } : { centro: 15, suelo: 7 };
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: [
          `radial-gradient(115% 70% at 50% 12%, color-mix(in srgb, ${tono} ${m.centro}%, transparent), transparent 70%)`,
          `linear-gradient(to top, color-mix(in srgb, ${tono} ${m.suelo}%, transparent), transparent 45%)`,
        ].join(', '),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// LA LÍNEA — trazo fino, fantasma del principio, ejes al borde
// ---------------------------------------------------------------------------

export function Linea({
  puntos,
  formato,
  alto = 150,
}: {
  puntos: { semana: string; valor: number }[];
  formato: (v: number) => string;
  alto?: number;
}) {
  if (puntos.length < 2) return null;

  const vals = puntos.map((p) => p.valor);
  const margen = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.35);
  const lo = Math.min(...vals) - margen;
  const hi = Math.max(...vals) + margen;
  const pad = { t: 12, b: 12, izq: 46, der: 6 };
  const util = alto - pad.t - pad.b;

  const px = (i: number) => pad.izq + (i / (puntos.length - 1)) * (W - pad.izq - pad.der);
  // Invertido: el número pequeño (mejor) arriba.
  const py = (v: number) => pad.t + ((v - lo) / (hi - lo)) * util;

  const serie = puntos.map((p, i) => ({ x: px(i), y: py(p.valor) }));
  const primero = serie[0]!;
  const ultimo = serie[serie.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${W} ${alto}`}
      width="100%"
      height={alto}
      role="img"
      aria-label={`De ${formato(puntos[0]!.valor)} a ${formato(puntos[puntos.length - 1]!.valor)}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* EL FANTASMA. La altura de donde salió, cruzando la caja: la distancia
          entre esa línea y el trazo ES la mejora. Cero palabras. */}
      <line x1={pad.izq} x2={W - pad.der} y1={primero.y} y2={primero.y} stroke="var(--twin-faint)" strokeWidth={1} strokeDasharray="2 5" />

      <path d={ruta(serie)} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      <circle cx={primero.x} cy={primero.y} r={3} fill="none" stroke="var(--twin-faint)" strokeWidth={1.4} />
      <circle cx={ultimo.x} cy={ultimo.y} r={4} fill="var(--twin-fg)" />
      <circle cx={ultimo.x} cy={ultimo.y} r={8.5} fill="var(--twin-fg)" fillOpacity={0.16} />

      {/* Los ejes, como en la referencia: dos cifras diminutas pegadas al borde
          izquierdo, a la altura exacta del mejor y del peor valor. */}
      <text x={0} y={py(Math.min(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.min(...vals))}
      </text>
      <text x={0} y={py(Math.max(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.max(...vals))}
      </text>
    </svg>
  );
}

const EJE: React.CSSProperties = {
  fontFamily: 'var(--twin-font-mono)',
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: '0.04em',
};

// ---------------------------------------------------------------------------
// LA CURVA DE MEJORES ESFUERZOS — la sombra, y el hueco entre las dos
// ---------------------------------------------------------------------------

/**
 * El estándar de Strava y Golden Cheetah: sustituye a los tres récords sueltos
 * de 1, 3 y 5 km. Un récord dice si ese día fue bueno; la curva dice de qué
 * está hecho el motor.
 *
 * Eje de distancia logarítmico porque las distancias lo son. Y entre la curva
 * de hoy y la de hace un mes se rellena el hueco: esa mancha es el progreso, y
 * es la única forma de verlo sin contarlo.
 */
export function CurvaEsfuerzos({
  hoy,
  antes,
  alto = 168,
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
  const pad = { t: 10, b: 22, x: 4 };
  const util = alto - pad.t - pad.b;

  const px = (m: number) => pad.x + ((Math.log(m) - x0) / (x1 - x0)) * (W - pad.x * 2);
  const py = (r: number) => pad.t + ((r - lo) / (hi - lo)) * util;
  const punto = (e: { metros: number; segundos: number }) => ({ x: px(e.metros), y: py(skm(e)) });

  const serieHoy = hoy.map(punto);
  const serieAntes = antes.map(punto);
  const marcas = [400, 1000, 5000, 10000].filter((m) => m >= Math.min(...metros) && m <= Math.max(...metros));
  const mejora = serieAntes.length > 1 && hoy[0] && antes[0] ? skm(hoy[hoy.length - 1]!) < skm(antes[antes.length - 1]!) : false;

  const banda =
    serieAntes.length > 1
      ? `${ruta(serieHoy)} L${[...serieAntes].reverse().map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} Z`
      : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${alto}`}
      width="100%"
      height={alto}
      role="img"
      aria-label={`Tus mejores esfuerzos${antes.length ? ', con los de hace un mes por detrás' : ''}`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {marcas.map((m) => (
        <line key={m} x1={px(m)} x2={px(m)} y1={pad.t} y2={alto - pad.b} stroke="var(--twin-hairline)" strokeWidth={1} />
      ))}

      {/* El hueco entre las dos curvas. Verde si ha mejorado, ámbar si no: es un
          veredicto, no un adorno. */}
      {banda && <path d={banda} fill={mejora ? 'var(--twin-ok)' : 'var(--twin-warning)'} fillOpacity={0.16} />}

      {serieAntes.length > 1 && (
        <path d={ruta(serieAntes)} fill="none" stroke="var(--twin-faint)" strokeWidth={1.25} strokeDasharray="3 4" strokeLinejoin="round" />
      )}

      <path d={ruta(serieHoy)} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {marcas.map((m) => (
        <text key={m} x={px(m)} y={alto - 6} textAnchor="middle" fill="var(--twin-faint)" style={EJE}>
          {m >= 1000 ? `${m / 1000}k` : m}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LAS BARRAS — una cantidad, sin juicio, con la media de partida marcada
// ---------------------------------------------------------------------------

export function Barras({ puntos, alto = 104 }: { puntos: { semana: string; valor: number }[]; alto?: number }) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.valor));
  const base = puntos.slice(0, 4).reduce((a, p) => a + p.valor, 0) / Math.min(4, puntos.length);

  return (
    <div style={{ position: 'relative', height: alto }} role="img" aria-label={`${puntos.length} semanas de kilómetros`}>
      {/* La media de las primeras semanas: la subida se VE contra ella. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(base / max) * 100}%`, borderTop: '1px dashed var(--twin-faint)' }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: '100%' }}>
        {puntos.map((p, i) => (
          <div
            key={p.semana}
            style={{
              flex: 1,
              minWidth: 0,
              // El tope existe por las series CORTAS (13-ago): con 4 puntos el
              // flex convertía cada semana en una losa a todo lo ancho. Con las
              // 8 del espejo no llega a actuar.
              maxWidth: 56,
              height: `${Math.max(3, (p.valor / max) * 100)}%`,
              // Sin esquinas redondeadas: la referencia usa columnas rectas.
              background: i === puntos.length - 1 ? 'var(--twin-fg)' : 'color-mix(in srgb, var(--twin-fg) 22%, transparent)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL REPARTO — las bandas de zona, con la marca del coach encima
// ---------------------------------------------------------------------------

/**
 * Aquí el color SÍ es de zona, porque lo que se mide es la zona: un tramo ámbar
 * es Z4 igual que en el mapa y en el resumen. Y el objetivo del coach es una
 * marca sobre la barra, no la frase «te pide un 80%»: la distancia entre la
 * marca y donde acaba el azul es el desvío, y se ve.
 */
export function BarraReparto({
  segmentos,
  objetivoSuave,
}: {
  segmentos: { zona: number | null; pct: number }[];
  objetivoSuave: number;
}) {
  return (
    <div style={{ position: 'relative', paddingTop: 9 }}>
      <div style={{ display: 'flex', height: 30 }}>
        {segmentos.map((s, i) => (
          <div
            key={i}
            style={{
              width: `${Math.max(0, s.pct)}%`,
              background: s.zona ? `var(--twin-z${s.zona})` : 'color-mix(in srgb, var(--twin-fg) 14%, transparent)',
            }}
          />
        ))}
      </div>
      <div style={{ position: 'absolute', top: 3, bottom: 0, left: `${objetivoSuave}%`, width: 1.5, background: 'var(--twin-fg)' }} />
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
  );
}

// ---------------------------------------------------------------------------
// LOS PUNTOS — una repetición, un punto
// ---------------------------------------------------------------------------

/**
 * SUSTITUYE AL ANILLO Y A LA BARRA DIVERGENTE, y hace el trabajo de los dos.
 *
 * El anillo de porcentaje era el elemento más genérico de la pantalla: un
 * donut se puede pegar en cualquier producto del mundo porque no significa
 * nada en particular. Un punto por repetición sí: cada punto es una serie que
 * el atleta corrió, la proporción se ve sin leer el número, y el SESGO —que es
 * lo que de verdad informa— aparece solo, porque los fallos rápidos y los
 * lentos tienen color distinto y se agrupan a la vista.
 */
export function Puntos({ dentro, lento, rapido }: { dentro: number; lento: number; rapido: number }) {
  const celdas = [
    ...Array.from({ length: dentro }, () => 'var(--twin-ok)'),
    ...Array.from({ length: lento }, () => 'color-mix(in srgb, var(--twin-fg) 30%, transparent)'),
    ...Array.from({ length: rapido }, () => 'var(--twin-danger)'),
  ];
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
      role="img"
      aria-label={`${dentro} repeticiones dentro, ${lento} lentas, ${rapido} pasadas de rosca`}
    >
      {celdas.map((c, i) => (
        <span key={i} style={{ width: 13, height: 13, borderRadius: 999, background: c }} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EL PLAZO — «aún no» dibujado, no explicado
// ---------------------------------------------------------------------------

export function Plazo({ llevas, hacen }: { llevas: number; hacen: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, height: 8, width: '100%' }} role="img" aria-label={`${llevas} de ${hacen} semanas`}>
      {Array.from({ length: hacen }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: i < llevas ? 'var(--twin-fg)' : 'color-mix(in srgb, var(--twin-fg) 16%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// APAGADO — la lectura se enseña, no se explica
// ---------------------------------------------------------------------------

/**
 * Una lectura sin cobertura no desaparece ni se cuenta en un párrafo: se pinta
 * su forma en tenue con un candado. El atleta ve QUÉ le falta por la silueta, y
 * el único texto del bloque es el botón de arriba.
 */
export function Apagado({ alto = 96 }: { alto?: number }) {
  return (
    <div style={{ position: 'relative', height: alto, display: 'grid', placeItems: 'center' }}>
      <svg viewBox={`0 0 ${W} ${alto}`} width="100%" height={alto} aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.22 }}>
        <path
          d={`M8 ${alto * 0.74} L${W * 0.22} ${alto * 0.6} L${W * 0.41} ${alto * 0.66} L${W * 0.6} ${alto * 0.42} L${W * 0.79} ${alto * 0.5} L${W - 8} ${alto * 0.26}`}
          fill="none"
          stroke="var(--twin-fg)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <svg width="17" height="17" viewBox="0 0 16 16" aria-hidden style={{ position: 'relative' }}>
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="var(--twin-muted)" strokeWidth="1.4" />
        <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" fill="none" stroke="var(--twin-muted)" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
