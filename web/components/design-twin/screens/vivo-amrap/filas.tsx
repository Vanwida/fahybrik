'use client';

// Las filas del round y la franja del pulso: lo que se toca por línea y lo que
// solo existe si hay reloj. Salen de `atoms.tsx` porque las usan las DOS caras
// y porque aquel fichero llegó al límite de 500 líneas que fija el proyecto.

import { IconCheckCircle, IconHeart, Label, Mono, RAD } from '../../kit';
import { COLOR_MODALIDAD, UMBRAL } from '../../datos-reales';
import { hrZone } from '../../sim';
import { lineaMovimiento, type MovimientoAmrap } from './data';

// ---------------------------------------------------------------------------
// La lista de movimientos — el toque pequeño, por línea
// ---------------------------------------------------------------------------

export type EstadoMovimiento = 'hecho' | 'actual' | 'pendiente';

/**
 * Una línea del round. El toque es opcional a propósito: quien no marque nada
 * cierra rondas enteras y su marcador acaba en rondas redondas; quien marque,
 * se lleva la parcial exacta cuando la ventana lo corte. Lo que no puede pasar
 * es que la app rellene la parcial sola (§7).
 */
export function FilaMovimiento({
  movimiento,
  estado,
  medida,
  crece = false,
  onMarcar,
}: {
  movimiento: MovimientoAmrap;
  estado: EstadoMovimiento;
  /**
   * Lo que va marcando la máquina en este tramo («5 / 10 cal»). Solo llega
   * cuando hay monitor conectado; sin él la fila no insinúa ningún avance.
   */
  medida?: string | null;
  /** Se reparte el alto que sobra en vez de dejar cola debajo (§6.1). */
  crece?: boolean;
  onMarcar: () => void;
}) {
  const hecho = estado === 'hecho';
  const actual = estado === 'actual';
  return (
    <button
      type="button"
      onClick={onMarcar}
      aria-label={`Marcar ${lineaMovimiento(movimiento)}`}
      aria-pressed={hecho}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        ...(crece ? { flex: '1 0 auto' } : null),
        padding: '13px 14px',
        borderRadius: RAD.m,
        border: `1px solid ${actual ? 'color-mix(in srgb, var(--twin-accent) 45%, transparent)' : 'var(--twin-hairline)'}`,
        background: actual ? 'color-mix(in srgb, var(--twin-accent) 10%, var(--twin-surface))' : 'var(--twin-surface)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background-color 200ms linear, border-color 200ms linear',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          flex: '0 0 auto',
          background: hecho ? 'transparent' : COLOR_MODALIDAD[movimiento.modalidad],
          border: hecho ? '1.5px solid var(--twin-faint)' : 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `italic ${actual ? 800 : 700} 20px/1.15 var(--twin-font-sans)`,
          color: hecho ? 'var(--twin-faint)' : 'var(--twin-fg)',
          textDecoration: hecho ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lineaMovimiento(movimiento)}
      </span>
      {medida && (
        <Mono size={15} weight={700} color="var(--twin-accent-text)">
          {medida}
        </Mono>
      )}
      {hecho && (
        <span style={{ color: 'var(--twin-ok)', display: 'inline-flex', flex: '0 0 auto' }}>
          <IconCheckCircle size={16} />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// La franja del pulso — existe solo si hay reloj
// ---------------------------------------------------------------------------

/**
 * Pulso y zona. `ppm` nulo = no hay reloj emparejado y la franja NO se pinta:
 * ni un guion ni una barra vacía insinuando que algo se está midiendo (§7).
 * La zona sale del umbral, que hoy en toda la base es estimado — por eso el
 * sellado lo dice con todas las letras y aquí, en vivo, solo se pinta la banda.
 */
export function FranjaPulso({ ppm }: { ppm: number | null }) {
  if (ppm === null) return null;
  const zona = hrZone(ppm, UMBRAL.ppm);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        flex: '0 0 auto',
      }}
    >
      <span style={{ color: `var(--twin-z${zona})`, display: 'inline-flex' }}>
        <IconHeart size={13} />
      </span>
      <Mono size={22} weight={800}>
        {ppm}
      </Mono>
      <Label size={10}>ppm</Label>
      <span style={{ flex: 1 }} />
      <span className="tw-zone" data-zone={zona}>
        Z{zona}
      </span>
    </div>
  );
}
