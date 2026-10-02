'use client';

// Las piezas que comparten las dos propuestas de la ficha. Ninguna baja de 15 px
// y todo color es un `var(--twin-*)`: el acento del club entra por `--twin-accent*`,
// los estados por ok/warning, las modalidades por `--twin-modality-*`.

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BotonCromo } from '../screens/hoy-dia/cromo';
import { IcoCompartir } from '../screens/plan-rehecho/iconos';
import { FrameVideo } from '../screens/sesion-previa/siluetas';
import { fichaDe, ultimaVezDe } from '../screens/sesion-previa/data';
import { COLOR_MODALIDAD } from '../datos-reales';
import { IcoCronometro, IcoDiana } from '../kit-dia/iconos';
import { Etiqueta, Pastilla } from '../kit-dia/piezas';
import { fuente, RADIO, TABULAR, TAM, TOQUE, tinte, velo } from '../kit-dia/tokens';
import type { LecturaFicha, Modalidad, MotivoSinDetalle, Movimiento, PerfilTramos } from './contrato';
import { barrasDePerfil, fraseDePerfil, metaDeSesion } from './modelo';

/** Margen lateral de la ficha: el de las pestañas. */
export const LATERAL = 20;

// ---------------------------------------------------------------------------
// Estilos: lo que `style={{}}` no puede escribir (`:active`, foco, animación)
// ---------------------------------------------------------------------------

const CSS = `
.fi-btn {
  appearance: none; border: 0; background: none; padding: 0; margin: 0; font: inherit; color: inherit;
  text-align: left; cursor: pointer; display: block; width: 100%;
  -webkit-tap-highlight-color: transparent;
  transition: transform 140ms cubic-bezier(.2,.7,.2,1), background-color 140ms ease-out, opacity 140ms ease-out;
}
.fi-btn:active { transform: scale(0.985); }
.fi-btn:focus-visible { outline: 3px solid var(--twin-accent-text); outline-offset: 2px; border-radius: 14px; }
.fi-btn[disabled] { cursor: default; opacity: 0.5; }

.fi-fila { transition: background-color 120ms ease-out; }
.fi-fila:active { background-color: var(--twin-hairline-strong); }

.fi-colapsable { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 260ms cubic-bezier(.2,.7,.2,1); }
.fi-colapsable[data-abierto='true'] { grid-template-rows: 1fr; }
.fi-colapsable > div { overflow: hidden; min-height: 0; }

@keyframes fi-entra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.fi-entra { animation: fi-entra 320ms cubic-bezier(.2,.7,.2,1) both; }

@keyframes fi-cambia { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
.fi-cambia { animation: fi-cambia 260ms cubic-bezier(.2,.7,.2,1) both; }

.fi-chevron { transition: transform 240ms cubic-bezier(.2,.7,.2,1); }
.fi-chevron[data-abierto='true'] { transform: rotate(90deg); }

.fi-pasos { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.fi-pasos::-webkit-scrollbar { display: none; }

@media (prefers-reduced-motion: reduce) {
  .fi-entra, .fi-cambia { animation: none !important; }
  .fi-btn, .fi-fila, .fi-colapsable, .fi-chevron { transition: none !important; }
  .fi-btn:active { transform: none !important; }
}
`;

export function EstilosFicha() {
  return <style>{CSS}</style>;
}

// ---------------------------------------------------------------------------
// Glifos propios de la ficha
// ---------------------------------------------------------------------------

const base = (tam: number) => ({
  width: tam,
  height: tam,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  style: { flex: '0 0 auto' } as CSSProperties,
});

const IcoAtras = ({ tam = 20 }: { tam?: number }) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const IcoPlay = ({ tam = 16 }: { tam?: number }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flex: '0 0 auto' }}>
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" />
  </svg>
);

const IcoPareja = ({ tam = 18 }: { tam?: number }) => (
  <svg {...base(tam)}>
    <circle cx="9" cy="8" r="3.2" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M3 19c0-3.2 2.7-5.5 6-5.5s6 2.3 6 5.5M15.5 14c2.8 0 5.5 1.7 5.5 4.5" />
  </svg>
);

// ---------------------------------------------------------------------------
// El cromo y la acción anclada
// ---------------------------------------------------------------------------

export function CromoFicha({ onLog, compartible }: { onLog: (linea: string) => void; compartible: boolean }) {
  return (
    <div
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
      }}
    >
      <BotonCromo etiqueta="Atrás" onClick={() => onLog('Atrás · vuelve al Plan')}>
        <IcoAtras tam={18} />
      </BotonCromo>
      {compartible ? (
        <BotonCromo etiqueta="Compartir la sesión" onClick={() => onLog('Compartir · abre la tarjeta del entreno')}>
          <IcoCompartir tam={20} />
        </BotonCromo>
      ) : (
        <span style={{ width: TOQUE }} />
      )}
    </div>
  );
}

/** La acción anclada: una sola puerta, siempre la misma, sin scroll que la tape. */
export function Dock({ onLog, deshabilitada }: { onLog: (linea: string) => void; deshabilitada?: boolean }) {
  return (
    <button
      type="button"
      className="fi-btn"
      disabled={deshabilitada}
      onClick={() => onLog('Empezar · va a la puerta de empezar (dispositivos y arrancar)')}
      style={{
        height: 56,
        borderRadius: RADIO.pastilla,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: 'var(--twin-fg)',
        color: 'var(--twin-bg)',
        ...fuente(800, TAM.cuerpo, 1, true),
        letterSpacing: '0.01em',
      }}
    >
      <IcoPlay tam={16} />
      Empezar
    </button>
  );
}

/** «Ya lo hice»: un camino honesto pero discreto, al final de la página, no anclado. */
export function YaLoHice({ onLog, prueba }: { onLog: (linea: string) => void; prueba?: boolean }) {
  if (prueba) {
    return (
      <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
        Una prueba se mide con la app: no se registra a mano.
      </p>
    );
  }
  return (
    <button
      type="button"
      className="fi-btn"
      onClick={() => onLog('Ya lo hice · abre el registro a mano')}
      style={{ minHeight: TOQUE, display: 'flex', alignItems: 'center', ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}
    >
      ¿Ya lo entrenaste sin la app? <span style={{ color: 'var(--twin-fg)', marginLeft: 6 }}>Regístralo</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// La cabecera
// ---------------------------------------------------------------------------

export function CabeceraFicha({ l, tamTitulo = 28 }: { l: LecturaFicha; tamTitulo?: number }) {
  const meta = metaDeSesion(l);
  const origen = l.origen === 'coach' ? `Plan de ${l.coach ?? 'tu coach'}` : 'Entreno libre';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Etiqueta color="var(--twin-accent-text)">
        {l.cuando} · {origen}
      </Etiqueta>
      <h1
        style={{
          margin: 0,
          ...fuente(800, tamTitulo, 1.08, true),
          letterSpacing: '-0.015em',
          color: 'var(--twin-fg)',
        }}
      >
        {l.titulo}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 14px', color: 'var(--twin-muted)' }}>
        <DatoMeta icono={<IcoCronometro tam={18} />}>
          {meta.minutos !== null ? (
            <>
              <b style={estiloCifra}>{meta.minutos}</b> min
            </>
          ) : (
            (meta.sinDuracion ?? 'Sin duración')
          )}
        </DatoMeta>
        {meta.bloquesDeTrabajo > 1 ? (
          <DatoMeta>
            <b style={estiloCifra}>{meta.bloquesDeTrabajo}</b> bloques
          </DatoMeta>
        ) : null}
        {l.prueba ? (
          <Pastilla fondo={velo('var(--twin-accent)', 16)} tinta="var(--twin-accent-text)" icono={<IcoDiana tam={16} />}>
            Prueba
          </Pastilla>
        ) : null}
        {l.conPareja ? (
          <Pastilla fondo="var(--twin-surface-elevated)" tinta="var(--twin-fg)" borde="var(--twin-hairline-strong)" icono={<IcoPareja tam={16} />}>
            Dobles con {l.conPareja}
          </Pastilla>
        ) : null}
      </div>
      {l.ultima ? (
        <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
          La última vez: <span style={{ color: 'var(--twin-fg)', ...TABULAR }}>{l.ultima.resumen}</span>, {l.ultima.cuando}.
        </p>
      ) : null}
    </div>
  );
}

const estiloCifra: CSSProperties = { ...fuente(700, TAM.cuerpo, 1), color: 'var(--twin-fg)', ...TABULAR };

function DatoMeta({ children, icono }: { children: ReactNode; icono?: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...fuente(500, TAM.suelo, 1.3) }}>
      {icono}
      <span>{children}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// La nota del coach — lo que más importa leer, entera
// ---------------------------------------------------------------------------

/**
 * La nota se lee ENTERA si cabe en `lineas` líneas; si no, se recorta y aparece «Leer entera». El control solo existe
 * cuando de verdad hay algo que desplegar: un «Leer entera» sobre una nota ya entera es un botón que no hace nada.
 */
export function NotaDelCoach({ texto, coach, lineas = 3 }: { texto: string; coach?: string; lineas?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [desborda, setDesborda] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !abierta) setDesborda(el.scrollHeight > el.clientHeight + 1);
  }, [texto, lineas, abierta]);
  return (
    <div
      style={{
        borderRadius: RADIO.fila,
        padding: '12px 16px 14px',
        background: tinte('var(--twin-accent)', 9, 'var(--twin-surface)'),
        border: `1px solid ${velo('var(--twin-accent)', 26)}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {coach ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-muted)' }}>
          <span
            aria-hidden
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: velo('var(--twin-accent)', 22),
              color: 'var(--twin-accent-text)',
              ...fuente(800, TAM.suelo, 1),
            }}
          >
            {coach.charAt(0)}
          </span>
          {coach}
        </span>
      ) : null}
      <p
        ref={ref}
        style={{
          margin: 0,
          ...fuente(400, TAM.cuerpo, 1.45),
          color: 'var(--twin-fg)',
          ...(abierta ? null : { display: '-webkit-box', WebkitLineClamp: lineas, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
        }}
      >
        {texto}
      </p>
      {desborda || abierta ? (
        <button
          type="button"
          className="fi-btn"
          onClick={() => setAbierta((v) => !v)}
          style={{ width: 'auto', alignSelf: 'flex-start', minHeight: TOQUE, display: 'inline-flex', alignItems: 'center', ...fuente(700, TAM.suelo, 1.2), color: 'var(--twin-accent-text)' }}
        >
          {abierta ? 'Leer menos' : 'Leer entera'}
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prepara — el material, en una línea
// ---------------------------------------------------------------------------

/** Lo que hay que tener a mano, como fichas. En la hoja va al final; en la ruta, dentro de cada bloque. */
export function Material({ cosas, titulo = 'Prepara' }: { cosas: string[]; titulo?: string | null }) {
  if (cosas.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {titulo ? <Etiqueta>{titulo}</Etiqueta> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {cosas.map((cosa) => (
          <span
            key={cosa}
            style={{
              minHeight: 32,
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 12px',
              borderRadius: RADIO.pastilla,
              background: 'var(--twin-surface)',
              border: '1px solid var(--twin-hairline-strong)',
              color: 'var(--twin-fg)',
              ...fuente(500, TAM.suelo, 1),
            }}
          >
            {cosa}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La miniatura de un movimiento
// ---------------------------------------------------------------------------

/**
 * El gesto, dibujado, cuando hay vídeo de técnica; si no, una loseta con el color de su modalidad. Sin vídeo
 * NO hay gesto: un dibujo inventado para un ejercicio sin clip sería una instrucción que nadie ha dado.
 */
export function Miniatura({ m, ancho = 72 }: { m: Movimiento; ancho?: number }) {
  const ficha = fichaDe(m.nombre);
  const alto = Math.round((ancho * 9) / 16);
  if (ficha.pose !== 'generico') {
    return (
      <FrameVideo
        pose={ficha.pose}
        videoS={ficha.videoS}
        tinte={COLOR_MODALIDAD[m.modalidad]}
        ancho={ancho}
        style={{ borderRadius: 10, height: alto }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: ancho,
        height: alto,
        flex: '0 0 auto',
        borderRadius: 10,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--twin-hairline)',
        background: `linear-gradient(150deg, ${tinte(COLOR_MODALIDAD[m.modalidad], 26, 'var(--twin-surface-sunken)')}, var(--twin-surface-sunken) 80%)`,
        color: 'color-mix(in srgb, var(--twin-fg) 70%, transparent)',
      }}
    >
      <GlifoModalidad modalidad={m.modalidad} tam={Math.round(alto * 0.5)} />
    </span>
  );
}

function GlifoModalidad({ modalidad, tam }: { modalidad: Modalidad; tam: number }) {
  switch (modalidad) {
    case 'strength':
      return (
        <svg {...base(tam)} strokeWidth={2.4}>
          <path d="M2.5 12h19M6 7.5v9M9 5.5v13M15 5.5v13M18 7.5v9" />
        </svg>
      );
    case 'run':
      return (
        <svg {...base(tam)}>
          <circle cx="14.5" cy="5" r="2" />
          <path d="m11 21 2.5-6-3-3 2-4.5 4 2 2.5.5M10 11.5 7 13M13.5 15l2.5 6" />
        </svg>
      );
    case 'functional':
      return (
        <svg {...base(tam)}>
          <circle cx="12" cy="14.5" r="6" />
          <path d="M9 8.5a3 3 0 0 1 6 0" />
        </svg>
      );
    case 'mobility':
      return (
        <svg {...base(tam)}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" />
        </svg>
      );
    default:
      return (
        <svg {...base(tam)}>
          <path d="M3 16c3 0 3-8 6-8s3 8 6 8 3-8 6-8" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// El perfil de una carrera por tramos
// ---------------------------------------------------------------------------

/** Cuántas barras como máximo; con más series el dibujo no cabe a 15 px de ancho de dedo. */
export function PerfilDeTramos({ p, alto = 56, conFrase = true }: { p: PerfilTramos; alto?: number; conFrase?: boolean }) {
  const barras = barrasDePerfil(p);
  const color = (zona: number | undefined, tipo: 'trabajo' | 'recuperacion') =>
    zona ? `var(--twin-z${zona})` : tipo === 'trabajo' ? 'var(--twin-accent)' : 'var(--twin-faint)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        role="img"
        aria-label={`${p.repeticiones} series de ${p.trabajo.medida}${p.recuperacion ? `, ${p.recuperacion.frase}` : ''}`}
        style={{ height: alto, display: 'flex', alignItems: 'flex-end', gap: barras.length > 20 ? 2 : 3 }}
      >
        {barras.map((b, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: `${Math.round(b.alto * 100)}%`,
              borderRadius: 3,
              background: color(b.zona, b.tipo),
              opacity: b.tipo === 'recuperacion' ? 0.5 : 1,
            }}
          />
        ))}
      </div>
      {conFrase ? (
        <p style={{ margin: 0, ...fuente(500, TAM.suelo, 1.35), color: 'var(--twin-muted)' }}>{fraseDePerfil(p)}</p>
      ) : null}
    </div>
  );
}

/** «Z4» con el color de su zona. El color acompaña, no es lo único: la zona se lee como letra. */
export function PastillaZona({ zona }: { zona: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 28,
        padding: '0 10px',
        borderRadius: RADIO.pastilla,
        background: 'var(--twin-surface-sunken)',
        border: '1px solid var(--twin-hairline-strong)',
        color: 'var(--twin-fg)',
        ...fuente(700, TAM.suelo, 1),
        ...TABULAR,
      }}
    >
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: `var(--twin-z${zona})` }} />
      Z{zona}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sin detalle
// ---------------------------------------------------------------------------

const TEXTO_SIN_DETALLE: Record<MotivoSinDetalle, { titular: string; frase: string }> = {
  'no-llego': {
    titular: 'Sin detalle de la sesión',
    frase: 'No pudimos cargar los ejercicios de esta sesión. Revisa tu conexión y vuelve a abrirla, o regístrala manualmente.',
  },
  'sin-ejercicios': {
    titular: 'Sin ejercicios todavía',
    frase: 'Tu coach aún no ha detallado qué hacer. Puedes empezar igualmente y apuntar lo que hagas.',
  },
};

export function SinDetalle({ motivo }: { motivo: MotivoSinDetalle }) {
  const { titular, frase } = TEXTO_SIN_DETALLE[motivo];
  return (
    <div
      style={{
        borderRadius: RADIO.tarjeta,
        padding: '22px 20px',
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>{titular}</span>
      <p style={{ margin: 0, ...fuente(400, TAM.cuerpo, 1.45), color: 'var(--twin-muted)' }}>{frase}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La técnica de un movimiento — se abre encima, sin sacarte de la sesión
// ---------------------------------------------------------------------------

/**
 * Lo que hace falta para ejecutar UN movimiento: el gesto, las claves del coach, su nota y lo que hiciste la última
 * vez (solo si alguien lo midió). Es la misma información que el detalle de ejercicio de la app, en una hoja que se
 * cierra con un toque y deja la ficha donde estaba.
 */
export function HojaTecnica({ m, onCerrar }: { m: Movimiento; onCerrar: () => void }) {
  const ficha = fichaDe(m.nombre);
  const ultima = ultimaVezDe(m.nombre);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <button
        type="button"
        aria-label="Cerrar la técnica"
        onClick={onCerrar}
        style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'var(--twin-scrim)', cursor: 'pointer' }}
      />
      <div
        role="dialog"
        aria-label={`Técnica: ${m.nombre}`}
        className="fi-entra"
        style={{
          position: 'relative',
          maxHeight: '82%',
          overflowY: 'auto',
          borderRadius: `${RADIO.grande}px ${RADIO.grande}px 0 0`,
          background: 'var(--twin-bg)',
          borderTop: '1px solid var(--twin-hairline-strong)',
          padding: `10px ${LATERAL}px calc(var(--twin-safe-bottom) + 20px)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <span aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, background: 'var(--twin-hairline-strong)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, ...fuente(800, 24, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{m.nombre}</h2>
          <BotonCromo etiqueta="Cerrar" onClick={onCerrar}>
            <IcoCerrar tam={16} />
          </BotonCromo>
        </div>
        {ficha.pose !== 'generico' ? (
          <FrameVideo pose={ficha.pose} videoS={ficha.videoS} tinte={COLOR_MODALIDAD[m.modalidad]} grande />
        ) : (
          <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>Este movimiento aún no tiene vídeo de técnica.</p>
        )}
        {ficha.claves.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ficha.claves.map((c) => (
              <li key={c} style={{ display: 'flex', gap: 10, ...fuente(400, TAM.cuerpo, 1.4), color: 'var(--twin-fg)' }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--twin-accent)', marginTop: 9, flex: '0 0 auto' }} />
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        {m.nota ? (
          <p style={{ margin: 0, padding: '2px 0 2px 12px', borderLeft: '3px solid var(--twin-accent)', ...fuente(400, TAM.cuerpo, 1.4), color: 'var(--twin-fg)' }}>
            {m.nota}
          </p>
        ) : null}
        {ultima ? (
          <p style={{ margin: 0, ...fuente(400, TAM.suelo, 1.4), color: 'var(--twin-muted)' }}>
            La última vez: <b style={{ color: 'var(--twin-fg)', ...TABULAR }}>{ultima.resumen}</b>, hace {ultima.haceDias} días.
          </p>
        ) : null}
      </div>
    </div>
  );
}

const IcoCerrar = ({ tam = 18 }: { tam?: number }) => (
  <svg {...base(tam)} strokeWidth={2.6}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
