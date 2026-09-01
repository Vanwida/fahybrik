'use client';

// El kit compartido del doble — átomos transcritos de ios/FAHYBRIK/Theme/
// (Theme.swift · Atoms.swift · ScreenScaffold.swift). Si el Swift cambia, esto
// cambia en el MISMO lote.
//
// Vive aquí y no dentro de una pantalla por la regla 0 del CONTRATO-UI: si otro
// fichero puede necesitarlo, va al sitio compartido. Nació privado dentro de
// `screens/benchmark-erg/ui.tsx` y esa vía fue justo la que en la app produjo
// seis relojes y tres grafías del ritmo — aquí se corta antes de empezar.
//
// Incluye además los DOS instrumentos de medida del estudio (`Muerto`,
// `Recortado`): no asertan un número, lo miden del layout reproducido. Así el
// diagnóstico de una pantalla cambia con el escenario en vez de envejecer.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { COLOR_MODALIDAD, type Modalidad } from './datos-reales';
import type { TwinAppearance } from './types';

/** Theme.Spacing. */
export const SP = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
/** Theme.Radius. */
export const RAD = { s: 6, m: 10, l: 14, xl: 20 } as const;

// ---------------------------------------------------------------------------
// ModalityDot y la entrada estándar — compartidos, no privados de una pantalla
// ---------------------------------------------------------------------------

/**
 * `ModalityDot` (Theme/RedesignComponents.swift). El §1 lo prohíbe dibujar a
 * mano: donde va un punto de modalidad va este, no un `Circle()`.
 *
 * Vivía privado en `screens/plan-bloque/atoms.tsx`, que es exactamente la vía
 * por la que el 28-jul nacieron seis relojes y tres grafías del ritmo. Sube al
 * kit la primera vez que una segunda familia de pantallas lo necesita.
 */
export function PuntoModalidad({ modalidad, size = 8 }: { modalidad: Modalidad; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLOR_MODALIDAD[modalidad],
        display: 'inline-block',
        flex: '0 0 auto',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// IconoTipoEntreno — de un vistazo, qué FUE la sesión (card 124)
// ---------------------------------------------------------------------------
//
// `PuntoModalidad` dice de qué modalidad es UN bloque; esto dice qué fue LA
// SESIÓN entera — el equivalente al monigote de Apple Fitness en su círculo de
// color. Vive aquí y no en `lectura-sesion` porque el vocabulario (el tipo, su
// tinte, su glifo) es de la app entera: el historial y cualquier lista de
// sesiones lo va a necesitar en cuanto exista, y repetirlo ahí sería la misma
// vía por la que nacieron los seis relojes del 28-jul.
//
// La CLASIFICACIÓN (qué Sesión produce qué tipo) es dominio y vive en
// `screens/lectura-sesion/modelo.ts` (`tipoDeSesion`); aquí solo el vocabulario
// y el dibujo.

export type TipoEntreno = 'correr' | 'fuerza' | 'hyrox' | 'mixto' | 'funcional';

/**
 * El tinte por tipo. `correr` y `hyrox` comparten color a propósito: es el
 * mismo que `COLOR_MODALIDAD.run` ya usa en toda la app (el rosa es «HYROX»,
 * y correr es la mitad de HYROX — memoria del proyecto). Lo que los distingue
 * es el glifo, no el color.
 */
const TINTE_TIPO: Record<TipoEntreno, string> = {
  correr: 'var(--twin-modality-hyrox)',
  hyrox: 'var(--twin-modality-hyrox)',
  fuerza: 'var(--twin-modality-strength)',
  mixto: 'var(--twin-modality-functional)',
  funcional: 'var(--twin-modality-functional)',
};

/**
 * La tinta del glifo — MEDIDA, no estimada (§4.2 del CONTRATO-UI).
 *
 * Sobre las cuatro combinaciones de tinte×tema el negro casi puro contrasta
 * 7,8:1–10,3:1 en oscuro y el blanco 4,8:1–6,7:1 en claro (contra los hex
 * reales de `twin.css`, con `contrastRatio` de `club-accent.ts`) — los dos
 * MUY por encima del 3:1 que exige un glifo. La combinación cruzada (negro en
 * claro, blanco en oscuro) cae hasta 2,9:1 y no vale: por eso la tinta se
 * decide por TEMA y no por tinte, siempre la misma regla para los cuatro.
 */
function tintaDelGlifo(appearance: TwinAppearance): string {
  return appearance === 'dark' ? '#0b0b0c' : '#ffffff';
}

function GlifoTipo({ tipo, color, size }: { tipo: TipoEntreno; color: string; size: number }) {
  switch (tipo) {
    case 'fuerza':
      // Una barra con sus discos: la lectura inmediata de «fuerza» en todo el
      // sector — el mismo lenguaje que ya usa el punto de modalidad.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <g fill={color}>
            <rect x="1.5" y="10.2" width="2.6" height="3.6" rx="0.8" />
            <rect x="4.6" y="8.4" width="2.2" height="7.2" rx="0.8" />
            <rect x="7.2" y="10.8" width="9.6" height="2.4" />
            <rect x="17.2" y="8.4" width="2.2" height="7.2" rx="0.8" />
            <rect x="19.9" y="10.2" width="2.6" height="3.6" rx="0.8" />
          </g>
        </svg>
      );
    case 'correr':
      // Una figura a media zancada — el mismo lenguaje que el monigote de
      // Apple, en nuestra voz de trazo lleno.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <g fill={color}>
            <circle cx="15.1" cy="4.6" r="2.1" />
            <path d="M13.4 7.3c1.7-.5 3 .1 3.9 1.4l2.3 3.4-1.8 1.3-2-2.9-1.3.9.9 2.3c.2.6.1 1.2-.4 1.6l-4.5 3.9-1.4-1.6 3.8-3.4-1-2.6c-.5-1.3-.1-2.8 1.1-3.8Z" />
            <path d="M9.9 15.9 5.6 18.7l1.1 1.9 4.9-3.1Z" />
            <path d="M12.7 9.6 8.9 11l.6 2 3.9-1.4Z" />
          </g>
        </svg>
      );
    case 'hyrox':
      // El rayo: intensidad cronometrada, la voz que ya usa el sector para lo
      // que se corre contrarreloj y por estaciones.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path d="M13.4 1.8 4.6 13.6h5.4L8.8 22.2l10.6-12.6h-5.9l1.9-7.8Z" fill={color} />
        </svg>
      );
    case 'mixto':
    case 'funcional':
      // El kettlebell: el objeto que representa «funcional» en cualquier box,
      // y el que mejor dice «esto mezcló disciplinas» sin ser ni la barra ni
      // la figura de correr.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            d="M8.6 8.4a3.4 3.4 0 0 1 6.8 0"
            fill="none"
            stroke={color}
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <rect x="6.2" y="8.6" width="11.6" height="11.6" rx="4.6" fill={color} />
        </svg>
      );
  }
}

/**
 * El círculo teñido con su glifo — el sujeto de la cabecera de una lectura de
 * sesión. `size` es el diámetro del círculo; el glifo escala con él.
 */
export function IconoTipoEntreno({
  tipo,
  appearance,
  size = 44,
}: {
  tipo: TipoEntreno;
  appearance: TwinAppearance;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: TINTE_TIPO[tipo],
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
    >
      <GlifoTipo tipo={tipo} color={tintaDelGlifo(appearance)} size={Math.round(size * 0.54)} />
    </span>
  );
}

/** Entrada estándar del doble: sube 6 pt y aparece. El escalón lo pone quien la usa. */
export function entradaStyle(visible: boolean, delayMs: number): CSSProperties {
  return {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(6px)',
    transition: 'opacity 280ms ease-out, transform 280ms ease-out',
    transitionDelay: `${delayMs}ms`,
  };
}

// ---------------------------------------------------------------------------
// CardSurface
// ---------------------------------------------------------------------------

export interface CardProps {
  children: ReactNode;
  padding?: number;
  radius?: number;
  /** Filo de acento de 2 px arriba (CardSurface.topAccent). */
  topAccent?: boolean;
  /** Filo de acento de 3 px a la izquierda (CardSurface.leftAccent). */
  leftAccent?: boolean;
  /** Sube la cara a la capa más clara + sombra hero. */
  elevated?: boolean;
  /**
   * La tarjeta OCUPA el hueco que le den y sus hijos se lo reparten — la
   * estrategia `llena` (§6.1) cuando el contenido no llega solo al alto. El
   * sobrante entra en las filas, que es lo que las hace acertables de pie y
   * sudando; nunca se acumula en una cola debajo.
   */
  fill?: boolean;
  style?: CSSProperties;
}

export function Card({
  children,
  padding = SP.l,
  radius = RAD.l,
  topAccent = false,
  leftAccent = false,
  elevated = false,
  fill = false,
  style,
}: CardProps) {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: radius,
        overflow: 'hidden',
        // Relleno en capas: degradado casi vertical elevado → surface, para que
        // la cara tenga un brillo superior en vez de ser una losa plana.
        background: elevated
          ? 'linear-gradient(to bottom, var(--twin-surface-elevated), var(--twin-surface))'
          : 'linear-gradient(to bottom, var(--twin-surface), color-mix(in srgb, var(--twin-surface) 92%, transparent))',
        boxShadow: elevated ? 'var(--twin-shadow-hero)' : 'var(--twin-shadow-card)',
        ...(fill ? { flex: 1, display: 'flex', flexDirection: 'column' as const, minHeight: 0 } : null),
        ...style,
      }}
    >
      {topAccent && <div style={{ height: 2, background: 'var(--twin-accent)' }} />}
      <div style={fill ? { padding, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : { padding }}>
        {children}
      </div>
      {leftAccent && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--twin-accent)' }} />
      )}
      {/* Costura hairline, algo más viva en el borde superior (el labio iluminado). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          border: '1px solid transparent',
          background:
            'linear-gradient(to bottom, var(--twin-hairline-strong), var(--twin-hairline)) border-box',
          WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** LabelText — micro-etiqueta en versales con tracking. */
export function Label({
  children,
  color = 'var(--twin-muted)',
  size = 11,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `600 ${size}px/1.1 var(--twin-font-sans)`,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** MonoText — cifras tabulares de instrumento. */
export function Mono({
  children,
  size = 13,
  weight = 500,
  color = 'var(--twin-fg)',
  italic = false,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: number;
  color?: string;
  italic?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `${italic ? 'italic ' : ''}${weight} ${size}px/1.1 var(--twin-font-mono)`,
        fontVariantNumeric: 'tabular-nums',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Título en la voz Fabrik: cursiva heavy. */
export function Display({
  children,
  size,
  color = 'var(--twin-fg)',
  tracking = '-0.01em',
  style,
}: {
  children: ReactNode;
  size: number;
  color?: string;
  tracking?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        font: `italic 800 ${size}px/1.1 var(--twin-font-sans)`,
        letterSpacing: tracking,
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Hairline({ style }: { style?: CSSProperties }) {
  return <div aria-hidden style={{ height: 1, background: 'var(--twin-hairline)', ...style }} />;
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

/** ExpertPrimaryButton — relleno naranja, glifo accentOn, cursiva heavy. */
export function CTA({
  title,
  onClick,
  height = 54,
  style,
}: {
  title: string;
  onClick: () => void;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tw-btn-primary"
      style={{ width: '100%', height, fontSize: 16, letterSpacing: '0.06em', ...style }}
    >
      {title}
    </button>
  );
}

/** SecondaryButton — contorno, sin relleno. */
export function SecondaryCTA({
  title,
  onClick,
  height = 44,
  style,
}: {
  title: string;
  onClick: () => void;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <button type="button" onClick={onClick} className="tw-btn-secondary" style={{ width: '100%', height, fontSize: 14, ...style }}>
      {title}
    </button>
  );
}

/** Botón circular de chrome (salir / atrás), 34 pt. */
export function RoundButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
        padding: 0,
        flex: '0 0 auto',
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Avisos — el patrón de la app para aviso inline (fondo tinte + icono)
// ---------------------------------------------------------------------------

export function Notice({
  tone,
  children,
}: {
  tone: 'warning' | 'ok' | 'accent';
  children: ReactNode;
}) {
  const color = `var(--twin-${tone === 'accent' ? 'accent-text' : tone})`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: SP.s,
        padding: SP.m,
        borderRadius: RAD.m,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color: 'var(--twin-fg)',
      }}
    >
      <span style={{ color, display: 'inline-flex', flex: '0 0 auto', paddingTop: 1 }}>
        <IconWarning />
      </span>
      <span style={{ font: '500 13px/1.35 var(--twin-font-sans)' }}>{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScreenScaffold — la columna de pantalla con la acción anclada abajo
// ---------------------------------------------------------------------------

/**
 * `.anchoredAction { }`: cuerpo flexible + acción SIEMPRE visible al fondo
 * (§6, regla 3). El cuerpo lleva `minHeight: 0` para que un hijo que scrollea
 * pueda encogerse en vez de empujar el botón fuera de la pantalla.
 */
export function Pantalla({
  children,
  accion,
  padding = SP.m,
  gap = SP.m,
}: {
  children: ReactNode;
  accion?: ReactNode;
  padding?: number;
  gap?: number;
}) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap,
        padding,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap }}>
        {children}
      </div>
      {accion && <div style={{ flex: '0 0 auto' }}>{accion}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los instrumentos de medida del estudio
// ---------------------------------------------------------------------------

/**
 * El sobrante que hoy no hace nada — se mide solo.
 *
 * Ocupa el hueco que en la app de hoy queda vacío y publica su alto REAL en pt
 * (el lienzo del doble es 1:1 con el iPhone 17 Pro: 402×874 pt, y `offsetHeight`
 * va sin escalar). Cambia de escenario y el número cambia con él.
 *
 * Solo se pinta en la vista «hoy»: es el diagnóstico, no la app.
 */
export function Muerto({ nota }: { nota?: string }) {
  const [alto, setAlto] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // La primera medida la da el propio ResizeObserver, que dispara al observar:
  // no hace falta un setState suelto en el efecto (y así no encadena renders).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAlto(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        borderRadius: RAD.m,
        border: '1px dashed color-mix(in srgb, var(--twin-danger) 45%, transparent)',
        background:
          'repeating-linear-gradient(135deg, color-mix(in srgb, var(--twin-danger) 9%, transparent) 0 6px, transparent 6px 14px)',
      }}
    >
      {alto >= 44 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: 6, textAlign: 'center' }}>
          <Mono size={alto >= 120 ? 22 : 13} weight={700} color="var(--twin-danger)">
            {alto} pt
          </Mono>
          {alto >= 90 && <Label size={9} color="var(--twin-danger)">sin nada</Label>}
          {nota && alto >= 150 && (
            <span style={{ font: '500 11px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 220 }}>
              {nota}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lo que hoy se corta — también se mide solo.
 *
 * Recorta a su hueco (como hace el `clipShape` de la app) y publica cuántos pt
 * de contenido se han quedado fuera. Sin scroll a propósito: en retrato la app
 * tampoco lo tiene, y ese es justo el fallo que hay que poder VER.
 */
export function Recortado({ children }: { children: ReactNode }) {
  const [fuera, setFuera] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const dentro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = caja.current;
    const d = dentro.current;
    if (!c || !d) return;
    const ro = new ResizeObserver(() => setFuera(Math.max(0, d.offsetHeight - c.clientHeight)));
    ro.observe(c);
    ro.observe(d);
    return () => ro.disconnect();
  }, []);

  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
      <div ref={caja} style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: RAD.m }}>
        <div ref={dentro}>{children}</div>
      </div>
      {fuera > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: `0 0 ${RAD.m}px ${RAD.m}px`,
            background: 'linear-gradient(to top, var(--twin-danger), color-mix(in srgb, var(--twin-danger) 0%, transparent))',
            color: '#fff',
          }}
        >
          <Mono size={13} weight={700} color="#fff">
            {fuera} pt
          </Mono>
          <Label size={9} color="rgba(255,255,255,0.9)">
            recortados
          </Label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iconos — SVG mínimos, equivalentes a los SF Symbols que usa la app
// ---------------------------------------------------------------------------

/** ProgressView: SMIL en vez de keyframes CSS (aquí no hay hoja de estilos). */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="8" cy="8" r="6" opacity="0.2" />
        <path d="M8 2a6 6 0 0 1 6 6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 8 8"
            to="360 8 8"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </g>
    </svg>
  );
}

export function IconWarning({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M8 1.6 15 14H1L8 1.6Z" fill="currentColor" />
      <path d="M8 6v3.6" stroke="var(--twin-bg)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.85" fill="var(--twin-bg)" />
    </svg>
  );
}

export function IconCheckCircle({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="m4.9 8.2 2.1 2.1 4-4.3" fill="none" stroke="var(--twin-bg)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCircle({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconChevron({ dir = 'right', size = 13 }: { dir?: 'left' | 'right'; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      style={{ transform: dir === 'left' ? 'scaleX(-1)' : undefined }}
    >
      <path d="m6 3.4 5 4.6-5 4.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClose({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path d="M3.6 3.6 12.4 12.4M12.4 3.6 3.6 12.4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function IconHeart({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 14S1.6 10.2 1.6 5.9A3.6 3.6 0 0 1 8 3.7a3.6 3.6 0 0 1 6.4 2.2C14.4 10.2 8 14 8 14Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** `square.stack.3d.up` — el ciclo entero: tres paradas apiladas, una encima
 *  de otra, igual que las etapas de la espina. */
export function IconStack({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 2.2 13.6 4.6 8 7 2.4 4.6Z M8 6.9 13.6 9.3 8 11.7 2.4 9.3Z M8 10.9 13.6 13.3 8 15.7 2.4 13.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** `calendar` — el historial de entrenos. */
export function IconCalendar({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3.4" width="12" height="10.8" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6.6h12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 1.7v2.6M10.6 1.7v2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** `message` — el chat con el coach. */
export function IconMessage({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <rect x="1.8" y="2.6" width="12.4" height="8.6" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 11.2v2.6l3.2-2.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
