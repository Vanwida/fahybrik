'use client';

// Las filas del round y la franja del pulso: lo que se toca por línea y lo que
// solo existe si hay reloj. Salen de `atoms.tsx` porque las usan las DOS caras
// y porque aquel fichero llegó al límite de 500 líneas que fija el proyecto.
//
// POR QUÉ PESAN MENOS QUE ANTES (§10.4). Hasta el 29-jul cada fila era una
// tarjeta maciza con borde de 1 px y superficie opaca, exactamente el mismo
// aspecto que la caja donde vivía el «5» de las rondas. Cinco cajas apiladas y
// el sujeto era una más de la lista. Ahora el sujeto ocupa la banda entera y la
// corona una regla de acento, y estas filas bajan a peso de apoyo: sin borde,
// superficie translúcida (el tinte de zona tiene que verse DEBAJO, o el
// ambiente se corta en una línea recta a media pantalla) y la tinta del acento
// reservada a la fila en curso. Siguen siendo tocables y siguen leyéndose de
// pie: lo que cambia es que ya no compiten por ser el sujeto.

import { IconCheckCircle, IconHeart, RAD } from '../../kit';
import { COLOR_MODALIDAD, UMBRAL } from '../../datos-reales';
import { hrZone } from '../../sim';
import { colorZona } from '../../kit-vivo';
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
        gap: 10,
        width: '100%',
        ...(crece ? { flex: '1 0 auto' } : null),
        padding: '10px 12px',
        borderRadius: RAD.m,
        border: 0,
        // Translúcida a propósito: el tinte de zona tiene que verse DEBAJO de
        // los apoyos, igual que en `Apoyo` de kit-vivo.
        background: actual
          ? 'color-mix(in srgb, var(--twin-accent) 14%, color-mix(in srgb, var(--twin-surface) 70%, transparent))'
          : 'color-mix(in srgb, var(--twin-surface) 62%, transparent)',
        boxShadow: actual ? 'inset 3px 0 0 var(--twin-accent)' : 'none',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background-color 200ms linear',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flex: '0 0 auto',
          marginLeft: actual ? 3 : 0,
          background: hecho ? 'transparent' : COLOR_MODALIDAD[movimiento.modalidad],
          border: hecho ? '1.5px solid var(--twin-faint)' : 'none',
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `italic ${actual ? 800 : 600} 17px/1.15 var(--twin-font-sans)`,
          color: hecho ? 'var(--twin-faint)' : actual ? 'var(--twin-fg)' : 'var(--twin-muted)',
          textDecoration: hecho ? 'line-through' : 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {lineaMovimiento(movimiento)}
      </span>
      {/* Lo que va marcando la máquina es TRABAJO, no servicio: va en la voz de
          instrumento y pesa más que el nombre del movimiento (§10.6, §4). */}
      {medida && (
        <span className="t-readout-s" style={{ color: 'var(--twin-accent-text)', flex: '0 0 auto' }}>
          {medida}
        </span>
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
        background: 'color-mix(in srgb, var(--twin-surface) 62%, transparent)',
        flex: '0 0 auto',
      }}
    >
      <span style={{ color: colorZona(zona), display: 'inline-flex' }}>
        <IconHeart size={13} />
      </span>
      {/* La cifra va del color de su zona — la misma que tiñe el lienzo detrás
          (§10.1). El chip `Z4` se queda porque nombra la zona; el color solo la
          insinúa. */}
      <span className="t-readout-s" style={{ color: colorZona(zona), transition: 'color 600ms linear' }}>
        {ppm}
      </span>
      <span className="t-readout-label" style={{ color: 'var(--twin-muted)', letterSpacing: '0.1em' }}>
        ppm
      </span>
      <span style={{ flex: 1 }} />
      <span className="tw-zone" data-zone={zona}>
        Z{zona}
      </span>
    </div>
  );
}
