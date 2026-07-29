'use client';

// Las piezas de la pantalla del plan. Viven aparte de la composición porque
// son las que llevan el movimiento (el carril que sube, los sellos que caen,
// la rampa que se dibuja) y eso ensucia la lectura del layout.
//
// Ninguna inventa un color ni un tamaño: todo sale de los tokens --twin-* y de
// COLOR_MODALIDAD, así el claro y el oscuro salen gratis.

import type { CSSProperties, ReactNode } from 'react';
import { COLOR_MODALIDAD, type Modalidad } from '../../datos-reales';
import { Label, Mono, PuntoModalidad, RAD, SP, entradaStyle } from '../../kit';
import type { ClaveDosis, DiaPlan, EstadoDia, SemanaPlan } from './data';
import { estadoDia } from './data';

// `entradaStyle` y `PuntoModalidad` nacieron aquí y ahora viven en el kit
// compartido (§0): la familia del plan los necesitaba y una copia habría sido
// la duplicación número quince. Se re-exportan para no romper a quien los
// importaba desde este fichero.
export { PuntoModalidad, entradaStyle };

/** El sello de hecha: disco lleno del color de la modalidad con su check. */
function Sello({ modalidad, visible, delayMs }: { modalidad: Modalidad; visible: boolean; delayMs: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        color: COLOR_MODALIDAD[modalidad],
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(1.7)',
        // Con rebote: un sello cae, no se desvanece.
        transition: 'opacity 200ms ease-out, transform 340ms cubic-bezier(0.2, 1.5, 0.4, 1)',
        transitionDelay: `${delayMs}ms`,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path
          d="m4.9 8.2 2.1 2.1 4-4.3"
          fill="none"
          stroke="var(--twin-bg)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Pendiente: el aro hueco de la modalidad. Saltada: el mismo aro, tachado. */
function Aro({ modalidad, tachado }: { modalidad: Modalidad; tachado: boolean }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', color: tachado ? 'var(--twin-muted)' : COLOR_MODALIDAD[modalidad] }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8" cy="8" r="6.2" />
        {tachado && <path d="M4.2 11.8 11.8 4.2" strokeLinecap="round" />}
      </svg>
    </span>
  );
}

/** Descanso: ni punto ni aro. Un hueco declarado, que es lo que hay. */
function Vacio() {
  return (
    <span
      aria-hidden
      style={{ width: 14, height: 2, borderRadius: 1, background: 'var(--twin-hairline-strong)', display: 'inline-block' }}
    />
  );
}

const ETIQUETA_ESTADO: Record<EstadoDia, string> = {
  hecha: 'hecha',
  saltada: 'saltada',
  pendiente: 'por hacer',
  descanso: 'descanso',
};

// ---------------------------------------------------------------------------
// El carril de la semana
// ---------------------------------------------------------------------------

interface ChipProps {
  dia: DiaPlan;
  estado: EstadoDia;
  esHoy: boolean;
  visible: boolean;
  delayEntrada: number;
  sellosVisibles: boolean;
  delaySello: number;
  onPulsar: () => void;
}

function ChipDia({ dia, estado, esHoy, visible, delayEntrada, sellosVisibles, delaySello, onPulsar }: ChipProps) {
  const modalidades = dia.sesiones.flatMap((s) => s.plan.modalidades).slice(0, 2);
  const principal: Modalidad = modalidades[0] ?? 'mobility';
  const titulos = dia.sesiones.map((s) => s.plan.ref.titulo).join(', ');

  return (
    <button
      type="button"
      onClick={onPulsar}
      aria-label={`${dia.nombre} ${dia.numero}, ${ETIQUETA_ESTADO[estado]}${titulos ? `, ${titulos}` : ''}`}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        padding: '8px 2px 9px',
        borderRadius: RAD.m,
        cursor: 'pointer',
        background: esHoy ? 'color-mix(in srgb, var(--twin-accent) 13%, transparent)' : 'transparent',
        border: `1px solid ${esHoy ? 'color-mix(in srgb, var(--twin-accent) 45%, transparent)' : 'transparent'}`,
        ...entradaStyle(visible, delayEntrada),
      }}
    >
      <Label size={10} color={esHoy ? 'var(--twin-accent-text)' : 'var(--twin-muted)'}>
        {dia.inicial}
      </Label>
      <Mono size={15} weight={esHoy ? 700 : 500} color={esHoy ? 'var(--twin-fg)' : 'var(--twin-muted)'}>
        {dia.numero}
      </Mono>
      <span style={{ height: 16, display: 'flex', alignItems: 'center', gap: 3 }}>
        {estado === 'descanso' && <Vacio />}
        {estado === 'hecha' && <Sello modalidad={principal} visible={sellosVisibles} delayMs={delaySello} />}
        {estado === 'saltada' && <Aro modalidad={principal} tachado />}
        {estado === 'pendiente' &&
          modalidades.map((m, i) =>
            i === 0 ? <Aro key={i} modalidad={m} tachado={false} /> : <PuntoModalidad key={i} modalidad={m} size={6} />,
          )}
      </span>
    </button>
  );
}

export function CarrilSemana({
  semana,
  visible,
  sellosVisibles,
  onDia,
}: {
  semana: SemanaPlan;
  visible: boolean;
  sellosVisibles: boolean;
  onDia: (dia: DiaPlan, estado: EstadoDia) => void;
}) {
  const estados = semana.dias.map((d, i) => estadoDia(d, i, semana.indiceHoy));
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {semana.dias.map((d, i) => {
          const estado = estados[i];
          // Los sellos caen en el orden en que se hicieron: cada uno espera a
          // los días hechos que tiene delante.
          const delaySello = estados.slice(0, i).filter((e) => e === 'hecha').length * 130 + 130;
          return (
            <ChipDia
              key={i}
              dia={d}
              estado={estado}
              esHoy={i === semana.indiceHoy}
              visible={visible}
              delayEntrada={i * 55}
              sellosVisibles={sellosVisibles}
              delaySello={delaySello}
              onPulsar={() => onDia(d, estado)}
            />
          );
        })}
      </div>
      {/* El hilo que baja de hoy hasta la sesión: la semana y el héroe son la
          misma cosa vista de lejos y de cerca, y se ve que lo son. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -13,
          left: `${((semana.indiceHoy + 0.5) * 100) / semana.dias.length}%`,
          transform: 'translateX(-50%)',
          width: 2,
          height: 13,
          borderRadius: 1,
          background: 'linear-gradient(to bottom, var(--twin-accent), transparent)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 300ms ease-out',
          transitionDelay: '420ms',
        }}
      />
    </div>
  );
}

/**
 * De qué está hecha la sesión, bloque a bloque. Es lo que gana el alto del
 * héroe cuando la sesión tiene de verdad partes: el calentamiento y la vuelta
 * a la calma van apagados porque no son el trabajo, son el marco.
 */
export function ParteSesion({
  titulo,
  ejercicios,
  estructural,
  modalidad,
}: {
  titulo: string;
  ejercicios: number;
  estructural: boolean;
  modalidad: Modalidad;
}) {
  const color = estructural ? 'var(--twin-muted)' : 'var(--twin-fg)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ opacity: estructural ? 0.45 : 1, display: 'inline-flex' }}>
        <PuntoModalidad modalidad={modalidad} size={6} />
      </span>
      <span
        style={{
          font: `${estructural ? 500 : 600} 13px/1.3 var(--twin-font-sans)`,
          color,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {titulo}
      </span>
      <Mono size={12} color={estructural ? 'var(--twin-muted)' : 'var(--twin-fg)'}>
        {ejercicios} {ejercicios === 1 ? 'ejercicio' : 'ejercicios'}
      </Mono>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datos y tarjetas
// ---------------------------------------------------------------------------

/** Un número de la dosis con su palabra debajo. El dato pesa más (§4). */
export function DatoClave({ clave }: { clave: ClaveDosis }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Mono size={26} weight={700}>
        {clave.valor}
      </Mono>
      <Label size={9} color="var(--twin-muted)">
        {clave.etiqueta}
      </Label>
    </div>
  );
}

export function Pastilla({ children, acento = false }: { children: ReactNode; acento?: boolean }) {
  return (
    <span
      className="tw-pill"
      style={
        acento
          ? {
              color: 'var(--twin-accent-text)',
              borderColor: 'color-mix(in srgb, var(--twin-accent) 35%, transparent)',
              background: 'color-mix(in srgb, var(--twin-accent) 10%, transparent)',
            }
          : undefined
      }
    >
      {children}
    </span>
  );
}

/**
 * La tarjeta de ayer / mañana del día de descanso. Es un botón de verdad: el
 * vacío se sale por aquí, así que tiene que poder pulsarse y tabularse.
 */
export function TarjetaDia({
  cuando,
  dia,
  titulo,
  modalidad,
  detalle,
  hecha,
  onPulsar,
  style,
}: {
  cuando: string;
  dia: string;
  titulo: string;
  modalidad: Modalidad;
  detalle: string;
  hecha: boolean;
  onPulsar: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onPulsar}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: SP.s,
        padding: SP.m,
        textAlign: 'left',
        borderRadius: RAD.l,
        border: '1px solid var(--twin-hairline)',
        background: 'var(--twin-surface)',
        color: 'var(--twin-fg)',
        cursor: 'pointer',
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Label size={9} color="var(--twin-muted)">
          {cuando}
        </Label>
        <Mono size={10} color="var(--twin-muted)">
          {dia}
        </Mono>
      </span>
      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ paddingTop: 5 }}>
          <PuntoModalidad modalidad={modalidad} size={7} />
        </span>
        <span style={{ font: '600 14px/1.25 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{titulo}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hecha && (
          <span aria-hidden style={{ display: 'inline-flex', color: 'var(--twin-ok)' }}>
            <svg width="13" height="13" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="7" fill="currentColor" />
              <path
                d="m4.9 8.2 2.1 2.1 4-4.3"
                fill="none"
                stroke="var(--twin-bg)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
        <Mono size={13} weight={600} color={hecha ? 'var(--twin-fg)' : 'var(--twin-muted)'}>
          {detalle}
        </Mono>
      </span>
    </button>
  );
}
