'use client';

// Las piezas de cromo. Son pocas y son pequeñas a propósito: en esta pantalla
// el contenido son los dibujos (`graficos.tsx`), y todo lo de aquí existe para
// que un número se lea a tres metros y para que NO haga falta un párrafo.
//
// PRESUPUESTO DE PALABRAS (Alex, 12-ago): cero párrafos; un pie de ocho
// palabras como mucho, y opcional; si una frase lleva coma, sobra. Por eso
// `Bloque` no tiene ranura de nota — no es que no se use, es que no existe: una
// ranura para prosa acaba llena de prosa.

import type { ReactNode } from 'react';
import { R, S } from '../../kit-composicion/tokens';
import { tonoDe, type ClaseVeredicto } from './modelo';

// ---------------------------------------------------------------------------
// EL VEREDICTO — dos o tres palabras, y nada debajo
// ---------------------------------------------------------------------------

export function Veredicto({ clase, frase, children }: { clase: ClaseVeredicto; frase: string; children?: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: S.s }}>
      <Etiqueta>Correr</Etiqueta>
      <h1
        style={{
          margin: 0,
          font: 'italic 800 42px/0.98 var(--twin-font-sans)',
          letterSpacing: '-0.03em',
          color: tonoDe(clase),
        }}
      >
        {frase}
      </h1>
      {children}
    </section>
  );
}

export function Etiqueta({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        font: '600 10px/1.2 var(--twin-font-sans)',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: 'var(--twin-faint)',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL BLOQUE — etiqueta, cifra, dibujo. Sin ranura para prosa.
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
 * hubo un trineo. Ahora es un punto y dos palabras: el que quiera saber por qué
 * lo pregunta, y el que no, no paga por leerlo.
 */
function Sello() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: R.pill,
        border: '1px solid var(--twin-hairline-strong)',
        font: '600 9px/1.2 var(--twin-font-sans)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--twin-muted)',
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--twin-accent)' }} />
      Solo aquí
    </span>
  );
}

// ---------------------------------------------------------------------------
// LA CIFRA — grande, tabular, con la unidad pequeña al lado
// ---------------------------------------------------------------------------

export function Cifra({
  valor,
  unidad,
  tono = 'var(--twin-fg)',
  tam = 56,
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: S.s, flexWrap: 'wrap' }}>
      <span
        style={{
          // Nada de atajo `font` aquí: el atajo REINICIA font-variant-numeric,
          // así que la cifra perdía las tabulares en cuanto React repintaba.
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          fontSize: tam,
          lineHeight: 0.92,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          color: tono,
        }}
      >
        {valor}
      </span>
      {unidad && (
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{unidad}</span>
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
 * obligaría a leer para saber si eso es bueno — que es lo que esta pantalla ha
 * dejado de hacer. Arriba y verde es mejor en todas partes, igual que en los
 * gráficos lo bueno va arriba.
 */
export function Delta({ mejor, valor, ventana }: { mejor: boolean | null; valor: string; ventana: string }) {
  const tono = mejor == null ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-warning)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      {mejor != null && (
        <span style={{ font: `700 13px/1 var(--twin-font-sans)`, color: tono }}>{mejor ? '▲' : '▼'}</span>
      )}
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 700,
          fontSize: 15,
          lineHeight: 1.2,
          fontVariantNumeric: 'tabular-nums',
          color: tono,
        }}
      >
        {valor}
      </span>
      <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{ventana}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// EL BOTÓN — el único texto que se le dedica a lo que falta
// ---------------------------------------------------------------------------

export function Boton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        height: 44,
        borderRadius: R.m,
        border: '1px solid var(--twin-accent)',
        background: 'transparent',
        color: 'var(--twin-accent-text)',
        font: '700 14px/1 var(--twin-font-sans)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/** La raya que separa bloques. El único cromo entre uno y el siguiente. */
export function Raya() {
  return <div style={{ height: 1, background: 'var(--twin-hairline)' }} />;
}
