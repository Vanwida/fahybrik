'use client';

// El vídeo, dibujado.
//
// Un frame 16:9 por ejercicio, hecho con SVG y tokens: nada de <video>, nada de
// imágenes externas. No es relleno bonito — es la única forma de que la ficha
// enseñe DIECISIETE gestos distintos sin material grabado, y de que se vea si
// la miniatura hace su trabajo a 84 px de ancho y a 370.
//
// La pose la manda el gesto, no la modalidad: un `Air Squat` con una barra
// encima sería una instrucción equivocada, y empujar el trineo no se parece a
// arrastrarlo. El tinte del fondo sí sale de la modalidad (COLOR_MODALIDAD),
// así la miniatura y el punto de la fila hablan del mismo color.

import type { CSSProperties, ReactElement } from 'react';
import { reloj } from '../../datos-reales';
import type { Pose } from './data';

const CUERPO: CSSProperties = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const EQUIPO: CSSProperties = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  opacity: 0.42,
};

function Suelo({ de = 20, a = 144 }: { de?: number; a?: number }) {
  return <path d={`M${de} 78 L${a} 78`} style={{ ...EQUIPO, opacity: 0.28 }} />;
}

function Cabeza({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r={5} fill="currentColor" />;
}

// ---------------------------------------------------------------------------
// Los gestos — viewBox 0 0 160 90, suelo en y=78
// ---------------------------------------------------------------------------

const GESTOS: Record<Pose, () => ReactElement> = {
  correr: () => (
    <>
      <Suelo />
      <Cabeza x={86} y={24} />
      <path d="M84 30 L78 50" style={CUERPO} />
      <path d="M82 35 L95 30" style={CUERPO} />
      <path d="M80 38 L68 45" style={CUERPO} />
      <path d="M78 50 L90 60 L94 74" style={CUERPO} />
      <path d="M78 50 L66 60 L74 51" style={CUERPO} />
    </>
  ),
  remo: () => (
    <>
      <path d="M28 74 L140 74" style={EQUIPO} />
      <circle cx={34} cy={56} r={13} style={EQUIPO} />
      <path d="M46 56 L88 52" style={EQUIPO} />
      <path d="M50 48 L46 66" style={EQUIPO} />
      <path d="M96 66 L112 66" style={EQUIPO} />
      <Cabeza x={106} y={32} />
      <path d="M104 38 L100 60" style={CUERPO} />
      <path d="M102 44 L88 52" style={CUERPO} />
      <path d="M100 60 L76 62 L58 60" style={CUERPO} />
    </>
  ),
  ski: () => (
    <>
      <Suelo />
      <path d="M126 12 L126 76" style={EQUIPO} />
      <path d="M112 14 L138 14" style={EQUIPO} />
      <path d="M120 16 L102 34" style={EQUIPO} />
      <path d="M124 16 L106 36" style={EQUIPO} />
      <Cabeza x={90} y={28} />
      <path d="M88 34 L86 56" style={CUERPO} />
      <path d="M88 38 L104 35" style={CUERPO} />
      <path d="M86 56 L78 74" style={CUERPO} />
      <path d="M86 56 L92 74" style={CUERPO} />
    </>
  ),
  bici: () => (
    <>
      <Suelo />
      <circle cx={40} cy={52} r={18} style={EQUIPO} />
      <path d="M52 64 L86 64 L94 44" style={EQUIPO} />
      <path d="M60 40 L76 38" style={EQUIPO} />
      <circle cx={78} cy={62} r={6} style={EQUIPO} />
      <Cabeza x={100} y={26} />
      <path d="M98 32 L92 50" style={CUERPO} />
      <path d="M96 36 L76 38" style={CUERPO} />
      <path d="M92 50 L78 60" style={CUERPO} />
      <path d="M92 50 L86 66" style={CUERPO} />
    </>
  ),
  trineo: () => (
    <>
      <Suelo a={150} />
      <path d="M26 76 L62 76 L58 62 L34 62 Z" style={EQUIPO} />
      <path d="M56 62 L56 44 L64 44" style={EQUIPO} />
      <Cabeza x={106} y={32} />
      <path d="M104 38 L116 58" style={CUERPO} />
      <path d="M105 43 L66 45" style={CUERPO} />
      <path d="M116 58 L126 68 L136 76" style={CUERPO} />
      <path d="M116 58 L108 68 L104 76" style={CUERPO} />
    </>
  ),
  'trineo-cuerda': () => (
    <>
      <Suelo a={150} />
      <path d="M22 76 L54 76 L50 64 L26 64 Z" style={EQUIPO} />
      <path d="M52 66 L98 56" style={EQUIPO} />
      <Cabeza x={112} y={34} />
      <path d="M110 40 L114 58" style={CUERPO} />
      <path d="M110 46 L98 56" style={CUERPO} />
      <path d="M114 58 L104 68 L100 76" style={CUERPO} />
      <path d="M114 58 L124 68 L130 76" style={CUERPO} />
    </>
  ),
  burpee: () => (
    <>
      <Suelo a={150} />
      <path d="M42 72 Q84 30 120 70" style={{ ...EQUIPO, strokeDasharray: '5 7' }} />
      <Cabeza x={126} y={48} />
      <path d="M124 54 L120 66" style={CUERPO} />
      <path d="M124 56 L134 62" style={CUERPO} />
      <path d="M120 66 L128 76" style={CUERPO} />
      <path d="M120 66 L110 76" style={CUERPO} />
    </>
  ),
  carga: () => (
    <>
      <Suelo />
      <path d="M64 56 L76 56 L74 70 L66 70 Z" style={EQUIPO} />
      <path d="M84 56 L96 56 L94 70 L86 70 Z" style={EQUIPO} />
      <Cabeza x={80} y={20} />
      <path d="M80 26 L80 52" style={CUERPO} />
      <path d="M72 30 L70 54" style={CUERPO} />
      <path d="M88 30 L90 54" style={CUERPO} />
      <path d="M80 52 L74 76" style={CUERPO} />
      <path d="M80 52 L86 76" style={CUERPO} />
    </>
  ),
  zancada: () => (
    <>
      <Suelo />
      <path d="M62 27 L98 27" style={{ ...EQUIPO, strokeWidth: 9, opacity: 0.34 }} />
      <Cabeza x={80} y={15} />
      <path d="M80 21 L80 45" style={CUERPO} />
      <path d="M74 29 L70 24" style={CUERPO} />
      <path d="M86 29 L90 24" style={CUERPO} />
      <path d="M80 45 L98 58 L98 76" style={CUERPO} />
      <path d="M80 45 L66 62 L58 74" style={CUERPO} />
    </>
  ),
  lanzamiento: () => (
    <>
      <Suelo de={24} a={150} />
      <path d="M22 8 L22 78" style={{ ...EQUIPO, strokeWidth: 5 }} />
      <path d="M22 20 L42 20" style={EQUIPO} />
      <circle cx={56} cy={26} r={8} style={{ ...EQUIPO, opacity: 0.6 }} />
      <Cabeza x={88} y={36} />
      <path d="M86 42 L84 58" style={CUERPO} />
      <path d="M86 44 L66 32" style={CUERPO} />
      <path d="M84 58 L74 66 L74 76" style={CUERPO} />
      <path d="M84 58 L96 66 L96 76" style={CUERPO} />
    </>
  ),
  sentadilla: () => (
    <>
      <Suelo />
      <path d="M46 37 L114 37" style={{ ...EQUIPO, strokeWidth: 4, opacity: 0.55 }} />
      <path d="M42 28 L42 46" style={{ ...EQUIPO, strokeWidth: 7, opacity: 0.55 }} />
      <path d="M118 28 L118 46" style={{ ...EQUIPO, strokeWidth: 7, opacity: 0.55 }} />
      <Cabeza x={80} y={24} />
      <path d="M80 30 L76 52" style={CUERPO} />
      <path d="M78 37 L64 41" style={CUERPO} />
      <path d="M79 37 L96 41" style={CUERPO} />
      <path d="M76 52 L64 60 L64 76" style={CUERPO} />
      <path d="M76 52 L90 60 L90 76" style={CUERPO} />
    </>
  ),
  'sentadilla-libre': () => (
    <>
      <Suelo />
      <Cabeza x={78} y={22} />
      <path d="M78 28 L74 50" style={CUERPO} />
      <path d="M76 34 L100 33" style={CUERPO} />
      <path d="M74 50 L62 58 L62 76" style={CUERPO} />
      <path d="M74 50 L88 58 L88 76" style={CUERPO} />
    </>
  ),
  balanceo: () => (
    <>
      <Suelo />
      <path d="M132 12 L132 78" style={EQUIPO} />
      <path d="M56 66 Q74 80 94 70" style={{ ...EQUIPO, strokeDasharray: '5 7' }} />
      <Cabeza x={80} y={22} />
      <path d="M80 28 L80 52" style={CUERPO} />
      <path d="M84 32 L128 34" style={CUERPO} />
      <path d="M80 52 L80 76" style={CUERPO} />
      <path d="M80 52 L58 62" style={CUERPO} />
    </>
  ),
  'suelo-rotacion': () => (
    <>
      <path d="M24 74 L138 74" style={{ ...EQUIPO, strokeWidth: 5, opacity: 0.3 }} />
      <path d="M84 40 Q106 34 118 48" style={{ ...EQUIPO, strokeDasharray: '5 7' }} />
      <Cabeza x={46} y={56} />
      <path d="M52 60 L86 66" style={CUERPO} />
      <path d="M56 62 L86 44" style={CUERPO} />
      <path d="M56 65 L88 63" style={CUERPO} />
      <path d="M86 66 L110 60 L124 68" style={CUERPO} />
    </>
  ),
  rodillo: () => (
    <>
      <path d="M22 76 L140 76" style={{ ...EQUIPO, strokeWidth: 5, opacity: 0.3 }} />
      <circle cx={60} cy={65} r={10} style={{ ...EQUIPO, opacity: 0.6 }} />
      <Cabeza x={118} y={40} />
      <path d="M113 45 L90 58" style={CUERPO} />
      <path d="M112 49 L114 70" style={CUERPO} />
      <path d="M90 58 L66 60" style={CUERPO} />
      <path d="M90 60 L72 70" style={CUERPO} />
    </>
  ),
  respiracion: () => (
    <>
      <path d="M28 76 L132 76" style={{ ...EQUIPO, strokeWidth: 5, opacity: 0.3 }} />
      <path d="M62 22 Q80 10 98 22" style={{ ...EQUIPO, strokeDasharray: '4 7' }} />
      <Cabeza x={80} y={34} />
      <path d="M80 40 L80 62" style={CUERPO} />
      <path d="M76 46 L64 64" style={CUERPO} />
      <path d="M84 46 L96 64" style={CUERPO} />
      <path d="M60 70 L80 62 L100 70" style={CUERPO} />
    </>
  ),
  generico: () => (
    <>
      <Suelo />
      <Cabeza x={80} y={26} />
      <path d="M80 32 L80 54" style={CUERPO} />
      <path d="M80 36 L68 48" style={CUERPO} />
      <path d="M80 36 L92 48" style={CUERPO} />
      <path d="M80 54 L72 76" style={CUERPO} />
      <path d="M80 54 L88 76" style={CUERPO} />
    </>
  ),
};

// ---------------------------------------------------------------------------
// El frame
// ---------------------------------------------------------------------------

export interface FrameProps {
  pose: Pose;
  /** Duración del clip. 0 = todavía no hay vídeo grabado y no se pinta reloj. */
  videoS: number;
  /** Color de modalidad para el tinte del fondo. */
  tinte: string;
  /** Ancho en px; sin él ocupa el del contenedor. */
  ancho?: number;
  /** El glifo grande solo en el detalle: en una fila de 84 px taparía el gesto. */
  grande?: boolean;
  style?: CSSProperties;
}

export function FrameVideo({ pose, videoS, tinte, ancho, grande = false, style }: FrameProps) {
  const Gesto = GESTOS[pose];
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: ancho ?? '100%',
        aspectRatio: '16 / 9',
        flex: '0 0 auto',
        borderRadius: grande ? 14 : 8,
        overflow: 'hidden',
        border: '1px solid var(--twin-hairline)',
        background: `linear-gradient(150deg, color-mix(in srgb, ${tinte} 30%, var(--twin-surface-sunken)), var(--twin-surface-sunken) 78%)`,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 160 90"
        width="100%"
        height="100%"
        style={{ display: 'block', color: 'color-mix(in srgb, var(--twin-fg) 74%, transparent)' }}
      >
        <Gesto />
      </svg>
      <Play grande={grande} />
      {videoS > 0 && grande && <Duracion segundos={videoS} />}
    </div>
  );
}

/**
 * Centrado solo en el frame grande. En una miniatura de 84 px un glifo centrado
 * se come el gesto justo cuando el gesto es lo único que hay que ver, así que
 * baja a la esquina y se queda como señal de «esto es un vídeo».
 */
function Play({ grande }: { grande: boolean }) {
  const lado = grande ? 58 : 20;
  return (
    <span
      style={{
        position: 'absolute',
        ...(grande
          ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
          : { bottom: 5, left: 5 }),
        width: lado,
        height: lado,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in srgb, var(--twin-bg) 66%, transparent)',
        border: '1px solid var(--twin-hairline-strong)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <svg width={grande ? 22 : 8} height={grande ? 24 : 9} viewBox="0 0 12 14">
        <path d="M2 1.4 11 7 2 12.6Z" fill="var(--twin-fg)" />
      </svg>
    </span>
  );
}

function Duracion({ segundos }: { segundos: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        right: 10,
        bottom: 10,
        padding: '3px 7px',
        borderRadius: 6,
        background: 'color-mix(in srgb, var(--twin-bg) 72%, transparent)',
        font: '700 11px/1 var(--twin-font-mono)',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--twin-fg)',
      }}
    >
      {reloj(segundos)}
    </span>
  );
}
