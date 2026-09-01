'use client';

// El vocabulario visual de los comunicados — compartido por las cuatro
// pantallas de la tanda «Del coach».
//
// Vive aquí y no dentro de la bandeja por la regla 0 del CONTRATO-UI: el chip
// de tipo y la insignia de estado se pintan en la lista Y en los tres detalles,
// y si cada pantalla se los dibujara acabaríamos con tres grafías del mismo
// estado, que es exactamente el fallo del 28-jul con el ritmo.
//
// Ninguna pieza inventa un color: todo sale de `modelo.ts`, que a su vez solo
// nombra vars `--twin-*`.

import type { CSSProperties, ReactNode } from 'react';
import { IconCheckCircle, IconChevron, IconCircle, Label, RoundButton } from '../kit';
import { R, S } from '../kit-composicion/tokens';
import { COACH } from './data';
import { ANCLA_ETIQUETA, TIPO, insignia, type Comunicado, type Insignia, type TipoComunicado } from './modelo';

// ---------------------------------------------------------------------------
// Chip de tipo e insignia de estado
// ---------------------------------------------------------------------------

/** El chip que dice QUÉ es esto. Es lo primero que se lee de un comunicado. */
export function ChipTipo({ tipo }: { tipo: TipoComunicado }) {
  const ficha = TIPO[tipo];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 9px',
        borderRadius: R.pill,
        background: `color-mix(in srgb, ${ficha.color} 15%, transparent)`,
        color: ficha.color,
        font: '700 10px/1 var(--twin-font-sans)',
        letterSpacing: '0.16em',
        whiteSpace: 'nowrap',
      }}
    >
      {ficha.etiqueta}
    </span>
  );
}

/** NUEVO · VISTO · HECHO · RESPONDIDO · VENCE HOY. La calcula `modelo.insignia`. */
export function EstadoBadge({ estado }: { estado: Insignia }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        font: '700 9.5px/1 var(--twin-font-sans)',
        letterSpacing: '0.14em',
        color: estado.color,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden
        style={{ width: 5, height: 5, borderRadius: '50%', background: estado.color, flex: '0 0 auto' }}
      />
      {estado.etiqueta}
    </span>
  );
}

/** De dónde cuelga. `general` no pinta nada: no informa (§6.2 bis). */
export function AnclaLinea({ c }: { c: Comunicado }) {
  const etiqueta = ANCLA_ETIQUETA[c.ancla];
  if (!etiqueta) return null;
  return <Label size={9.5} color="var(--twin-faint)">{etiqueta}</Label>;
}

// ---------------------------------------------------------------------------
// Marcar hecho
// ---------------------------------------------------------------------------

/**
 * El acto que separa un comunicado de un mensaje: marcarlo. Es un control, así
 * que tiene área de toque de sobra y dice en voz alta qué marca.
 */
export function BotonMarcar({
  hecho,
  etiqueta,
  onTap,
}: {
  hecho: boolean;
  etiqueta: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={hecho}
      aria-label={etiqueta}
      style={{
        all: 'unset',
        cursor: 'pointer',
        flex: '0 0 auto',
        width: 40,
        height: 40,
        display: 'grid',
        placeItems: 'center',
        color: hecho ? 'var(--twin-ok)' : 'var(--twin-faint)',
      }}
    >
      {hecho ? <IconCheckCircle size={22} /> : <IconCircle size={22} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// La tarjeta de la bandeja
// ---------------------------------------------------------------------------

export interface ComunicadoCardProps {
  c: Comunicado;
  /** Se pinta a la izquierda cuando el comunicado se marca desde la lista. */
  marcar?: { hecho: boolean; etiqueta: string; onTap: () => void };
  /** Sustituye a la línea de resumen cuando el detalle manda (una tarea vencida). */
  detalle?: ReactNode;
  /** Lo que se ancla al pie de la tarjeta (una CTA de respuesta). */
  pie?: ReactNode;
  onAbrir?: () => void;
  style?: CSSProperties;
}

/**
 * Chip · título · una línea · ancla · estado. Ese orden y no otro: el atleta
 * decide si abre por el tipo y por el estado, y lee el título por el medio.
 */
export function ComunicadoCard({ c, marcar, detalle, pie, onAbrir, style }: ComunicadoCardProps) {
  const marca = insignia(c);
  // Tachar es «esto ya no hay que hacerlo», y solo lo cumple `hecho`. Una
  // pregunta respondida sigue siendo la pregunta: tacharla se lee como que se
  // anuló, y lo que pasó es lo contrario (se contestó y cambió el plan).
  const tachado = c.estado === 'hecho';
  const apagado = tachado || c.estado === 'respondido';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S.m, ...style }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: S.s }}>
        {marcar ? (
          <BotonMarcar hecho={marcar.hecho} etiqueta={marcar.etiqueta} onTap={marcar.onTap} />
        ) : null}
        <button
          type="button"
          onClick={onAbrir}
          disabled={!onAbrir}
          style={{
            all: 'unset',
            cursor: onAbrir ? 'pointer' : 'default',
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: S.s, flexWrap: 'wrap' }}>
            <ChipTipo tipo={c.tipo} />
            <span style={{ flex: 1 }} />
            <EstadoBadge estado={marca} />
          </span>

          <span
            style={{
              font: '650 16px/1.25 var(--twin-font-sans)',
              color: apagado ? 'var(--twin-muted)' : 'var(--twin-fg)',
              textDecoration: tachado ? 'line-through' : 'none',
              textDecorationColor: 'var(--twin-faint)',
            }}
          >
            {c.titulo}
          </span>

          {detalle ?? (
            <span style={{ font: '400 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
              {c.resumen}
            </span>
          )}

          <span style={{ display: 'flex', alignItems: 'center', gap: S.s }}>
            <AnclaLinea c={c} />
            <span style={{ flex: 1 }} />
            {onAbrir ? (
              <span style={{ color: 'var(--twin-faint)', display: 'inline-flex' }}>
                <IconChevron size={12} />
              </span>
            ) : null}
          </span>
        </button>
      </div>
      {pie}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La cabecera de los tres detalles
// ---------------------------------------------------------------------------

/**
 * Atrás · chip · de quién y cuándo. Idéntica en los tres detalles a propósito:
 * abrir una pregunta y abrir un protocolo tienen que sentirse la misma casa.
 */
export function CabeceraDetalle({
  c,
  onVolver,
  accesorio,
}: {
  c: Comunicado;
  onVolver: () => void;
  /** A la derecha: la insignia de estado, o el progreso de un protocolo. */
  accesorio?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: S.m,
        padding: `${S.m}px ${S.l}px`,
        borderBottom: '1px solid var(--twin-hairline)',
      }}
    >
      <RoundButton onClick={onVolver} label="Volver a Del coach">
        <IconChevron dir="left" size={13} />
      </RoundButton>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ display: 'flex' }}>
          <ChipTipo tipo={c.tipo} />
        </span>
        <span style={{ font: '500 11.5px/1.2 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          De {COACH.nombreCorto} · {c.publicado}
        </span>
      </span>
      {accesorio}
    </div>
  );
}
