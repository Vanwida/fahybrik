'use client';

// LAS HOJAS: la infraestructura de las hojas modales de la pestaña (importar,
// buscar y fijar carrera, el tiempo objetivo), el diálogo de confirmación y el
// menú de acciones de una carrera. En iOS son `.sheet` y `.confirmationDialog`;
// aquí viven DENTRO del lienzo del iPhone (absolutas sobre la pantalla), con el
// foco atrapado, Escape para cerrar y el fondo inerte mientras están abiertas.

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import type { ProximaCarrera } from '../../kit-carreras/contrato';
import { IcoEstrella, IcoCerrar, IcoPapelera, BotonTexto, TINTA_PELIGRO } from './piezas';
import { IcoChat } from '../../kit-dia/iconos';
import { fuente, RADIO, TAM, TOQUE, velo } from '../../kit-dia/tokens';

const FOCALIZABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Foco atrapado en el panel: entra al abrir, da la vuelta con Tab, sale con Escape y vuelve a donde estaba. */
function useFocoAtrapado(panel: React.RefObject<HTMLDivElement | null>, onCerrar: () => void, enfocar: boolean) {
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });
  // Quién tenía el foco ANTES de abrir, tomado en el primer render: dentro del efecto llegaría
  // tarde (con el modo estricto el efecto corre dos veces y la segunda ya vería el foco del panel).
  const previo = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null));
  useEffect(() => {
    const volver = previo.current;
    const raiz = panel.current;
    if (raiz && enfocar) {
      // Lo primero enfocable que NO sea el «cerrar» de la cabecera: el campo o la primera acción.
      const lista = [...raiz.querySelectorAll<HTMLElement>(FOCALIZABLE)];
      (lista.find((e) => !e.hasAttribute('data-cerrar')) ?? lista[0] ?? raiz).focus({ preventScroll: true });
    }
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrar.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const lista = [...panel.current.querySelectorAll<HTMLElement>(FOCALIZABLE)];
      if (lista.length === 0) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTecla, true);
    return () => {
      document.removeEventListener('keydown', alTecla, true);
      volver?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const capa: CSSProperties = { position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' };

/** El velo que oscurece lo de detrás (`--twin-scrim`, nunca un negro suelto). Tocarlo cierra. */
function Velo({ onCerrar }: { onCerrar: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onCerrar}
      className="cr-velo"
      style={{ position: 'absolute', inset: 0, border: 0, padding: 0, margin: 0, background: 'var(--twin-scrim)', cursor: 'default' }}
    />
  );
}

/**
 * La hoja: título de sección a 24, cierre de 44 pt, cuerpo con scroll y la acción
 * anclada abajo si la hay (§6, regla 3). Ocupa el 92 % como mucho: se ve lo de
 * detrás, que es lo que dice «esto es una hoja».
 */
export function Hoja({
  titulo,
  onCerrar,
  children,
  accion,
  alto = 'auto',
  atras,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Anclada abajo (el «Sí, importar»). */
  accion?: ReactNode;
  /** `llena` la hace de alto casi completo (búsquedas con listas); `auto` la ajusta al contenido. */
  alto?: 'auto' | 'llena';
  /** Volver un paso dentro de la hoja (en lugar de cerrar). */
  atras?: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocoAtrapado(panel, onCerrar, true);
  return (
    <div style={capa} className="cr-capa">
      <Velo onCerrar={onCerrar} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="cr-hoja"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: alto === 'llena' ? '92%' : undefined,
          maxHeight: '92%',
          background: 'var(--twin-bg)',
          borderRadius: `${RADIO.grande}px ${RADIO.grande}px 0 0`,
          border: '1px solid var(--twin-hairline-strong)',
          borderBottom: 0,
          boxShadow: 'var(--twin-shadow-hero)',
          overflow: 'hidden',
        }}
      >
        <span aria-hidden style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8, background: velo('var(--twin-fg)', 24) }} />
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 8px 4px 20px', minHeight: 56 }}>
          <h2 id={id} style={{ margin: 0, ...fuente(800, TAM.seccion, 1.15, true), letterSpacing: '-0.01em', color: 'var(--twin-fg)' }}>
            {titulo}
          </h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {atras ? (
              <button type="button" className="hd-toque" onClick={atras} style={{ width: 'auto', minHeight: TOQUE, padding: '0 12px', ...fuente(700, TAM.suelo, 1), color: 'var(--twin-accent-text)' }}>
                Atrás
              </button>
            ) : null}
            <button
              type="button"
              className="hd-toque"
              data-cerrar
              onClick={onCerrar}
              aria-label="Cerrar"
              style={{ width: TOQUE, height: TOQUE, display: 'grid', placeItems: 'center', color: 'var(--twin-fg)' }}
            >
              <IcoCerrar tam={20} />
            </button>
          </span>
        </div>
        <div className="twin-scroll" style={{ flex: '1 1 auto', minHeight: 0, padding: '4px 20px 24px' }}>
          {children}
        </div>
        {accion ? (
          <div
            style={{
              flex: '0 0 auto',
              padding: `12px 20px calc(var(--twin-safe-bottom) + 16px)`,
              background: 'var(--twin-bg)',
              borderTop: '1px solid var(--twin-hairline)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {accion}
          </div>
        ) : null}
        {/* Sin acción anclada, el pie respeta el gesto de inicio. */}
        {accion ? null : <span aria-hidden style={{ flex: '0 0 auto', height: 'var(--twin-safe-bottom)' }} />}
      </div>
    </div>
  );
}

// ── Confirmación (el `.confirmationDialog` de iOS) ───────────────────────────

export function Confirmacion({
  titulo,
  mensaje,
  destructivo,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  mensaje: string;
  destructivo: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocoAtrapado(panel, onCancelar, true);
  return (
    <div style={capa} className="cr-capa">
      <Velo onCerrar={onCancelar} />
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={id}
        className="cr-hoja"
        style={{
          position: 'relative',
          margin: `0 12px calc(var(--twin-safe-bottom) + 8px)`,
          borderRadius: RADIO.grande,
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          boxShadow: 'var(--twin-shadow-hero)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 22px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id={id} style={{ margin: 0, ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>
            {titulo}
          </h2>
          <p style={{ margin: 0, ...fuente(500, TAM.cuerpo, 1.4), color: 'var(--twin-fg)', textWrap: 'pretty' }}>{mensaje}</p>
        </div>
        <div style={{ borderTop: '1px solid var(--twin-hairline)' }}>
          <BotonTexto tono="peligro" centrado onClick={onConfirmar}>
            {destructivo}
          </BotonTexto>
        </div>
        <div style={{ borderTop: '1px solid var(--twin-hairline)' }}>
          <BotonTexto tono="tinta" centrado onClick={onCancelar}>
            Cancelar
          </BotonTexto>
        </div>
      </div>
    </div>
  );
}

// ── El menú de acciones de una carrera (⋯ y pulsación larga en iOS) ───────────

export type AccionCarrera = 'preguntar' | 'hacer-principal' | 'quitar';

function FilaAccion({ icono, children, onClick, peligro = false }: { icono: ReactNode; children: ReactNode; onClick: () => void; peligro?: boolean }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={onClick}
      style={{ minHeight: 56, padding: '0 22px', display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid var(--twin-hairline)', ...fuente(700, TAM.cuerpo, 1.2), color: peligro ? TINTA_PELIGRO : 'var(--twin-fg)' }}
    >
      <span style={{ display: 'inline-flex', width: 24, justifyContent: 'center' }}>{icono}</span>
      {children}
    </button>
  );
}

/**
 * Las acciones RARAS de una carrera. «Hacer objetivo principal» solo si no lo es
 * ya (no hay nada que promover); «Preguntar al coach» solo con coach; «Eliminar
 * carrera» es destructiva y pasa por su confirmación.
 */
export function MenuAcciones({
  carrera,
  principal,
  conCoach,
  onElige,
  onCerrar,
}: {
  carrera: ProximaCarrera;
  principal: boolean;
  conCoach: boolean;
  onElige: (a: AccionCarrera) => void;
  onCerrar: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocoAtrapado(panel, onCerrar, true);
  return (
    <div style={capa} className="cr-capa">
      <Velo onCerrar={onCerrar} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="cr-hoja"
        style={{
          position: 'relative',
          margin: `0 12px calc(var(--twin-safe-bottom) + 8px)`,
          borderRadius: RADIO.grande,
          background: 'var(--twin-surface-elevated)',
          border: '1px solid var(--twin-hairline-strong)',
          boxShadow: 'var(--twin-shadow-hero)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 22px 12px' }}>
          <h2 id={id} style={{ margin: 0, ...fuente(800, 20, 1.2, true), color: 'var(--twin-fg)' }}>
            {carrera.nombre}
          </h2>
        </div>
        {conCoach ? (
          <FilaAccion icono={<IcoChat tam={22} />} onClick={() => onElige('preguntar')}>
            Preguntar al coach
          </FilaAccion>
        ) : null}
        {principal ? null : (
          <FilaAccion icono={<IcoEstrella tam={22} />} onClick={() => onElige('hacer-principal')}>
            Hacer objetivo principal
          </FilaAccion>
        )}
        <FilaAccion icono={<IcoPapelera tam={22} />} onClick={() => onElige('quitar')} peligro>
          Eliminar carrera
        </FilaAccion>
        <div style={{ borderTop: '1px solid var(--twin-hairline)' }}>
          <BotonTexto tono="tinta" centrado onClick={onCerrar}>
            Cancelar
          </BotonTexto>
        </div>
      </div>
    </div>
  );
}
