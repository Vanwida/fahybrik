'use client';

// Los átomos de la familia AMRAP. Solo tokens: ni un hex, ni un tamaño fuera
// de la escala de twin.css (la voz `readout` va en 22/34/48/72, y el número de
// la ronda en 144 = dos veces `t-readout-hero`, que es lo que pide `gobierna`
// cuando el sujeto tiene que leerse con el móvil en el suelo).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IconCheckCircle, IconClose, IconHeart, Label, Mono, RAD } from '../../kit';
import { COLOR_MODALIDAD, UMBRAL } from '../../datos-reales';
import { hrZone } from '../../sim';
import { lineaMovimiento, type MovimientoAmrap } from './data';

// ---------------------------------------------------------------------------
// La confirmación gorda — «la pantalla late» al sumar una ronda
// ---------------------------------------------------------------------------

/**
 * Verdadero a partir del primer fotograma pintado. Sirve para arrancar un
 * elemento en su estado tenso y dejar que la transición lo relaje: dos
 * `requestAnimationFrame` porque un `useEffect` disparado por un toque se
 * ejecuta ANTES de que el navegador pinte, y entonces no habría transición
 * ninguna (los dos estilos caerían en el mismo fotograma).
 *
 * Quien lo usa se remonta con `key`, así cada ronda vuelve a tensar.
 */
function useTrasPintar(): boolean {
  const [pintado, setPintado] = useState(false);
  useEffect(() => {
    let interno = 0;
    const externo = requestAnimationFrame(() => {
      interno = requestAnimationFrame(() => setPintado(true));
    });
    return () => {
      cancelAnimationFrame(externo);
      cancelAnimationFrame(interno);
    };
  }, []);
  return pintado;
}

/** El latido: un golpe de luz naranja sobre TODO el lienzo. Se ve de reojo. */
export function Destello() {
  const ido = useTrasPintar();
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: RAD.xl,
        background:
          'radial-gradient(120% 70% at 50% 50%, color-mix(in srgb, var(--twin-accent) 38%, transparent), transparent 72%)',
        opacity: ido ? 0 : 1,
        transition: 'opacity 560ms ease-out',
      }}
    />
  );
}

/** El golpe del número: entra grande y se asienta. Remonta con `key`. */
export function Golpe({ children }: { children: ReactNode }) {
  const asentado = useTrasPintar();
  return (
    <span
      style={{
        display: 'inline-block',
        transform: asentado ? 'scale(1)' : 'scale(1.16)',
        transition: 'transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cromo — salir se mantiene pulsado, pausar es un toque
// ---------------------------------------------------------------------------

/**
 * Salir de un AMRAP a mitad borra el marcador, y el botón vive a un palmo de
 * una zona de toque enorme que se aporrea con la mano sudada. Así que no se
 * toca: se mantiene. El relleno naranja crece durante la pulsación y es la
 * única confirmación que hace falta.
 */
function BotonMantener({
  label,
  onCompletar,
  ms = 700,
  children,
}: {
  label: string;
  onCompletar: () => void;
  ms?: number;
  children: ReactNode;
}) {
  const [pulsando, setPulsando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const soltar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setPulsando(false);
  }, []);

  useEffect(() => soltar, [soltar]);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => {
        setPulsando(true);
        temporizador.current = setTimeout(() => {
          soltar();
          onCompletar();
        }, ms);
      }}
      onPointerUp={soltar}
      onPointerLeave={soltar}
      onPointerCancel={soltar}
      // Con teclado sale directo: lo que se defiende es el roce del dedo
      // sudado contra el borde, no la pulsación deliberada de una tecla.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onCompletar();
      }}
      style={{
        position: 'relative',
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
        color: pulsando ? 'var(--twin-accent-on)' : 'var(--twin-muted)',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        flex: '0 0 auto',
        transition: 'color 200ms linear',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--twin-accent)',
          transform: pulsando ? 'scale(1)' : 'scale(0)',
          transition: `transform ${pulsando ? ms : 160}ms linear`,
        }}
      />
      <span style={{ position: 'relative', display: 'inline-flex' }}>{children}</span>
    </button>
  );
}

export function TopCromo({
  pausado,
  ventanaTotal,
  onPausa,
  onSalir,
}: {
  pausado: boolean;
  /** La ventana entera, no la que queda: es la prescripción, no el estado. */
  ventanaTotal: string;
  onPausa: () => void;
  onSalir: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
      <BotonMantener label="Mantén pulsado para salir del entreno" onCompletar={onSalir}>
        <IconClose size={13} />
      </BotonMantener>
      <button
        type="button"
        aria-label={pausado ? 'Seguir el entreno' : 'Pausar el entreno'}
        onClick={onPausa}
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          color: 'var(--twin-muted)',
          cursor: 'pointer',
          padding: 0,
          flex: '0 0 auto',
          font: '700 15px/1 var(--twin-font-sans)',
        }}
      >
        {pausado ? '▶' : '‖'}
      </button>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span
          style={{
            font: 'italic 800 9px/1.1 var(--twin-font-sans)',
            letterSpacing: '0.08em',
            color: 'var(--twin-accent-text)',
          }}
        >
          AMRAP
        </span>
        {/* «AMRAP 12:00» es el lead canónico de la prescripción
            (shared/domain/prescription/to-text.ts): el formato y su ventana. */}
        <Mono size={11} color="var(--twin-muted)">
          {ventanaTotal}
        </Mono>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La ventana, en número
// ---------------------------------------------------------------------------

/**
 * El aro ya dice cuánto queda de un vistazo; esto es para cuando quieres el
 * dato exacto. Crece y se vuelve naranja según aprieta — de 34 (readout-m) a
 * 48 en el último minuto y a 72 (readout-hero) en los diez últimos segundos,
 * siempre por debajo del número de la ronda, que es quien manda.
 */
export function VentanaReadout({
  texto,
  tamano,
  caliente,
  aliento,
}: {
  texto: string;
  tamano: number;
  caliente: boolean;
  aliento: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: '0 0 auto' }}>
      <Label size={10} color={caliente ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}>
        Quedan
      </Label>
      <Mono
        size={tamano}
        weight={800}
        color={caliente ? 'var(--twin-accent-text)' : 'var(--twin-fg)'}
        style={{ lineHeight: 1, transition: 'font-size 500ms ease-out, color 500ms linear' }}
      >
        {texto}
      </Mono>
      {aliento && (
        <span style={{ font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-accent-text)' }}>
          {aliento}
        </span>
      )}
    </div>
  );
}

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
  onMarcar,
}: {
  movimiento: MovimientoAmrap;
  estado: EstadoMovimiento;
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
