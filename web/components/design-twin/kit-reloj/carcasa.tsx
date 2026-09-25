'use client';

// LAS PIEZAS DE LA CARCASA — lo que `Muneca` pinta por encima de las páginas:
// los puntos (vertical de la corona, horizontal de las áreas), el velo de la
// pausa, la gota del Water Lock, el aviso de deshacer y el «Terminado».
// Separado de `Muneca.tsx` solo por tamaño; nadie más debería usarlas.

import type { ReactNode } from 'react';
import type { Area } from './mandos';
import { BotonAccion, useCabe } from './piezas';
import { ANCHO_PIE, C, T } from './tokens';

export const PASOS_AGUA = 3;

/** Lo que funde el velo del pie con lo de encima (pt): una fila cortada se disuelve. */
const VELO_PIE_FUNDIDO = 12;

const AREAS: Area[] = ['controles', 'vivo', 'musica'];

export const KEYFRAMES = `
@keyframes reloj-entra { from { opacity: 0; transform: translateY(-6px) scale(0.98); } to { opacity: 1; transform: none; } }
@keyframes reloj-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes reloj-drena { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes reloj-puntos { 0%, 55% { opacity: 1; } 100% { opacity: 0.38; } }
@keyframes reloj-apaga { 0%, 60% { opacity: 1; } 100% { opacity: 0; } }
@keyframes reloj-destello { from { opacity: 0.22; } to { opacity: 0; } }
`;

/** Los puntos de la pila, en vertical junto a la corona, como watchOS. Se encienden al girar. */
export function PuntosVerticales({ total, activa, n }: { total: number; activa: number; n: number }) {
  return (
    <div
      key={n}
      aria-hidden
      style={{
        position: 'absolute',
        // Junto a la corona, arriba a la derecha, como la pila vertical de
        // watchOS: ahí no hay dato (el héroe queda por debajo de este carril).
        right: 9,
        top: 52,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
        animation: n > 0 ? 'reloj-puntos 1800ms ease-out forwards' : undefined,
        opacity: n > 0 ? undefined : 0.38,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: 4, height: i === activa ? 10 : 4, borderRadius: 2, background: i === activa ? C.tinta : 'rgba(255,255,255,0.4)', transition: 'height 200ms ease' }} />
      ))}
    </div>
  );
}

/** Los puntos de las áreas, abajo: aparecen al cambiar de área y se apagan. */
export function PuntosAreas({ activa, n }: { activa: number; n: number }) {
  if (n === 0) return null;
  return (
    <div
      key={n}
      aria-hidden
      style={{
        position: 'absolute',
        bottom: 5,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 5,
        pointerEvents: 'none',
        animation: 'reloj-apaga 1600ms ease-out forwards',
      }}
    >
      {AREAS.map((a, i) => (
        <span key={a} style={{ width: 5, height: 5, borderRadius: 3, background: i === activa ? C.tinta : 'rgba(255,255,255,0.35)' }} />
      ))}
    </div>
  );
}

export function VeloPausa({ onReanudar }: { onReanudar: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 10,
        padding: '0 calc(var(--twin-safe-right) + 10px) calc(var(--twin-safe-bottom) + 6px)',
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.85) 70%)',
      }}
    >
      <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 700, letterSpacing: 1.2, color: C.tinta }}>EN PAUSA</span>
      <BotonAccion etiqueta="Reanudar" onPulsa={onReanudar} />
    </div>
  );
}

export function GotaAgua({ giro }: { giro: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3.5s6 6.6 6 10.8a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5Z" fill="#5AC8FA" />
        </svg>
      </div>
      {giro > 0 ? (
        <div style={{ position: 'absolute', inset: 0, background: C.velo, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600 }}>Gira la corona</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: PASOS_AGUA }, (_, i) => (
              <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: i < giro ? C.tinta : C.carril }} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * EL AVISO DE DESHACER — 5 s, con su barra que se vacía. Vive en la FRANJA
 * DEL PIE (`ANCHO_PIE`, el alto de un botón): tapa la fila de abajo, nunca el
 * héroe (P3), que es lo que el atleta mira justo después de cerrar (el GO, la
 * serie siguiente). La píldora entera es el botón (44 pt): arriba qué se
 * cerró, debajo «Deshacer» en naranja, la acción. Debajo, `VeloPie`.
 */
export function AvisoDeshacer({ aviso, onDeshacer }: { aviso: string; onDeshacer: () => void }) {
  const ref = useCabe<HTMLSpanElement>();
  return (
    <button
      type="button"
      aria-label={`${aviso} · Deshacer`}
      onClick={(e) => {
        e.stopPropagation();
        onDeshacer();
      }}
      style={{
        position: 'absolute',
        // Centrada sin `transform`: la animación de entrada lo usa entero.
        left: 0,
        right: 0,
        marginInline: 'auto',
        bottom: 'var(--twin-safe-bottom)',
        width: ANCHO_PIE,
        height: T.boton.alto,
        border: 0,
        borderRadius: T.boton.alto / 2,
        background: C.superficie2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        padding: '0 8px',
        boxSizing: 'border-box',
        overflow: 'hidden',
        fontFamily: 'inherit',
        cursor: 'pointer',
        animation: 'reloj-entra 200ms ease-out',
      }}
    >
      <span
        aria-hidden
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: C.tinta2, transformOrigin: 'left', animation: 'reloj-drena 5s linear forwards' }}
      />
      <span style={{ maxWidth: '100%', display: 'flex', justifyContent: 'center' }}>
        <span ref={ref} style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta, whiteSpace: 'nowrap', lineHeight: 1, transformOrigin: 'center' }}>
          {aviso}
        </span>
      </span>
      <span style={{ fontSize: T.boton.cuerpo, fontWeight: T.boton.peso, color: C.accion, lineHeight: 1 }}>Deshacer</span>
    </button>
  );
}

/**
 * EL VELO DEL PIE — mientras vive el aviso, la franja es suya: un negro de
 * lado a lado tapa lo que hubiera en el pie (los botones del descanso son más
 * anchos que la píldora y asomarían por los lados) y funde la fila que la
 * píldora corta, en vez de rebanarla. Va DENTRO del Vivo, bajo la capa (el GO
 * no se vela: es el héroe) y bajo el aro (la sesión no se tapa).
 */
export function VeloPie() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `calc(var(--twin-safe-bottom) + ${T.boton.alto + VELO_PIE_FUNDIDO}px)`,
        background: `linear-gradient(180deg, transparent, ${C.fondo} ${VELO_PIE_FUNDIDO}px)`,
        pointerEvents: 'none',
        animation: 'reloj-aparece 200ms ease-out',
      }}
    />
  );
}

export function Terminado({ titulo }: { titulo: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.fondo, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke={C.tinta2} strokeWidth="1.6" />
        <path d="M7.5 12.5 10.3 15.3 16.5 9" fill="none" stroke={C.tinta} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600 }}>{titulo}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>guardando…</span>
    </div>
  );
}

/** El fondo: el tinte de zona en una banda central, negro arriba (el aro) y abajo (el OLED no gasta). */
export function Fondo({ color, visible }: { color: string; visible: boolean }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: color,
          opacity: visible ? 1 : 0,
          transition: 'background-color 700ms ease, opacity 250ms ease',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.7) 16%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.55) 72%, #000 100%)',
        }}
      />
    </>
  );
}

/** El aro de la sesión: solo en el Vivo, atenuado en Always-On. */
export function CapaAro({ opacidad, children }: { opacidad: number; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: opacidad, transition: 'opacity 250ms ease' }}>
      {children}
    </div>
  );
}
