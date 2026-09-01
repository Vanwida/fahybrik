'use client';

// El cromo. Poco y pequeño a propósito: el contenido son los dibujos
// (`graficos.tsx`), y esto existe para que una cifra se lea a tres metros.
//
// LA VOZ SALE DE `lectura-carrera`, mirándola (12-ago). Allí:
//   · el sujeto es un numeral MONO enorme, centrado, con su etiqueta en
//     versalita diminuta y muy espaciada encima;
//   · las secciones se separan con esa misma etiqueta y AIRE, nunca con una
//     línea divisoria ni con una tarjeta;
//   · el naranja de marca aparece una sola vez, en la acción.
// Esta pantalla usa las clases ya shipeadas (`t-readout-label`) en vez de
// reescribir sus valores, para que no puedan divergir.
//
// PRESUPUESTO DE PALABRAS (Alex, 12-ago): cero párrafos; un pie de ocho
// palabras como mucho, y opcional. Por eso `Bloque` NO tiene ranura de nota: no
// es que no se use, es que no existe — una ranura para prosa acaba con prosa.

import type { ReactNode } from 'react';
import { R, S } from '../../kit-composicion/tokens';
import { tonoDe, type ClaseVeredicto } from './modelo';

// ---------------------------------------------------------------------------
// LA ETIQUETA — versalita diminuta, el único separador entre bloques
// ---------------------------------------------------------------------------

export function Etiqueta({ children, centrada }: { children: ReactNode; centrada?: boolean }) {
  return (
    <span
      className="t-readout-label"
      style={{ color: 'var(--twin-faint)', letterSpacing: '0.18em', textAlign: centrada ? 'center' : undefined }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL VEREDICTO — centrado y con todo el aire, como el sujeto de la referencia
// ---------------------------------------------------------------------------

export function Veredicto({ clase, frase, children }: { clase: ClaseVeredicto; frase: string; children?: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S.m, padding: `${S.l}px 0 ${S.s}px` }}>
      <Etiqueta centrada>Correr</Etiqueta>
      <h1
        style={{
          margin: 0,
          // La display en cursiva y negrita de la marca, derivada del logotipo.
          font: 'italic 800 46px/0.94 var(--twin-font-sans)',
          letterSpacing: '-0.035em',
          textAlign: 'center',
          color: tonoDe(clase),
        }}
      >
        {frase}
      </h1>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EL BLOQUE — etiqueta, cifra, dibujo. Sin caja y sin ranura para prosa.
// ---------------------------------------------------------------------------

export function Bloque({ etiqueta, sello, children }: { etiqueta: string; sello?: boolean; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.m }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
        <Etiqueta>{etiqueta}</Etiqueta>
        {sello && <Sello />}
      </div>
      {children}
    </section>
  );
}

/**
 * «Solo aquí» era un renglón de tres frases explicando que Garmin no sabe que
 * hubo un trineo. Ahora son dos palabras y ni siquiera llevan color: el punto
 * naranja que tenían se quitó porque el acento de marca está reservado al
 * instante en que algo se logra, nunca a un estado sostenido (§9.1 del kit), y
 * un sello permanente es exactamente un estado sostenido. En esta pantalla el
 * naranja aparece una sola vez, en la acción, como en `lectura-carrera`.
 */
function Sello() {
  return (
    <span
      style={{
        font: '700 9px/1.2 var(--twin-font-sans)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
      }}
    >
      Solo aquí
    </span>
  );
}

// ---------------------------------------------------------------------------
// LA CIFRA — mono, tabular, con la unidad pequeña al lado
// ---------------------------------------------------------------------------

export function Cifra({
  valor,
  unidad,
  tono = 'var(--twin-fg)',
  tam = 54,
  children,
}: {
  valor: string;
  unidad?: string;
  tono?: string;
  tam?: number;
  /** La variación, pegada al número. */
  children?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span
        style={{
          // Nada de atajo `font`: el atajo REINICIA font-variant-numeric y la
          // cifra perdía las tabulares en cuanto React repintaba.
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          fontSize: tam,
          lineHeight: 0.9,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.045em',
          color: tono,
        }}
      >
        {valor}
      </span>
      {unidad && (
        <span
          style={{
            font: '600 11px/1.2 var(--twin-font-sans)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--twin-muted)',
          }}
        >
          {unidad}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * LA FLECHA SIGNIFICA «MEJOR», NO «MÁS».
 *
 * En ritmo y en coste, mejorar es que el número BAJE. Una flecha que siguiera
 * el signo crudo apuntaría hacia abajo justo cuando el atleta va mejor, y
 * obligaría a leer para saber si eso es bueno. Arriba y verde es mejor en toda
 * la pantalla, igual que en los gráficos lo bueno va arriba.
 */
export function Delta({ mejor, valor, ventana }: { mejor: boolean | null; valor: string; ventana: string }) {
  const tono = mejor == null ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      {mejor != null && <span style={{ font: '700 11px/1 var(--twin-font-sans)', color: tono }}>{mejor ? '▲' : '▼'}</span>}
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 700,
          fontSize: 14,
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
          color: tono,
        }}
      >
        {valor}
      </span>
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.08em', color: 'var(--twin-faint)' }}>
        {ventana}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL BOTÓN — el único texto que se le dedica a lo que falta, y el único naranja
// ---------------------------------------------------------------------------

export function Boton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        height: 48,
        borderRadius: R.m,
        border: 'none',
        background: 'var(--twin-accent)',
        color: 'var(--twin-accent-on)',
        // La acción de la referencia va en display cursiva y versalita.
        font: 'italic 800 15px/1 var(--twin-font-sans)',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
