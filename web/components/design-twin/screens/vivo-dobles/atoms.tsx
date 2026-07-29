'use client';

// Los átomos del relevo. Solo lo que es propio de dobles: lo genérico (Card,
// Label, Mono, Display, CTA, Hairline, iconos) viene del kit compartido, que es
// lo que manda el §0 del CONTRATO-UI.
//
// Lo propio de dobles es siempre lo mismo: DE QUIÉN es cada cosa. Por eso todos
// estos átomos llevan `quien` y sacan el color de `COLOR`/`COLOR_TEXTO`, en vez
// de recibir un color suelto que en la siguiente pantalla se elegiría distinto.

import type { ReactNode } from 'react';
import { Hairline, IconHeart, Label, Mono, RAD, SP } from '../../kit';
import {
  COLOR,
  COLOR_TEXTO,
  PAREJA,
  TRAMO,
  metrosPorQuien,
  metrosTexto,
  nombreDe,
  zonaDe,
  type Quien,
  type Segmento,
} from './data';

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
// EL SUJETO — el dato que gobierna, y escala hasta llenar (§6.1 `gobierna`)
// ---------------------------------------------------------------------------

export function Sujeto({
  label,
  valor,
  unidad,
  prefijo,
  quien,
  nota,
  resaltado = false,
}: {
  label: string;
  valor: string;
  unidad?: string;
  /** El `~` de una estimación: pequeño, pegado a la cifra, nunca dentro. */
  prefijo?: string;
  quien: Quien;
  /** La línea de debajo: el hecho MEDIDO del que sale la cifra de arriba. */
  nota?: ReactNode;
  /** La cifra se tiñe del color de quien manda: para el último tramo de cuenta. */
  resaltado?: boolean;
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <Label size={10} color={COLOR_TEXTO[quien]}>
          {label}
        </Label>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          {prefijo && (
            <span
              className="t-readout-m"
              style={{ fontSize: 'clamp(24px, 6vh, 44px)', color: 'var(--twin-muted)' }}
            >
              {prefijo}
            </span>
          )}
          {/* `gobierna`: el techo del clamp es alto a propósito. Con uno bajo la
              cifra se quedaba en 108 px y sobraban ~240 pt de nada arriba y
              abajo del sujeto — el mismo hueco que esta tanda venía a arreglar,
              colado en la propuesta. Se vio en la primera captura del doble. */}
          <span
            className="t-readout-hero"
            style={{
              fontSize: 'clamp(72px, 21vh, 152px)',
              color: resaltado ? COLOR_TEXTO[quien] : 'var(--twin-fg)',
            }}
          >
            {valor}
          </span>
          {unidad && (
            <span
              className="t-readout-m"
              style={{ fontSize: 'clamp(22px, 5.5vh, 40px)', color: 'var(--twin-muted)' }}
            >
              {unidad}
            </span>
          )}
        </div>
        {nota && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: SP.s,
              font: '500 13px/1.35 var(--twin-font-sans)',
              color: 'var(--twin-muted)',
              textAlign: 'center',
            }}
          >
            {nota}
          </div>
        )}
      </div>
    </div>
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
// LA BARRA DE LOS DOS — el reparto real, no el planeado
// ---------------------------------------------------------------------------

/**
 * Pinta lo que ha pasado DE VERDAD, relevo a relevo: si os cambiáis antes de
 * los 250, el trozo de cada uno cambia con vosotros. Y es aquí donde se ve la
 * regla del motor sin tener que leerla: lo azul no es tuyo y no se te apunta.
 */
export function BarraPareja({
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
  const porQuien = metrosPorQuien(hechos, actual, metros);
  const pct = (m: number) => `${(m / TRAMO.totalM) * 100}%`;

  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: `10px ${SP.m}px 11px`,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
        <Label size={9}>Total de los dos</Label>
        <span style={{ flex: 1 }} />
        <Mono size={17} weight={800}>
          {metrosTexto(metros)}
        </Mono>
        <Mono size={11} weight={600} color="var(--twin-muted)">
          de {metrosTexto(TRAMO.totalM)} m
        </Mono>
      </div>

      <div
        style={{
          position: 'relative',
          height: 10,
          borderRadius: 5,
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

      <div style={{ display: 'flex', alignItems: 'center', gap: SP.m }}>
        <PuntoReparto quien="tu" metros={porQuien.tu} />
        <PuntoReparto quien="pareja" metros={porQuien.pareja} />
        <span style={{ flex: 1 }} />
        {reloj && (
          <>
            <Mono size={12} weight={700} color="var(--twin-muted)">
              {reloj}
            </Mono>
            <Label size={9}>reloj</Label>
          </>
        )}
      </div>
    </div>
  );
}

function PuntoReparto({ quien, metros }: { quien: Quien; metros: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR[quien], flex: '0 0 auto' }} />
      <span style={{ font: '600 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {nombreDe(quien)}
      </span>
      <Mono size={12} weight={700}>
        {metrosTexto(metros)}
      </Mono>
      <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>m</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tu pulso — el único que este móvil mide
// ---------------------------------------------------------------------------

export function PulsoTuyo({ ppm }: { ppm: number }) {
  const zona = zonaDe(ppm);
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: `9px ${SP.m}px`,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <span style={{ color: `var(--twin-z${zona})`, display: 'inline-flex' }}>
        <IconHeart size={13} />
      </span>
      <Label size={9}>Tu pulso</Label>
      <span style={{ flex: 1 }} />
      <Mono size={20} weight={800} color={`var(--twin-z${zona})`}>
        {ppm}
      </Mono>
      <Label size={9}>ppm</Label>
      <span className="tw-zone" data-zone={zona} style={{ marginLeft: 4 }}>
        Z{zona}
      </span>
    </div>
  );
}
