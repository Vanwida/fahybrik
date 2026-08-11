'use client';

// El lenguaje común de las tres vistas del plan.
//
// Existe por el §10.3 del CONTRATO-UI: en una familia de vistas que se turnan,
// **el sujeto no puede bailar**. Ciclo, semana y día se abren una desde la otra,
// así que su cromo y su sujeto caen a la MISMA altura y con la misma voz — si en
// una está arriba y en la siguiente 60 pt más abajo, el atleta reencuadra cada
// vez que baja un nivel.
//
// Y por el §10.2: **un solo numeral**. Todas las cifras de la familia van con la
// cara monoespaciada tabular de `t-readout-*`, la misma que el EMOM y la fuerza.
// Nada de tres tratamientos para el «2 de 4» del ciclo, el «4 de 8» de la semana
// y los «42 min» del día.
//
// Ningún átomo de aquí inventa un color ni un tamaño: todo sale de los tokens
// `--twin-*` y de las clases de `twin.css`, así el claro y el oscuro salen gratis.

import type { CSSProperties, ReactNode } from 'react';
import { COLOR_MODALIDAD, type Modalidad } from '../datos-reales';
import { IconClose, PuntoModalidad, RAD, SP, entradaStyle } from '../kit';
import { S } from '../kit-composicion/tokens';
import type { EstadoDia, RepartoModalidad, Trabajo } from './modelo';

export { entradaStyle, PuntoModalidad };

/**
 * La banda del sujeto (§10.3). Las tres vistas la respetan, caiga dentro el
 * nombre de un microciclo, el contador de la semana o el título de una sesión.
 */
export const BANDA_SUJETO = 104;

// ---------------------------------------------------------------------------
// El cromo y el sujeto
// ---------------------------------------------------------------------------

/**
 * La línea de arriba: dónde estás. Siempre una sola línea y siempre en el mismo
 * sitio; si la derecha no tiene nada que decir, se calla en vez de rellenarse.
 */
export function Cromo({
  izquierda,
  derecha,
  onCerrar,
  visible = true,
}: {
  izquierda: string;
  derecha?: string;
  /**
   * Botón de cerrar (×), a la derecha de todo. Solo lo lleva la pantalla que
   * se presenta como modal (el ciclo, en iOS un `fullScreenCover`); las que
   * viven dentro de una pestaña no lo pasan y el cromo se queda igual.
   */
  onCerrar?: () => void;
  visible?: boolean;
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: SP.s,
        minHeight: 16,
        ...entradaStyle(visible, 0),
      }}
    >
      <span
        style={{
          font: '600 12px/1.2 var(--twin-font-sans)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {izquierda}
      </span>
      {derecha ? (
        <span style={{ font: '600 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)', flex: '0 0 auto' }}>
          {derecha}
        </span>
      ) : null}
      {onCerrar ? (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          style={{
            appearance: 'none',
            background: 'none',
            border: 0,
            padding: 0,
            margin: 0,
            width: 28,
            height: 28,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--twin-fg)',
            cursor: 'pointer',
            flex: '0 0 auto',
          }}
        >
          <IconClose size={13} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * El sujeto, en su banda fija.
 *
 * El título va en la voz display (cursiva heavy) porque un nombre de microciclo
 * o de sesión es un valor CATEGÓRICO, y el §4 es explícito: un categórico gana
 * por peso y un escalón de tamaño en la tipografía de TEXTO, no convirtiéndose
 * en un instrumento de medida. El monoespaciado se reserva para `cifra`, que sí
 * se compara.
 */
export function Sujeto({
  eyebrow,
  titulo,
  cifra,
  pie,
  visible = true,
}: {
  eyebrow?: string;
  titulo: string;
  /** La cifra que acompaña al sujeto, ya formateada. Ausente = no la hay. */
  cifra?: ReactNode;
  /** Una línea de contexto. Ausente = el título se basta. */
  pie?: string;
  visible?: boolean;
}) {
  // Un título largo baja un escalón antes que partirse en tres líneas: el
  // sujeto se lee de un vistazo o no es el sujeto.
  const clase = titulo.length > 24 ? 't-headline-m' : 't-headline-l';
  return (
    <div
      style={{
        flex: '0 0 auto',
        minHeight: BANDA_SUJETO,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        ...entradaStyle(visible, 90),
      }}
    >
      {eyebrow ? (
        <span
          style={{
            font: '700 11px/1 var(--twin-font-sans)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--twin-accent-text)',
          }}
        >
          {eyebrow}
        </span>
      ) : null}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.m }}>
        <span className={clase} style={{ color: 'var(--twin-fg)', flex: 1, minWidth: 0 }}>
          {titulo}
        </span>
        {cifra}
      </div>
      {pie ? (
        <span style={{ font: '500 13px/1.35 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{pie}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El numeral — UNO para toda la familia (§10.2)
// ---------------------------------------------------------------------------

export type TamanoNumeral = 'hero' | 'l' | 'm' | 's';

/**
 * Toda cifra de estas tres pantallas pasa por aquí. La unidad y el resto del
 * contador van en `sufijo`, en sans: una palabra dentro del monoespaciado sale
 * con el espaciado de una columna de instrumento y deja de leerse.
 */
export function Numeral({
  children,
  tamano = 'm',
  color = 'var(--twin-fg)',
  sufijo,
  tamanoSufijo = 13,
}: {
  children: ReactNode;
  tamano?: TamanoNumeral;
  color?: string;
  sufijo?: string;
  tamanoSufijo?: number;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, flex: '0 0 auto' }}>
      <span className={`t-readout-${tamano}`} style={{ color }}>
        {children}
      </span>
      {sufijo ? (
        <span style={{ font: `500 ${tamanoSufijo}px/1.2 var(--twin-font-sans)`, color: 'var(--twin-muted)' }}>
          {sufijo}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// La duración — el único sitio donde se decide medido / previsto / nada
// ---------------------------------------------------------------------------

/**
 * Cuánto duró o cuánto durará, con la ley del §7 metida dentro:
 *
 *   · Hay ejecución → el número es la MEDIDA. Se pinta a secas, sin adorno.
 *   · No hay ejecución pero la prescripción deja estimar → «unos 53 min».
 *   · Ni una cosa ni la otra → **no se pinta nada**. Ni un guion, ni un cero.
 *
 * Que esto sea un componente y no tres `if` repartidos es a propósito: fue
 * tener la misma decisión escrita en tres sitios lo que produjo el «42,4» y el
 * «42.4» de la misma magnitud en pantallas contiguas.
 */
export function Duracion({
  trabajo,
  tamano = 's',
}: {
  trabajo: Pick<Trabajo, 'medidoMin' | 'previstoMin'>;
  tamano?: TamanoNumeral;
}) {
  if (trabajo.medidoMin !== null) {
    return (
      <Numeral tamano={tamano} sufijo="min">
        {trabajo.medidoMin}
      </Numeral>
    );
  }
  if (trabajo.previstoMin !== null) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>unos</span>
        <Numeral tamano={tamano} color="var(--twin-muted)" sufijo="min">
          {trabajo.previstoMin}
        </Numeral>
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Estados del día — el mismo vocabulario visual que el carril de `plan-bloque`
// ---------------------------------------------------------------------------

export const ETIQUETA_ESTADO: Record<EstadoDia, string> = {
  hecha: 'hecha',
  saltada: 'saltada',
  pendiente: 'por hacer',
  descanso: 'descanso',
};

/** El sello de hecha: disco lleno de la modalidad con su check. */
export function Sello({ modalidad, size = 16 }: { modalidad: Modalidad; size?: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', color: COLOR_MODALIDAD[modalidad], flex: '0 0 auto' }}>
      <svg width={size} height={size} viewBox="0 0 16 16">
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
export function Aro({ modalidad, tachado, size = 16 }: { modalidad: Modalidad; tachado: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        color: tachado ? 'var(--twin-muted)' : COLOR_MODALIDAD[modalidad],
        flex: '0 0 auto',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8" cy="8" r="6.2" />
        {tachado ? <path d="M4.2 11.8 11.8 4.2" strokeLinecap="round" /> : null}
      </svg>
    </span>
  );
}

/** Descanso: ni punto ni aro. Un hueco declarado, que es lo que hay. */
export function RayaDescanso() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 2,
        borderRadius: 1,
        background: 'var(--twin-hairline-strong)',
        display: 'inline-block',
        flex: '0 0 auto',
      }}
    />
  );
}

/** La marca de estado de un día, elegida en un solo sitio. */
export function MarcaEstado({ estado, modalidad, size }: { estado: EstadoDia; modalidad: Modalidad; size?: number }) {
  if (estado === 'descanso') return <RayaDescanso />;
  if (estado === 'hecha') return <Sello modalidad={modalidad} size={size} />;
  return <Aro modalidad={modalidad} tachado={estado === 'saltada'} size={size} />;
}

// ---------------------------------------------------------------------------
// Pastillas y reparto
// ---------------------------------------------------------------------------

export function Pastilla({
  children,
  tono = 'neutro',
}: {
  children: ReactNode;
  tono?: 'neutro' | 'acento' | 'aviso';
}) {
  const color =
    tono === 'acento' ? 'var(--twin-accent-text)' : tono === 'aviso' ? 'var(--twin-warning)' : 'var(--twin-muted)';
  return (
    <span
      className="tw-pill"
      style={
        tono === 'neutro'
          ? undefined
          : {
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
            }
      }
    >
      {children}
    </span>
  );
}

/**
 * De quién es el trabajo. Un entreno libre NO es un anexo del plan del coach:
 * en producción 9 de las 11 asignaciones del atleta 64 son suyas, así que la
 * marca existe para distinguir, no para degradar.
 */
export function Origen({ trabajo }: { trabajo: Pick<Trabajo, 'origen' | 'esTest'> }) {
  if (trabajo.esTest) return <Pastilla tono="acento">Test</Pastilla>;
  if (trabajo.origen === 'libre') return <Pastilla>Tuyo</Pastilla>;
  return null;
}

/**
 * El reparto de la semana por modalidad, **en sesiones**. Los minutos por
 * modalidad no se saben (ver `repartoSemana`), así que se cuenta lo que sí:
 * cuántas sesiones toca cada una.
 */
export function Reparto({ reparto, total }: { reparto: RepartoModalidad[]; total: number }) {
  if (total === 0 || reparto.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', gap: 3, height: 6, borderRadius: 3, overflow: 'hidden' }}>
        {reparto.map((r) => (
          <span
            key={r.modalidad}
            aria-hidden
            style={{
              flex: r.sesiones,
              minWidth: 3,
              borderRadius: 3,
              background: COLOR_MODALIDAD[r.modalidad],
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: SP.m, flexWrap: 'wrap' }}>
        {reparto.map((r) => (
          <span key={r.modalidad} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <PuntoModalidad modalidad={r.modalidad} size={6} />
            <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {NOMBRE_MODALIDAD[r.modalidad]}
            </span>
            <span
              className="t-readout-s"
              style={{ fontSize: 12, lineHeight: 1.2, color: 'var(--twin-fg)' }}
            >
              {r.sesiones}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * El nombre de cada modalidad en español de gimnasio (§3). «Ergo» no se dice:
 * el atleta dice remo, ski y bici.
 */
export const NOMBRE_MODALIDAD: Record<Modalidad, string> = {
  run: 'correr',
  row: 'remo',
  ski: 'ski',
  bike: 'bici',
  strength: 'fuerza',
  functional: 'estaciones',
  mobility: 'movilidad',
};

// ---------------------------------------------------------------------------
// El pie de acción — anclado, pero sin competir con el sujeto (§10.5)
// ---------------------------------------------------------------------------

/**
 * La acción vive abajo y siempre visible (§6, regla 3), pero **no pesa como el
 * sujeto** (§10.5): el sujeto es lo que miras, la acción es lo que tocas. Por
 * eso es un botón de contorno y no un bloque naranja del ancho de la pantalla —
 * salvo cuando de verdad es LA acción del atleta (empezar a entrenar).
 */
export function Accion({
  titulo,
  onTap,
  principal = false,
  visible = true,
}: {
  titulo: string;
  onTap: () => void;
  principal?: boolean;
  visible?: boolean;
}) {
  return (
    <div style={{ flex: '0 0 auto', ...entradaStyle(visible, 300) }}>
      <button
        type="button"
        onClick={onTap}
        className={principal ? 'tw-btn-primary' : 'tw-btn-secondary'}
        style={{ width: '100%', height: principal ? 54 : 46, fontSize: principal ? 16 : 14 }}
      >
        {titulo}
      </button>
    </div>
  );
}

/** La columna de pantalla de la familia: cromo, sujeto, cuerpo y acción. */
export function Lienzo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div
      style={{
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: S.m,
        padding: '14px 16px 16px',
      }}
    >
      {children}
      {accion}
    </div>
  );
}

/** El cuerpo `llena`: se queda el sobrante y lo reparte entre sus filas. */
export function Cuerpo({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: SP.s,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Fila contenedora con la cara de tarjeta, sin el peso de `Card`. */
export function Fila({
  children,
  acento = false,
  onTap,
  etiqueta,
  style,
}: {
  children: ReactNode;
  acento?: boolean;
  onTap?: () => void;
  etiqueta: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={etiqueta}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        cursor: onTap ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        width: '100%',
        padding: `${SP.m}px ${SP.m}px`,
        borderRadius: RAD.l,
        border: `1px solid ${acento ? 'color-mix(in srgb, var(--twin-accent) 45%, transparent)' : 'var(--twin-hairline)'}`,
        background: acento ? 'color-mix(in srgb, var(--twin-accent) 10%, transparent)' : 'var(--twin-surface)',
        color: 'var(--twin-fg)',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
