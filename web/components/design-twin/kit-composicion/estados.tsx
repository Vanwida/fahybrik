'use client';

// Estados y filas compartidos por las cuatro pantallas de composición.
//
// Dos piezas cargan casi todo el peso del §6:
//   · `EstadoCentrado` — el arquetipo Vacío. La salida es OBLIGATORIA por tipo:
//     o una acción, o una frase que declare por qué no la hay (§5). No se puede
//     construir uno mudo, lo impide el tipo.
//   · `HuecoMuerto` — la regla del alto medida en vivo. Se pinta solo en los
//     escenarios «HOY», para que el problema se VEA antes de aprobar el arreglo.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Chevron, Etiqueta, Hairline } from './chrome';
import { R, S } from './tokens';

// ---------------------------------------------------------------------------
// El arquetipo Vacío — «qué falta y por qué», centrado, con salida obligatoria
// ---------------------------------------------------------------------------

/**
 * La salida de un vacío es obligatoria, y solo hay dos formas legítimas:
 * una acción que el atleta puede tocar AHORA, o la declaración honesta de
 * quién lo desbloquea y cuándo. Un vacío sin ninguna de las dos no compila.
 */
export type SalidaVacio =
  | {
      tipo: 'accion';
      texto: string;
      onTap?: () => void;
      secundaria?: { texto: string; onTap?: () => void };
      /** Cuando además hay algo fuera de su mano, se declara aquí. */
      nota?: string;
    }
  | { tipo: 'depende'; quien: string; cuando: string };

export function EstadoCentrado({
  eyebrow,
  titulo,
  cuerpo,
  cifra,
  salida,
}: {
  eyebrow?: string;
  titulo: string;
  cuerpo: string;
  /** El sujeto cuando lo hay: una cifra que se lee a tres metros. */
  cifra?: ReactNode;
  salida: SalidaVacio;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: S.m,
        padding: `0 ${S.xl}px`,
        maxWidth: 340,
      }}
    >
      {eyebrow ? <Etiqueta color="var(--twin-accent-text)">{eyebrow}</Etiqueta> : null}
      {cifra}
      <h2 className="t-headline-s" style={{ margin: 0, color: 'var(--twin-fg)' }}>
        {titulo}
      </h2>
      <p style={{ margin: 0, font: '400 14px/1.5 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{cuerpo}</p>
      {salida.tipo === 'accion' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S.s, width: '100%', marginTop: S.xs }}>
          <button type="button" className="tw-btn-primary" onClick={salida.onTap} style={{ width: '100%' }}>
            {salida.texto}
          </button>
          {salida.secundaria ? (
            <button
              type="button"
              onClick={salida.secundaria.onTap}
              style={{
                all: 'unset',
                cursor: 'pointer',
                textAlign: 'center',
                padding: `${S.s}px 0`,
                font: '600 14px/1.2 var(--twin-font-sans)',
                color: 'var(--twin-accent-text)',
              }}
            >
              {salida.secundaria.texto}
            </button>
          ) : null}
          {salida.nota ? (
            <p style={{ margin: 0, font: '400 12px/1.45 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              {salida.nota}
            </p>
          ) : null}
        </div>
      ) : (
        // No hay acción posible: entonces se DICE quién la desbloquea y cuándo.
        // Esto sigue siendo una salida — lo que no vale es callarse.
        <div
          style={{
            marginTop: S.xs,
            padding: `${S.m}px ${S.l}px`,
            borderRadius: R.l,
            border: '1px dashed var(--twin-hairline-strong)',
            font: '500 13px/1.45 var(--twin-font-sans)',
            color: 'var(--twin-muted)',
          }}
        >
          Lo publica <b style={{ color: 'var(--twin-fg)', fontWeight: 650 }}>{salida.quien}</b>
          <br />
          {salida.cuando}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La fila de Lista que LLEVA SU DATO (§4: el dato pesa más que su etiqueta)
// ---------------------------------------------------------------------------

export interface FilaDatoProps {
  etiqueta: string;
  /**
   * El número por el que se abre la fila. Ausente = aún no hay dato.
   * SOLO la cifra: el monoespaciado es la voz del readout y una palabra («de»,
   * «kg») dentro de él sale con el espaciado de una columna de instrumento.
   */
  valor?: string;
  /** Lo que acompaña a la cifra (unidad o resto del contador), en sans. */
  sufijo?: string;
  /** Contexto del número (cuál levantamiento, de dónde sale, cuándo). */
  pie?: string;
  /**
   * El subtítulo explicativo SOLO sobrevive cuando no hay dato, y entonces es
   * una invitación: dice qué acto lo llena, no qué hay dentro de la puerta.
   */
  invitacion?: string;
  /** Adorno a la izquierda del chevron (una pastilla de estado, por ejemplo). */
  accesorio?: ReactNode;
  acento?: boolean;
  onTap?: () => void;
}

export function FilaDato({ etiqueta, valor, sufijo, pie, invitacion, accesorio, acento, onTap }: FilaDatoProps) {
  const hayDato = valor !== undefined;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        width: '100%',
        padding: `${S.m}px ${S.l - 2}px`,
        minHeight: 58,
      }}
      aria-label={
        hayDato
          ? `${etiqueta}: ${valor}${sufijo ? ` ${sufijo}` : ''}${pie ? `, ${pie}` : ''}`
          : `${etiqueta}: sin dato. ${invitacion ?? ''}`
      }
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            // La etiqueta BAJA cuando hay dato (13/500) y sube a voz principal
            // cuando la fila está vacía, porque entonces ella es el sujeto.
            font: hayDato ? '500 13px/1.3 var(--twin-font-sans)' : '600 15px/1.3 var(--twin-font-sans)',
            color: hayDato ? 'var(--twin-muted)' : 'var(--twin-fg)',
          }}
        >
          {etiqueta}
        </span>
        {!hayDato && invitacion ? (
          <span style={{ font: '400 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{invitacion}</span>
        ) : null}
      </span>
      {accesorio}
      {hayDato ? (
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span
              style={{
                // 22 contra 13: el dato manda, y se nota a tres metros.
                font: '700 22px/1.05 var(--twin-font-mono)',
                fontVariantNumeric: 'tabular-nums',
                color: acento ? 'var(--twin-accent-text)' : 'var(--twin-fg)',
              }}
            >
              {valor}
            </span>
            {sufijo ? (
              <span style={{ font: '500 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{sufijo}</span>
            ) : null}
          </span>
          {pie ? (
            <span style={{ font: '500 10.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{pie}</span>
          ) : null}
        </span>
      ) : null}
      <Chevron />
    </button>
  );
}

/** Grupo de filas con hairline entre ellas (CardSurface(padding: 0)). */
export function GrupoFilas({ children }: { children: ReactNode[] }) {
  const filas = children.filter(Boolean);
  return (
    <div
      style={{
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        borderRadius: R.l,
        overflow: 'hidden',
      }}
    >
      {filas.map((f, i) => (
        <div key={i}>
          {i > 0 ? <Hairline /> : null}
          {f}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El instrumento de medida — solo en los escenarios «HOY»
// ---------------------------------------------------------------------------

/**
 * Anotación de estudio: señala un problema que NO es de altura (una jerarquía
 * tipográfica plana, una puerta sin cifra). Se pinta pegada a lo que critica.
 */
export function Anotacion({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.s,
        margin: `${S.xs}px 0 0`,
        padding: `${S.xs}px ${S.s}px`,
        borderRadius: R.s,
        border: '1.5px dashed color-mix(in srgb, var(--twin-accent) 55%, transparent)',
        background: 'color-mix(in srgb, var(--twin-accent) 8%, transparent)',
        font: '600 10.5px/1.35 var(--twin-font-mono)',
        color: 'var(--twin-accent-text)',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Ocupa el sobrante de una pantalla apilada desde arriba y dice cuánto mide.
 * No es UI de la app: es la regla del §6.1 hecha visible. Mide el DOM en vivo,
 * así que el número no puede quedarse obsoleto respecto al mockup que rodea.
 */
export function HuecoMuerto({ nota }: { nota?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAlto(Math.round(el.clientHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        flex: 1,
        minHeight: 0,
        margin: `${S.s}px ${S.s}px`,
        borderRadius: R.m,
        border: '1.5px dashed color-mix(in srgb, var(--twin-accent) 55%, transparent)',
        background:
          'repeating-linear-gradient(135deg, color-mix(in srgb, var(--twin-accent) 7%, transparent) 0 8px, transparent 8px 18px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        textAlign: 'center',
        padding: S.m,
      }}
    >
      <span
        style={{
          font: '700 13px/1 var(--twin-font-mono)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-accent-text)',
          letterSpacing: '0.04em',
        }}
      >
        {alto} pt muertos
      </span>
      {nota ? (
        <span style={{ font: '500 10.5px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 240 }}>
          {nota}
        </span>
      ) : null}
    </div>
  );
}
