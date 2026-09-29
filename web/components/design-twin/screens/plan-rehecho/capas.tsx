'use client';

// LAS CAPAS que se abren SOBRE la pestaña: la hoja de acciones de una sesión, la
// de «Mover a otro día», el diálogo (confirmar, conflicto, límite del club) y el
// aviso de fallo. Son los mismos menús y diálogos del Swift (`PlanAcciones`,
// `LiveWorkoutLaunchConflictDialog`, el «Límite de visibilidad»), con las dos
// cosas que un menú contextual no tiene en la web: un nombre accesible y una
// salida por teclado (Escape, foco atrapado y devuelto).
//
// Las capas cuelgan del lienzo del iPhone (`.twin-screen-safe`), no de la página.

import { useEffect, useRef, type ReactNode } from 'react';
import { IcoChat } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, TOQUE, tinte, velo } from '../../kit-dia/tokens';
import type { SesionDelPlan } from '../../kit-plan/contrato';
import type { AccionDeSesion, ClaveAccion } from '../../kit-plan/modelo';
import { IcoAviso, IcoCerrar, IcoChevronIzq, IcoDeshacer, IcoLapiz, IcoLista, IcoMover, IcoPapelera } from './iconos';
import { IcoCheck } from '../../kit-dia/iconos';

/**
 * El texto de lo que borra o pisa algo. El rojo de estado a secas no llega a 4,5:1 sobre la superficie
 * elevada del tema oscuro (4,5 justo, y sin margen contra el suavizado): se mezcla con la tinta del
 * tema, que sigue leyéndose rojo y pasa AA en claro y en oscuro.
 */
const TINTA_PELIGRO = tinte('var(--twin-danger)', 72, 'var(--twin-fg)');

const FOCALIZABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Escape cierra, Tab no se sale de la capa y el foco vuelve a donde estaba. */
function useCapa(onCerrar: () => void) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const el = raiz.current;
    (el?.querySelector<HTMLElement>(FOCALIZABLE) ?? el)?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCerrar();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const dentro = [...el.querySelectorAll<HTMLElement>(FOCALIZABLE)];
      if (dentro.length === 0) return;
      const primero = dentro[0]!;
      const ultimo = dentro[dentro.length - 1]!;
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => {
      window.removeEventListener('keydown', alTeclear, true);
      previo?.focus?.();
    };
    // Se monta una vez por capa: onCerrar es estable dentro de una misma capa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return raiz;
}

function Capa({
  etiqueta,
  onCerrar,
  abajo,
  children,
}: {
  etiqueta: string;
  onCerrar: () => void;
  abajo?: boolean;
  children: ReactNode;
}) {
  const raiz = useCapa(onCerrar);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: abajo ? 'flex-end' : 'center', justifyContent: 'center' }}>
      <div aria-hidden className="pl-vela" onClick={onCerrar} style={{ position: 'absolute', inset: 0, background: 'var(--twin-scrim)' }} />
      <div
        ref={raiz}
        role="dialog"
        aria-modal="true"
        aria-label={etiqueta}
        tabIndex={-1}
        className={abajo ? 'pl-hoja' : 'pl-alerta'}
        style={{
          position: 'relative',
          width: abajo ? '100%' : 'calc(100% - 48px)',
          maxHeight: '86%',
          overflowY: 'auto',
          boxSizing: 'border-box',
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          borderRadius: abajo ? `${RADIO.grande}px ${RADIO.grande}px 0 0` : RADIO.grande,
          borderBottom: abajo ? 'none' : undefined,
          boxShadow: 'var(--twin-shadow-hero)',
          padding: abajo ? '10px 0 calc(var(--twin-safe-bottom) + 12px)' : '24px 22px 18px',
          outline: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Hoja de acciones ────────────────────────────────────────────────────────

const ICONO: Record<ClaveAccion, ReactNode> = {
  tecnica: <IcoLista />,
  preguntar: <IcoChat tam={22} />,
  mover: <IcoMover />,
  'marcar-hecha': <IcoCheck tam={22} />,
  completar: <IcoLapiz />,
  deshacer: <IcoDeshacer />,
  'editar-libre': <IcoLapiz />,
  'borrar-libre': <IcoPapelera />,
};

function FilaAccion({ icono, texto, destructiva, onClick }: { icono: ReactNode; texto: string; destructiva?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pl-fila-accion"
      onClick={onClick}
      style={{
        appearance: 'none',
        border: 0,
        background: 'none',
        width: '100%',
        minHeight: 56,
        padding: '0 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        textAlign: 'left',
        cursor: 'pointer',
        color: destructiva ? TINTA_PELIGRO : 'var(--twin-fg)',
        ...fuente(600, TAM.cuerpo, 1.25),
      }}
    >
      {icono}
      {texto}
    </button>
  );
}

const Separador = () => <div role="separator" style={{ height: 1, background: 'var(--twin-hairline)', margin: '0 22px' }} />;

export interface GrupoDeAcciones {
  sesion: SesionDelPlan;
  /** «Hoy · Jueves 1». */
  cuando: string;
  acciones: AccionDeSesion[];
}

function Cabecera({ titulo, subtitulo, atras, onAtras }: { titulo: string; subtitulo?: string; atras?: boolean; onAtras?: () => void }) {
  return (
    <div style={{ padding: '6px 22px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      {atras ? (
        <button
          type="button"
          className="pl-btn"
          aria-label="Volver"
          onClick={onAtras}
          style={{ width: TOQUE, height: TOQUE, marginLeft: -14, display: 'grid', placeItems: 'center', color: 'var(--twin-fg)' }}
        >
          <IcoChevronIzq tam={20} />
        </button>
      ) : null}
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>{titulo}</h2>
        {subtitulo ? <p style={{ margin: '2px 0 0', ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)' }}>{subtitulo}</p> : null}
      </div>
    </div>
  );
}

export function HojaAcciones({
  grupos,
  onElegir,
  onCerrar,
}: {
  grupos: GrupoDeAcciones[];
  onElegir: (clave: ClaveAccion, sesion: SesionDelPlan) => void;
  onCerrar: () => void;
}) {
  return (
    <Capa etiqueta="Acciones de la sesión" onCerrar={onCerrar} abajo>
      {grupos.map((g, i) => (
        <section key={g.sesion.id} aria-label={g.sesion.titulo}>
          {i > 0 ? <Separador /> : null}
          <Cabecera titulo={g.sesion.titulo} subtitulo={g.cuando} />
          {g.acciones.map((a) => (
            <FilaAccion key={a.clave} icono={ICONO[a.clave]} texto={a.etiqueta} destructiva={a.destructiva} onClick={() => onElegir(a.clave, g.sesion)} />
          ))}
        </section>
      ))}
      <Separador />
      <FilaAccion icono={<IcoCerrar tam={22} />} texto="Cerrar" onClick={onCerrar} />
    </Capa>
  );
}

export function HojaMover({
  sesion,
  destinos,
  onElegir,
  onAtras,
  onCerrar,
}: {
  sesion: SesionDelPlan;
  destinos: Array<{ iso: string; etiqueta: string }>;
  onElegir: (iso: string, etiqueta: string) => void;
  onAtras: () => void;
  onCerrar: () => void;
}) {
  return (
    <Capa etiqueta="Mover a otro día" onCerrar={onCerrar} abajo>
      <Cabecera titulo="Mover a otro día" subtitulo={sesion.titulo} atras onAtras={onAtras} />
      {destinos.map((d) => (
        <FilaAccion key={d.iso} icono={<IcoMover />} texto={d.etiqueta} onClick={() => onElegir(d.iso, d.etiqueta)} />
      ))}
    </Capa>
  );
}

// ── Diálogo ─────────────────────────────────────────────────────────────────

export interface BotonDeDialogo {
  texto: string;
  onClick: () => void;
  /** Lo que borra o pisa algo: en el color de peligro. */
  destructivo?: boolean;
  /** La salida por defecto (cancelar): sin relleno. */
  neutro?: boolean;
}

export function Alerta({ titulo, mensaje, botones, onCerrar }: { titulo: string; mensaje: string; botones: BotonDeDialogo[]; onCerrar: () => void }) {
  return (
    <Capa etiqueta={titulo} onCerrar={onCerrar}>
      <h2 style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), color: 'var(--twin-fg)', letterSpacing: '-0.01em' }}>{titulo}</h2>
      <p style={{ margin: '10px 0 20px', ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{mensaje}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {botones.map((b) => (
          <button
            key={b.texto}
            type="button"
            className="pl-btn"
            onClick={b.onClick}
            style={{
              minHeight: 52,
              padding: '0 16px',
              borderRadius: RADIO.pastilla,
              cursor: 'pointer',
              border: b.neutro || b.destructivo ? `1px solid ${b.destructivo ? velo('var(--twin-danger)', 55) : 'var(--twin-hairline-strong)'}` : 'none',
              background: b.neutro || b.destructivo ? 'transparent' : 'var(--twin-fg)',
              color: b.destructivo ? TINTA_PELIGRO : b.neutro ? 'var(--twin-fg)' : 'var(--twin-bg)',
              ...fuente(700, TAM.cuerpo, 1.2),
            }}
          >
            {b.texto}
          </button>
        ))}
      </div>
    </Capa>
  );
}

// ── Aviso de fallo ──────────────────────────────────────────────────────────

/**
 * Cuando aparece, lo que falló YA se revirtió: no promete nada, cuenta qué pasó.
 * Va arriba, como en Swift, para no tapar la acción anclada.
 */
export function AvisoDeFallo({ texto, onCerrar }: { texto: string; onCerrar: () => void }) {
  return (
    <div
      role="alert"
      className="pl-aviso"
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        top: 'calc(var(--twin-safe-top) + 6px)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        padding: '8px 8px 8px 16px',
        boxSizing: 'border-box',
        borderRadius: RADIO.tarjeta,
        background: 'var(--twin-fg)',
        color: 'var(--twin-bg)',
        boxShadow: 'var(--twin-shadow-hero)',
        ...fuente(700, TAM.suelo, 1.3),
      }}
    >
      <IcoAviso tam={20} />
      <span style={{ flex: 1 }}>{texto}</span>
      <button
        type="button"
        className="pl-btn"
        aria-label="Cerrar aviso"
        onClick={onCerrar}
        style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', color: 'var(--twin-bg)' }}
      >
        <IcoCerrar tam={18} />
      </button>
    </div>
  );
}
