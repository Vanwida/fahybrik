'use client';

// Los átomos de la cara de monitor. Lo genérico (Card, CTA, iconos) viene del
// kit compartido; aquí vive SOLO lo que es del ergo y de nadie más.
//
// Regla de voz: todo dato del monitor va en `t-readout-*` (mono recto 800,
// tabular). La estructura (títulos, nombres) va en la cursiva Fabrik. Ningún
// tamaño suelto: cuando un readout tiene que ESCALAR con el alto (§6.1
// `gobierna`) se sobreescribe solo `font-size` sobre la clase, que conserva
// familia, peso y tabular-nums.

import type { CSSProperties, ReactNode } from 'react';
import { IconClose, Label, Mono, RAD, SP } from '../../kit';
import { hrZone } from '../../sim';
import { UMBRAL } from '../../datos-reales';

export type Zona = 1 | 2 | 3 | 4 | 5;

/** La zona del pulso. Sin pulso no hay zona: nulo, y nadie pinta un guion. */
export function zonaDe(pulso: number | null): Zona | null {
  return pulso == null ? null : hrZone(pulso, UMBRAL.ppm);
}

export const COLOR_ZONA = (z: Zona | null): string =>
  z == null ? 'var(--twin-fg)' : `var(--twin-z${z})`;

// ---------------------------------------------------------------------------
// Ambiente — la zona de pulso tiñe la pantalla entera
// ---------------------------------------------------------------------------

/**
 * El tinte de zona sobre el lienzo. Es `background-color` (no un degradado)
 * porque un color SÍ interpola: al saltar de Z4 a Z5 el ambiente vira en vez
 * de parpadear. La máscara lo desvanece hacia abajo para que el sujeto quede
 * en la parte teñida y los datos de servicio, limpios.
 *
 * Sin zona no hay tinte. Un ambiente neutro es la lectura honesta de «no
 * tenemos tu pulso», y es exactamente lo que pasó en la pieza de esquí real.
 */
export function Ambiente({ zona, intensidad = 13 }: { zona: Zona | null; intensidad?: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundColor:
          zona == null ? 'transparent' : `color-mix(in srgb, var(--twin-z${zona}) ${intensidad}%, transparent)`,
        WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, transparent 66%)',
        maskImage: 'linear-gradient(to bottom, #000 0%, transparent 66%)',
        transition: 'background-color 900ms linear',
      }}
    />
  );
}

/** Fogonazo al cruzar el hito: nace encendido y se apaga solo. */
export function Fogonazo({ activo, tono = 'var(--twin-ok)' }: { activo: boolean; tono?: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundColor: `color-mix(in srgb, ${tono} 42%, transparent)`,
        opacity: activo ? 1 : 0,
        transition: 'opacity 620ms ease-out',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/** El sujeto: el número que gobierna, con su etiqueta arriba y su unidad debajo. */
export function Sujeto({
  etiqueta,
  valor,
  unidad,
  color = 'var(--twin-fg)',
  minPx = 68,
  maxPx = 132,
  extra,
}: {
  etiqueta: string;
  valor: string;
  unidad?: string;
  color?: string;
  minPx?: number;
  maxPx?: number;
  extra?: ReactNode;
}) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.xs,
      }}
    >
      <Label size={10}>{etiqueta}</Label>
      <span
        className="t-readout-hero"
        style={{ fontSize: `clamp(${minPx}px, 17vh, ${maxPx}px)`, color, transition: 'color 600ms linear' }}
      >
        {valor}
      </span>
      {unidad && <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>{unidad}</span>}
      {extra}
    </div>
  );
}

/** La diferencia contra el objetivo. Verde = vas mejor, y punto. */
export function Delta({
  valor,
  unidad,
  mejorEs,
  sufijo,
  textoNulo,
}: {
  valor: number | null;
  unidad: string;
  /** En ritmo, menos es mejor; en vatios, más. */
  mejorEs: 'menos' | 'mas';
  /** «vs objetivo» · «vs tu serie 1». Siempre se dice contra qué. */
  sufijo: string;
  /** Qué se lee cuando la diferencia es cero. Depende de contra qué compares. */
  textoNulo: string;
}) {
  if (valor == null) return null;
  const nulo = Math.abs(valor) < 0.5;
  const mejor = mejorEs === 'menos' ? valor < 0 : valor > 0;
  const color = nulo ? 'var(--twin-muted)' : mejor ? 'var(--twin-ok)' : 'var(--twin-danger)';
  const signo = valor > 0 ? '+' : '−';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 999,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        transition: 'background-color 400ms linear',
      }}
    >
      {/* Una cifra va en la voz de instrumento; «en el objetivo» NO es una
          cifra y monoespaciarla la disfraza de medida (§4). */}
      {nulo ? (
        <span style={{ font: '600 15px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{textoNulo}</span>
      ) : (
        <span className="t-readout-s" style={{ color, transition: 'color 400ms linear' }}>
          {`${signo}${Math.abs(Math.round(valor))} ${unidad}`}
        </span>
      )}
      <span style={{ font: '500 11px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{sufijo}</span>
    </span>
  );
}

/**
 * Celda de servicio: el tercer nivel de jerarquía y el último. Va en
 * `t-readout-s` (22 px) y no más: cuatro celdas se reparten 378 pt, y un
 * cronómetro a ancho fijo en `t-readout-m` se sale de su caja. El dato sigue
 * pesando el doble que su etiqueta (§4).
 */
export function Celda({
  etiqueta,
  valor,
  color = 'var(--twin-fg)',
  pie,
}: {
  etiqueta: string;
  valor: string;
  color?: string;
  pie?: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '12px 6px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <span className="t-readout-s" style={{ color, transition: 'color 600ms linear' }}>{valor}</span>
      <span
        className="t-readout-label"
        style={{ color: 'var(--twin-muted)', textAlign: 'center', letterSpacing: '0.1em' }}
      >
        {etiqueta}
      </span>
      {pie && <span style={{ font: '500 10px/1 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{pie}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lo que queda — la barra que se vacía
// ---------------------------------------------------------------------------

/**
 * La medida DRENA. A mitad de una serie la pregunta del atleta no es «cuánto
 * llevo», es «cuánto me queda»: la barra se vacía y el número cuenta atrás.
 * Cuando el monitor calla, la barra se queda quieta y lo dice.
 */
export function BarraDrenaje({
  restante,
  total,
  ciego,
  alto = 10,
  /** La medida ya está cubierta aunque el tramo siga abierto (cruce perdido). */
  cubierta = false,
}: {
  restante: number;
  total: number;
  ciego: boolean;
  alto?: number;
  cubierta?: boolean;
}) {
  const fraccion = cubierta ? 1 : Math.max(0, Math.min(1, restante / total));
  return (
    <div style={{ height: alto, borderRadius: 999, background: 'var(--twin-surface-sunken)', overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${fraccion * 100}%`,
          borderRadius: 999,
          background: cubierta ? 'var(--twin-ok)' : ciego ? 'var(--twin-faint)' : 'var(--twin-accent)',
          transition: 'width 950ms linear, background-color 300ms linear',
        }}
      />
    </div>
  );
}

export function Drenaje({
  restante,
  total,
  unidad,
  ciego,
  compacto = false,
  cubierta = false,
  medido,
}: {
  restante: number;
  total: number;
  unidad: string;
  ciego: boolean;
  compacto?: boolean;
  cubierta?: boolean;
  /** Lo acumulado: es lo que se lee cuando ya no queda nada por cubrir. */
  medido?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          className={compacto ? 't-readout-m' : 't-readout-l'}
          style={{ color: cubierta ? 'var(--twin-ok)' : ciego ? 'var(--twin-faint)' : 'var(--twin-fg)' }}
        >
          {cubierta ? (medido ?? total) : restante}
        </span>
        <span className="t-readout-label" style={{ color: 'var(--twin-muted)' }}>
          {cubierta ? `${unidad} hechos` : `${unidad} para cerrar`}
        </span>
        <span style={{ flex: 1 }} />
        <Mono size={12} color="var(--twin-faint)">de {total}</Mono>
      </div>
      <BarraDrenaje restante={restante} total={total} ciego={ciego} cubierta={cubierta} alto={compacto ? 6 : 10} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cromo — quién eres, en qué serie vas, y cómo se sale
// ---------------------------------------------------------------------------

/** Las series como muescas: hechas, la de ahora, y las que faltan. */
export function Muescas({ series, actual }: { series: number; actual: number }) {
  if (series <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} aria-label={`Serie ${actual} de ${series}`}>
      {Array.from({ length: series }, (_, i) => {
        const hecha = i + 1 < actual;
        const ahora = i + 1 === actual;
        return (
          <span
            key={i}
            style={{
              width: ahora ? 18 : 10,
              height: 4,
              borderRadius: 999,
              background: hecha ? 'var(--twin-ok)' : ahora ? 'var(--twin-accent)' : 'var(--twin-hairline-strong)',
              transition: 'width 300ms ease-out, background-color 300ms linear',
            }}
          />
        );
      })}
    </div>
  );
}

export function Cromo({
  titulo,
  serie,
  series,
  onSalir,
  onPausa,
  compacto = false,
}: {
  titulo: string;
  serie: number;
  series: number;
  onSalir: () => void;
  onPausa: () => void;
  compacto?: boolean;
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
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, flex: '0 0 auto' }}>
      {boton(<IconClose size={13} />, 'Salir del entreno', onSalir)}
      {boton(<span style={{ fontSize: 15 }}>‖</span>, 'Pausar el entreno', onPausa)}
      <span style={{ flex: 1 }} />
      {!compacto && <Muescas series={series} actual={serie} />}
      <span
        style={{
          font: 'italic 800 11px/1.1 var(--twin-font-sans)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--twin-accent-text)',
        }}
      >
        {series > 1 ? `Serie ${serie} de ${series}` : titulo}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos del monitor — la honestidad, en una línea
// ---------------------------------------------------------------------------

export function Aviso({
  texto,
  tono = 'neutro',
}: {
  texto: string;
  tono?: 'neutro' | 'alerta' | 'ok';
}) {
  const color =
    tono === 'alerta' ? 'var(--twin-warning)' : tono === 'ok' ? 'var(--twin-ok)' : 'var(--twin-muted)';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        padding: '9px 12px',
        borderRadius: RAD.m,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: '0 0 auto' }}
      />
      <span style={{ font: '500 12px/1.35 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La salida que siempre está — el toque cierra lo que la medida no cerró
// ---------------------------------------------------------------------------

export function SalidaManual({
  titulo,
  onClick,
  destacada = false,
  alto = 74,
  style,
}: {
  titulo: string;
  onClick: () => void;
  /** Primaria cuando la medida ya no puede cerrar el tramo: ahí manda el toque. */
  destacada?: boolean;
  alto?: number;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={destacada ? 'tw-btn-primary' : 'tw-btn-secondary'}
      style={{
        width: '100%',
        height: alto,
        fontSize: 17,
        fontStyle: 'italic',
        fontWeight: 800,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {titulo}
    </button>
  );
}

/** Pausa de verdad: el crono para, y de aquí se sale. */
export function Pausa({ onReanudar, onSalir }: { onReanudar: () => void; onSalir: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--twin-scrim)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP.l,
        padding: SP.xl,
      }}
    >
      <span className="t-headline-m" style={{ color: 'var(--twin-fg)' }}>En pausa</span>
      <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', textAlign: 'center' }}>
        El crono del tramo está parado. El monitor sigue donde lo dejaste.
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s, width: '100%', maxWidth: 260 }}>
        <button type="button" onClick={onReanudar} className="tw-btn-primary" style={{ width: '100%' }}>
          SEGUIR
        </button>
        <button type="button" onClick={onSalir} className="tw-btn-secondary" style={{ width: '100%', height: 46 }}>
          Salir del entreno
        </button>
      </div>
    </div>
  );
}
