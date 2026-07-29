'use client';

// El cromo del bloque y su franja de contexto — lo que envuelve al sujeto y no
// se va nunca.
//
// EL CRONO. En un For Time el crono del bloque ES la puntuación, así que no
// puede desaparecer al abrir una hoja, ni al pausar, ni al sellar una estación.
// Pero tampoco puede COMPETIR: hasta el 29-jul vivía en una barra con
// superficie propia y a 34 px, y la pantalla acababa con dos numerales y
// ninguno mandando. Ahora vive en la fila `contexto` de `MarcoVivo` (§10.3), en
// la voz de instrumento pero un escalón por debajo: presencia por SITIO, no por
// tamaño.
//
// EL TINTE. Ya no sale de aquí. Lo pone la ZONA DE PULSO (`Ambiente` de
// `kit-vivo`, §10.1). Antes lo ponía la modalidad del tramo activo, y el
// resultado se veía de lejos: lienzo verde azulado (remo) mientras el pulso
// marcaba 164 ppm en Z4 — el fondo diciendo una cosa y el atleta otra. La
// modalidad sigue marcando el tramo donde le toca, que es el punto de color de
// cada fila de la ruta.

import { RAD, SP } from '../../kit';
import { reloj } from '../../datos-reales';

// ---------------------------------------------------------------------------
// El cromo — de qué formato es esto y dónde estás dentro
// ---------------------------------------------------------------------------

function IconPausa({ reanudar }: { reanudar: boolean }) {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" aria-hidden>
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

/**
 * La fila de cromo: pausar, el formato y en qué tramo vas. Todo en una línea de
 * 34 pt — el mismo botón redondo que el AMRAP, para que dos formatos del mismo
 * entreno no tengan dos cromos distintos.
 */
export function CromoFormato({
  posicion,
  pausado,
  onPausa,
}: {
  posicion: string;
  pausado: boolean;
  onPausa: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, width: '100%', minWidth: 0 }}>
      <button
        type="button"
        onClick={onPausa}
        aria-label={pausado ? 'Reanudar el entreno' : 'Pausar el entreno'}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          color: 'var(--twin-muted)',
          cursor: 'pointer',
          padding: 0,
          flex: '0 0 auto',
        }}
      >
        <IconPausa reanudar={pausado} />
      </button>
      <span
        style={{
          font: 'italic 800 10px/1 var(--twin-font-sans)',
          letterSpacing: '0.12em',
          color: 'var(--twin-accent-text)',
          flex: '0 0 auto',
        }}
      >
        FOR TIME
      </span>
      <span
        style={{
          font: '600 12px/1 var(--twin-font-sans)',
          color: 'var(--twin-muted)',
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {pausado ? 'En pausa' : posicion}
      </span>
      <span style={{ flex: 1 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El contexto — la puntuación, y el cap cuando lo hay
// ---------------------------------------------------------------------------

export interface CapEstado {
  totalS: number;
  restanteS: number;
  /** Último minuto: el contexto se pone naranja y lo dice. */
  urgente: boolean;
}

/**
 * La franja que no desaparece jamás. El crono va en `t-readout-s` (22 pt): la
 * misma voz de instrumento que el sujeto, un escalón por debajo.
 *
 * El aviso del último minuto NO se escribe en una línea aparte — se dice en la
 * etiqueta del propio crono. Una sola redacción para las dos caras: la misma
 * frase escrita dos veces es como empiezan las tres grafías del ritmo (§2).
 */
export function ContextoFormato({ scoreS, cap }: { scoreS: number; cap?: CapEstado }) {
  const urgente = cap?.urgente ?? false;
  // «Último minuto» solo mientras QUEDA cap. Con el cap agotado el crono ya no
  // avisa de nada: es lo que tardaste, y la barra de al lado dice el resto.
  const avisa = urgente && (cap?.restanteS ?? 0) > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.m, width: '100%', minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, flex: '0 0 auto' }}>
        <span className="t-readout-s" style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)' }}>
          {reloj(scoreS)}
        </span>
        <span
          className="t-readout-label"
          style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-muted)', letterSpacing: '0.1em' }}
        >
          {avisa ? 'último minuto' : 'tu tiempo'}
        </span>
      </span>
      {cap ? <BarraCap {...cap} /> : <span style={{ flex: 1 }} />}
    </div>
  );
}

/**
 * El cap es lo único que se pinta como progreso, y puede: es tiempo, y el
 * tiempo se mide. Las repeticiones no llevan barra por la misma razón.
 */
function BarraCap({ totalS, restanteS, urgente }: CapEstado) {
  const usado = Math.min(1, Math.max(0, (totalS - restanteS) / totalS));
  const tinte = urgente ? 'var(--twin-accent)' : 'var(--twin-muted)';
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: SP.s }}>
      <div
        role="img"
        aria-label={`Cap de ${reloj(totalS)}. Quedan ${reloj(restanteS)}.`}
        style={{
          flex: 1,
          minWidth: 0,
          height: 4,
          borderRadius: RAD.s,
          background: 'var(--twin-surface-sunken)',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${usado * 100}%`, height: '100%', background: tinte, transition: 'width 500ms linear' }} />
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, flex: '0 0 auto' }}>
        <span className="t-readout-s" style={{ color: urgente ? 'var(--twin-accent-text)' : 'var(--twin-fg)' }}>
          {reloj(restanteS)}
        </span>
        <span style={{ font: '500 11px var(--twin-font-sans)', color: 'var(--twin-muted)' }}>de cap</span>
      </span>
    </div>
  );
}
