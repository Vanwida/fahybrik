'use client';

// Los átomos propios de «Correr». Todo lo que ya existía se usa del kit
// compartido (`../../kit`): Card, Label, Mono, Display, CTA, SP, RAD. Aquí solo
// vive lo que no existe todavía, que es lo que hace distinta a esta pantalla:
//
//   Ambiente  — el lienzo ENTERO teñido del color de tu zona, con transición.
//   BandaZona — las cinco zonas a lo ancho, con tu objetivo señalado.
//   Cifra     — el dato que gobierna, escalado al lienzo (no al viewport).
//   Drenaje   — lo que QUEDA del tramo, vaciándose de verdad.
//   Apoyos    — la fila (o columna) de lecturas de segundo nivel.
//
// Si la propuesta se aprueba, `Ambiente`, `BandaZona` y `Drenaje` suben al kit:
// los va a querer el HUD de remo y el de fuerza igual que este.

import type { CSSProperties, ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { Label, Mono, RAD, SP } from '../../kit';
import type { Zona } from './guion';

const ZONAS: readonly Zona[] = [1, 2, 3, 4, 5];

/** Radio de píldora. Lo escribe así `.tw-pill` en twin.css; el kit no lo exporta. */
const PILDORA = 9999;

// ---------------------------------------------------------------------------
// Ambiente — la zona tiñe el aire, no una tarjeta
// ---------------------------------------------------------------------------

/**
 * Cuánto color aguanta cada tema. En oscuro el tinte tiene que subir para que
 * se lea a dos metros; en claro, con el mismo porcentaje, el lienzo se
 * emborrona y el texto pierde contraste. Por eso el reparto es por apariencia y
 * no un número único.
 */
const MEZCLA: Record<TwinAppearance, { centro: number; suelo: number }> = {
  dark: { centro: 30, suelo: 14 },
  light: { centro: 17, suelo: 8 },
};

function capa(color: string, m: { centro: number; suelo: number }): string {
  return [
    `radial-gradient(115% 75% at 50% 20%, color-mix(in srgb, ${color} ${m.centro}%, transparent), transparent 70%)`,
    `linear-gradient(to top, color-mix(in srgb, ${color} ${m.suelo}%, transparent), transparent 45%)`,
  ].join(', ');
}

/**
 * Una capa por zona, y solo la viva a opacidad 1: así el cambio de zona se
 * TRANSICIONA (un degradado no interpola de un color a otro; dos capas sí).
 * Cuando no hay pulso no hay zona, y entonces no se tiñe nada: el lienzo queda
 * neutro en vez de fingir una intensidad.
 */
export function Ambiente({
  zona,
  appearance,
  acento = false,
}: {
  zona: Zona | null;
  appearance: TwinAppearance;
  /** Tiñe de naranja: se reserva para el instante en que algo se logra. */
  acento?: boolean;
}) {
  const m = MEZCLA[appearance];
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {ZONAS.map((z) => (
        <div
          key={z}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: !acento && zona === z ? 1 : 0,
            transition: 'opacity 1100ms ease',
            background: capa(`var(--twin-z${z})`, m),
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: acento ? 1 : 0,
          transition: 'opacity 500ms ease',
          background: capa('var(--twin-accent)', m),
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// BandaZona — las cinco, a lo ancho, con la tuya encendida
// ---------------------------------------------------------------------------

export function BandaZona({
  zona,
  objetivo,
  alto = 12,
}: {
  zona: Zona | null;
  /** La zona en la que deberías estar: se marca aunque no estés en ella. */
  objetivo?: Zona;
  alto?: number;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, width: '100%' }}>
      {ZONAS.map((z) => {
        const viva = z === zona;
        return (
          <div key={z} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <div
              style={{
                height: viva ? alto + 6 : alto,
                borderRadius: RAD.s,
                background: `var(--twin-z${z})`,
                opacity: viva ? 1 : 0.2,
                transition: 'height 400ms ease, opacity 400ms ease',
                boxShadow: viva ? '0 0 0 2px color-mix(in srgb, var(--twin-fg) 45%, transparent) inset' : 'none',
              }}
            />
            <span
              style={{
                font: `${viva ? 'italic 800' : '600'} 10px/1 var(--twin-font-sans)`,
                letterSpacing: '0.1em',
                textAlign: 'center',
                color: viva ? `var(--twin-z${z})` : 'var(--twin-faint)',
              }}
            >
              {z === objetivo && !viva ? `Z${z} ·` : `Z${z}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cifra — el dato que gobierna
// ---------------------------------------------------------------------------

/**
 * Escala con el LIENZO (unidades de contenedor), no con el viewport: dentro del
 * marco del doble el alto de la ventana no dice nada del alto del teléfono, y
 * con `vh` el número encogería en un portátil bajo aunque en el móvil hubiera
 * sitio de sobra. En horizontal manda el ancho, que es donde está el aire.
 */
// Con el lienzo del iPhone 17 Pro (781 pt útiles en vertical, 756 de ancho en
// horizontal) el 16 % sale a ~125 pt: el número más ancho que se pinta aquí
// («12,5» con su unidad) cabe justo en los 378 pt de ancho útil, y a 125 pt se
// lee de pie, a dos metros y con el móvil en el suelo.
const TAMANOS: Record<'hero' | 'media', Record<'portrait' | 'landscape', string>> = {
  hero: { portrait: 'clamp(64px, 16cqh, 140px)', landscape: 'clamp(64px, 16cqw, 140px)' },
  media: { portrait: 'clamp(30px, 7cqh, 56px)', landscape: 'clamp(30px, 7cqw, 56px)' },
};

export function Cifra({
  children,
  horizontal,
  escala = 'hero',
  tono = 'var(--twin-fg)',
  unidad,
  style,
}: {
  children: ReactNode;
  horizontal: boolean;
  escala?: 'hero' | 'media';
  tono?: string;
  unidad?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'center', ...style }}>
      <span
        className="t-readout-hero"
        style={{ fontSize: TAMANOS[escala][horizontal ? 'landscape' : 'portrait'], color: tono, lineHeight: 0.95 }}
      >
        {children}
      </span>
      {unidad && (
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
          {unidad}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Drenaje — lo que QUEDA, vaciándose
// ---------------------------------------------------------------------------

/**
 * La barra baja en vez de subir: el sujeto de un tramo por distancia es lo que
 * falta, y una barra que crece cuenta la historia contraria (lo hecho), que es
 * justo lo que no necesitas mirando el suelo a 3:50.
 *
 * La transición dura casi el segundo entero y es lineal, así el vaciado se ve
 * continuo y no a saltos de tick.
 */
export function Drenaje({ fraccion, tono = 'var(--twin-accent)' }: { fraccion: number; tono?: string }) {
  const queda = Math.max(0, Math.min(1, 1 - fraccion));
  return (
    <div
      style={{
        height: 10,
        width: '100%',
        borderRadius: PILDORA,
        background: 'color-mix(in srgb, var(--twin-fg) 12%, transparent)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${queda * 100}%`,
          borderRadius: PILDORA,
          background: tono,
          transition: 'width 950ms linear, background-color 400ms ease',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apoyos — el segundo nivel de lectura
// ---------------------------------------------------------------------------

export interface Apoyo {
  etiqueta: string;
  /** `null` = no hay medida. No se pinta el hueco: se pinta la razón (§7). */
  valor: string | null;
  unidad?: string;
  tono?: string;
  /** Lo que hay que decir cuando el valor no existe («sin señal»). */
  ausente?: string;
  /** Marca de procedencia: «declarado», «estimado». */
  marca?: string;
}

export function Apoyos({ items, horizontal }: { items: Apoyo[]; horizontal: boolean }) {
  return (
    <div
      style={{
        display: horizontal ? 'flex' : 'grid',
        flexDirection: horizontal ? 'column' : undefined,
        gridTemplateColumns: horizontal ? undefined : `repeat(${items.length}, minmax(0, 1fr))`,
        gap: SP.s,
        width: '100%',
      }}
    >
      {items.map((a) => (
        <div
          key={a.etiqueta}
          style={{
            display: 'flex',
            flexDirection: horizontal ? 'row' : 'column',
            alignItems: horizontal ? 'baseline' : 'flex-start',
            justifyContent: horizontal ? 'space-between' : undefined,
            gap: horizontal ? SP.m : 5,
            padding: `${SP.s}px ${SP.m}px`,
            borderRadius: RAD.m,
            background: 'color-mix(in srgb, var(--twin-surface) 78%, transparent)',
            border: '1px solid var(--twin-hairline)',
            minWidth: 0,
          }}
        >
          <Label size={10}>{a.etiqueta}</Label>
          {a.valor === null ? (
            <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {a.ausente ?? 'sin medir'}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
              <span className="t-readout-s" style={{ color: a.tono ?? 'var(--twin-fg)', whiteSpace: 'nowrap' }}>
                {a.valor}
              </span>
              {a.unidad && (
                <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{a.unidad}</span>
              )}
              {a.marca && (
                <span style={{ font: '600 9px/1 var(--twin-font-sans)', letterSpacing: '0.08em', color: 'var(--twin-warning)', textTransform: 'uppercase' }}>
                  {a.marca}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pastillas
// ---------------------------------------------------------------------------

/** El objetivo del tramo: naranja, porque el naranja es la acción y la meta. */
export function Objetivo({ children }: { children: ReactNode }) {
  return (
    <span
      className="tw-pill"
      style={{
        color: 'var(--twin-accent-text)',
        borderColor: 'color-mix(in srgb, var(--twin-accent-text) 45%, transparent)',
        background: 'color-mix(in srgb, var(--twin-accent) 12%, transparent)',
        font: '600 12px/1 var(--twin-font-sans)',
      }}
    >
      {children}
    </span>
  );
}

/** El juicio de una palabra: dentro / te pasas / aprieta. */
export function Veredicto({ texto, tono }: { texto: string; tono: string }) {
  return (
    <span
      style={{
        font: 'italic 800 11px/1 var(--twin-font-sans)',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: tono,
      }}
    >
      {texto}
    </span>
  );
}

/** El chip de un dispositivo con su punto de estado. */
export function Chip({
  texto,
  estado,
  children,
}: {
  texto: string;
  estado: 'ok' | 'buscando' | 'mudo';
  children?: ReactNode;
}) {
  const punto = estado === 'ok' ? 'var(--twin-ok)' : estado === 'buscando' ? 'var(--twin-warning)' : 'var(--twin-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        borderRadius: RAD.s,
        background: 'color-mix(in srgb, var(--twin-surface) 80%, transparent)',
        border: '1px solid var(--twin-hairline)',
        color: estado === 'ok' ? 'var(--twin-fg)' : 'var(--twin-muted)',
        maxWidth: '100%',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: punto, flex: '0 0 auto' }} />
      {children}
      <span
        style={{
          font: 'italic 800 9px/1 var(--twin-font-sans)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {texto}
      </span>
    </span>
  );
}

/** Una línea de verdad: lo que la app NO sabe, y qué hacer con ello. */
export function Verdad({ texto, accion }: { texto: string; accion?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: RAD.m,
        background: 'color-mix(in srgb, var(--twin-warning) 15%, transparent)',
        border: '1px solid color-mix(in srgb, var(--twin-warning) 35%, transparent)',
      }}
    >
      <span style={{ flex: 1, font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
      {accion}
    </div>
  );
}

/** Botón de una línea para declarar algo con UN toque. */
export function BotonToque({ titulo, onClick }: { titulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        height: 34,
        padding: `0 ${SP.m}px`,
        borderRadius: RAD.m,
        background: 'var(--twin-accent)',
        color: 'var(--twin-accent-on)',
        border: 0,
        font: 'italic 800 12px/1 var(--twin-font-sans)',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {titulo}
    </button>
  );
}

/** La lectura pequeña que acompaña al sujeto («1:31 el 400 · objetivo 1:32»). */
export function Pie({ children }: { children: ReactNode }) {
  return <Mono size={12} color="var(--twin-muted)">{children}</Mono>;
}

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------

const trazo = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconoPausa({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />
    </svg>
  );
}

export function IconoPlay({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" />
    </svg>
  );
}

/** El pulso del reloj: un corazón, que es como lo dibuja todo el mundo. */
export function IconoPulso({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 20.3 4.2 12.9a4.8 4.8 0 0 1 6.8-6.7l1 1 1-1a4.8 4.8 0 0 1 6.8 6.7Z" fill="currentColor" />
    </svg>
  );
}

/** La cinta: la banda y la consola. */
export function IconoCinta({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 17h14a3 3 0 0 0 0-6H7a3 3 0 0 1 0-6h1" {...trazo} />
      <path d="M19 4v9" {...trazo} />
    </svg>
  );
}

/**
 * La señal: tres ondas que laten mientras busca. La animación va en SMIL, como
 * el `Spinner` del kit, porque aquí no hay hoja de estilos donde declarar
 * keyframes; y `prefers-reduced-motion` ya la neutraliza desde twin.css.
 */
export function IconoSenal({ size = 16, buscando = false }: { size?: number; buscando?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="18" r="2.2" fill="currentColor" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={['M8 14.5a5.5 5.5 0 0 1 8 0', 'M5.5 11.2a9 9 0 0 1 13 0', 'M3 8a12.5 12.5 0 0 1 18 0'][i]} {...trazo}>
          {buscando && (
            <animate
              attributeName="opacity"
              values="0.15;1;0.15"
              dur="1.8s"
              begin={`${i * 0.25}s`}
              repeatCount="indefinite"
            />
          )}
        </path>
      ))}
    </svg>
  );
}
