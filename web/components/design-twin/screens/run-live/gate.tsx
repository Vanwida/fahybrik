'use client';

// BlockPreviewGate — la puerta que abre CADA bloque: el atleta ve lo que viene,
// se coloca, y toca EMPEZAR cuando está listo. El reloj del bloque no corre
// hasta ese toque.
// Espejo de ios/FAHYBRIK/Workout/BlockPreviewGate.swift

import { BLOQUE } from './data';
import { BotonPrimario, BotonRedondo, Etiqueta, Linea } from './atoms';

export function PuertaBloque({
  horizontal,
  onEmpezar,
  onSalir,
  onAtras,
  onLog,
}: {
  horizontal: boolean;
  onEmpezar: () => void;
  onSalir: () => void;
  onAtras: () => void;
  onLog: (linea: string) => void;
}) {
  return (
    <div
      className="twin-screen-safe"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: horizontal ? 520 : undefined,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '16px 24px',
        }}
      >
        {/* Fila superior: salir (nunca atrapado) + bloque anterior + posición */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BotonRedondo icono="xmark" onClick={onSalir} etiqueta="Salir del entreno" borde />
          <BotonRedondo
            icono="list-bullet"
            onClick={() => onLog('Ver el entreno entero')}
            etiqueta="Ver el entreno entero"
            borde
          />
          <BotonRedondo icono="chevron-left" onClick={onAtras} etiqueta="Bloque anterior" color="var(--twin-fg)" borde />
          <span
            style={{
              font: 'italic 800 11px/1 var(--twin-font-sans)',
              letterSpacing: '0.07em',
              color: 'var(--twin-muted)',
            }}
          >
            BLOQUE {BLOQUE.numero} DE {BLOQUE.total}
          </span>
        </div>

        {/* Cabecera: fase + título del bloque */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              font: 'italic 800 11px/1 var(--twin-font-sans)',
              letterSpacing: '0.09em',
              color: 'var(--twin-accent-text)',
            }}
          >
            {BLOQUE.fase}
          </span>
          <span style={{ font: 'italic 800 30px/1.05 var(--twin-font-sans)', letterSpacing: '-0.013em', color: 'var(--twin-fg)' }}>
            {BLOQUE.titulo}
          </span>
        </div>

        <div>
          <span
            style={{
              display: 'inline-block',
              font: '800 13px/1 var(--twin-font-mono)',
              color: 'var(--twin-accent-text)',
              background: 'color-mix(in srgb, var(--twin-accent-text) 12%, transparent)',
              padding: '6px 10px',
              borderRadius: 6,
            }}
          >
            {BLOQUE.formato}
          </span>
        </div>

        {/* Lo que viene */}
        <div className="twin-scroll" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Etiqueta texto="Lo que viene" />
          <div
            style={{
              position: 'relative',
              borderRadius: 14,
              overflow: 'hidden',
              background: 'linear-gradient(180deg, var(--twin-surface), color-mix(in srgb, var(--twin-surface) 92%, transparent))',
              border: '1px solid var(--twin-hairline)',
              borderTopColor: 'var(--twin-hairline-strong)',
              boxShadow: 'var(--twin-shadow-card)',
            }}
          >
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--twin-accent)' }} />
            {BLOQUE.filas.map((fila, i) => (
              <div key={fila.nombre}>
                {i > 0 && <Linea />}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '12px 14px' }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      flex: '0 0 auto',
                      borderRadius: 9999,
                      background: 'color-mix(in srgb, var(--twin-accent) 70%, transparent)',
                      transform: 'translateY(-3px)',
                    }}
                  />
                  <span style={{ font: '600 15px/1.3 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{fila.nombre}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ font: '500 13px/1.3 var(--twin-font-mono)', color: 'var(--twin-muted)', textAlign: 'right' }}>
                    {fila.trabajo}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* La puerta */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <span style={{ font: '400 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
            Empieza cuando estés listo
          </span>
          <BotonPrimario titulo="EMPEZAR" height={64} onClick={onEmpezar} />
        </div>
      </div>
    </div>
  );
}
