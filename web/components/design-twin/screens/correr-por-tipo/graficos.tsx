'use client';

// LOS DIBUJOS DE ESTA PANTALLA — en la voz de `analiticas-correr` (estudiada
// mirándola, no de memoria): trazo fino sobre el lienzo, fantasma del punto de
// partida, ejes en dos cifras mono diminutas, cero cajas, cero rellenos
// sólidos. LO BUENO VA ARRIBA: el eje se invierte porque en ritmo (bruto o al
// pulso) bajar es mejorar.
//
// LO PROPIO DE ESTA PANTALLA: el eje X no reparte los puntos por ÍNDICE —
// aquí una sesión no es semanal, así que espaciar «uno por columna» mentiría
// sobre el hueco real entre un 6×800 de abril y el siguiente de mayo. El eje
// es TIEMPO REAL (proporcional a los días transcurridos), con marcas de mes
// abajo, como pide el mapa: «eje temporal de meses».

import type { PuntoProgreso } from './modelo';
import { epochDias, mesCorto } from './modelo';

const W = 378;

function ruta(p: { x: number; y: number }[]): string {
  return p.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
}

const EJE: React.CSSProperties = {
  fontFamily: 'var(--twin-font-mono)',
  fontWeight: 600,
  fontSize: 10,
  letterSpacing: '0.04em',
};

// ---------------------------------------------------------------------------
// LA PROGRESIÓN — una sesión, un punto, en su fecha real
// ---------------------------------------------------------------------------

export function LineaProgreso({ puntos, formato, alto = 158 }: { puntos: PuntoProgreso[]; formato: (v: number) => string; alto?: number }) {
  if (puntos.length < 2) return null;

  const vals = puntos.map((p) => p.valor);
  const margen = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.35);
  const lo = Math.min(...vals) - margen;
  const hi = Math.max(...vals) + margen;
  const pad = { t: 12, b: 24, izq: 46, der: 6 };
  const util = alto - pad.t - pad.b;

  const dias = puntos.map((p) => epochDias(p.fecha));
  const d0 = Math.min(...dias);
  const d1 = Math.max(...dias);
  const rango = Math.max(1, d1 - d0);

  const px = (i: number) => pad.izq + ((dias[i]! - d0) / rango) * (W - pad.izq - pad.der);
  // Invertido: el número pequeño (mejor) arriba.
  const py = (v: number) => pad.t + ((v - lo) / (hi - lo)) * util;

  const serie = puntos.map((p, i) => ({ x: px(i), y: py(p.valor) }));
  const primero = serie[0]!;
  const ultimo = serie[serie.length - 1]!;

  // Una marca por mes distinto que cubra el rango — nunca doce meses fijos.
  const meses: { x: number; etiqueta: string }[] = [];
  let visto = '';
  puntos.forEach((p, i) => {
    const m = mesCorto(p.fecha);
    if (m !== visto) {
      meses.push({ x: px(i), etiqueta: m });
      visto = m;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${W} ${alto}`}
      width="100%"
      height={alto}
      role="img"
      aria-label={`De ${formato(puntos[0]!.valor)} a ${formato(puntos[puntos.length - 1]!.valor)}, ${puntos.length} sesiones`}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* EL FANTASMA: la altura de donde salió. La distancia entre esa línea y
          el trazo ES la mejora — cero palabras. */}
      <line x1={pad.izq} x2={W - pad.der} y1={primero.y} y2={primero.y} stroke="var(--twin-faint)" strokeWidth={1} strokeDasharray="2 5" />

      <path d={ruta(serie)} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {serie.map((p, i) =>
        i === 0 || i === serie.length - 1 ? null : <circle key={i} cx={p.x} cy={p.y} r={2} fill="var(--twin-faint)" />,
      )}
      <circle cx={primero.x} cy={primero.y} r={3} fill="none" stroke="var(--twin-faint)" strokeWidth={1.4} />
      <circle cx={ultimo.x} cy={ultimo.y} r={4} fill="var(--twin-fg)" />
      <circle cx={ultimo.x} cy={ultimo.y} r={8.5} fill="var(--twin-fg)" fillOpacity={0.16} />

      {/* Los ejes: dos cifras diminutas pegadas al borde izquierdo, a la
          altura exacta del mejor y del peor valor. */}
      <text x={0} y={py(Math.min(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.min(...vals))}
      </text>
      <text x={0} y={py(Math.max(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.max(...vals))}
      </text>

      {/* Los meses, abajo — el «eje temporal de meses» del mapa. */}
      {meses.map((m, i) => (
        <text key={i} x={m.x} y={alto - 6} textAnchor={i === 0 ? 'start' : 'middle'} fill="var(--twin-faint)" style={EJE}>
          {m.etiqueta}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LOS PUNTOS — un punto por repetición evaluada (misma pieza que en
// `analiticas-correr/graficos.tsx`: sustituye al anillo, y el sesgo se ve solo
// porque los fallos rápidos y los lentos tienen color distinto)
// ---------------------------------------------------------------------------

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
