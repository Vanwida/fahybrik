'use client';

// Las piezas de «El minuto manda». Todas leen tokens: ni un hex, ni un tamaño
// suelto que no salga de twin.css o del kit (CONTRATO-UI §0 y §4).
//
// LO QUE CAMBIÓ CON EL §10: el lienzo lo tiñe LA ZONA DE PULSO, no la fase del
// minuto. Antes `Drenaje` bañaba la pantalla del color del ambiente —gris,
// verde o el NARANJA DE MARCA—, y la zona quedaba relegada a un chip de diez
// píxeles. Eso rompía dos reglas a la vez: el naranja de marca no es un color
// de dato (§9.1) y la zona es la que tiñe el lienzo en las diez vistas (§10.1).
//
// El drenaje sobrevive porque la tesis se sostiene —a tres metros ves cuánta
// columna queda antes de leer los dígitos—, pero como GEOMETRÍA neutra y por
// debajo del ambiente. El significado del minuto (faena, tuyo, se acaba) lo
// dicen el rótulo, el latido del numeral y el fogonazo del cambio.

import type { CSSProperties, ReactNode } from 'react';
import { IconClose, Label, Mono, RAD, RoundButton, SP } from '../../kit';
import { EtiquetaSujeto, Numeral, Trabajo } from '../../kit-vivo';
import { COLOR_MODALIDAD } from '../../datos-reales';
import { dosis, type Ambiente as AmbienteMinuto, type Tarea } from './data';

// ---------------------------------------------------------------------------
// Los dos movimientos de la pantalla (aquí no hay hoja de estilos donde
// meterlos, y SMIL no anima cajas). Van con prefijo `vm-` para no pisar nada.
// El bloque de reducción de movimiento de twin.css los cubre: apunta a
// `.twin-root *`, y esto vive dentro.
// ---------------------------------------------------------------------------

const CSS = `
@keyframes vm-entra { from { opacity: 0; transform: translateY(8px) scale(1.16) } to { opacity: 1; transform: none } }
@keyframes vm-late  { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.035) } }
.vm-entra { animation: vm-entra 300ms cubic-bezier(.16,.84,.44,1) both; }
.vm-late  { animation: vm-late 1s ease-in-out infinite; }
`;

export function EstilosEmom() {
  return <style>{CSS}</style>;
}

// ---------------------------------------------------------------------------
// El fondo: la columna del minuto — geometría, no color de dato
// ---------------------------------------------------------------------------

/**
 * La columna que drena. `fraccion` es lo que queda de la FASE (no del bloque):
 * en un interval el trabajo drena sobre 45 y el cambio sobre 15, porque lo que
 * vives es la fase.
 *
 * Va en neutro y a media intensidad, DEBAJO del tinte de zona: es un nivel que
 * baja, no un estado que se colorea. Sin tono propio no hay forma de que nadie
 * vuelva a colar el naranja de marca como si fuera un dato.
 *
 * `claveFase` remonta la columna en cada cambio de fase o de ronda. Sin eso, la
 * transición de altura animaría el rellenado hacia arriba durante un segundo
 * entero justo cuando el reloj tiene que ser tajante: el minuto vuelve a estar
 * lleno de golpe, como en un reloj de pared.
 */
export function Drenaje({ fraccion, claveFase }: { fraccion: number; claveFase: string }) {
  const tono = 'var(--twin-neutral)';
  const nivel = `${Math.max(0, Math.min(1, fraccion)) * 100}%`;
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* La columna, sin canto: su borde superior queda al 2 %, que a ojo no
          existe. Antes acababa en un filo del 30 % y con el lienzo ya teñido
          por la zona eso partía la pantalla en DOS fondos distintos. */}
      <div
        key={claveFase}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: nivel,
          background: `linear-gradient(to top, color-mix(in srgb, ${tono} 11%, transparent), color-mix(in srgb, ${tono} 2%, transparent))`,
          transition: 'height 1000ms linear',
        }}
      />
      {/* El nivel se marca con un resplandor CENTRADO en la línea, no con el
          canto de la columna: se difumina hacia los dos lados, así que se ve
          dónde va el minuto y no hay ninguna arista que cruce el numeral. */}
      <div
        key={`${claveFase}-nivel`}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: nivel,
          height: 72,
          marginBottom: -36,
          background: `linear-gradient(to bottom, transparent, color-mix(in srgb, ${tono} 13%, transparent), transparent)`,
          transition: 'bottom 1000ms linear',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cromo — salir y pausa siempre alcanzables, y el formato a la derecha
// ---------------------------------------------------------------------------

export function Chrome({
  formato,
  pausado,
  onPausa,
  onSalir,
  compacto = false,
}: {
  formato: string;
  pausado: boolean;
  onPausa: () => void;
  onSalir: () => void;
  /** En horizontal los dos botones viven DENTRO de la franja del formato, que
   *  ya canta la cadencia: aquí solo hacen falta ellos. */
  compacto?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        flex: '0 0 auto',
        ...(compacto ? null : { width: '100%' }),
      }}
    >
      <RoundButton onClick={onSalir} label="Salir del entreno">
        <IconClose size={13} />
      </RoundButton>
      <RoundButton onClick={onPausa} label={pausado ? 'Reanudar el reloj' : 'Pausar el reloj'}>
        {pausado ? (
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
            <path d="M4.5 3.2 12.8 8l-8.3 4.8Z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
            <path d="M5 3h2.1v10H5zM8.9 3H11v10H8.9z" fill="currentColor" />
          </svg>
        )}
      </RoundButton>
      {!compacto && (
        <>
          <span style={{ flex: 1 }} />
          <Mono size={11} color="var(--twin-muted)">
            {formato.toUpperCase()}
          </Mono>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Franja de contexto — solo aparece cuando hay algo REAL que declarar
// ---------------------------------------------------------------------------

export function Franja({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        width: '100%',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  );
}

export function Chip({ texto, color, punto }: { texto: string; color?: string; punto?: string }) {
  const c = color ?? 'var(--twin-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        borderRadius: RAD.s,
        color: c,
        background: `color-mix(in srgb, ${c} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`,
        font: '600 10px/1 var(--twin-font-sans)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {punto && (
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: punto, flex: '0 0 auto' }} />
      )}
      {texto}
    </span>
  );
}

/** El punto de modalidad, con el color que ya define la app. */
export function puntoDe(t: Tarea): string {
  return COLOR_MODALIDAD[t.modalidad];
}

// ---------------------------------------------------------------------------
// El sujeto: EL MINUTO
// ---------------------------------------------------------------------------

/** Lo que dice cada ambiente encima del número. Un rótulo, no una frase. */
export const ROTULO: Record<AmbienteMinuto, string> = {
  faena: 'Queda',
  tuyos: 'Tuyos',
  aviso: 'Se acaba',
  cambio: 'Cambio',
};

/**
 * EL MINUTO — el sujeto de la pantalla, en el numeral compartido (§10.2).
 *
 * El número va en la tinta normal: quien tiñe el lienzo es la zona, y el color
 * del sujeto se lo deja al ambiente. Lo que dice en qué punto del minuto estás
 * es el RÓTULO (queda · tuyos · se acaba · cambio), que sí se colorea, más el
 * latido de los últimos segundos.
 *
 * Antes esto era un `font:` a mano de `clamp(88px, 22vh, 140px)` —con `vh`, que
 * mide la ventana del navegador y no el teléfono— y un `letterSpacing` que la
 * voz de instrumento no tiene.
 */
export function Hero({
  texto,
  tono,
  rotulo,
  late,
  etiquetaVoz,
  horizontal = false,
}: {
  texto: string;
  /** El color del RÓTULO: el ambiente del minuto. El numeral no se tiñe. */
  tono: string;
  rotulo: string;
  late: boolean;
  etiquetaVoz: string;
  horizontal?: boolean;
}) {
  return (
    <div
      role="timer"
      aria-label={etiquetaVoz}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
    >
      <EtiquetaSujeto tono={tono}>{rotulo}</EtiquetaSujeto>
      {/* El latido va en un envoltorio: `Numeral` es del kit y no se le cuelgan
          clases por dentro. */}
      <div aria-hidden className={late ? 'vm-late' : undefined}>
        <Numeral horizontal={horizontal}>{texto}</Numeral>
      </div>
    </div>
  );
}

/**
 * EL TRABAJO DEL MINUTO — lo segundo más importante de la pantalla (§10.6).
 *
 * Vive DENTRO de la banda, pegado al minuto que lo gobierna, y no en un panel
 * gris aparte más pequeño que el reloj: eso era exactamente lo que el §10.6
 * nombra como el fallo de libro.
 *
 * Dos casos, y la diferencia es de honestidad:
 *
 *   la cuenta una MÁQUINA → fracción viva («11 de 12 cal»). El denominador ya
 *                           es la prescripción; escribir el 12 dos veces sería
 *                           ruido.
 *   no la cuenta NADIE    → la DOSIS, que sí se sabe porque la escribió el
 *                           coach. Lo que no se pinta es cuántas llevas: un
 *                           contador a cero sería un dato inventado (§7).
 */
export function TrabajoMinuto({
  tarea,
  contador,
  hecha,
  atenuada,
}: {
  tarea: Tarea;
  /** Lo que marca el monitor ahora. Nulo = no hay quien cuente. */
  contador: number | null;
  hecha: boolean;
  atenuada: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        opacity: atenuada ? 0.45 : 1,
        transition: 'opacity 240ms ease-out',
      }}
    >
      <Trabajo
        nombre={tarea.nombre}
        hecho={contador}
        objetivo={contador === null ? null : tarea.cantidad}
        unidad={tarea.unidad}
        tono={hecha ? 'var(--twin-ok)' : 'var(--twin-fg)'}
      />
      {contador === null && <Numeral escala="segundo">{dosis(tarea)}</Numeral>}
    </div>
  );
}

/** El anuncio de lo que viene. Solo cuando de verdad viene otra cosa. */
export function Anuncio({ rotulo, texto, punto }: { rotulo: string; texto: string; punto?: string }) {
  return (
    <div
      className="vm-entra"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: RAD.m,
        background: 'color-mix(in srgb, var(--twin-accent) 16%, transparent)',
        border: '1px solid color-mix(in srgb, var(--twin-accent) 45%, transparent)',
      }}
    >
      <Label size={10} color="var(--twin-accent-text)" style={{ letterSpacing: '0.2em' }}>
        {rotulo}
      </Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {punto && (
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: punto, flex: '0 0 auto' }} />
        )}
        <span style={{ font: 'italic 800 20px/1.15 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{texto}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La traza de rondas — un CONTADOR, así que se pinta siempre (§6.2 bis)
// ---------------------------------------------------------------------------

export type EstadoPip = 'sellada' | 'pasada' | 'actual' | 'pendiente';

const FONDO_PIP: Record<EstadoPip, string> = {
  sellada: 'var(--twin-ok)',
  pasada: 'color-mix(in srgb, var(--twin-fg) 26%, transparent)',
  actual: 'var(--twin-accent)',
  pendiente: 'var(--twin-hairline-strong)',
};

export function Traza({
  total,
  actual,
  sellos,
  pie,
}: {
  total: number;
  actual: number;
  /** Presente = las rondas selladas se distinguen de las que solo pasaron. */
  sellos?: Readonly<Record<number, number>>;
  /** Ausente en horizontal: allí la ronda ya la canta la franja del formato. */
  pie?: string;
}) {
  const estado = (i: number): EstadoPip => {
    if (i === actual) return 'actual';
    if (i > actual) return 'pendiente';
    if (sellos && sellos[i] === undefined) return 'pasada';
    return sellos ? 'sellada' : 'pasada';
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', gap: 4 }} aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 9,
              borderRadius: 5,
              background: FONDO_PIP[estado(i)],
              transition: 'background-color 240ms ease-out',
            }}
          />
        ))}
      </div>
      {pie && (
        <Mono size={11} color="var(--twin-muted)">
          {pie}
        </Mono>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sello del minuto — el estado en el que el toque ya está dado
// ---------------------------------------------------------------------------

/**
 * La franja cuando la ronda ya está sellada. Ocupa la MISMA franja que la
 * acción (§10.3: las filas se reservan) y no pesa más que ella: el toque de
 * «hecho» lo pinta `FranjaAccion` del kit, y en un EMOM va en contorno porque
 * quien gobierna la transición es el RELOJ, no tu dedo (§10.5).
 */
const CAJA_SELLO: CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: RAD.l,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
};

export function SelloHecho({ texto }: { texto: string }) {
  return (
    <div
      style={{
        ...CAJA_SELLO,
        background: 'color-mix(in srgb, var(--twin-ok) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--twin-ok) 45%, transparent)',
      }}
    >
      <span
        style={{
          font: 'italic 800 17px/1 var(--twin-font-sans)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--twin-ok)',
        }}
      >
        {texto}
      </span>
      <Label size={10} color="var(--twin-muted)">
        Este minuto ya es tuyo
      </Label>
    </div>
  );
}
