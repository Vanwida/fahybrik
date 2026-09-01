'use client';

// LOS ÁTOMOS DE «LA MUÑECA, LEGIBLE» — un mismo juego de piezas que se pinta
// en dos escalas. `Escala` decide el tamaño de CADA pieza contra la tabla de
// `modelo.ts`; ninguna escena escribe un `fontSize` a mano.
//
// El numeral de hoy se pinta CURSIVO — es fiel al reloj real (`kit-watch/
// numeral.tsx`: «el reloj de hoy inclina sus cifras»); el nuevo es recto,
// tabular, sin itálica: la propuesta ya aceptada para el sujeto en
// `kit-watch`. Es la única pieza donde hoy y nuevo comparten método (ancho
// disponible) y difieren sobre todo en la itálica y el desacople de la
// unidad; todo el resto del cromo difiere en tamaño puro.

import type { CSSProperties, ReactNode } from 'react';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { W } from '../watch-live/theme';
import { HOY, NUEVO, hoySujetoPt, nuevoSujetoPt } from './modelo';

export type Escala = 'hoy' | 'nuevo';

// ---------------------------------------------------------------------------
// El lienzo
// ---------------------------------------------------------------------------

export function Lienzo({ tinte = W.bg, children }: { tinte?: string; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: tinte, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: DEGRADADO }} />
      <div style={{ position: 'absolute', inset: 0, padding: RELLENO, boxSizing: 'border-box' }}>
        <div style={COLUMNA}>{children}</div>
      </div>
    </div>
  );
}

const DEGRADADO =
  'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.78) 16%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.7) 76%, #000 100%)';

const RELLENO =
  'var(--twin-safe-top) calc(var(--twin-safe-right) + 2px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 2px)';

const COLUMNA: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  color: W.ink,
};

// ---------------------------------------------------------------------------
// El cromo — versión hoy / nueva de cada pieza
// ---------------------------------------------------------------------------

export function Contexto({ escala, children }: { escala: Escala; children: string }) {
  const pt = escala === 'hoy' ? HOY.contexto : NUEVO.contexto;
  return (
    <span
      style={{
        fontSize: pt,
        fontWeight: 800,
        letterSpacing: escala === 'hoy' ? 1 : 1.2,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.85)',
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      {children}
    </span>
  );
}

export function Nota({ escala, children }: { escala: Escala; children: string }) {
  const pt = escala === 'hoy' ? HOY.nota : NUEVO.nota;
  return (
    <span
      style={{
        fontSize: pt,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: W.dim,
        whiteSpace: 'nowrap',
        marginTop: escala === 'hoy' ? 3 : 5,
        flex: '0 0 auto',
      }}
    >
      {children}
    </span>
  );
}

/** La franja «Toca · X»: dice qué hace el toque — es acción, no cromo de relleno. */
export function AccionBanda({ escala, children }: { escala: Escala; children: string }) {
  const pt = escala === 'hoy' ? HOY.accion : NUEVO.accion;
  return (
    <span
      style={{
        fontSize: pt,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: 'uppercase',
        color: W.ink,
        whiteSpace: 'nowrap',
        marginTop: escala === 'hoy' ? 4 : 6,
        flex: '0 0 auto',
      }}
    >
      {children}
    </span>
  );
}

/**
 * El segundo nivel — y no hay tercero. La etiqueta y el valor llevan tamaños
 * DISTINTOS en la propia auditoría (10→16 la etiqueta, 18→28 el valor): el
 * valor es el trabajo real y pesa más que su etiqueta.
 */
export function SegundoNivel({
  escala,
  etiqueta,
  valor,
  color = W.ink,
}: {
  escala: Escala;
  etiqueta?: string;
  valor: string;
  color?: string;
}) {
  const etiquetaPt = escala === 'hoy' ? HOY.etiquetaSegundo : NUEVO.etiquetaSegundo;
  const valorPt = escala === 'hoy' ? HOY.segundoValor : NUEVO.segundoValor;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
      {etiqueta ? (
        <span
          style={{
            fontSize: etiquetaPt,
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: W.dim,
            whiteSpace: 'nowrap',
          }}
        >
          {etiqueta}
        </span>
      ) : null}
      <span
        style={{
          fontSize: valorPt,
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color,
          whiteSpace: 'nowrap',
        }}
      >
        {valor}
      </span>
    </div>
  );
}

/** Cuerpo explicativo — overlays y vacíos. La única pieza que no es cromo de HUD. */
export function Cuerpo({ escala, children }: { escala: Escala; children: ReactNode }) {
  const pt = escala === 'hoy' ? HOY.cuerpo : NUEVO.cuerpo;
  return (
    <p style={{ fontSize: pt, fontWeight: 600, lineHeight: 1.35, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
      {children}
    </p>
  );
}

/** Botón de ancho completo — 15→18. El único control con relleno propio. */
export function BotonAncho({
  escala,
  children,
  tono = 'neutro',
  onClick,
}: {
  escala: Escala;
  children: string;
  tono?: 'neutro' | 'naranja' | 'peligro';
  onClick?: () => void;
}) {
  const pt = escala === 'hoy' ? HOY.boton : NUEVO.boton;
  const fondo = tono === 'naranja' ? W.orange : tono === 'peligro' ? 'rgba(255,77,77,0.16)' : W.surfaceRaised;
  const color = tono === 'peligro' ? W.zoneRed : W.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        // 44×44 (§8): con la fuente a 18 pt ya no hace falta forzarlo, pero se
        // deja explícito para que el mínimo no dependa de que el texto crezca.
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        borderRadius: 14,
        background: fondo,
        color,
        fontFamily: 'inherit',
        fontSize: pt,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

/**
 * EL SUJETO. Hoy: cubeta por glifos, cursivo. Nuevo: ancho disponible, recto
 * y tabular, con la unidad desacoplada a tamaño fijo (§1, última fila).
 */
export function Numeral({
  escala,
  texto,
  unidad,
  color,
  urgente = false,
}: {
  escala: Escala;
  texto: string;
  unidad?: string;
  color?: string;
  urgente?: boolean;
}) {
  const pt = escala === 'hoy' ? hoySujetoPt(texto, unidad) : nuevoSujetoPt(texto, unidad);
  const tono = color ?? (urgente ? W.orange : W.ink);
  if (escala === 'hoy') {
    // Hoy la unidad comparte tirada y cuerpo proporcional: pegada, cursiva,
    // más pequeña por regla de tres — nunca a un tamaño que se pueda leer
    // sola desde lejos.
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
        <span
          style={{
            fontFamily: 'var(--twin-font-mono)',
            fontSize: pt,
            fontStyle: 'italic',
            fontWeight: 800,
            lineHeight: 0.85,
            fontVariantNumeric: 'tabular-nums',
            color: tono,
          }}
        >
          {texto}
        </span>
        {unidad ? (
          <span
            style={{
              fontFamily: 'var(--twin-font-mono)',
              fontSize: pt * HOY.unidadProporcion,
              fontStyle: 'italic',
              fontWeight: 800,
              color: W.dim,
              marginLeft: 2,
            }}
          >
            {unidad}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
      <span
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontSize: pt,
          fontWeight: 800,
          lineHeight: 0.82,
          fontVariantNumeric: 'tabular-nums',
          color: tono,
          transition: 'font-size 260ms ease-out',
        }}
      >
        {texto}
      </span>
      {unidad ? (
        <span
          style={{
            fontFamily: 'var(--twin-font-mono)',
            // Fija: 20 pt digan lo que digan las cifras de al lado.
            fontSize: NUEVO.unidadFija,
            fontWeight: 800,
            color: W.dim,
            marginLeft: 4,
          }}
        >
          {unidad}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El volante hoy / nuevo — dos páginas reales, no una miniatura
// ---------------------------------------------------------------------------

/**
 * «Sin el antes, el después no se juzga» — pero un lienzo de 208×248 no da
 * para poner los dos lado a lado sin recortar el texto a un tamaño que ya no
 * sería el real. En vez de eso, DOS PÁGINAS a escala 1:1: se desliza (o se
 * toca la etiqueta) para pasar de una a otra, igual que el resto del kit pasa
 * de página. Así lo que se mide en pantalla es el tamaño de verdad, no una
 * miniatura a ojo.
 */
export function VolanteHoyNuevo({
  inicial = 'hoy',
  onLog,
  children,
}: {
  inicial?: Escala;
  onLog: (linea: string) => void;
  children: (escala: Escala) => ReactNode;
}) {
  const [escala, setEscala] = useState<Escala>(inicial);
  const dragX = useRef<number | null>(null);
  const cambiar = () => {
    const destino: Escala = escala === 'hoy' ? 'nuevo' : 'hoy';
    setEscala(destino);
    onLog(destino === 'nuevo' ? 'Página NUEVO: 16 pt de suelo' : 'Página HOY: el cromo de producción');
  };
  const abajo = (e: ReactPointerEvent) => {
    dragX.current = e.clientX;
  };
  const arriba = (e: ReactPointerEvent) => {
    if (dragX.current == null) return;
    const dx = e.clientX - dragX.current;
    dragX.current = null;
    if (Math.abs(dx) >= 24) cambiar();
  };
  return (
    <div
      style={{ position: 'absolute', inset: 0, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={abajo}
      onPointerUp={arriba}
    >
      {children(escala)}
      {/* Dos puntos, no una etiqueta: cualquier texto aquí competiría con la
          regla de los 16 pt que la propia página está demostrando. El estado
          («HOY» / «NUEVO») ya queda dicho en la cronología del panel. */}
      <div style={puntosModo}>
        <button type="button" onClick={cambiar} aria-label="Ver cómo está hoy" aria-current={escala === 'hoy'} style={puntoBoton}>
          <Punto activo={escala === 'hoy'} />
        </button>
        <button type="button" onClick={cambiar} aria-label="Ver la propuesta nueva" aria-current={escala === 'nuevo'} style={puntoBoton}>
          <Punto activo={escala === 'nuevo'} />
        </button>
      </div>
    </div>
  );
}

function Punto({ activo }: { activo: boolean }) {
  return (
    <span
      style={{
        display: 'block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: activo ? W.ink : 'rgba(255,255,255,0.28)',
      }}
    />
  );
}

const puntosModo: CSSProperties = {
  position: 'absolute',
  top: 7,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 8,
  zIndex: 2,
};

const puntoBoton: CSSProperties = {
  padding: 3,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  lineHeight: 0,
};
