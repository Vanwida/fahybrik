'use client';

// El marco de la muñeca y sus dos páginas.
//
// LA TESIS DE LA FAMILIA, en tres reglas que valen para los cuatro escenarios:
//
//  1. La PANTALLA es el botón. El reloj de hoy gasta 52 pt de alto (el 21 % del
//     lienzo) en un botón grande, y por eso su héroe se queda en 54 px. Aquí el
//     gesto de avanzar lo recoge todo el área de contenido, y esos 52 pt vuelven
//     al sujeto, que pasa a medir 120-130 pt.
//  2. El BISEL es el progreso (aro.tsx). Las esquinas redondeadas no admiten
//     texto: ahí va la estructura, gratis.
//  3. Las BANDAS de safe area son el cromo. Arriba el contexto de una línea,
//     abajo los puntos de página. Entre medias, SOLO el sujeto y un segundo
//     nivel. Nunca un tercero.
//
// Color: el fondo entero se tiñe con el estado (tu zona de pulso, o el verde de
// recuperación) a sangre, que es lo que se ve de reojo. El tinte va al 38 % como
// máximo y en una banda central, no a plena pantalla: por encima de ahí el aro
// naranja cae por debajo de 3:1 sobre una zona ámbar, y el texto atenuado por
// debajo de 4,5:1. El sujeto es SIEMPRE blanco (contraste máximo contra
// cualquier zona); el color vive en el fondo y en el aro.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { estimateWidth, fitScale } from '../watch-live/format';
import { W, zoneColor } from '../watch-live/theme';
import { ZONA_NOMBRE, zonaDe } from './guion';

/** Ancho máximo del sujeto: el lienzo (208) menos el aro y su aire. */
const MAX_SUJETO = 190;
/** Altura de las cifras de SF Pro respecto al cuerpo de la fuente. */
const CAP_EM = 0.72;
/** Caja de línea ceñida: lo que llena la pantalla es el GLIFO, no la caja. */
const INTERLINEA = 0.8;
/** Tope del tinte de estado. Por encima el aro y las etiquetas pierden contraste. */
const TINTE_MAX = 38;

export function tinte(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, ${W.bg})`;
}

// ---------------------------------------------------------------------------
// El sujeto
// ---------------------------------------------------------------------------

/**
 * El número que gobierna. `alto` es la altura ÓPTICA que se le pide a las
 * cifras; de ahí sale el cuerpo de fuente. Si el texto no cabe a lo ancho,
 * encoge como el `minimumScaleFactor` del reloj, así que el número CRECE solo
 * al pasar de 3 cifras a 2, o al bajar la cuenta atrás de un minuto. Eso no es
 * un efecto de más: es urgencia dicha en tamaño, y sale gratis del formato.
 *
 * Recto, no cursivo: el reloj espejo inclina sus cifras, pero a 90 px sobre un
 * lienzo de 208 la inclinación se come justo el ancho que el sujeto necesita, y
 * la diagonal pelea con la curva del bisel.
 */
export function Sujeto({
  texto,
  unidad,
  alto,
  color = W.ink,
  latido = 0,
}: {
  texto: string;
  unidad?: string;
  alto: number;
  color?: string;
  /** Cambiar este número da un golpe de escala: el marcador «late» al sumar. */
  latido?: number;
}) {
  // Late al CAMBIAR, no al montar: el marcador arranca con una cifra ya puesta.
  // La animación va por la API del navegador y no por estado de React: es un
  // golpe visual de 340 ms, no información, y no tiene por qué costar renders.
  const cajaRef = useRef<HTMLDivElement>(null);
  const primeroRef = useRef(true);
  useEffect(() => {
    if (primeroRef.current) {
      primeroRef.current = false;
      return;
    }
    const el = cajaRef.current;
    if (!el || typeof el.animate !== 'function' || sinMovimiento()) return;
    const golpe = el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 340, easing: 'ease-out' },
    );
    return () => golpe.cancel();
  }, [latido]);

  const cuerpo = alto / CAP_EM;
  const cuerpoUnidad = cuerpo * 0.3;
  const ancho = estimateWidth(texto, cuerpo) + (unidad ? estimateWidth(unidad, cuerpoUnidad) : 0);
  const ajuste = fitScale(ancho, MAX_SUJETO);

  return (
    <div ref={cajaRef} style={{ display: 'flex', alignItems: 'baseline', flex: '0 0 auto' }}>
      <span
        style={{
          fontSize: cuerpo * ajuste,
          lineHeight: INTERLINEA,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          color,
          transition: 'font-size 260ms ease-out, color 320ms ease',
        }}
      >
        {texto}
      </span>
      {unidad ? (
        <span
          style={{
            fontSize: cuerpoUnidad * ajuste,
            lineHeight: 1,
            fontWeight: 800,
            color: W.dim,
          }}
        >
          {unidad}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El segundo nivel (y no hay tercero)
// ---------------------------------------------------------------------------

const SEGUNDO_BASE = 22;

export function SegundoNivel({
  etiqueta,
  valor,
  color = W.ink,
}: {
  /** Marca de procedencia o de rol, en versales pequeñas: «GPS», «LUEGO». */
  etiqueta?: string;
  valor: string;
  color?: string;
}) {
  // Se ajusta como el sujeto, con un suelo alto: una línea de dosis larga
  // («3 de 4 · 5 × 100 kg») no puede partirse ni salirse del lienzo, pero
  // tampoco encogerse hasta dejar de leerse a distancia de brazo.
  const ancho =
    estimateWidth(valor, SEGUNDO_BASE) + (etiqueta ? estimateWidth(etiqueta, 10) + 6 : 0);
  const ajuste = fitScale(ancho, MAX_SUJETO, 0.7);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
      {etiqueta ? <span style={versales}>{etiqueta}</span> : null}
      <span
        style={{
          fontSize: SEGUNDO_BASE * ajuste,
          lineHeight: 1.1,
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

const versales: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: W.dim,
  whiteSpace: 'nowrap',
};

const contextoEstilo: CSSProperties = {
  ...versales,
  color: 'rgba(255,255,255,0.85)',
  flex: '0 0 auto',
};

// ---------------------------------------------------------------------------
// El marco: fondo teñido, aro, y las dos páginas
// ---------------------------------------------------------------------------

/**
 * El golpe de luz de una transición. Va en estado porque el destello se dispara
 * por SUCESO (cierre de serie, ronda nueva), no por render: sube `n` y el marco
 * lo reproduce. Tipado explícito porque los hexes de WatchTheme son literales.
 */
export interface Destello {
  n: number;
  color: string;
}

export interface MarcoProps {
  /** Banda superior de una línea: dónde estás. */
  contexto: string;
  /** Color que tiñe el fondo en la página de la tarea (zona o recuperación). */
  color: string;
  aro: ReactNode;
  sujeto: ReactNode;
  segundo: ReactNode;
  /** Etiqueta del gesto («TOCA · HECHA»). Sin ella, la página no avanza nada. */
  accion?: string;
  onAvanzar?: () => void;
  /** El pulso: el reloj lo mide siempre, así que la segunda página nunca falta. */
  bpm: number;
  onLog: (linea: string) => void;
  /** Sube este contador para disparar un destello a pantalla completa. */
  destelloN?: number;
  destelloColor?: string;
}

export function Marco({
  contexto,
  color,
  aro,
  sujeto,
  segundo,
  accion,
  onAvanzar,
  bpm,
  onLog,
  destelloN = 0,
  destelloColor = W.orangeSoft,
}: MarcoProps) {
  const [pagina, setPagina] = useState<'tarea' | 'cuerpo'>('tarea');
  const zona = zonaDe(bpm);
  const enCuerpo = pagina === 'cuerpo';
  const tinteActivo = enCuerpo ? zoneColor(zona) : color;

  const cambiarPagina = () => {
    const destino = enCuerpo ? 'tarea' : 'cuerpo';
    setPagina(destino);
    onLog(destino === 'cuerpo' ? 'Página del cuerpo: pulso y zona' : 'Vuelta a la tarea');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: W.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: tinte(tinteActivo, TINTE_MAX),
          transition: 'background-color 700ms ease',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, background: DEGRADADO }} />
      {aro}
      <Destello n={destelloN} color={destelloColor} />

      <div style={{ position: 'absolute', inset: 0, padding: RELLENO, boxSizing: 'border-box' }}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            onClick={enCuerpo ? cambiarPagina : onAvanzar}
            disabled={!enCuerpo && !onAvanzar}
            aria-label={enCuerpo ? 'Volver a la tarea' : (accion ?? 'Sin acción')}
            style={{ ...areaPrincipal, cursor: enCuerpo || onAvanzar ? 'pointer' : 'default' }}
          >
            {enCuerpo ? (
              <PaginaCuerpo bpm={bpm} zona={zona} />
            ) : (
              <>
                <span style={contextoEstilo}>{contexto}</span>
                <span style={{ flex: 1 }} />
                {sujeto}
                <span style={{ flex: 1 }} />
                {segundo}
                <span style={{ ...versales, marginTop: 4, opacity: accion ? 1 : 0 }}>{accion ?? '·'}</span>
              </>
            )}
          </button>
          <button type="button" onClick={cambiarPagina} aria-label="Cambiar de página" style={bandaPuntos}>
            <Punto activo={!enCuerpo} />
            <Punto activo={enCuerpo} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La página del cuerpo. El reloj mide el pulso SIEMPRE (el sensor es suyo), así
 * que esta página existe en los cuatro escenarios y nunca aparece vacía. La
 * zona, en cambio, cuelga de un umbral que hoy es estimado en toda la base, y
 * eso viaja escrito: el atleta tiene que poder distinguir un dato medido de uno
 * derivado de una estimación.
 */
function PaginaCuerpo({ bpm, zona }: { bpm: number; zona: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <>
      <span style={contextoEstilo}>Pulso</span>
      <span style={{ flex: 1 }} />
      <Sujeto texto={String(bpm)} alto={78} />
      <span style={{ flex: 1 }} />
      <SegundoNivel valor={`Z${zona} ${ZONA_NOMBRE[zona]}`} color={zoneColor(zona)} />
      <span style={{ ...versales, marginTop: 4 }}>ppm · umbral estimado</span>
    </>
  );
}

function Punto({ activo }: { activo: boolean }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: activo ? W.ink : 'rgba(255,255,255,0.28)',
        transition: 'background-color 200ms ease',
      }}
    />
  );
}

/** El golpe de luz de las transiciones: entra de golpe y se va en medio segundo. */
function Destello({ n, color }: { n: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (n === 0) return;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || sinMovimiento()) return;
    const luz = el.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    return () => luz.cancel();
  }, [n]);
  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, background: color, opacity: 0, pointerEvents: 'none' }}
    />
  );
}

/**
 * La regla de `prefers-reduced-motion` de twin.css apaga transiciones y
 * animaciones CSS, pero no llega a la API del navegador: aquí se comprueba a
 * mano para que quien la tenga puesta no reciba destellos.
 */
function sinMovimiento(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * El tinte vive en una banda central. Negro arriba (donde corre el aro) y negro
 * abajo (donde viven las etiquetas atenuadas y donde el OLED no gasta).
 */
const DEGRADADO =
  'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.80) 14%, rgba(0,0,0,0) 46%, rgba(0,0,0,0.72) 74%, #000 100%)';

/** Los safe areas del reloj los fija DeviceFrame; a los lados, 2 pt más por el aro. */
const RELLENO =
  'var(--twin-safe-top) calc(var(--twin-safe-right) + 2px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 2px)';

const areaPrincipal: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  color: W.ink,
  font: 'inherit',
  textAlign: 'center',
  cursor: 'pointer',
};

const bandaPuntos: CSSProperties = {
  flex: '0 0 auto',
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  width: '100%',
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
};
