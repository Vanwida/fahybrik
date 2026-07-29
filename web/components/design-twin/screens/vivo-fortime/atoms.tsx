'use client';

// El cromo del bloque: lo que envuelve al sujeto y no se va nunca.
//
// La franja existe porque en un For Time el crono del bloque ES la puntuación.
// No puede desaparecer al abrir una hoja, ni al pausar, ni al sellar una
// estación. Vive arriba, con superficie propia, y consigue su presencia por
// sitio y por voz (mono de instrumento) en vez de por tamaño: si compitiera en
// tamaño con el sujeto, la pantalla tendría dos sujetos y ninguno mandaría.

import { Mono, RAD, SP } from '../../kit';
import { reloj } from '../../datos-reales';

// ---------------------------------------------------------------------------
// El ambiente — el tramo activo tiñe la pantalla con su modalidad
// ---------------------------------------------------------------------------

export function Ambiente({ color }: { color: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(ellipse 120% 60% at 50% 22%, color-mix(in srgb, ${color} 20%, transparent), transparent 72%)`,
        transition: 'background 600ms ease-out',
      }}
    />
  );
}

/**
 * El fogonazo del suceso: entra de golpe y se va solo.
 *
 * La asimetría de la transición es el efecto entero — al encender no hay
 * transición (el suceso es instantáneo, como el pitido del monitor), y al
 * apagar hay 700 ms de caída. `activo` lo DERIVA quien lo usa del reloj
 * (`recienSellado`), así que aquí no hay ni estado ni temporizador.
 */
export function Flash({ activo, color }: { activo: boolean; color: string }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `color-mix(in srgb, ${color} 45%, transparent)`,
        opacity: activo ? 1 : 0,
        transition: activo ? 'none' : 'opacity 700ms ease-out',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// La franja — la puntuación, siempre
// ---------------------------------------------------------------------------

function IconPausa({ reanudar }: { reanudar: boolean }) {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" aria-hidden>
      {reanudar ? (
        <path d="M4.5 3 13 8l-8.5 5V3Z" fill="currentColor" />
      ) : (
        <g fill="currentColor">
          <rect x="4" y="3" width="2.6" height="10" rx="1" />
          <rect x="9.4" y="3" width="2.6" height="10" rx="1" />
        </g>
      )}
    </svg>
  );
}

export interface CapEstado {
  totalS: number;
  restanteS: number;
  /** Último minuto: la franja se pone naranja y lo dice. */
  urgente: boolean;
}

/**
 * La franja — y el motivo de que exista en las DOS caras.
 *
 * «El formato nunca suelta la franja»: gires como gires, el For Time sigue
 * siendo un For Time, así que su puntuación y dónde estás no se van. Lo que
 * cambia al girar no es QUÉ lleva, es cómo se pliega: en horizontal el alto es
 * el recurso escaso (381 pt contra 781), así que el cap y el aviso se meten en
 * la misma línea en vez de apilarse debajo.
 */
export function Franja({
  posicion,
  scoreS,
  cap,
  pausado,
  onPausa,
  compacta = false,
}: {
  posicion: string;
  scoreS: number;
  cap?: CapEstado;
  pausado: boolean;
  onPausa: () => void;
  /** Horizontal: todo en una línea. */
  compacta?: boolean;
}) {
  const urgente = cap?.urgente ?? false;
  return (
    <div
      style={{
        flex: '0 0 auto',
        padding: compacta ? `2px ${SP.m}px` : `${SP.s}px ${SP.m}px ${cap ? SP.s : SP.m}px`,
        background: urgente
          ? 'color-mix(in srgb, var(--twin-accent) 24%, var(--twin-surface))'
          : 'var(--twin-surface)',
        borderBottom: '1px solid var(--twin-hairline-strong)',
        transition: 'background-color 500ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
        <button
          type="button"
          onClick={onPausa}
          aria-label={pausado ? 'Reanudar el entreno' : 'Pausar el entreno'}
          style={{
            width: 44,
            height: 44,
            marginLeft: -10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 0,
            padding: 0,
            color: 'var(--twin-muted)',
            cursor: 'pointer',
          }}
        >
          <IconPausa reanudar={pausado} />
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            style={{
              font: 'italic 800 10px/1 var(--twin-font-sans)',
              letterSpacing: '0.12em',
              color: 'var(--twin-accent-text)',
            }}
          >
            FOR TIME
          </span>
          <span style={{ font: '600 12px/1 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            {pausado ? 'En pausa' : posicion}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        {/* En horizontal el cap viaja en la propia línea: es lo mismo que
            arriba, plegado de otra manera, no una segunda versión. */}
        {compacta && cap && (
          <div style={{ flex: '0 1 260px', minWidth: 140 }}>
            <BarraCap {...cap} sinMargen />
          </div>
        )}
        {compacta && urgente && <AvisoUltimoMinuto />}
        <span
          className="t-readout-m"
          style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)' }}
        >
          {reloj(scoreS)}
        </span>
      </div>
      {!compacta && cap && <BarraCap {...cap} />}
      {!compacta && urgente && (
        <div style={{ marginTop: SP.xs }}>
          <AvisoUltimoMinuto />
        </div>
      )}
    </div>
  );
}

/**
 * Lo dice, y se calla. El aviso es la información de que se acaba, no una
 * arenga: el naranja ya grita bastante, y la barra de al lado ya dice «de
 * cap». Una sola redacción para las dos caras — la misma frase escrita dos
 * veces es como empiezan las tres grafías del ritmo (§2).
 */
function AvisoUltimoMinuto() {
  return (
    <span style={{ font: '600 11px/1 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
      Último minuto.
    </span>
  );
}

/**
 * El cap es lo único que se pinta como progreso, y puede: es tiempo, y el
 * tiempo se mide. Las repeticiones no llevan barra por la misma razón.
 */
function BarraCap({ totalS, restanteS, urgente, sinMargen = false }: CapEstado & { sinMargen?: boolean }) {
  const usado = Math.min(1, Math.max(0, (totalS - restanteS) / totalS));
  const tinte = urgente ? 'var(--twin-accent)' : 'var(--twin-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, marginTop: sinMargen ? 0 : SP.s }}>
      <div
        role="img"
        aria-label={`Cap de ${reloj(totalS)}. Quedan ${reloj(restanteS)}.`}
        style={{
          flex: 1,
          height: 4,
          borderRadius: RAD.s,
          background: 'var(--twin-surface-sunken)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${usado * 100}%`, height: '100%', background: tinte, transition: 'width 500ms linear' }} />
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
        <Mono size={14} weight={700} color={urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}>
          {reloj(restanteS)}
        </Mono>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>de cap</span>
      </span>
    </div>
  );
}
