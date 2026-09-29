'use client';

// LO QUE TE RECLAMA: un solo bloque con contador, plegado: la pareja que entrena
// ahora, la revisión que propone o tiene reservada el coach y la batería de tests.
// Cerrado, enseña lo más urgente con su salida y cuántos más hay; abierto, todo.
// Con uno solo no hay nada que plegar. Sin ninguno la banda no existe (§6.2 bis:
// un contador se pinta en cero, pero «nada que reclamar» no es un contador).
//
// Sin coach no hay revisión ni tests ni comunicados, y ninguna llega aquí: el
// bloque es de ellos, no un hueco que se rellena con otra cosa.

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { LecturaHoy, Reclamo } from '../../kit-hoy/contrato';
import { Banda, Esq, Etiqueta } from './atomos';
import { IconChevron, IconRevision, IconTests } from './iconos';
import { capitalizar, inicialesDe } from './texto';
import { ORDEN_RECLAMOS, T, TOQUE } from './tokens';

type Pendiente = Exclude<Reclamo, { clave: 'a-medias' }>;

/** Los reclamos del bloque, en su orden de urgencia (el entreno a medias se promueve fuera). */
export function reclamosDelBloque(reclamos: Reclamo[]): Pendiente[] {
  return reclamos
    .filter((r): r is Pendiente => r.clave !== 'a-medias')
    .sort((a, b) => ORDEN_RECLAMOS.indexOf(a.clave) - ORDEN_RECLAMOS.indexOf(b.clave));
}

const TITULO: CSSProperties = { font: `600 ${T.cuerpo}px/22px var(--twin-font-sans)`, color: 'var(--twin-fg)' };
const APOYO: CSSProperties = { font: `400 ${T.apoyo}px/20px var(--twin-font-sans)`, color: 'var(--twin-muted)', display: 'flex', alignItems: 'center', gap: 6 };

function Marcador({ children, anillo }: { children: ReactNode; anillo?: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        background: 'color-mix(in srgb, var(--twin-fg) 7%, transparent)',
        boxShadow: anillo ? `inset 0 0 0 2px ${anillo}` : 'inset 0 0 0 1px var(--twin-hairline-strong)',
        color: 'var(--twin-fg)',
        font: `700 ${T.apoyo}px/1 var(--twin-font-sans)`,
      }}
    >
      {children}
    </span>
  );
}

function Fila({ marcador, titulo, apoyo, accion, onClick, etiqueta }: { marcador: ReactNode; titulo: string; apoyo: ReactNode; accion?: string; onClick?: () => void; etiqueta: string }) {
  const contenido = (
    <>
      {marcador}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={TITULO}>{titulo}</span>
        <span style={APOYO}>{apoyo}</span>
      </span>
      {onClick ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: `700 ${T.cuerpo}px/1 var(--twin-font-sans)`, color: accion ? 'var(--twin-accent-text)' : 'var(--twin-faint)' }}>
          {accion}
          <IconChevron tam={accion ? 14 : 16} />
        </span>
      ) : null}
    </>
  );
  const caja: CSSProperties = { width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textAlign: 'left', borderRadius: 12 };
  return onClick ? (
    <button type="button" className="pl-btn pl-fila" onClick={onClick} aria-label={etiqueta} style={caja}>
      {contenido}
    </button>
  ) : (
    <div role="group" aria-label={etiqueta} style={caja}>
      {contenido}
    </div>
  );
}

function ItemReclamo({ r, l, onIr }: { r: Pendiente; l: LecturaHoy; onIr: (donde: string) => void }) {
  const coach = l.coach ?? 'Tu coach';
  if (r.clave === 'pareja-en-vivo') {
    // «Únete» solo si hay una sesión propia por delante: sin ella, es información.
    const puedeUnirse = l.hoy?.tipo === 'sesiones' && l.hoy.sesiones.some((s) => s.estado === 'pendiente');
    return (
      <Fila
        marcador={<Marcador anillo="var(--twin-info)">{inicialesDe(r.nombre)}</Marcador>}
        titulo={`${r.nombre} está entrenando ahora`}
        apoyo={
          <>
            <span className="pl-late" aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--twin-accent)' }} />
            <span style={{ color: 'var(--twin-accent-text)', fontWeight: 600 }}>En vivo</span>
          </>
        }
        accion={puedeUnirse ? 'Únete' : undefined}
        onClick={puedeUnirse ? () => onIr(`Pareja en vivo · ${r.nombre} → Únete (lleva al Plan)`) : undefined}
        etiqueta={`${r.nombre} está entrenando ahora.${puedeUnirse ? ' Únete en vivo' : ''}`}
      />
    );
  }
  if (r.clave === 'revision') {
    const propuesta = r.estado === 'propuesta';
    const titulo = propuesta ? `${coach} te propone una revisión` : `Revisión con ${coach}`;
    const apoyo = propuesta ? (r.cuando ? `Propone ${r.cuando}` : 'Elige tu hueco') : r.cuando ? `${capitalizar(r.cuando)} · videollamada` : 'Videollamada';
    return (
      <Fila
        marcador={<Marcador><IconRevision tam={19} /></Marcador>}
        titulo={titulo}
        apoyo={apoyo}
        accion={propuesta ? 'Elegir' : undefined}
        onClick={() => onIr(propuesta ? 'Revisión propuesta → elegir hueco' : 'Revisión reservada → ver detalle')}
        etiqueta={`${titulo}. ${apoyo}`}
      />
    );
  }
  const { hechos, total } = r;
  return (
    <Fila
      marcador={<Marcador><IconTests tam={19} /></Marcador>}
      titulo="Tus tests"
      apoyo={
        <>
          {total <= 10 ? (
            <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
              {Array.from({ length: total }, (_, i) => (
                <span key={i} style={{ width: 18, height: 6, borderRadius: 3, background: i < hechos ? 'var(--twin-fg)' : 'var(--twin-hairline-strong)' }} />
              ))}
            </span>
          ) : null}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {hechos} de {total} hechos
          </span>
        </>
      }
      onClick={() => onIr('Tests → abre la batería del coach')}
      etiqueta={`Tus tests, ${hechos} de ${total} hechos`}
    />
  );
}

export function Reclamos({ l, orden, onIr }: { l: LecturaHoy; orden: number; onIr: (donde: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const items = l.cargando ? [] : reclamosDelBloque(l.reclamos);
  if (l.cargando) {
    // Aún no sabemos si hay algo que reclamar: una fila de esqueleto ocupa el sitio
    // de la más común, para que lo de debajo no baile cuando llegue la respuesta.
    return (
      <Banda etiqueta="Te esperan" orden={orden} crece={0}>
        <div role="status" aria-label="Cargando lo que te espera" style={{ minHeight: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Esq w={40} h={40} r={20} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Esq w="70%" h={20} r={6} />
            <Esq w="45%" h={16} r={6} />
          </span>
        </div>
      </Banda>
    );
  }
  if (items.length === 0) return null;
  const [primero, ...resto] = items;
  const plegable = resto.length > 0;

  return (
    <Banda etiqueta="Te esperan" orden={orden} crece={0} relleno={6}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: TOQUE }}>
        <Etiqueta>Te esperan</Etiqueta>
        <span
          style={{
            minWidth: 26,
            height: 26,
            padding: '0 8px',
            boxSizing: 'border-box',
            borderRadius: 13,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'color-mix(in srgb, var(--twin-fg) 10%, transparent)',
            font: `700 ${T.apoyo}px/1 var(--twin-font-sans)`,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-fg)',
          }}
        >
          {items.length}
        </span>
        {plegable ? (
          <button
            type="button"
            className="pl-btn"
            aria-expanded={abierto}
            aria-controls={id}
            onClick={() => setAbierto((a) => !a)}
            style={{ marginLeft: 'auto', minHeight: TOQUE, padding: '0 4px 0 12px', display: 'inline-flex', alignItems: 'center', gap: 4, font: `600 ${T.apoyo}px/1 var(--twin-font-sans)`, color: 'var(--twin-accent-text)' }}
          >
            {abierto ? 'Ver menos' : `Ver los otros ${resto.length}`}
            <span aria-hidden style={{ display: 'inline-flex', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 220ms ease' }}>
              <IconChevron tam={14} abajo />
            </span>
          </button>
        ) : null}
      </div>
      <ItemReclamo r={primero} l={l} onIr={onIr} />
      {plegable ? (
        <div id={id} className="pl-resto" data-abierto={abierto}>
          <div>
            {resto.map((r) => (
              <div key={r.clave} style={{ borderTop: '1px solid var(--twin-hairline)' }}>
                <ItemReclamo r={r} l={l} onIr={onIr} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Banda>
  );
}
