'use client';

// LOS TRES DIBUJOS — y una regla que los gobierna a los dos que juzgan.
//
// **LO BUENO VA ARRIBA. SIEMPRE.** Una línea que sube significa que vas mejor,
// se mida lo que se mida. En ritmo eso obliga a invertir el eje (5:02 arriba,
// 5:14 abajo) y en el coste de correr cansado también, porque en las dos el
// número bueno es el pequeño. Sin esta regla el atleta tiene que leerse el eje
// antes de saber si la línea que sube es una buena noticia — y no se lo lee.
//
// Las BARRAS no siguen la regla porque no juzgan: los kilómetros de una semana
// no son buenos ni malos por sí mismos, son una cantidad. Teñirlas de verde o
// rojo sería inventarles un sentido que no tienen.
//
// Nada de esto lleva naranja de marca (§9.1): el acento es para el instante en
// que algo se logra, no para un estado sostenido. El color que sí aparece es el
// de ZONA, y solo donde la zona es literalmente el sujeto de la lectura.

import { ritmoKm, esDecimal } from '../../kit-composicion/formato';
import { S } from '../../kit-composicion/tokens';
import type { Esfuerzo } from './modelo';

const W = 378;
const PAD = { arriba: 10, abajo: 20, izq: 4, der: 4 };

function ruta(puntos: { x: number; y: number }[]): string {
  return puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

function Eje({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: S.s }}>{children}</div>
  );
}

function Marca({ children, tono = 'var(--twin-faint)' }: { children: React.ReactNode; tono?: string }) {
  return <span style={{ font: '500 9.5px/1.2 var(--twin-font-sans)', color: tono }}>{children}</span>;
}

// ---------------------------------------------------------------------------
// LA CURVA DE MEJORES ESFUERZOS — con la sombra de hace un mes
// ---------------------------------------------------------------------------

/**
 * El estándar de Strava y Golden Cheetah, adoptado tal cual (§06 del
 * diagnóstico): sustituye a los tres récords sueltos de 1, 3 y 5 km. Un récord
 * suelto solo dice si ese día fue bueno; la curva entera dice de qué está hecho
 * el motor, y con la sombra encima dice además hacia dónde va.
 *
 * El eje de distancia es logarítmico porque las distancias lo son: entre 400 m
 * y 800 m hay el mismo salto de naturaleza que entre 5 y 10 km, y en lineal los
 * cuatro primeros puntos se apelotonan contra el margen izquierdo.
 */
export function CurvaEsfuerzos({
  hoy,
  antes,
  alto = 132,
}: {
  hoy: Esfuerzo[];
  antes: Esfuerzo[];
  alto?: number;
}) {
  const todos = [...hoy, ...antes];
  if (todos.length < 2) return null;

  const skm = (e: Esfuerzo) => (e.segundos / e.metros) * 1000;
  const ritmos = todos.map(skm);
  const minR = Math.min(...ritmos);
  const maxR = Math.max(...ritmos);
  const margen = Math.max(6, (maxR - minR) * 0.12);
  const lo = minR - margen;
  const hi = maxR + margen;

  const metros = todos.map((e) => e.metros);
  const lx = (m: number) => Math.log(m);
  const x0 = lx(Math.min(...metros));
  const x1 = lx(Math.max(...metros));
  const ancho = W - PAD.izq - PAD.der;
  const util = alto - PAD.arriba - PAD.abajo;

  const px = (m: number) => PAD.izq + ((lx(m) - x0) / (x1 - x0)) * ancho;
  // Invertido: el ritmo rápido (número pequeño) arriba.
  const py = (r: number) => PAD.arriba + ((r - lo) / (hi - lo)) * util;

  const punto = (e: Esfuerzo) => ({ x: px(e.metros), y: py(skm(e)) });
  const serieHoy = hoy.map(punto);
  const serieAntes = antes.map(punto);

  const marcas = [400, 1000, 5000, 10000].filter((m) => m >= Math.min(...metros) && m <= Math.max(...metros));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg
        viewBox={`0 0 ${W} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label={`Tus mejores esfuerzos de 400 metros a 10 kilómetros${antes.length > 0 ? ', con los de hace un mes por detrás' : ''}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {marcas.map((m) => (
          <line
            key={m}
            x1={px(m)}
            x2={px(m)}
            y1={PAD.arriba - 4}
            y2={alto - PAD.abajo}
            stroke="var(--twin-hairline)"
            strokeWidth={1}
          />
        ))}

        {/* LA SOMBRA. Va detrás, discontinua y sin puntos: es el pasado, no
            compite con el presente y no invita a leerla dato a dato. */}
        {serieAntes.length > 1 && (
          <path
            d={ruta(serieAntes)}
            fill="none"
            stroke="var(--twin-faint)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            strokeLinejoin="round"
          />
        )}

        <path d={ruta(serieHoy)} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {serieHoy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="var(--twin-bg)" stroke="var(--twin-fg)" strokeWidth={1.6} />
        ))}

        {marcas.map((m) => (
          <text
            key={m}
            x={px(m)}
            y={alto - 6}
            textAnchor="middle"
            fill="var(--twin-faint)"
            style={{ font: '500 9.5px var(--twin-font-sans)' }}
          >
            {m >= 1000 ? `${m / 1000}k` : `${m}`}
          </text>
        ))}
      </svg>
      <Eje>
        <Marca>{`arriba ${ritmoKm(Math.round(lo))} · abajo ${ritmoKm(Math.round(hi))}`}</Marca>
        {antes.length > 0 && <Marca>— — hace un mes</Marca>}
      </Eje>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LA LÍNEA QUE JUZGA — semana a semana, y lo bueno arriba
// ---------------------------------------------------------------------------

export function LineaJuicio({
  puntos,
  color = 'var(--twin-fg)',
  /** Cómo se escribe un valor del eje. */
  formato,
  alto = 96,
}: {
  puntos: { semana: string; valor: number }[];
  color?: string;
  formato: (v: number) => string;
  alto?: number;
}) {
  if (puntos.length < 2) return null;

  const vals = puntos.map((p) => p.valor);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const margen = Math.max(1, (max - min) * 0.25);
  const lo = min - margen;
  const hi = max + margen;

  const ancho = W - PAD.izq - PAD.der;
  const util = alto - PAD.arriba - PAD.abajo;
  const px = (i: number) => PAD.izq + (i / (puntos.length - 1)) * ancho;
  // Invertido SIEMPRE: estas dos lecturas (ritmo y coste) tienen el número bueno
  // en el lado pequeño, así que el pequeño va arriba y subir es mejorar.
  const py = (v: number) => PAD.arriba + ((v - lo) / (hi - lo)) * util;

  const serie = puntos.map((p, i) => ({ x: px(i), y: py(p.valor) }));
  const area = `${ruta(serie)} L${serie[serie.length - 1]!.x.toFixed(1)} ${alto - PAD.abajo} L${serie[0]!.x.toFixed(1)} ${alto - PAD.abajo} Z`;
  const ultimo = serie[serie.length - 1]!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg
        viewBox={`0 0 ${W} ${alto}`}
        width="100%"
        height={alto}
        role="img"
        aria-label={`De ${formato(puntos[0]!.valor)} en ${puntos[0]!.semana} a ${formato(puntos[puntos.length - 1]!.valor)} en ${puntos[puntos.length - 1]!.semana}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path d={area} fill={`color-mix(in srgb, ${color} 10%, transparent)`} />
        <path d={ruta(serie)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={ultimo.x} cy={ultimo.y} r={3.2} fill={color} />
      </svg>
      <Eje>
        <Marca>{`${puntos[0]!.semana} · ${formato(puntos[0]!.valor)}`}</Marca>
        <Marca tono={color}>{`${puntos[puntos.length - 1]!.semana} · ${formato(puntos[puntos.length - 1]!.valor)}`}</Marca>
      </Eje>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LAS BARRAS — una cantidad, sin juicio
// ---------------------------------------------------------------------------

export function BarrasSemanales({ puntos, alto = 84 }: { puntos: { semana: string; km: number }[]; alto?: number }) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.km));
  const total = puntos.reduce((a, p) => a + p.km, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: alto }}
        role="img"
        aria-label={`${puntos.length} semanas, de ${esDecimal(puntos[0]!.km, 0)} a ${esDecimal(puntos[puntos.length - 1]!.km, 0)} kilómetros`}
      >
        {puntos.map((p, i) => (
          <div
            key={p.semana}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${Math.max(4, (p.km / max) * 100)}%`,
              borderRadius: 3,
              // La última destaca porque es la que el atleta está viviendo; las
              // demás son el contexto que la hace legible.
              background: i === puntos.length - 1 ? 'var(--twin-fg)' : 'var(--twin-hairline-strong)',
            }}
          />
        ))}
      </div>
      <Eje>
        <Marca>{puntos[0]!.semana}</Marca>
        <Marca>{`${Math.round(total)} km en ${puntos.length} semanas`}</Marca>
        <Marca tono="var(--twin-fg)">{puntos[puntos.length - 1]!.semana}</Marca>
      </Eje>
    </div>
  );
}
