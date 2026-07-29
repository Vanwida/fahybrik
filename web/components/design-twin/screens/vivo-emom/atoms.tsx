'use client';

// Las piezas de «El minuto manda». Todas leen tokens: ni un hex, ni un tamaño
// suelto que no salga de twin.css o del kit (CONTRATO-UI §0 y §4).
//
// La pieza que sostiene la tesis es `Drenaje`: el minuto no es un número en una
// tarjeta, es EL FONDO de la pantalla. A tres metros, con el móvil en el suelo,
// primero ves cuánta columna queda y de qué color es; los dígitos son la
// lectura de cerca. Por eso el color del ambiente baña el lienzo entero y no un
// chip de doce píxeles en una esquina.

import type { CSSProperties, ReactNode } from 'react';
import { IconClose, Label, Mono, RAD, RoundButton, SP } from '../../kit';
import { COLOR_MODALIDAD } from '../../datos-reales';
import type { Ambiente, Tarea } from './data';

// ---------------------------------------------------------------------------
// Los tres movimientos de la pantalla (aquí no hay hoja de estilos donde
// meterlos, y SMIL no anima cajas). Van con prefijo `vm-` para no pisar nada.
// El bloque de reducción de movimiento de twin.css los cubre: apunta a
// `.twin-root *`, y esto vive dentro.
// ---------------------------------------------------------------------------

const CSS = `
@keyframes vm-flash { from { opacity: .5 } to { opacity: 0 } }
@keyframes vm-entra { from { opacity: 0; transform: translateY(8px) scale(1.16) } to { opacity: 1; transform: none } }
@keyframes vm-late  { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.035) } }
.vm-flash { animation: vm-flash 320ms ease-out forwards; }
.vm-entra { animation: vm-entra 300ms cubic-bezier(.16,.84,.44,1) both; }
.vm-late  { animation: vm-late 1s ease-in-out infinite; }
`;

export function EstilosEmom() {
  return <style>{CSS}</style>;
}

// ---------------------------------------------------------------------------
// El fondo: la columna del minuto
// ---------------------------------------------------------------------------

/**
 * La columna que drena. `fraccion` es lo que queda de la FASE (no del bloque):
 * en un interval el trabajo drena sobre 45 y el cambio sobre 15, porque lo que
 * vives es la fase.
 *
 * `claveFase` remonta la columna en cada cambio de fase o de ronda. Sin eso, la
 * transición de altura animaría el rellenado hacia arriba durante un segundo
 * entero justo cuando el reloj tiene que ser tajante: el minuto vuelve a estar
 * lleno de golpe, como en un reloj de pared.
 */
export function Drenaje({
  fraccion,
  color,
  claveFase,
}: {
  fraccion: number;
  color: string;
  claveFase: string;
}) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        key={claveFase}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${Math.max(0, Math.min(1, fraccion)) * 100}%`,
          background: `linear-gradient(to top, color-mix(in srgb, ${color} 26%, transparent), color-mix(in srgb, ${color} 5%, transparent))`,
          transition: 'height 1000ms linear, background 260ms ease-out',
        }}
      >
        {/* El filo del nivel va DIFUMINADO, no como una línea de 2 px. La
            primera versión lo llevaba nítido y a mitad de minuto le cruzaba una
            raya por encima al número: justo al que hay que leer a tres metros.
            Difuminado se sigue viendo dónde está el nivel y no corta un glifo. */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 18,
            background: `linear-gradient(to bottom, color-mix(in srgb, ${color} 48%, transparent), transparent)`,
          }}
        />
      </div>
    </div>
  );
}

/** El destello del cambio de minuto: el suceso que se ve sin mirar. */
export function Flash({ clave, color }: { clave: string; color: string }) {
  return (
    <div
      key={clave}
      aria-hidden
      className="vm-flash"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `color-mix(in srgb, ${color} 55%, transparent)`,
      }}
    />
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
        ...(compacto ? null : { alignSelf: 'stretch' }),
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
        flex: '0 0 auto',
        minHeight: 26,
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
export const ROTULO: Record<Ambiente, string> = {
  faena: 'Queda',
  tuyos: 'Tuyos',
  aviso: 'Se acaba',
  cambio: 'Cambio',
};

export function Hero({
  texto,
  color,
  rotulo,
  late,
  etiquetaVoz,
}: {
  texto: string;
  color: string;
  rotulo: string;
  late: boolean;
  etiquetaVoz: string;
}) {
  return (
    <div
      role="timer"
      aria-label={etiquetaVoz}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
    >
      <Label size={11} color={color} style={{ letterSpacing: '0.22em' }}>
        {rotulo}
      </Label>
      <span
        aria-hidden
        className={late ? 'vm-late' : undefined}
        style={{
          fontFamily: 'var(--twin-font-mono)',
          fontWeight: 800,
          // El número del box: crece con el lienzo hasta donde sigue cabiendo
          // entero. «0:19» son 4 avances mono (~2,4 em), así que 140 px ocupan
          // 336 de los 378 útiles del lienzo del iPhone 17 Pro. Es el tamaño
          // máximo que se lee a tres metros sin partirse en dos líneas.
          fontSize: 'clamp(88px, 22vh, 140px)',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          color,
        }}
      >
        {texto}
      </span>
    </div>
  );
}

/**
 * La tarea del minuto. Con monitor se lee como una fracción viva («7 / 12 cal»)
 * porque el denominador YA es la prescripción: escribir el 12 dos veces sería
 * ruido. Sin monitor se lee la dosis y nada más, que es todo lo que se sabe.
 */
export function TareaGrande({
  tarea,
  contador,
  hecha,
  atenuada,
}: {
  tarea: Tarea;
  contador: number | null;
  hecha: boolean;
  atenuada: boolean;
}) {
  const color = hecha ? 'var(--twin-ok)' : 'var(--twin-fg)';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        opacity: atenuada ? 0.45 : 1,
        transition: 'opacity 240ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span
          aria-hidden
          style={{ width: 8, height: 8, borderRadius: '50%', background: puntoDe(tarea), flex: '0 0 auto' }}
        />
        <span
          style={{
            font: 'italic 800 28px/1.1 var(--twin-font-sans)',
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
            color: 'var(--twin-fg)',
          }}
        >
          {tarea.nombre}
        </span>
      </div>
      {contador === null ? (
        <Mono size={34} weight={800}>
          {tarea.cantidad} {tarea.unidad}
        </Mono>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <Mono size={40} weight={800} color={color}>
            {contador}
          </Mono>
          <Mono size={22} weight={700} color="var(--twin-muted)">
            / {tarea.cantidad} {tarea.unidad}
          </Mono>
        </div>
      )}
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
// El toque de «hecho» — el ÚNICO botón que puede existir en un EMOM
// ---------------------------------------------------------------------------

const CAJA_ACCION: CSSProperties = {
  width: '100%',
  height: 88,
  borderRadius: RAD.l,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
};

export function BotonHecho({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tw-btn-primary"
      style={{ ...CAJA_ACCION, font: 'italic 800 26px/1 var(--twin-font-sans)', letterSpacing: '0.08em' }}
    >
      HECHO
      <span style={{ font: '600 11px/1 var(--twin-font-sans)', letterSpacing: '0.1em', opacity: 0.75 }}>
        SELLA TU TIEMPO DE ESTE MINUTO
      </span>
    </button>
  );
}

export function SelloHecho({ texto }: { texto: string }) {
  return (
    <div
      style={{
        ...CAJA_ACCION,
        background: 'color-mix(in srgb, var(--twin-ok) 16%, transparent)',
        border: '1px solid color-mix(in srgb, var(--twin-ok) 45%, transparent)',
      }}
    >
      <span style={{ font: 'italic 800 22px/1 var(--twin-font-sans)', color: 'var(--twin-ok)' }}>{texto}</span>
      <Label size={10} color="var(--twin-muted)">
        Este minuto ya es tuyo
      </Label>
    </div>
  );
}
