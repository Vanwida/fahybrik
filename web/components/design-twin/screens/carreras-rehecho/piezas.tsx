'use client';

// Las piezas pequeñas que comparten los bloques de «Carreras»: los glifos que
// `kit-dia/iconos` todavía no tiene, y los cuatro contenedores que se repiten
// (tarjeta, estado vacío con salida, aviso de error, botón de texto). Nada baja
// de 15 px ni de 44 pt de toque. El orquestador puede subir todo esto a `kit-dia`.

import type { CSSProperties, ReactNode } from 'react';
import { IcoChevron } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';

interface P {
  tam?: number;
}

const base = (tam: number, extra: CSSProperties = {}) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  style: { flex: '0 0 auto', ...extra },
});

export const IcoPuntos = ({ tam = 22 }: P) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <circle cx="5.5" cy="12" r="1.9" />
    <circle cx="12" cy="12" r="1.9" />
    <circle cx="18.5" cy="12" r="1.9" />
  </svg>
);

export const IcoCerrar = ({ tam = 20 }: P) => (
  <svg {...base(tam)} strokeWidth={2.4}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const IcoPersonas = ({ tam = 18 }: P) => (
  <svg {...base(tam)}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19c.4-3.2 2.7-5 6-5s5.6 1.8 6 5" />
    <circle cx="17" cy="9.5" r="2.5" />
    <path d="M16.4 14.2c2.6-.1 4.2 1.4 4.6 4" />
  </svg>
);

export const IcoPersonaX = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <circle cx="10" cy="8.5" r="3.4" />
    <path d="M3.5 19.5c.4-3.4 2.9-5.4 6.5-5.4 1.2 0 2.3.2 3.2.6" />
    <path d="m16 15 5 5m0-5-5 5" />
  </svg>
);

export const IcoBandera = ({ tam = 24 }: P) => (
  <svg {...base(tam)}>
    <path d="M5 21V4M5 4h13l-2.4 4.2L18 12.5H5" />
  </svg>
);

export const IcoEstrella = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" />
  </svg>
);

export const IcoPapelera = ({ tam = 22 }: P) => (
  <svg {...base(tam)}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7M10 11v6m4-6v6" />
  </svg>
);

export const IcoEnlace = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);

export const IcoAlerta = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <path d="M12 4 2.8 19.5h18.4z" />
    <path d="M12 10v4.4M12 17.2v.1" strokeWidth={2.6} />
  </svg>
);

export const IcoPersonaMas = ({ tam = 20 }: P) => (
  <svg {...base(tam)}>
    <circle cx="10" cy="8.5" r="3.4" />
    <path d="M3.5 19.5c.4-3.4 2.9-5.4 6.5-5.4 1.4 0 2.6.3 3.6.8M18 14v6m-3-3h6" />
  </svg>
);

/**
 * El texto de una acción destructiva. El rojo de estado (#f23f3f en oscuro) sobre la
 * superficie elevada da 4,50:1, justo por debajo de AA; mezclado un poco con la tinta
 * del tema (un token sobre un token, nunca un hex) pasa con holgura en los dos temas
 * y sigue leyéndose rojo.
 */
export const TINTA_PELIGRO = tinte('var(--twin-danger)', 72, 'var(--twin-fg)');

// ── Contenedores ──────────────────────────────────────────────────────────────

/** La tarjeta de la familia: radio 22, superficie y un pelo. */
export function Tarjeta({ children, style, realce = false }: { children: ReactNode; style?: CSSProperties; realce?: boolean }) {
  return (
    <div
      style={{
        borderRadius: RADIO.tarjeta,
        background: realce ? tinte('var(--twin-accent)', 10, 'var(--twin-surface)') : 'var(--twin-surface)',
        border: `1px solid ${realce ? velo('var(--twin-accent)', 40) : 'var(--twin-hairline)'}`,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Un botón de texto de 48 pt (la salida discreta: «Ver 3 más», «Cancelar»). */
export function BotonTexto({
  children,
  onClick,
  icono,
  tono = 'acento',
  centrado = false,
  derecha,
  desactivado = false,
  ...aria
}: {
  children: ReactNode;
  onClick: () => void;
  /** Mientras algo está en marcha no admite otro toque (se queda legible: solo deja de responder). */
  desactivado?: boolean;
  icono?: ReactNode;
  tono?: 'acento' | 'tinta' | 'suave' | 'peligro';
  centrado?: boolean;
  /** Lo que va a la derecha (el chevron de un pliegue). */
  derecha?: ReactNode;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}) {
  const color = { acento: 'var(--twin-accent-text)', tinta: 'var(--twin-fg)', suave: 'var(--twin-muted)', peligro: TINTA_PELIGRO }[tono];
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      disabled={desactivado}
      {...aria}
      style={{
        minHeight: TOQUE,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: centrado ? 'center' : 'space-between',
        gap: 8,
        ...fuente(700, TAM.cuerpo, 1.2),
        color,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textAlign: centrado ? 'center' : 'left' }}>
        {icono}
        {children}
      </span>
      {derecha}
    </button>
  );
}

/** Un campo de texto de la familia: etiqueta, 52 pt, foco visible, y lo que haga falta a los lados. */
export function Campo({
  etiqueta,
  izquierda,
  derecha,
  children,
  aviso = false,
}: {
  etiqueta: string;
  izquierda?: ReactNode;
  derecha?: ReactNode;
  children: ReactNode;
  /** Borde de aviso (algo del texto no cuadra, sin ser un error). */
  aviso?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ ...fuente(700, TAM.suelo, 1.2), letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--twin-muted)' }}>{etiqueta}</span>
      <span
        className="cr-campo"
        style={{
          minHeight: 52,
          padding: '0 6px 0 14px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: RADIO.fila,
          background: 'var(--twin-surface)',
          border: `1px solid ${aviso ? velo('var(--twin-warning)', 60) : 'var(--twin-hairline-strong)'}`,
          ...fuente(500, TAM.cuerpo, 1.2),
          color: 'var(--twin-fg)',
        }}
      >
        {izquierda ? <span style={{ display: 'inline-flex', color: 'var(--twin-muted)' }}>{izquierda}</span> : null}
        {children}
        {derecha}
      </span>
    </label>
  );
}

/** Aviso de error: tinte del peligro, marca con forma, texto en tinta del tema. */
export function Aviso({ children, salida }: { children: ReactNode; salida?: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '14px 16px',
        borderRadius: RADIO.fila,
        background: tinte('var(--twin-danger)', 11),
        border: `1px solid ${velo('var(--twin-danger)', 34)}`,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ color: 'var(--twin-danger)', display: 'inline-flex', paddingTop: 1 }}>
          <IcoAlerta tam={20} />
        </span>
        <span style={{ ...fuente(600, TAM.cuerpo, 1.35), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{children}</span>
      </span>
      {salida}
    </div>
  );
}

/**
 * El estado vacío con salida (§5): qué falta, por qué, y el acto que lo llena.
 * Compacto (una tarjeta de sección), no de pantalla: el vacío de pantalla es el
 * sujeto, no esto.
 */
export function Vacio({
  icono,
  titulo,
  mensaje,
  salida,
}: {
  icono: ReactNode;
  titulo: string;
  mensaje: string;
  salida: ReactNode;
}) {
  return (
    <Tarjeta style={{ padding: '20px 18px 18px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          color: 'var(--twin-fg)',
        }}
      >
        {icono}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ ...fuente(800, 20, 1.15, true), color: 'var(--twin-fg)' }}>{titulo}</span>
        <span style={{ ...fuente(500, TAM.cuerpo, 1.35), color: 'var(--twin-muted)', textWrap: 'pretty' }}>{mensaje}</span>
      </span>
      {salida}
    </Tarjeta>
  );
}

/** La salida principal de un vacío: pastilla de acento (es «haz esto ahora»), 52 pt. */
export function SalidaAccion({ children, onClick, icono }: { children: ReactNode; onClick: () => void; icono?: ReactNode }) {
  return (
    <button type="button" className="hd-toque" onClick={onClick} style={{ width: 'auto', alignSelf: 'flex-start' }}>
      <span
        className="hd-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          height: 52,
          padding: '0 22px',
          boxSizing: 'border-box',
          borderRadius: RADIO.pastilla,
          background: 'var(--twin-accent)',
          color: 'var(--twin-accent-on)',
          ...fuente(800, TAM.cuerpo, 1, true),
        }}
      >
        {icono}
        {children}
      </span>
    </button>
  );
}

/**
 * El botón grande de una hoja (fijar, guardar, importar): acento porque es «haz esto
 * ahora». Ocupado no se atenúa (se lee «Importando…» con su contraste entero) y a la
 * vez no admite otro toque; inactivo cambia de superficie y de tinta, no de opacidad.
 */
export function BotonPrimario({
  children,
  onClick,
  activo = true,
  ocupado = false,
  textoOcupado,
  voz,
}: {
  children: ReactNode;
  onClick: () => void;
  activo?: boolean;
  ocupado?: boolean;
  textoOcupado: string;
  /** Lo que lee el lector de pantalla mientras está ocupado. */
  voz: string;
}) {
  const vivo = activo || ocupado;
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      disabled={ocupado || !activo}
      aria-busy={ocupado}
      aria-label={ocupado ? voz : undefined}
      style={{
        height: 56,
        borderRadius: RADIO.pastilla,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxSizing: 'border-box',
        background: vivo ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
        border: vivo ? '1px solid transparent' : '1px solid var(--twin-hairline-strong)',
        color: vivo ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
        ...fuente(800, TAM.cuerpo, 1, true),
        letterSpacing: '0.01em',
      }}
    >
      {ocupado ? (
        <>
          <span className="cr-gira" aria-hidden style={{ display: 'inline-flex', width: 20, height: 20, borderRadius: '50%', border: '2.5px solid color-mix(in srgb, var(--twin-accent-on) 30%, transparent)', borderTopColor: 'var(--twin-accent-on)' }} />
          {textoOcupado}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Una pastilla de sección de 44 pt (el «Buscar carrera» y el «Importar» de cada cabecera). */
export function PastillaSeccion({ children, onClick, icono }: { children: ReactNode; onClick: () => void; icono?: ReactNode }) {
  return (
    <button type="button" className="hd-toque" onClick={onClick} style={{ width: 'auto', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
      <span
        className="hd-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          padding: '0 16px',
          boxSizing: 'border-box',
          borderRadius: RADIO.pastilla,
          background: tinte('var(--twin-accent)', 12, 'var(--twin-bg)'),
          border: `1px solid ${velo('var(--twin-accent)', 40)}`,
          color: 'var(--twin-accent-text)',
          ...fuente(700, TAM.suelo, 1),
        }}
      >
        {icono}
        {children}
      </span>
    </button>
  );
}

export const Chevron = () => (
  <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
    <IcoChevron tam={18} />
  </span>
);
