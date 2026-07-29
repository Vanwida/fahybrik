'use client';

// Los átomos de la cara de monitor. Lo genérico (Card, CTA, iconos) viene del
// kit compartido; el LENGUAJE del entreno en vivo (Ambiente, Numeral, la banda
// del sujeto, la franja de acción, el delta, el apoyo) viene de `../../kit-vivo`
// desde el 29-jul. Aquí vive SOLO lo que es del ergo y de nadie más.
//
// Lo que se fue de este fichero al kit del §10, y por qué: `Ambiente`, `Delta`,
// `Fogonazo`, `zonaDe`, `COLOR_ZONA` (ahora `colorZona`) y `SalidaManual`
// (ahora `FranjaAccion`) los tenían también correr, fuerza y el EMOM, cada uno
// con su copia. `Celda` era el `Apoyo` del kit con otro nombre. Si mañana hay
// que cambiar el tinte se cambia en un sitio y cambia en las diez (§0).
//
// Regla de voz: todo dato del monitor va en `t-readout-*` (mono recto 800,
// tabular). La estructura (títulos, nombres) va en la cursiva Fabrik. Y ningún
// tamaño de cifra grande se escribe aquí: lo pone `Numeral` (§10.2).

import type { ReactNode } from 'react';
import { IconClose, Mono, RAD, SP } from '../../kit';
import { EtiquetaSujeto, Numeral } from '../../kit-vivo';

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/**
 * El sujeto cuando el número que gobierna es la ORDEN y no una medida.
 *
 * Es `EtiquetaSujeto` + `Numeral` y nada más: la banda y el centrado los pone
 * `MarcoVivo`, así que aquí no se vuelve a repartir alto ni se vuelve a elegir
 * un tamaño de cifra. Antes tenía su propio `clamp(…, 17vh, …)`, que medía el
 * alto de la VENTANA y no el del teléfono (§10.2).
 */
export function Sujeto({
  etiqueta,
  valor,
  unidad,
  color,
  extra,
}: {
  etiqueta: string;
  valor: string;
  unidad?: string;
  color?: string;
  extra?: ReactNode;
}) {
  return (
    <>
      <EtiquetaSujeto>{etiqueta}</EtiquetaSujeto>
      <Numeral tono={color} unidad={unidad}>
        {valor}
      </Numeral>
      {extra}
    </>
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
