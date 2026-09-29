'use client';

// «CONTIGO» — lo que te reclama, agrupado en UNA superficie y plegado.
//
// Es la vuelta a lo que la app tenía repartido en cinco tarjetas sueltas
// (retomar, pareja en vivo, batería de tests, revisión, comunicados). Aquí son
// filas de una sola tarjeta, en el orden en que CADUCAN (`itemsContigo`): lo
// que se acaba en minutos primero, lo que espera sin prisa al final.
//
// Se pinta lo que hay y nada más: sin reclamos no hay sección (no hay ruido
// gris). Un CONTADOR se pinta también en cero («0 de 4», §6.2 bis). Con más de
// tres filas se pliega a dos y un «Ver N más» de 48 pt.
//
// Sin coach no llega ninguna fila de coach: lo garantiza `itemsContigo`, no esta
// vista.

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import type { LecturaHoy } from '../../kit-hoy/contrato';
import { IcoBandeja, IcoChevron, IcoCronometro, IcoPausa, IcoVideo } from './iconos';
import type { ItemContigo } from './momento';
import { Pastilla, TituloSeccion, mayuscula } from './piezas';
import { fuente, RADIO, tinte, velo, TABULAR, TAM, TOQUE } from './tokens';

/** Desde cuántas filas se pliega, y cuántas quedan a la vista al plegar. */
const PLEGAR_DESDE = 3;
const VISIBLES_PLEGADO = 2;

interface Fila {
  clave: string;
  icono: ReactNode;
  titulo: string;
  detalle: string;
  /** Lo que va a la derecha antes del chevron. */
  extra?: ReactNode;
  /** Lo que caduca en minutos o ya está empezado: lleva el marco naranja suave. */
  realce?: boolean;
  /** La pastilla de la derecha ya es el gesto: sin chevron (además libra 22 px al título). */
  sinChevron?: boolean;
  etiqueta: string;
  onClick: () => void;
}

function Ficha({ children, tono }: { children: ReactNode; tono?: 'realce' }) {
  return (
    <span
      aria-hidden
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        background: tono === 'realce' ? 'var(--twin-accent)' : 'var(--twin-surface-elevated)',
        color: tono === 'realce' ? 'var(--twin-accent-on)' : 'var(--twin-fg)',
        border: tono === 'realce' ? 'none' : '1px solid var(--twin-hairline-strong)',
      }}
    >
      {children}
    </span>
  );
}

/** Los cuatro tramos de la batería de tests: contador visible, también en cero. */
function Tramos({ hechos, total }: { hechos: number; total: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', gap: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 14,
            height: 6,
            borderRadius: 3,
            background: i < hechos ? 'var(--twin-accent)' : velo('var(--twin-fg)', 24),
          }}
        />
      ))}
    </span>
  );
}

function filaDe(item: ItemContigo, l: LecturaHoy, puedeUnirse: boolean, onLog: (s: string) => void): Fila {
  const quien = l.coach ?? 'Tu coach';
  switch (item.clave) {
    case 'pareja-en-vivo':
      return {
        clave: item.clave,
        icono: (
          <span className="hd-vivo" style={{ '--hd-latido': 'var(--twin-accent)', width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--twin-accent)', color: 'var(--twin-accent-on)', ...fuente(800, TAM.cuerpo, 1, true) } as CSSProperties}>
            {item.nombre.charAt(0).toUpperCase()}
          </span>
        ),
        titulo: `${item.nombre} está entrenando ahora`,
        detalle: puedeUnirse ? 'En vivo · desde el Plan' : 'En vivo ahora',
        extra: puedeUnirse ? (
          <Pastilla fondo="var(--twin-accent)" tinta="var(--twin-accent-on)">
            Únete
          </Pastilla>
        ) : undefined,
        realce: true,
        sinChevron: Boolean(puedeUnirse),
        etiqueta: `${item.nombre} está entrenando ahora. ${puedeUnirse ? 'Únete en vivo' : 'En vivo'}`,
        onClick: () => onLog(puedeUnirse ? `Contigo → Plan · unirse en vivo con ${item.nombre}` : `Contigo → ${item.nombre} entrena ahora`),
      };
    case 'a-medias':
      return {
        clave: item.clave,
        icono: <Ficha tono="realce"><IcoPausa tam={24} /></Ficha>,
        titulo: 'Tienes un entreno a medias',
        detalle: `${item.titulo} · desde las ${item.desde}`,
        extra: (
          <Pastilla fondo="var(--twin-accent)" tinta="var(--twin-accent-on)">
            Retomar
          </Pastilla>
        ),
        realce: true,
        sinChevron: true,
        etiqueta: `Tienes un entreno a medias: ${item.titulo}, desde las ${item.desde}. Retomar`,
        onClick: () => onLog(`Contigo → retomar «${item.titulo}»`),
      };
    case 'revision': {
      const propuesta = item.estado === 'propuesta';
      const titulo = propuesta ? `${quien} te propone una revisión` : `Próxima sesión con ${quien}`;
      const detalle = propuesta
        ? item.cuando
          ? `${mayuscula(item.cuando)} · videollamada de 30 min`
          : 'Elige tu hueco · videollamada de 30 min'
        : item.cuando
          ? mayuscula(item.cuando)
          : 'Revisión reservada';
      return {
        clave: item.clave,
        icono: <Ficha><IcoVideo tam={24} /></Ficha>,
        titulo,
        detalle,
        etiqueta: `${titulo}. ${detalle}`,
        onClick: () => onLog(propuesta ? 'Contigo → elegir hueco de la revisión' : 'Contigo → revisión reservada'),
      };
    }
    case 'tests':
      return {
        clave: item.clave,
        icono: <Ficha><IcoCronometro tam={24} /></Ficha>,
        titulo: 'Tus tests',
        detalle: `${item.hechos} de ${item.total} hechos`,
        extra: <Tramos hechos={item.hechos} total={item.total} />,
        etiqueta: `Tus tests: ${item.hechos} de ${item.total} hechos`,
        onClick: () => onLog('Contigo → hub de tests'),
      };
    case 'comunicados':
      return {
        clave: item.clave,
        icono: <Ficha><IcoBandeja tam={24} /></Ficha>,
        titulo: 'Del coach',
        detalle: `${item.n} sin resolver`,
        etiqueta: `Del coach, ${item.n} sin resolver`,
        onClick: () => onLog('Contigo → bandeja «Del coach»'),
      };
  }
}

function FilaContigo({ f, primera }: { f: Fila; primera: boolean }) {
  return (
    <button
      type="button"
      className="hd-toque"
      onClick={f.onClick}
      aria-label={f.etiqueta}
      style={{
        minHeight: 72,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderTop: primera ? 'none' : '1px solid var(--twin-hairline)',
        background: f.realce ? tinte('var(--twin-accent)', 10, 'var(--twin-surface)') : 'transparent',
      }}
    >
      {f.icono}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ ...fuente(700, TAM.cuerpo, 1.25), color: 'var(--twin-fg)', textWrap: 'balance' }}>{f.titulo}</span>
        <span style={{ ...fuente(500, TAM.suelo, 1.3), color: 'var(--twin-muted)', ...TABULAR }}>{f.detalle}</span>
      </span>
      {f.extra}
      {f.sinChevron ? null : (
        <span style={{ color: 'var(--twin-muted)', display: 'inline-flex' }}>
          <IcoChevron tam={18} />
        </span>
      )}
    </button>
  );
}

export function Contigo({
  l,
  items,
  puedeUnirse,
  onLog,
}: {
  l: LecturaHoy;
  items: ItemContigo[];
  puedeUnirse: boolean;
  onLog: (linea: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  if (items.length === 0) return null;
  const filas = items.map((i) => filaDe(i, l, puedeUnirse, onLog));
  const plegable = filas.length > PLEGAR_DESDE;
  const visibles = plegable && !abierto ? filas.slice(0, VISIBLES_PLEGADO) : filas;
  const resto = filas.length - VISIBLES_PLEGADO;
  return (
    <section aria-label="Contigo" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <TituloSeccion
        aparte={
          <Pastilla fondo={velo('var(--twin-fg)', 8)} tinta="var(--twin-fg)">
            {items.length === 1 ? '1 cosa' : `${items.length} cosas`}
          </Pastilla>
        }
      >
        Contigo
      </TituloSeccion>
      <div
        id={id}
        style={{
          borderRadius: RADIO.tarjeta,
          background: 'var(--twin-surface)',
          border: '1px solid var(--twin-hairline)',
          overflow: 'hidden',
        }}
      >
        {visibles.map((f, i) => (
          <FilaContigo key={f.clave} f={f} primera={i === 0} />
        ))}
        {plegable ? (
          <button
            type="button"
            className="hd-toque"
            aria-expanded={abierto}
            aria-controls={id}
            onClick={() => setAbierto((a) => !a)}
            style={{
              minHeight: TOQUE,
              padding: '0 16px',
              borderTop: '1px solid var(--twin-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              ...fuente(700, TAM.cuerpo, 1.2),
              color: 'var(--twin-accent-text)',
            }}
          >
            {abierto ? 'Ver menos' : `Ver ${resto} más`}
            <span style={{ display: 'inline-flex', transform: abierto ? 'rotate(-90deg)' : 'rotate(90deg)' }}>
              <IcoChevron tam={18} />
            </span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
