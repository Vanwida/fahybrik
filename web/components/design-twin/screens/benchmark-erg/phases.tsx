'use client';

// Fases previas al HUD: el detalle de la marca y la puerta del bloque.
// Espejo de ios/FAHYBRIK/Marks/MarkDetailView.swift y
// ios/FAHYBRIK/Workout/BlockPreviewGate.swift.

import { Card, CTA, Display, Hairline, IconChevron, IconClose, Label, Mono, RoundButton, RAD, SP } from './ui';
import { HISTORIAL, MARCA, fmtDeltaMarca, fmtMarca } from './data';

// ---------------------------------------------------------------------------
// 1 · Detalle de marca
// ---------------------------------------------------------------------------

export function MarkDetail({ onProbarme }: { onProbarme: () => void }) {
  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar title={MARCA.label} />
      <div
        className="twin-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.l,
          padding: `${SP.l}px ${SP.l}px 120px`,
        }}
      >
        <HeroMarca />
        <HistorialCard />
      </div>
      {/* La única acción, clavada donde vive el pulgar. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: SP.l }}>
        <CTA title="Probarme ahora" onClick={onProbarme} />
      </div>
    </div>
  );
}

/** Barra de navegación en línea (navigationBarTitleDisplayMode(.inline)). */
function NavBar({ title }: { title: string }) {
  return (
    <div
      style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${SP.s}px`,
        flex: '0 0 auto',
      }}
    >
      <span style={{ color: 'var(--twin-accent-text)', display: 'inline-flex', width: 44 }}>
        <IconChevron dir="left" size={17} />
      </span>
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          font: '600 17px/1.2 var(--twin-font-sans)',
          color: 'var(--twin-fg)',
        }}
      >
        {title}
      </span>
      <span style={{ width: 44 }} />
    </div>
  );
}

function HeroMarca() {
  return (
    <Card padding={18}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Label>Tu mejor marca</Label>
        <span className="t-readout-l" style={{ color: 'var(--twin-fg)' }}>
          {fmtMarca(MARCA.prSegundos)}
        </span>
        <div style={{ display: 'flex', gap: 6, font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          <span>{fmtMarca(MARCA.prSegundos)}/500</span>
          <span>·</span>
          <span>{MARCA.prRelativo}</span>
        </div>
      </div>
    </Card>
  );
}

function HistorialCard() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Label>Historial</Label>
      <Card padding={0}>
        {HISTORIAL.map((fila, i) => {
          const previo = HISTORIAL[i + 1];
          const delta = previo ? fmtDeltaMarca(previo.segundos, fila.segundos) : null;
          return (
            <div key={fila.relativo}>
              {i > 0 && <Hairline style={{ marginLeft: 14 }} />}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ font: '500 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                    {fila.relativo}
                  </span>
                  <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
                    {fila.tag}
                  </span>
                </div>
                <span style={{ flex: 1 }} />
                {delta && (
                  <span
                    style={{
                      font: '500 12px/1.3 var(--twin-font-sans)',
                      color: delta.mejora ? 'var(--twin-ok)' : 'var(--twin-danger)',
                    }}
                  >
                    {delta.label}
                  </span>
                )}
                <Mono size={14} weight={700}>
                  {fmtMarca(fila.segundos)}
                </Mono>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Puerta del bloque — «Empieza cuando estés listo»
// ---------------------------------------------------------------------------

export interface BlockGateProps {
  /** region.title — para un benchmark, el bloque ES el objetivo. */
  titulo: string;
  /** phaseTag sobre el título (nil cuando el título ya ES la fase). */
  fase: string | null;
  /** Línea de formato del bloque (blockFormatLabel). */
  formato: string | null;
  /** Las filas de «Lo que viene»: movimiento + su trabajo. */
  trabajo: readonly { nombre: string; linea: string | null }[];
  onEmpezar: () => void;
  onSalir: () => void;
}

export function BlockGate({ titulo, fase, formato, trabajo, onEmpezar, onSalir }: BlockGateProps) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: SP.l,
        padding: `${SP.l}px ${SP.xl}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SP.m, flex: '0 0 auto' }}>
        <RoundButton onClick={onSalir} label="Salir del entreno">
          <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
            <IconClose />
          </span>
        </RoundButton>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
        {fase && (
          <span
            style={{
              font: 'italic 800 11px/1.1 var(--twin-font-sans)',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--twin-accent-text)',
            }}
          >
            {fase}
          </span>
        )}
        <Display size={30} tracking="-0.013em">
          {titulo}
        </Display>
      </div>

      {formato && (
        <div style={{ flex: '0 0 auto' }}>
          <span
            style={{
              display: 'inline-block',
              font: '800 13px/1.2 var(--twin-font-mono)',
              color: 'var(--twin-accent-text)',
              padding: '6px 10px',
              borderRadius: RAD.s,
              background: 'color-mix(in srgb, var(--twin-accent-text) 12%, transparent)',
            }}
          >
            {formato}
          </span>
        </div>
      )}

      <div className="twin-scroll" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
          <Label>Lo que viene</Label>
          <Card padding={0} leftAccent>
            {trabajo.map((fila, i) => (
              <div key={fila.nombre}>
                {i > 0 && <Hairline />}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 14px' }}>
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--twin-accent)',
                      opacity: 0.7,
                      flex: '0 0 auto',
                      alignSelf: 'center',
                    }}
                  />
                  <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
                    {fila.nombre}
                  </span>
                  <span style={{ flex: 1 }} />
                  {fila.linea && (
                    <Mono size={13} color="var(--twin-muted)" style={{ textAlign: 'right' }}>
                      {fila.linea}
                    </Mono>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s, flex: '0 0 auto' }}>
        <span
          style={{
            font: '500 12px/1.3 var(--twin-font-sans)',
            color: 'var(--twin-faint)',
            textAlign: 'center',
          }}
        >
          Empieza cuando estés listo
        </span>
        <CTA title="EMPEZAR" onClick={onEmpezar} height={64} />
      </div>
    </div>
  );
}
