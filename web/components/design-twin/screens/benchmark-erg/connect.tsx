'use client';

// «Conecta el remo» — espejo de ios/FAHYBRIK/Workout/ErgPreStartFlow.swift, que
// envuelve ios/FAHYBRIK/Devices/PM5/PM5LiveStreamView.swift (+ PM5ConnectGuide).
//
// Primero se conecta, se acepta TU máquina («USAR ESTE PM5») y sólo entonces
// empieza la pieza. En un BENCHMARK no existe el escape manual: el monitor mide
// la marca, sin él no hay nada que guardar.

import { useState } from 'react';
import { useTimeline } from '../../sim';
import { Card, CTA, Hairline, IconAntenna, IconChevron, IconClose, IconRower, Label, Mono, Spinner, RAD, SP } from './ui';
import { PM5 } from './data';

export interface ErgConnectProps {
  /** Se muestra pequeño sobre la pantalla de conexión: QUÉ vas a empezar. */
  sessionTitle: string;
  /** «el remo» | «el SkiErg» | «la bici» — la cabecera habla la máquina. */
  machineWord: string;
  /** Un benchmark NO ofrece «Empezar sin monitor». */
  isBenchmark: boolean;
  /** Cuánto tarda el escaneo en sacar el erg (ms). */
  escaneoMs: number;
  /** Metros que el monitor ya traía hechos (escenario del monitor sucio). */
  metrosEnMonitor?: number;
  onUsar: () => void;
  onCancel: () => void;
  onLog: (linea: string) => void;
}

type Estado = 'buscando' | 'listado' | 'conectando' | 'conectado';

export function ErgConnect({
  sessionTitle,
  machineWord,
  isBenchmark,
  escaneoMs,
  metrosEnMonitor = 0,
  onUsar,
  onCancel,
  onLog,
}: ErgConnectProps) {
  const [estado, setEstado] = useState<Estado>('buscando');

  useTimeline([
    {
      at: escaneoMs,
      run: () => {
        setEstado('listado');
        onLog('PM5 encontrado');
      },
    },
  ]);

  // El enlace BLE tarda un instante tras el toque: connecting → servicios → stream.
  useTimeline(
    [
      {
        at: 600,
        run: () => {
          setEstado('conectado');
          onLog(`Conectado a ${PM5.nombre}`);
        },
      },
    ],
    estado === 'conectando',
  );

  const conectado = estado === 'conectado';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Cabecera de ErgPreStartFlow */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `${SP.m}px ${SP.l}px 0`,
          flex: '0 0 auto',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'var(--twin-surface)',
            border: 0,
            color: 'var(--twin-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <IconClose size={16} />
        </button>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ font: 'italic 700 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
            Conecta {machineWord}
          </span>
          <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            {sessionTitle}
          </span>
        </div>
        <span style={{ width: 40, flex: '0 0 auto' }} />
      </div>

      {/* PM5LiveStreamView */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.l,
          padding: SP.l,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', flex: '0 0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ font: 'italic 700 20px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
              Concept2 PM5
            </span>
            <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              Conecta tu erg para potencia y SPM en directo
            </span>
          </div>
        </div>
        <Hairline />

        <div className="twin-scroll" style={{ flex: 1, minHeight: 0 }}>
          {conectado ? (
            <ConectadoBody metrosEnMonitor={metrosEnMonitor} />
          ) : (
            <BuscandoBody estado={estado} onTocarErg={() => { setEstado('conectando'); }} />
          )}
        </div>

        {conectado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s, flex: '0 0 auto' }}>
            <CTA title="USAR ESTE PM5" onClick={onUsar} />
            <button type="button" className="tw-btn-secondary" style={{ width: '100%' }} onClick={onCancel}>
              Desconectar
            </button>
          </div>
        )}

        {/* El escape honesto de una sesión normal. Un benchmark JAMÁS lo ofrece:
            una marca que la app no midió no existe. */}
        {!isBenchmark && (
          <button
            type="button"
            onClick={onUsar}
            style={{
              height: 40,
              border: 0,
              background: 'transparent',
              color: 'var(--twin-muted)',
              font: '500 13px/1.2 var(--twin-font-sans)',
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            Empezar sin monitor · lo apuntas tú
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuscandoBody({ estado, onTocarErg }: { estado: Estado; onTocarErg: () => void }) {
  const etiqueta = estado === 'conectando' ? 'Conectando…' : 'Buscando ergs cercanos…';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
        <span style={{ color: 'var(--twin-accent)', display: 'inline-flex' }}>
          <Spinner size={14} />
        </span>
        <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{etiqueta}</span>
      </div>

      {estado === 'buscando' ? (
        <>
          <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Asegúrate de que el PM5 está encendido y mostrando la pantalla principal.
          </span>
          <ConnectGuide />
        </>
      ) : (
        <>
          <ErgRow onClick={onTocarErg} />
          <CollapsedHelp />
        </>
      )}
    </div>
  );
}

/** Fila de erg descubierto: icono + «ID <serial>» + qué hacer. */
function ErgRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Erg ID ${PM5.serial}, toca para conectar`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        width: '100%',
        padding: SP.m,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: 0,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'var(--twin-surface-sunken)',
          color: 'var(--twin-accent-text)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: '0 0 auto',
        }}
      >
        <IconRower />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: '600 16px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>ID {PM5.serial}</span>
        <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          Toca para conectar
        </span>
      </span>
      <span style={{ flex: 1 }} />
      <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
        <IconChevron />
      </span>
    </button>
  );
}

function ConectadoBody({ metrosEnMonitor }: { metrosEnMonitor: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <Card padding={SP.m}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--twin-ok)' }} />
            <span style={{ font: '600 16px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{PM5.nombre}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <LivePill label="PWR" value="—" />
            <LivePill label="SPM" value="—" />
            <LivePill label="DIST" value={metrosEnMonitor > 0 ? `${metrosEnMonitor} m` : '—'} />
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
        <Label>Cambiar de erg</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s }}>
          <span style={{ color: 'var(--twin-accent)', display: 'inline-flex' }}>
            <Spinner size={14} />
          </span>
          <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
            Buscando otros ergs cercanos…
          </span>
        </div>
      </div>

      <CollapsedHelp />
    </div>
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
        borderRadius: RAD.s,
        background: 'var(--twin-surface)',
      }}
    >
      <Label size={9}>{label}</Label>
      <span
        style={{
          font: 'italic 800 14px/1 var(--twin-font-sans)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--twin-fg)',
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PM5ConnectGuide — el menú del monitor DIBUJADO, con «Connect» señalado
// ---------------------------------------------------------------------------

const MENU_PM5 = ['Just Row', 'Select Workout', 'Connect', 'Memory', 'More Options'] as const;
const MENU_DIANA = 'Connect';

function ConnectGuide() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.m }}>
      <div
        style={{
          width: 232,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          borderRadius: 14,
          background: 'var(--twin-surface-sunken)',
          border: '1px solid var(--twin-hairline-strong)',
        }}
      >
        <span style={{ font: '600 9px/1.2 var(--twin-font-mono)', color: 'var(--twin-muted)', textAlign: 'center' }}>
          Main Menu
        </span>
        {MENU_PM5.map((fila) => {
          const diana = fila === MENU_DIANA;
          return (
            <div
              key={fila}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 24,
                padding: '0 10px',
                borderRadius: 7,
                background: diana ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'transparent',
                border: `${diana ? 1.5 : 1}px solid ${diana ? 'var(--twin-accent)' : 'var(--twin-hairline)'}`,
              }}
            >
              {diana && <span style={{ color: 'var(--twin-accent)', font: '800 9px/1 var(--twin-font-sans)' }}>▶</span>}
              <Mono size={11} weight={diana ? 800 : 500} color={diana ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}>
                {fila}
              </Mono>
            </div>
          );
        })}
      </div>
      <span style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        En el PM5, pulsa «Connect» para hacerlo visible. Luego toca tu erg en la lista (el número es el ID que sale en
        el monitor).
      </span>
    </div>
  );
}

/** La guía plegada — ayuda persistente que nunca desaparece a mitad de flujo. */
function CollapsedHelp() {
  const [abierta, setAbierta] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          color: 'var(--twin-muted)',
        }}
      >
        <span style={{ font: '800 10px/1.2 var(--twin-font-sans)', letterSpacing: '0.08em' }}>CÓMO CONECTAR</span>
        <span style={{ display: 'inline-flex', transform: abierta ? 'rotate(90deg)' : undefined }}>
          <IconChevron size={12} />
        </span>
      </button>
      {abierta && <ConnectGuide />}
    </div>
  );
}

/** Chip de estado del enlace para el HUD (ConnectionStrip). */
export function PM5Chip({ conectado, onClick }: { conectado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={conectado ? 'Remo PM5 conectado' : 'Conectar remo PM5'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 8px',
        borderRadius: RAD.s,
        cursor: 'pointer',
        color: conectado ? 'var(--twin-accent-text)' : 'var(--twin-muted)',
        background: conectado ? 'color-mix(in srgb, var(--twin-accent) 14%, transparent)' : 'var(--twin-surface)',
        border: `1px solid ${conectado ? 'color-mix(in srgb, var(--twin-accent-text) 50%, transparent)' : 'var(--twin-outline)'}`,
      }}
    >
      <IconAntenna size={9} />
      <span style={{ font: 'italic 800 9px/1 var(--twin-font-sans)', letterSpacing: '0.07em' }}>
        {conectado ? 'PM5' : 'CONECTA PM5'}
      </span>
    </button>
  );
}
