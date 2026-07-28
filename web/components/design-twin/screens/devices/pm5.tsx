'use client';

// El remo: la subpágina de Perfil (PM5SettingsView) y la hoja de emparejamiento
// (PM5LiveStreamView) con su guía ilustrada (PM5ConnectGuide).
//
// REGLA que gobierna toda esta pantalla: BUSCAR, NUNCA CONECTAR. Abrir la hoja
// escanea y ya está. El erg recordado sale el primero y marcado; el enlace solo
// lo abre el dedo del atleta — los ergs rotan (hoy remo, mañana ski, y el de
// ayer ya es de otro).

import type { ReactNode } from 'react';
import { Glyph } from './glyphs';
import { Card, Hairline, LabelText, NavBar, PrimaryButton, SecondaryButton, Spinner } from './atoms';
import { R, SP } from './tokens';

/** Los estados de PM5ConnectionState que esta pantalla sabe nombrar. */
export type PM5Estado = 'idle' | 'scanning' | 'connecting' | 'discovering' | 'streaming';

export interface ErgDescubierto {
  id: string;
  nombre: string;
}

/**
 * El PM5 anuncia «PM5 <serie>». La tirada de dígitos más larga ES el ID que sale
 * en la pantalla del monitor, que es como se distinguen los ergs de una sala.
 */
export function pm5Serial(nombre: string): string | null {
  const runs = nombre.split(/\D+/).filter(Boolean);
  const best = runs.reduce<string>((a, b) => (b.length > a.length ? b : a), '');
  return best.length >= 4 ? best : null;
}

function filaSubtitulo(nombre: string): string {
  const serial = pm5Serial(nombre);
  if (!serial) return 'Toca para conectar';
  // Lo que el nombre diga más allá de «PM5 <serie>» (Row / Ski) sí distingue
  // máquinas; un «PM5 <serie>» pelado no añade nada.
  const resto = nombre.replace(serial, '').replace(/pm5/gi, '').replace(/[^a-zA-Z0-9]+/g, '');
  return resto === '' ? 'Toca para conectar' : `Toca para conectar · ${nombre}`;
}

// ---------------------------------------------------------------------------
// Subpágina de Perfil
// ---------------------------------------------------------------------------

export interface PM5SettingsProps {
  recordado: string | null;
  conectado: boolean;
  onBack: () => void;
  onOlvidar: () => void;
  onBuscar: () => void;
}

export function PM5Settings({ recordado, conectado, onBack, onOlvidar, onBuscar }: PM5SettingsProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <NavBar onBack={onBack} />
      <div
        className="twin-scroll"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SP.l, padding: SP.l }}
      >
        <div className="t-headline-m">Concept2 PM5</div>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
            <LabelText text={recordado ? 'Dispositivo emparejado' : 'Sin dispositivo emparejado'} />
            <div className="t-body-emph">{recordado ?? '—'}</div>
            {conectado && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Dot />
                <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
                  Streaming en directo
                </span>
              </div>
            )}
          </div>
        </Card>
        {recordado != null && <SecondaryButton title="Olvidar este PM5" onClick={onOlvidar} />}
        <PrimaryButton title="Buscar y emparejar" onClick={onBuscar} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hoja de emparejamiento
// ---------------------------------------------------------------------------

export interface PM5ScannerProps {
  estado: PM5Estado;
  descubiertos: ReadonlyArray<ErgDescubierto>;
  recordadoId: string | null;
  recordadoNombre: string | null;
  conectadoNombre: string | null;
  onCerrar: () => void;
  onElegir: (erg: ErgDescubierto) => void;
  onUsar: () => void;
  onDesconectar: () => void;
  onOlvidar: () => void;
}

export function PM5Scanner(props: PM5ScannerProps) {
  const conectado = props.estado === 'streaming';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: SP.l, gap: SP.l }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: SP.m }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <div className="t-headline-s">Concept2 PM5</div>
          <div className="t-small" style={{ color: 'var(--twin-muted)' }}>
            Conecta tu erg para potencia y SPM en directo
          </div>
        </div>
        <button
          type="button"
          onClick={props.onCerrar}
          aria-label="Cerrar"
          style={{ all: 'unset', cursor: 'pointer', width: 28, height: 28, display: 'grid', placeItems: 'center' }}
        >
          <Glyph name="xmark" size={15} color="var(--twin-muted)" weight={2.2} />
        </button>
      </header>
      <Hairline />

      <div className="twin-scroll" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SP.m }}>
        {conectado ? (
          <>
            <ConectadoCard nombre={props.conectadoNombre} />
            <CambiarDeErg {...props} />
            <ComoConectarPlegado />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
              <Spinner size={16} color="var(--twin-accent)" />
              <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
                {etiquetaEstado(props.estado)}
              </span>
            </div>
            {props.descubiertos.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
                <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
                  Asegúrate de que el PM5 está encendido y mostrando la pantalla principal.
                </span>
                <PM5ConnectGuide />
                {props.recordadoNombre && (
                  <span className="t-caption" style={{ color: 'var(--twin-muted)' }}>
                    Último usado: {props.recordadoNombre} — tócalo en la lista cuando aparezca.
                  </span>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
                  {props.descubiertos.map((erg) => (
                    <ErgRow
                      key={erg.id}
                      erg={erg}
                      recordado={erg.id === props.recordadoId}
                      onTap={() => props.onElegir(erg)}
                    />
                  ))}
                </div>
                <ComoConectarPlegado />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
        {conectado ? (
          <>
            <PrimaryButton title="USAR ESTE PM5" onClick={props.onUsar} />
            <SecondaryButton title="Desconectar" onClick={props.onDesconectar} />
          </>
        ) : (
          props.recordadoId != null && <SecondaryButton title="Olvidar dispositivo" onClick={props.onOlvidar} />
        )}
      </div>
    </div>
  );
}

function etiquetaEstado(estado: PM5Estado): string {
  switch (estado) {
    case 'connecting':
      return 'Conectando…';
    case 'discovering':
      return 'Descubriendo servicios…';
    case 'scanning':
      return 'Buscando ergs cercanos…';
    case 'streaming':
      return 'Conectado';
    case 'idle':
      return 'Listo para buscar';
  }
}

function Dot() {
  return <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--twin-ok)', flex: 'none' }} />;
}

/** Fila estilo ErgData: icono, «ID <serie>» y una línea de acción en castellano. */
function ErgRow({ erg, recordado, onTap }: { erg: ErgDescubierto; recordado: boolean; onTap: () => void }) {
  const serial = pm5Serial(erg.nombre);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`Erg ${serial ? `ID ${serial}` : erg.nombre}, toca para conectar`}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: SP.m,
        background: 'var(--twin-surface)',
        borderRadius: R.m,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 9999,
          background: 'var(--twin-surface-sunken)',
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
          color: 'var(--twin-accent-text)',
        }}
      >
        <Glyph name="figure.rower" size={16} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="t-body-emph">{serial ? `ID ${serial}` : erg.nombre}</span>
          {/* Una ETIQUETA, nunca una acción: ordena arriba y lo dice. */}
          {recordado && (
            <span
              style={{
                font: 'italic 800 8px/1 var(--twin-font-sans)',
                letterSpacing: 0.6,
                color: 'var(--twin-accent-text)',
              }}
            >
              ÚLTIMO USADO
            </span>
          )}
        </span>
        <span className="t-caption" style={{ color: 'var(--twin-muted)' }}>
          {filaSubtitulo(erg.nombre)}
        </span>
      </span>
      <Glyph name="chevron.right" size={13} color="var(--twin-muted)" weight={2.4} />
    </button>
  );
}

function ConectadoCard({ nombre }: { nombre: string | null }) {
  return (
    <Card padding={SP.m}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
          <Dot />
          <span className="t-body-emph">{nombre ?? 'PM5'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {/* Aún no ha dado una palada: el monitor no ha mandado ni un dato. */}
          <LivePill label="PWR" value="—" />
          <LivePill label="SPM" value="—" />
          <LivePill label="DIST" value="—" />
        </div>
      </div>
    </Card>
  );
}

function LivePill({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 0',
        background: 'var(--twin-surface)',
        borderRadius: R.s,
      }}
    >
      <span
        style={{
          font: '600 9px/1 var(--twin-font-sans)',
          letterSpacing: 1.76,
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
        }}
      >
        {label}
      </span>
      <span style={{ font: 'italic 800 14px/1 var(--twin-font-sans)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Los OTROS PM5 de la sala mientras uno está conectado: un toque cambia de erg. */
function CambiarDeErg({ descubiertos, conectadoNombre, onElegir }: PM5ScannerProps) {
  const otros = descubiertos.filter((e) => e.nombre !== conectadoNombre);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <LabelText text="Cambiar de erg" />
      {otros.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
          <Spinner size={16} color="var(--twin-accent)" />
          <span className="t-small" style={{ color: 'var(--twin-muted)' }}>
            Buscando otros ergs cercanos…
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
          {otros.map((erg) => (
            <ErgRow key={erg.id} erg={erg} recordado={false} onTap={() => onElegir(erg)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** La guía ilustrada, plegada — la forma persistente: nunca desaparece. */
function ComoConectarPlegado() {
  return (
    <details>
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          font: '800 10px/1.6 var(--twin-font-sans)',
          letterSpacing: 0.8,
          color: 'var(--twin-muted)',
        }}
      >
        CÓMO CONECTAR
      </summary>
      <div style={{ paddingTop: SP.s }}>
        <PM5ConnectGuide />
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// PM5ConnectGuide — el menú del monitor DIBUJADO, con la flecha en «Connect»
// ---------------------------------------------------------------------------

const MENU_ROWS = ['Just Row', 'Select Workout', 'Connect', 'Memory', 'More Options'] as const;
const MENU_TARGET = 'Connect';

export function PM5ConnectGuide() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m, width: '100%' }}>
      <PM5MenuIllustration />
      <span className="t-small" style={{ color: 'var(--twin-muted)', width: '100%' }}>
        En el PM5, pulsa «Connect» para hacerlo visible. Luego toca tu erg en la lista (el número es el ID que sale en el
        monitor).
      </span>
    </div>
  );
}

function PM5MenuIllustration() {
  return (
    <div
      role="img"
      aria-label="Menú principal del PM5 con la opción Connect señalada"
      style={{
        width: 232,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        background: 'var(--twin-surface-sunken)',
        border: '1px solid var(--twin-hairline-strong)',
        borderRadius: R.l,
      }}
    >
      <span
        style={{
          font: '600 9px/1.2 var(--twin-font-mono)',
          color: 'var(--twin-muted)',
          textAlign: 'center',
        }}
      >
        Main Menu
      </span>
      {MENU_ROWS.map((row) => (
        <MenuRow key={row} title={row} target={row === MENU_TARGET} />
      ))}
    </div>
  );
}

function MenuRow({ title, target }: { title: string; target: boolean }): ReactNode {
  return (
    <div
      style={{
        height: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 10px',
        borderRadius: 7,
        background: target ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'transparent',
        border: target ? '1.5px solid var(--twin-accent)' : '1px solid var(--twin-hairline)',
      }}
    >
      {target && <Glyph name="arrowtriangle.right.fill" size={10} color="var(--twin-accent)" />}
      <span
        style={{
          font: `${target ? 800 : 500} 11px/1 var(--twin-font-mono)`,
          color: target ? 'var(--twin-accent-text)' : 'color-mix(in srgb, var(--twin-fg) 75%, transparent)',
        }}
      >
        {title}
      </span>
    </div>
  );
}
