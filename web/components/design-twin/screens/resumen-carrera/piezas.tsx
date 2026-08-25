'use client';

// Las piezas propias del resumen de una carrera. Todo lo demás (Ambiente,
// Numeral, MarcoVivo, FranjaAccion, Apoyo) sale de `kit-vivo`: esta pantalla no
// reinventa el lenguaje del entreno, lo continúa.

import type { ReactNode } from 'react';
import { reloj, ritmoKm } from '../../kit-composicion/formato';
import type { Certeza, Lectura, Tramo } from '../../tramos';

// ---------------------------------------------------------------------------
// EL PEINE — la refutación de la media, dibujada
// ---------------------------------------------------------------------------

const ALTO_PEINE = 116;
/** Suelo de la barra: un tramo suave sigue teniendo que verse, no desaparecer. */
const ALTO_MIN = 0.24;
/** Aire por encima y por debajo del rango, para que nada toque el borde. */
const MARGEN = 0.08;

/**
 * Una barra por tramo, ancha como su duración y alta como su VELOCIDAD.
 *
 * Alta como la velocidad y no como el ritmo, aunque lo que se lea sea el ritmo:
 * el ritmo es un inverso, y con él la barra del tramo lento sería la más alta.
 * «Más rápido, más alto» es la única lectura que no hay que explicar.
 *
 * Y encima, la línea de la media: discontinua, cruzando el peine por un sitio
 * donde no hay ninguna barra. Ahí está el argumento entero de esta pantalla —
 * la media es una raya que no toca nada.
 */
export function Peine({ tramos, mediaSkm }: { tramos: Tramo[]; mediaSkm: number | null }) {
  const conRitmo = tramos.filter((t) => t.ritmoSkm != null);
  if (conRitmo.length === 0) return null;

  const velocidades = conRitmo.map((t) => 1000 / t.ritmoSkm!);
  const mediaV = mediaSkm != null ? 1000 / mediaSkm : null;
  const todas = mediaV != null ? [...velocidades, mediaV] : velocidades;
  const span = Math.max(...todas) - Math.min(...todas);
  const min = Math.min(...todas) - span * MARGEN;
  const max = Math.max(...todas) + span * MARGEN;
  const fraccion = (v: number) => (max <= min ? 1 : ALTO_MIN + (1 - ALTO_MIN) * ((v - min) / (max - min)));

  return (
    <div>
      <div style={{ position: 'relative', height: ALTO_PEINE, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {tramos.map((t, i) => (
          <Barra key={i} tramo={t} alto={t.ritmoSkm != null ? fraccion(1000 / t.ritmoSkm) : ALTO_MIN} />
        ))}
        {mediaV != null && <LineaMedia alto={fraccion(mediaV)} mediaSkm={mediaSkm!} />}
      </div>
    </div>
  );
}

function Barra({ tramo, alto }: { tramo: Tramo; alto: number }) {
  const fuerte = tramo.tipo === 'fuerte';
  const parado = tramo.tipo === 'parado';
  return (
    <div
      title={`${ETIQUETA_TIPO[tramo.tipo]} · ${reloj(tramo.duracionS)}${
        tramo.ritmoSkm != null ? ` · ${ritmoKm(tramo.ritmoSkm)}` : ''
      }`}
      style={{
        flex: `${Math.max(1, tramo.duracionS)} 1 0`,
        minWidth: 2,
        height: `${alto * 100}%`,
        borderRadius: 3,
        // El naranja de marca NO es un color de dato (§9.1): lo fuerte manda por
        // tinta y por altura, no por color de acento.
        background: parado ? 'transparent' : fuerte ? 'var(--twin-fg)' : 'var(--twin-muted)',
        opacity: parado ? 1 : fuerte ? 0.95 : 0.42,
        border: parado ? '1px dashed var(--twin-hairline-strong)' : 'none',
      }}
    />
  );
}

const ETIQUETA_TIPO: Record<Tramo['tipo'], string> = {
  fuerte: 'Fuerte',
  suave: 'Suave',
  parado: 'Parado',
};

function LineaMedia({ alto, mediaSkm }: { alto: number; mediaSkm: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: `${alto * 100}%`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'none',
      }}
    >
      <div style={{ flex: 1, borderTop: '1px dashed var(--twin-faint)' }} />
      <span
        style={{
          font: '600 10px/1 var(--twin-font-sans)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          whiteSpace: 'nowrap',
          // La etiqueta cae por definición sobre las barras: sin fondo propio se
          // lee encima del blanco de un fuerte y no se entiende ninguno de los dos.
          padding: '2px 5px',
          borderRadius: 4,
          background: 'var(--twin-bg)',
        }}
      >
        {`media ${ritmoKm(mediaSkm)}`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El aguante y la honestidad
// ---------------------------------------------------------------------------

const VEREDICTO: Record<NonNullable<Lectura['aguante']>['veredicto'], { frase: string; tono: string }> = {
  aguantaste: { frase: '', tono: 'var(--twin-ok)' },
  'de-menos-a-mas': { frase: '', tono: 'var(--twin-ok)' },
  'se-te-fue': { frase: '', tono: 'var(--twin-warning)' },
};

/**
 * Lo que de verdad juzga una sesión de calidad. El veredicto sale de comparar
 * mitades, pero lo que se enseña son los dos HECHOS —la primera y la última—,
 * porque son los que el atleta puede reconocer.
 */
export function Aguante({ aguante }: { aguante: NonNullable<Lectura['aguante']> }) {
  const v = VEREDICTO[aguante.veredicto];
  return (
    <Linea>
      <span style={{ font: 'italic 800 15px/1.2 var(--twin-font-sans)', color: v.tono }}>{v.frase}</span>
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {`la primera a ${ritmoKm(aguante.primeraSkm)}, la última a ${ritmoKm(aguante.ultimaSkm)}`}
      </span>
    </Linea>
  );
}

const NOTA_CERTEZA: Record<Certeza, string> = {
  marcados: 'Tramos marcados: los cerró el entreno, no se han inferido.',
  detectados: 'Tramos detectados del ritmo, no marcados. Dato inferido.',
  estimados: 'Tramos estimados del ritmo: la separación entre fuerte y suave va justa.',
};

/** Un tramo inferido no puede leerse igual que uno medido (§7). Y va escrito. */
export function NotaCerteza({ certeza }: { certeza: Certeza }) {
  return (
    <span
      style={{
        font: '500 11px/1.35 var(--twin-font-sans)',
        color: 'var(--twin-faint)',
        display: 'block',
        textAlign: 'center',
      }}
    >
      {NOTA_CERTEZA[certeza]}
    </span>
  );
}

/**
 * EL HUECO DECLARADO — y se declara porque hay un acto concreto que lo llena
 * (§6.2 bis). No para esta carrera, que ya pasó, pero sí para la siguiente:
 * con el reloj conectado las vueltas llegan reales.
 */
export function SinTramos({ prescrito }: { prescrito: boolean }) {
  return (
    <Linea>
      <span style={{ font: 'italic 800 15px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {prescrito ? 'No se guardaron los tramos' : 'Una sola lectura de toda la sesión'}
      </span>
      <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {prescrito
          ? 'Se guardó un ritmo para toda la sesión. Con el reloj conectado llegan las vueltas y sus ritmos.'
          : 'Sin marcas ni serie de ritmo no hay tramos que separar.'}
      </span>
    </Linea>
  );
}

function Linea({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        textAlign: 'center',
        padding: '10px 8px',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--twin-surface) 78%, transparent)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      {children}
    </div>
  );
}
