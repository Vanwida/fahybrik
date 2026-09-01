'use client';

// LOS DOS GRÁFICOS DE UN INFORME — barras para lo que se suma, línea para lo que se promedia.
//
// EQUIVALENTES LOCALES de `Linea`/`Barras` de `analiticas-correr/graficos.tsx`: mismo
// lenguaje visual de la familia (trazos finos SOBRE el lienzo, cero relleno sólido, cero caja,
// ejes en dos cifras mono diminutas pegadas al borde) pero sin su lógica de veredicto — esto es
// un INFORME (lo que Garmin llama Reports), no una pantalla que juzga.
//
// LA DIFERENCIA QUE IMPORTA: allí «lo bueno va arriba» invierte el eje del ritmo porque el
// sujeto de esa pantalla es si mejoras. Aquí el sujeto es EL DATO — la línea sube donde sube el
// número, se mida lo que se mida, como en cualquier informe de Garmin o Strava. Invertir el eje
// aquí sería fingir un juicio que esta pantalla no hace.

const W = 378;

function ruta(p: { x: number; y: number }[]): string {
  return p.map((q, i) => `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
}

const EJE: React.CSSProperties = {
  fontFamily: 'var(--twin-font-mono)',
  fontWeight: 600,
  fontSize: 9.5,
  letterSpacing: '0.03em',
};

// ---------------------------------------------------------------------------
// BARRAS — una cantidad por bucket (semana o mes), sin juicio, con su etiqueta debajo
// ---------------------------------------------------------------------------

/**
 * Kilómetros, tiempo, desnivel: lo que se SUMA. La última barra —el bucket en curso— es la
 * única sólida, el resto queda en el tinte tenue del trazo; ninguna lleva relleno de color,
 * como manda la familia. La etiqueta bajo cada barra es la semana o el mes, según el periodo
 * activo: con hasta doce meses cabe perfectamente a este tamaño de letra.
 */
export function Barras({ puntos, alto = 108 }: { puntos: { etiqueta: string; valor: number }[]; alto?: number }) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.valor), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: alto }} role="img" aria-label={`${puntos.length} periodos`}>
        {puntos.map((p, i) => (
          <div
            key={`${p.etiqueta}-${i}`}
            style={{
              flex: 1,
              minWidth: 0,
              // Tope por las series cortas: con 4 buckets el flex hacía losas.
              maxWidth: 56,
              height: `${Math.max(3, (p.valor / max) * 100)}%`,
              // Sin esquinas redondeadas, como las columnas de la referencia.
              background: i === puntos.length - 1 ? 'var(--twin-fg)' : 'color-mix(in srgb, var(--twin-fg) 22%, transparent)',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {puntos.map((p, i) => (
          <span
            key={`${p.etiqueta}-eje-${i}`}
            style={{
              ...EJE,
              flex: 1,
              minWidth: 0,
              maxWidth: 56,
              textAlign: 'center',
              color: 'var(--twin-faint)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {p.etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LÍNEA — una media por bucket, con el fantasma del punto de partida
// ---------------------------------------------------------------------------

/**
 * Ritmo, FC, VO₂máx, cadencia: lo que se PROMEDIA. El fantasma —la línea de puntos a la
 * altura del primer valor— es la misma idea que en `analiticas-correr`: la distancia entre
 * esa línea y el trazo de hoy ES el cambio, sin necesidad de una cifra de más. Solo las
 * etiquetas de los dos extremos se rotulan en el eje X: con hasta doce puntos, rotular todos
 * sería ruido y el primero/último son los que sitúan el resto.
 */
export function Linea({
  puntos,
  formato,
  alto = 140,
}: {
  puntos: { etiqueta: string; valor: number }[];
  formato: (v: number) => string;
  alto?: number;
}) {
  if (puntos.length < 2) return null;

  const vals = puntos.map((p) => p.valor);
  const margen = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.35);
  const lo = Math.min(...vals) - margen;
  const hi = Math.max(...vals) + margen;
  const pad = { t: 12, b: 20, izq: 46, der: 6 };
  const util = alto - pad.t - pad.b;

  const px = (i: number) => pad.izq + (i / (puntos.length - 1)) * (W - pad.izq - pad.der);
  // Eje LITERAL, sin invertir: el número más alto cae arriba, como en cualquier informe.
  const py = (v: number) => pad.t + util - ((v - lo) / (hi - lo)) * util;

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
      <line x1={pad.izq} x2={W - pad.der} y1={primero.y} y2={primero.y} stroke="var(--twin-faint)" strokeWidth={1} strokeDasharray="2 5" />

      <path d={ruta(serie)} fill="none" stroke="var(--twin-fg)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      <circle cx={primero.x} cy={primero.y} r={3} fill="none" stroke="var(--twin-faint)" strokeWidth={1.4} />
      <circle cx={ultimo.x} cy={ultimo.y} r={4} fill="var(--twin-fg)" />
      <circle cx={ultimo.x} cy={ultimo.y} r={8.5} fill="var(--twin-fg)" fillOpacity={0.16} />

      {/* Eje Y: mínimo y máximo, pegados al borde izquierdo. */}
      <text x={0} y={py(Math.min(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.min(...vals))}
      </text>
      <text x={0} y={py(Math.max(...vals)) + 3.5} fill="var(--twin-faint)" style={EJE}>
        {formato(Math.max(...vals))}
      </text>

      {/* Eje X: solo los dos extremos. */}
      <text x={primero.x} y={alto - 4} textAnchor="start" fill="var(--twin-faint)" style={EJE}>
        {puntos[0]!.etiqueta}
      </text>
      <text x={ultimo.x} y={alto - 4} textAnchor="end" fill="var(--twin-faint)" style={EJE}>
        {puntos[puntos.length - 1]!.etiqueta}
      </text>
    </svg>
  );
}
