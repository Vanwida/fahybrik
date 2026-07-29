'use client';

// Los átomos del relevo. Solo lo que es propio de dobles: lo genérico (Card,
// Label, Mono, Hairline, iconos) viene del kit compartido y TODO el lenguaje del
// entreno en vivo (ambiente, numeral, banda, acción, apoyos) viene de
// `kit-vivo`, que es lo que manda el §0 y el §10 del CONTRATO-UI.
//
// Lo propio de dobles es siempre lo mismo: DE QUIÉN es cada cosa. Por eso estos
// átomos llevan `quien` y sacan el color de `COLOR`/`COLOR_TEXTO`, en vez de
// recibir un color suelto que en la siguiente pantalla se elegiría distinto.
//
// OJO con dónde vive la identidad (§10.1): el naranja y el azul dicen QUIÉN, y
// eso es información, así que siguen en la pastilla, en el reparto y en la barra
// bicolor. Lo que NO pueden hacer es teñir el lienzo: el lienzo es TU zona de
// pulso, también mientras rema tu pareja — que es justo el dato que quieres ver
// bajar mientras descansas.

import type { ReactNode } from 'react';
import type { TwinAppearance } from '../../types';
import { Hairline, IconClose, Label, Mono, RAD, SP } from '../../kit';
import { Ambiente, Apoyo, colorZona, zonaDe } from '../../kit-vivo';
import {
  CAMBIO_S,
  COLOR,
  COLOR_TEXTO,
  PAREJA,
  TRAMO,
  metrosPorQuien,
  metrosTexto,
  pulsoRecuperando,
  pulsoRemando,
  velocidad,
  type EscenaLegProps,
  type Quien,
  type Segmento,
} from './data';

/**
 * Lo que recibe una cara del relevo. `EscenaLegProps` (el contrato del motor)
 * más lo único que necesita el LENGUAJE: la apariencia, de la que depende
 * cuánto tinte aguanta el lienzo. Vive aquí y no en `data.ts` porque es una
 * necesidad de cómo se pinta, no del modelo del tramo.
 */
export type EscenaLegVista = EscenaLegProps & { appearance: TwinAppearance };

// ---------------------------------------------------------------------------
// §10.1 · El lienzo de una cara del relevo — TU zona, detrás de todo
// ---------------------------------------------------------------------------

/**
 * Las CUATRO escenas entran por aquí, y por eso el tinte no salta al cambiar de
 * escena: es siempre tu pulso, remes tú o reme ella.
 *
 * El ambiente va fuera del safe area (a sangre, bajo la isla) y el marco dentro.
 */
export function LienzoVivo({
  ppm,
  appearance,
  children,
}: {
  /** Tu pulso. Nulo = sin ancla de FC: lienzo neutro, sin inventar intensidad. */
  ppm: number | null;
  appearance: TwinAppearance;
  children: ReactNode;
}) {
  return (
    <>
      <Ambiente zona={zonaDe(ppm)} appearance={appearance} />
      <div className="twin-screen-safe">{children}</div>
    </>
  );
}

/**
 * Tu pulso en los dos instantes que no son un relevo en curso: el cambio y el
 * cierre del tramo.
 *
 * Sale de las MISMAS curvas que las dos escenas de relevo, así que el tinte no
 * pega un salto al cambiar de escena: si acabas de soltar vienes del pico
 * (`pulsoRemando(1)` = 172), y si el último trozo lo remó tu pareja llevas su
 * relevo entero recuperando, que es exactamente lo que la escena de espera
 * estaba pintando un segundo antes.
 *
 * `trozos` son los relevos cerrados, el último incluido.
 */
export function pulsoTrasRelevo(trozos: Segmento[]): number {
  const ultimo = trozos[trozos.length - 1];
  if (!ultimo || ultimo.quien === 'tu') return pulsoRemando(1);
  const suRelevoS = (ultimo.hastaM - ultimo.desdeM) / velocidad(ultimo.quien);
  return pulsoRecuperando(CAMBIO_S + suRelevoS);
}

// ---------------------------------------------------------------------------
// El cromo — salir, pausar y en qué relevo vas
// ---------------------------------------------------------------------------

/**
 * La fila de arriba, propia y no prestada: antes se traía el `TopStrip` de
 * `entreno-vivo`, que es otra pantalla, y eso ataba dos vistas que no comparten
 * ni el modelo ni el ritmo de cambio. La forma (dos iconos a la izquierda,
 * posición a la derecha) es la de `vivo-erg`, que es la que Alex aprobó.
 */
export function Cromo({
  relevo,
  relevos,
  onSalir,
  onPausa,
}: {
  relevo: number;
  relevos: number;
  onSalir: () => void;
  onPausa: () => void;
}) {
  const boton = (hijo: ReactNode, etiqueta: string, click: () => void) => (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={click}
      style={{
        width: 30,
        height: 30,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 0,
        color: 'var(--twin-muted)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {hijo}
    </button>
  );
  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: SP.s }}>
      {boton(<IconClose size={13} />, 'Salir del entreno', onSalir)}
      {boton(<span style={{ fontSize: 15 }}>‖</span>, 'Pausar el entreno', onPausa)}
      <span style={{ flex: 1 }} />
      <span style={{ font: '500 11px/1.1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {TRAMO.titulo} · dobles
      </span>
      <span
        style={{
          font: 'italic 800 11px/1.1 var(--twin-font-sans)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--twin-accent-text)',
        }}
      >
        Relevo {relevo} de {relevos}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El contexto — el marcador del tramo, la fila que no desaparece jamás
// ---------------------------------------------------------------------------

/**
 * En dobles el crono-puntuación es el TOTAL DE LOS DOS, y por eso ocupa la fila
 * de contexto de la banda (§10.3) en las cuatro escenas: remes tú, reme ella,
 * estéis cambiando o hayáis acabado, el tramo va por donde va.
 *
 * La barra pinta lo que ha pasado DE VERDAD, relevo a relevo: si os cambiáis
 * antes de los 250, el trozo de cada uno cambia con vosotros. Y es aquí donde se
 * ve la regla del motor sin tener que leerla: lo azul no es tuyo y no se te
 * apunta.
 *
 * Sin superficie: es contexto, no una tarjeta — la caja la tenía por inercia y
 * competía con los apoyos de abajo.
 */
export function MarcadorTramo({
  hechos,
  actual,
  metros,
  reloj,
}: {
  hechos: Segmento[];
  actual: Segmento;
  metros: number;
  /** El reloj del tramo. Se omite donde ya sea el sujeto de la pantalla: el
   * mismo 4:24 dos veces en el mismo lienzo no es contexto, es ruido. */
  reloj?: string;
}) {
  const trozos: Segmento[] = [...hechos, { ...actual, hastaM: Math.max(actual.desdeM, metros) }];
  const pct = (m: number) => `${(m / TRAMO.totalM) * 100}%`;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
        <Label size={9}>Total de los dos</Label>
        <span style={{ flex: 1 }} />
        <Mono size={16} weight={800}>
          {metrosTexto(metros)}
        </Mono>
        <Mono size={11} weight={600} color="var(--twin-muted)">
          de {metrosTexto(TRAMO.totalM)} m
        </Mono>
        {reloj && (
          <>
            <span
              aria-hidden
              style={{ width: 1, height: 11, background: 'var(--twin-hairline-strong)', margin: '0 2px' }}
            />
            <Mono size={13} weight={700} color="var(--twin-muted)">
              {reloj}
            </Mono>
          </>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 4,
          overflow: 'hidden',
          background: 'var(--twin-surface-sunken)',
        }}
      >
        {trozos.map((t) => (
          <div
            key={`${t.quien}-${t.desdeM}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: pct(t.desdeM),
              width: pct(Math.max(0, t.hastaM - t.desdeM)),
              background: COLOR[t.quien],
              transition: 'width 900ms linear',
            }}
          />
        ))}
        {/* Las marcas del reparto planeado: dónde TOCABA cambiar. */}
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: pct(i * TRAMO.relevoM),
              width: 2,
              background: 'var(--twin-bg)',
              opacity: 0.85,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El latido de «en vivo» — SMIL, como el Spinner del kit (aquí no hay hoja de
// estilos donde declarar keyframes, y twin.css es de la app, no de una pantalla)
// ---------------------------------------------------------------------------

export function PuntoVivo({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" aria-hidden style={{ flex: '0 0 auto' }}>
      <circle cx="4" cy="4" r="3.2" fill={color}>
        <animate attributeName="opacity" values="1;0.25;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Quién es quién — la pastilla que abre cualquier bloque de persona
// ---------------------------------------------------------------------------

export function PastillaPersona({
  quien,
  texto,
  vivo = false,
  mayusculas = true,
}: {
  quien: Quien;
  texto: string;
  vivo?: boolean;
  /**
   * Falso cuando el texto lleva una UNIDAD dentro. Las versales de la pastilla
   * convierten «250 m» en «250 M», y una eme mayúscula no son metros: es mega.
   * Un nombre («ANA REMA») sí se grita; una unidad, nunca.
   */
  mayusculas?: boolean;
}) {
  const color = COLOR_TEXTO[quien];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 9999,
        color,
        background: `color-mix(in srgb, ${COLOR[quien]} 14%, transparent)`,
        font: 'italic 800 11px/1 var(--twin-font-sans)',
        letterSpacing: '0.1em',
        textTransform: mayusculas ? 'uppercase' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {vivo && <PuntoVivo color={color} />}
      {texto}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Los afijos del numeral — a escala del numeral, nunca a un tamaño a mano
// ---------------------------------------------------------------------------

/** Cuerpo del afijo respecto al del numeral. En `em`: crece y encoge con él. */
const UNIDAD_EM = 0.3;
const ESTIMA_EM = 0.46;

/**
 * La unidad pegada a la cifra del sujeto.
 *
 * No usa la ranura `unidad` de `Numeral`: esa va en `.t-readout-label`, que
 * lleva `text-transform: uppercase` y escribiría «M» donde hay metros (que es
 * mega) y «S» donde hay segundos. Mismo fallo de twin.css que documenta
 * `UnidadRitmo`, y se arregla allí, no aquí.
 */
export function UnidadSujeto({ children }: { children: ReactNode }) {
  // El margen también en `em` — y en los del AFIJO, que es lo que le da un aire
  // proporcional a su propio cuerpo y no un hueco fijo que se abre al encoger.
  return (
    <span style={{ fontSize: `${UNIDAD_EM}em`, marginLeft: '0.4em', color: 'var(--twin-muted)' }}>
      {children}
    </span>
  );
}

/** El `~` de una estimación: pequeño, pegado a la cifra, nunca dentro (§7). */
export function EstimaSujeto() {
  return (
    <span style={{ fontSize: `${ESTIMA_EM}em`, marginRight: '0.2em', color: 'var(--twin-muted)' }}>~</span>
  );
}

/**
 * `/500m` en la voz de instrumento, pero con la eme MINÚSCULA.
 *
 * No usa `.t-readout-label` de twin.css, que lleva `text-transform: uppercase`
 * y escribe «/500M». El §2 del contrato fija la grafía del ritmo con la eme
 * minúscula (`1:52/500m`) porque `M` es el prefijo de mega: «/500M» no es una
 * abreviatura fea, es otra unidad. La clase compartida hereda el fallo y lo
 * arrastran ya el HUD del remo y el reloj; se arregla en `twin.css` (y en el
 * `Theme.Typography.readoutLabel` que espeja), no desde aquí.
 */
export function UnidadRitmo() {
  return (
    <span
      style={{
        font: '600 11px/1 var(--twin-font-mono)',
        letterSpacing: '0.16em',
        color: 'var(--twin-muted)',
      }}
    >
      /500m
    </span>
  );
}

// ---------------------------------------------------------------------------
// LA FRANJA DE TU PAREJA — lo que se sabe de ella, y de dónde sale
// ---------------------------------------------------------------------------

export type EstadoPareja =
  /** Está dentro: la máquina cuenta su parcial y su ritmo. */
  | { modo: 'rema'; hechoM: number; deM: number; ritmo: string }
  /**
   * Está fuera: lo único cierto es que sale después de ti y, si ya ha remado
   * algo, lo que le contó la máquina en su último relevo. `ultimo` ausente = el
   * tramo empieza contigo y todavía no hay nada suyo que enseñar.
   */
  | { modo: 'descansa'; ultimo?: { metros: number; tiempo: string } };

/**
 * Nunca lleva su pulso. Su reloj no está emparejado con este móvil, y un hueco
 * gris que dijera «sin datos» no lo arregla ningún toque tuyo: se calla (§6.2
 * bis). El ritmo sí va, y va porque LO MIDE LA MÁQUINA, no ella. Un relevo de
 * burpees llegaría aquí sin ritmo, y estaría bien.
 */
export function FranjaPareja({ estado }: { estado: EstadoPareja }) {
  const azul = COLOR_TEXTO.pareja;
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: `10px ${SP.m}px 11px`,
        borderRadius: RAD.m,
        background: `color-mix(in srgb, ${COLOR.pareja} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${COLOR.pareja} 32%, transparent)`,
      }}
    >
      {estado.modo === 'rema' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
            <PastillaPersona quien="pareja" texto={`${PAREJA} rema`} vivo />
            <span style={{ flex: 1 }} />
            <Mono size={22} weight={800} color={azul}>
              {metrosTexto(estado.hechoM)}
            </Mono>
            <Mono size={12} weight={600} color="var(--twin-muted)">
              de {metrosTexto(estado.deM)} m
            </Mono>
          </div>
          <Hairline />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <Mono size={19} weight={800} color="var(--twin-fg)">
              {estado.ritmo}
            </Mono>
            <UnidadRitmo />
            <span style={{ flex: 1 }} />
            <span style={{ font: '500 11px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
              lo mide el monitor del remo
            </span>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
          <PastillaPersona quien="pareja" texto={`${PAREJA} descansa`} />
          <span style={{ flex: 1 }} />
          <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'right' }}>
            sale tras de ti
            {estado.ultimo && (
              <>
                <br />
                <span style={{ color: 'var(--twin-faint)' }}>
                  su relevo: {metrosTexto(estado.ultimo.metros)} m en {estado.ultimo.tiempo}
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Los apoyos — el tercer nivel, en las celdas del kit (§10)
// ---------------------------------------------------------------------------

/** Tu pulso: el único que este móvil mide, y el que tiñe el lienzo. */
export function ApoyoPulso({ ppm }: { ppm: number }) {
  const zona = zonaDe(ppm);
  return <Apoyo etiqueta="Tu pulso" valor={String(ppm)} tono={colorZona(zona)} pie={zona ? `Z${zona}` : undefined} />;
}

/**
 * Los metros que lleva uno de los dos: la regla del motor dicha sin tener que
 * leerla — lo que rema tu pareja es suyo y no se te apunta.
 *
 * Una celda por persona y no las dos juntas, porque no siempre caben las dos:
 * la fila de apoyos son TRES a lo ancho y ni una más (§10), así que mientras
 * remas el sitio se lo lleva tu ritmo y de tu pareja queda su franja.
 */
export function ApoyoReparto({
  quien,
  hechos,
  actual,
  metros,
}: {
  quien: Quien;
  hechos: Segmento[];
  actual: Segmento;
  metros: number;
}) {
  const por = metrosPorQuien(hechos, actual, metros);
  return (
    <Apoyo
      etiqueta={quien === 'tu' ? 'Tuyos' : `De ${PAREJA}`}
      valor={`${metrosTexto(por[quien])} m`}
      tono={COLOR_TEXTO[quien]}
    />
  );
}
