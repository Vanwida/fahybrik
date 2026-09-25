'use client';

// LAS PÁGINAS FIJAS — las de la gramática de Apple Entreno (P4).
//
//   PaginaControles  izquierda: Pausa/Reanudar, Siguiente paso o Vuelta,
//                    Water Lock, Terminar (→ «¿Terminar y guardar?»).
//   AhoraSuena       derecha: la música del sistema.
//
// Las de la corona (Datos, Vueltas, Estructura y sus formas genéricas) viven
// en `listas.tsx`.
//
// Iconos: trazos propios, sin librería (el lienzo del reloj no carga nada).

import type { ReactNode } from 'react';
import { Columna } from './pasos';
import { C, T } from './tokens';

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export type IconoControl = 'pausa' | 'reanudar' | 'siguiente' | 'vuelta' | 'agua' | 'terminar';

function Icono({ tipo, tono }: { tipo: IconoControl; tono: string }) {
  const p = { fill: 'none', stroke: tono, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (tipo) {
    case 'pausa':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill={tono} />
          <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill={tono} />
        </svg>
      );
    case 'reanudar':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M7 4.5v15l12.5-7.5Z" fill={tono} />
        </svg>
      );
    case 'siguiente':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 5.5 13 12l-8 6.5M17.5 5.5v13" {...p} />
        </svg>
      );
    case 'vuelta':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4h-4" {...p} />
        </svg>
      );
    case 'agua':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3.5s6 6.6 6 10.8a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5Z" {...p} />
        </svg>
      );
    case 'terminar':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" {...p} />
        </svg>
      );
  }
}

/** Un control de la página izquierda: botón redondeado ≥ 44 pt y su rótulo a 15 pt. */
export function Control({
  icono,
  etiqueta,
  activo = false,
  onPulsa,
}: {
  icono: IconoControl;
  etiqueta: string;
  activo?: boolean;
  onPulsa: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPulsa();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: C.tinta,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 86,
          height: 58,
          borderRadius: 20,
          background: activo ? C.accion : C.superficie2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icono tipo={icono} tono={activo ? C.sobreAccion : C.accion} />
      </span>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1 }}>{etiqueta}</span>
    </button>
  );
}

export interface PaginaControlesProps {
  pausado: boolean;
  onPausa: () => void;
  /** «Siguiente paso», «Vuelta», «Siguiente serie»: la etiqueta es del contexto. */
  siguiente?: { etiqueta: string; icono?: 'siguiente' | 'vuelta'; onPulsa: () => void };
  agua: boolean;
  onAgua: () => void;
  onTerminar: () => void;
}

/** LOS CONTROLES, a la izquierda del vivo — el orden y el sitio de Apple Entreno. */
export function PaginaControles(p: PaginaControlesProps) {
  return (
    <Columna estilo={{ justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '86px 86px', columnGap: 12, rowGap: 12 }}>
        <Control
          icono={p.pausado ? 'reanudar' : 'pausa'}
          etiqueta={p.pausado ? 'Reanudar' : 'Pausa'}
          activo={p.pausado}
          onPulsa={p.onPausa}
        />
        {p.siguiente ? (
          <Control icono={p.siguiente.icono ?? 'siguiente'} etiqueta={p.siguiente.etiqueta} onPulsa={p.siguiente.onPulsa} />
        ) : (
          <span />
        )}
        <Control icono="agua" etiqueta="Bloqueo" activo={p.agua} onPulsa={p.onAgua} />
        <Control icono="terminar" etiqueta="Terminar" onPulsa={p.onTerminar} />
      </div>
    </Columna>
  );
}

/** «¿Terminar y guardar?» — Terminar (la acción, naranja) o Seguir. Nunca un tercer botón. */
export function ConfirmarTerminar({ onTerminar, onSeguir }: { onTerminar: () => void; onSeguir: () => void }) {
  const boton = (texto: string, accion: boolean, f: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        f();
      }}
      style={{
        width: '100%',
        height: 48,
        border: 0,
        borderRadius: 24,
        background: accion ? C.accion : C.superficie2,
        color: accion ? C.sobreAccion : C.tinta,
        fontSize: T.boton.cuerpo,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {texto}
    </button>
  );
  return (
    <Columna estilo={{ background: C.fondo, justifyContent: 'center', gap: 10 }}>
      <span style={{ fontSize: 22, fontWeight: 600, textAlign: 'center', lineHeight: 1.15, marginBottom: 8 }}>
        ¿Terminar y guardar?
      </span>
      {boton('Terminar', true, onTerminar)}
      {boton('Seguir', false, onSeguir)}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Ahora suena (derecha) — del sistema, por eso sus iconos no son naranjas
// ---------------------------------------------------------------------------

export function AhoraSuena() {
  const redondo = (hijo: ReactNode, grande = false) => (
    <span
      style={{
        width: grande ? 52 : 44,
        height: grande ? 52 : 44,
        borderRadius: '50%',
        background: grande ? C.superficie2 : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hijo}
    </span>
  );
  return (
    <Columna estilo={{ justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>Ahora suena</span>
      <span style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>Lista de series</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>Pista 4 de 18</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
        {redondo(
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M19 5v14L9 12Zm-13 0h2.5v14H6Z" fill={C.tinta} />
          </svg>,
        )}
        {redondo(
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill={C.tinta} />
            <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill={C.tinta} />
          </svg>,
          true,
        )}
        {redondo(
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 5v14l10-7Zm13 0h-2.5v14H18Z" fill={C.tinta} />
          </svg>,
        )}
      </div>
    </Columna>
  );
}
