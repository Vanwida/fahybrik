'use client';

// Piezas de la propuesta «chat contextual».
//
// Casi todas son cromo NATIVO de iOS reproducido (el diálogo del «+», el menú
// de pulsación larga, una hoja de selección): existen aquí para poder juzgar el
// coste real en pantalla de la idea, que es exactamente lo que había que
// decidir. Las piezas del chat en sí (cabecera, burbuja, compositor, chip y
// tarjeta) NO se redibujan: vienen de `../chat-coach/piezas`.
//
// CONVENIO DEL DOBLE: la fila que esta propuesta AÑADE se pinta en naranja para
// poder señalarla. En la app es una fila idéntica a sus vecinas — el naranja es
// del doble, no del diseño.

import { R, S } from '../../kit-composicion/tokens';
import type { EntrenoElegible, NombreGlifo } from './data';

/**
 * El atenuado del sistema cuando se abre un menú o una hoja: iOS oscurece Y
 * desenfoca. Sobre un fondo casi negro el oscurecido solo no se lee, y sin ese
 * contraste no se puede juzgar dónde acaba el menú y empieza la app.
 */
export function Velo({
  children,
  colocacion = 'abajo',
}: {
  children: React.ReactNode;
  colocacion?: 'abajo' | 'centro' | 'arriba';
}) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent:
          colocacion === 'abajo' ? 'flex-end' : colocacion === 'arriba' ? 'flex-start' : 'center',
      }}
    >
      {children}
    </div>
  );
}

/**
 * Los iconos de las filas de menú. Van en SVG y no en carácter porque los
 * glifos tipo ✉ o ✎ los pinta el sistema como emoji de color: en la app son SF
 * Symbols monocromos y el doble tiene que enseñar eso, no un adorno.
 */
export function Glifo({ nombre, tam = 15 }: { nombre: NombreGlifo; tam?: number }) {
  const comun = {
    width: tam,
    height: tam,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (nombre === 'lista') {
    return (
      <svg {...comun} aria-hidden>
        <path d="M2 4h12M2 8h12M2 12h8" />
      </svg>
    );
  }
  if (nombre === 'mensaje') {
    return (
      <svg {...comun} aria-hidden>
        <path d="M3 3h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 13 11H7l-3.5 2.5V11H3a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 3 3Z" />
      </svg>
    );
  }
  if (nombre === 'check') {
    return (
      <svg {...comun} aria-hidden>
        <path d="M3 8.5 6.2 12 13 4.5" />
      </svg>
    );
  }
  if (nombre === 'lapiz') {
    return (
      <svg {...comun} aria-hidden>
        <path d="M11.2 2.8a1.7 1.7 0 0 1 2.4 2.4L5.4 13.4 2 14.4l1-3.4 7.2-8.2Z" />
      </svg>
    );
  }
  return (
    <svg {...comun} aria-hidden>
      <path d="M4.5 3.2 12.6 8l-8.1 4.8V3.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface Fila {
  etiqueta: string;
  glifo?: NombreGlifo;
  nueva?: boolean;
  submenu?: boolean;
  destructiva?: boolean;
}

/**
 * El `confirmationDialog` del «+», tal como lo pinta iOS: dos bloques
 * separados, el título arriba en pequeño, Cancelar aparte.
 */
export function HojaDeAcciones({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  return (
    // El lienzo ya viene con los safe areas puestos (`.twin-screen-safe`), así
    // que aquí solo va el aire de la hoja.
    <div style={{ padding: `0 ${S.s}px ${S.s}px`, display: 'grid', gap: S.s }}>
      <div style={{ borderRadius: R.l, overflow: 'hidden', background: 'var(--twin-surface-elevated)' }}>
        <div
          style={{
            padding: `${S.m}px ${S.l}px`,
            textAlign: 'center',
            font: '600 12.5px/1.3 var(--twin-font-sans)',
            color: 'var(--twin-muted)',
            borderBottom: '1px solid var(--twin-hairline)',
          }}
        >
          {titulo}
        </div>
        {filas.map((f, i) => (
          <div
            key={f.etiqueta}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 52,
              borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)',
              font: '400 16.5px/1.2 var(--twin-font-sans)',
              color: f.nueva ? 'var(--twin-accent-text)' : 'var(--twin-fg)',
            }}
          >
            {f.etiqueta}
            {f.submenu ? <span aria-hidden style={{ opacity: 0.5, font: '600 14px/1' }}>›</span> : null}
          </div>
        ))}
      </div>
      <div
        style={{
          height: 52,
          display: 'grid',
          placeItems: 'center',
          borderRadius: R.l,
          background: 'var(--twin-surface-elevated)',
          font: '650 16.5px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
        }}
      >
        Cancelar
      </div>
    </div>
  );
}

/** El menú de pulsación larga (`contextMenu`) de iOS. */
export function MenuFlotante({ filas, ancho = 254 }: { filas: Fila[]; ancho?: number }) {
  return (
    <div
      style={{
        width: ancho,
        borderRadius: R.l,
        overflow: 'hidden',
        background: 'var(--twin-surface-elevated)',
        border: '1px solid var(--twin-hairline-strong)',
        boxShadow: '0 18px 40px rgba(0, 0, 0, 0.45)',
      }}
    >
      {filas.map((f, i) => (
        <div
          key={f.etiqueta}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S.m,
            height: 44,
            padding: `0 ${S.m}px`,
            borderTop: i === 0 ? 'none' : '1px solid var(--twin-hairline)',
            font: '400 14.5px/1.2 var(--twin-font-sans)',
            color: f.destructiva
              ? 'var(--twin-danger)'
              : f.nueva
                ? 'var(--twin-accent-text)'
                : 'var(--twin-fg)',
          }}
        >
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {f.etiqueta}
          </span>
          <span
            aria-hidden
            style={{
              width: 18,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              font: '500 14px/1 var(--twin-font-sans)',
              opacity: 0.8,
            }}
          >
            {f.submenu ? '›' : f.glifo ? <Glifo nombre={f.glifo} /> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * La hoja de «¿sobre qué entreno?».
 *
 * Es la ÚNICA superficie nueva de toda la propuesta, y solo se ve si el atleta
 * la pide. Dos reglas de contenido, que es donde se gana o se pierde: el título
 * solo no basta (dos «Fuerza A» en la misma lista), así que cada fila lleva su
 * pie de qué va; y los pendientes de esta semana también se ofrecen, porque
 * preguntar ANTES de entrenar es la mitad de los casos.
 */
export function SelectorDeEntreno({
  secciones,
  elegido,
}: {
  secciones: { seccion: string; entrenos: EntrenoElegible[] }[];
  elegido?: string;
}) {
  return (
    <div
      style={{
        maxHeight: '74%',
        display: 'flex',
        flexDirection: 'column',
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        background: 'var(--twin-bg)',
        border: '1px solid var(--twin-hairline)',
        borderBottom: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', paddingTop: S.s }}>
        <span style={{ width: 36, height: 5, borderRadius: R.pill, background: 'var(--twin-hairline-strong)' }} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `${S.m}px ${S.l}px ${S.m}px`,
          borderBottom: '1px solid var(--twin-hairline)',
        }}
      >
        <span style={{ font: '500 14.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>Cancelar</span>
        <span
          style={{
            flex: 1,
            textAlign: 'center',
            font: 'italic 700 15px/1.2 var(--twin-font-sans)',
            color: 'var(--twin-fg)',
          }}
        >
          ¿Sobre qué entreno?
        </span>
        <span style={{ width: 58 }} />
      </div>
      <div style={{ overflow: 'hidden', paddingBottom: S.s }}>
        {secciones.map((s) => (
          <div key={s.seccion}>
            <div
              style={{
                padding: `${S.m}px ${S.l}px ${S.xs}px`,
                font: '700 10px/1.2 var(--twin-font-sans)',
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--twin-faint)',
              }}
            >
              {s.seccion}
            </div>
            {s.entrenos.map((e) => (
              <div
                key={e.ref}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S.m,
                  padding: `9px ${S.l}px`,
                  borderTop: '1px solid var(--twin-hairline)',
                  background: elegido === e.ref ? 'var(--twin-surface)' : 'transparent',
                }}
              >
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ font: '600 14.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                    {e.titulo}
                  </span>
                  <span style={{ font: '400 11.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                    {e.pie}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                  {e.estado === 'hecho' ? (
                    <span aria-hidden style={{ font: '600 11px/1', color: 'var(--twin-accent-text)' }}>
                      ✓
                    </span>
                  ) : null}
                  <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
                    {e.cuando}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La sesión de hoy. Se pinta suelta porque en el guion del menú hay DOS: la del
 * fondo (desenfocada) y la copia levantada por encima del velo, que es como iOS
 * enseña lo que estás pulsando.
 */
export function TarjetaSesion({ levantada = false }: { levantada?: boolean }) {
  return (
    <div
      style={{
        padding: `${S.l}px`,
        borderRadius: R.l,
        background: levantada ? 'var(--twin-surface-elevated)' : 'var(--twin-surface)',
        border: `1px solid ${levantada ? 'var(--twin-hairline-strong)' : 'var(--twin-hairline)'}`,
        boxShadow: levantada ? '0 22px 50px rgba(0, 0, 0, 0.55)' : undefined,
        display: 'grid',
        gap: 4,
      }}
    >
      <span style={{ font: '600 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.09em', color: 'var(--twin-faint)' }}>
        AHORA
      </span>
      <span style={{ font: 'italic 800 19px/1.15 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Fuerza A</span>
      <span style={{ font: '400 12.5px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        Empuje · 4 bloques · 55 min
      </span>
    </div>
  );
}

/** Una fila de ejercicio de la ficha previa. Misma historia: la del fondo y la levantada. */
export function FilaEjercicio({
  n,
  nombre,
  dosis,
  levantada = false,
}: {
  n: number;
  nombre: string;
  dosis: string;
  levantada?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        padding: `${S.m}px ${S.l}px`,
        borderRadius: R.l,
        background: levantada ? 'var(--twin-surface-elevated)' : 'var(--twin-surface)',
        border: `1px solid ${levantada ? 'var(--twin-hairline-strong)' : 'var(--twin-hairline)'}`,
        boxShadow: levantada ? '0 22px 50px rgba(0, 0, 0, 0.55)' : undefined,
      }}
    >
      <span style={{ width: 16, font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{n}</span>
      <span style={{ flex: 1, font: '600 14px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{nombre}</span>
      <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{dosis}</span>
    </div>
  );
}

/** Las cuatro filas del entreno del guion. */
export const EJERCICIOS = [
  { n: 1, nombre: 'Back squat', dosis: '4×5 · 80%' },
  { n: 2, nombre: 'Press banca', dosis: '4×6 · RIR 2' },
  { n: 3, nombre: 'Remo con barra', dosis: '3×10' },
  { n: 4, nombre: 'Plancha', dosis: '3×45 s' },
] as const;

/**
 * Fondo reducido del día del plan. Sin detalle A PROPÓSITO: el sujeto del guion
 * es el menú, y un fondo fiel competiría con él (además de mezclar dos
 * propuestas distintas en una sola pantalla).
 */
export function FondoPlan() {
  return (
    <div style={{ padding: `${S.l}px ${S.l}px 0` }}>
      <div style={{ font: 'italic 800 22px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Miércoles 12</div>
      <div style={{ marginTop: S.m, display: 'grid', gap: S.s }}>
        <TarjetaSesion />
        <div
          style={{
            padding: `${S.m}px ${S.l}px`,
            borderRadius: R.l,
            background: 'var(--twin-surface)',
            border: '1px solid var(--twin-hairline)',
            display: 'flex',
            alignItems: 'center',
            gap: S.m,
          }}
        >
          <span style={{ flex: 1, font: '600 14px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            Rodaje suave
          </span>
          <span style={{ font: '500 11.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>hecha</span>
        </div>
      </div>
    </div>
  );
}

/** Fondo reducido de la ficha previa: las filas de ejercicio del entreno. */
export function FondoBrief() {
  return (
    <div style={{ padding: `${S.l}px ${S.l}px 0` }}>
      <div style={{ font: 'italic 800 22px/1.1 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>Fuerza A</div>
      <div style={{ marginTop: 2, font: '400 12.5px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        Empuje · 4 bloques · 55 min
      </div>
      <div style={{ marginTop: S.l, display: 'grid', gap: S.s }}>
        {EJERCICIOS.map((f) => (
          <FilaEjercicio key={f.n} n={f.n} nombre={f.nombre} dosis={f.dosis} />
        ))}
      </div>
    </div>
  );
}
