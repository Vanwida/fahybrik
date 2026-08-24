'use client';

// Las piezas de la ficha. Todas leen la dosis por `dosisConSeries()` y ninguna
// escribe un color a mano: si un ítem llega sin medida, aquí se pinta el nombre
// solo, sin un «— reps» ni un 0 de relleno (CONTRATO-UI §7).

import type { CSSProperties, ReactNode } from 'react';
import {
  COLOR_MODALIDAD,
  dosisConSeries,
  dosisDeCarrera,
  reloj,
  type BloqueReal,
  type ItemReal,
} from '../../datos-reales';
import { IconChevron, Label, SP } from '../../kit';
import { fichaDe, palabraMovimientos } from './data';
import { FrameVideo } from './siluetas';

/** Ancho de la miniatura de fila. 84 es lo que cabe dejando la dosis legible. */
const MINI = { normal: 84, estructural: 62 } as const;

// ---------------------------------------------------------------------------
// La ficha se compone escalonada
// ---------------------------------------------------------------------------

export function Aparece({
  visible,
  children,
  style,
}: {
  visible: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : 'translateY(12px)',
        transition: 'opacity 340ms ease-out, transform 340ms cubic-bezier(0.22, 1, 0.36, 1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modalidad y material
// ---------------------------------------------------------------------------

export function PuntoModalidad({ item, size = 7 }: { item: ItemReal; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLOR_MODALIDAD[item.modalidad],
        flex: '0 0 auto',
      }}
    />
  );
}

export function Material({ cosas }: { cosas: string[] }) {
  if (cosas.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.s }}>
      <Label size={10}>Material</Label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cosas.map((cosa) => (
          <span key={cosa} className="tw-pill" style={{ padding: '5px 10px', fontSize: 12 }}>
            {cosa}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// La dosis — una sola grafía, y el hueco se ve
// ---------------------------------------------------------------------------

export function LineaDosis({ item, grande = false }: { item: ItemReal; grande?: boolean }) {
  const dosis = dosisConSeries(item);
  const carrera = dosisDeCarrera(item);
  const extras: string[] = [];
  if (carrera) {
    // Una carrera con ESTRUCTURA se cuenta por sus tramos: el objetivo y la
    // recuperación salen de ellos, no del aplanado que hay al lado — que aquí
    // escribía «descanso 1:00» de un minuto que se corre al trote en Z2.
    if (carrera.objetivo) extras.push(carrera.objetivo);
    if (carrera.detalle) extras.push(carrera.detalle);
  } else {
    if (item.objetivo) extras.push(item.objetivo);
    if (item.fraseRelativa) extras.push(item.fraseRelativa);
    // «45s» por debajo del minuto, reloj a partir de ahí: la variante en segundos
    // de `Formato.clock`, que es con la que la app escribe los descansos.
    if (item.descansoS) extras.push(`descanso ${reloj(item.descansoS, 'segundos')}`);
  }
  if (!dosis && extras.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
      {dosis && (
        <span
          style={{
            font: `700 ${grande ? 24 : 15}px/1.1 var(--twin-font-mono)`,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-fg)',
          }}
        >
          {dosis}
        </span>
      )}
      {extras.length > 0 && (
        <span
          style={{
            font: `500 ${grande ? 14 : 12}px/1.3 var(--twin-font-sans)`,
            color: dosis ? 'var(--twin-muted)' : 'var(--twin-fg)',
          }}
        >
          {extras.join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * Los huecos del método, contados y dichos una vez por bloque. Se declara
 * porque el atleta SÍ tiene un acto concreto con el que llenarlo: preguntarle
 * al coach en el box (§6.2 bis). Cuatro etiquetas «sin dosis», una por fila,
 * serían la misma verdad convertida en ruido.
 */
export function AvisoSinDosis({ cuantos, coach }: { cuantos: number; coach?: string }) {
  if (cuantos === 0) return null;
  const quien = coach ?? 'tu coach';
  return (
    <p
      style={{
        margin: 0,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'color-mix(in srgb, var(--twin-warning) 13%, transparent)',
        font: '500 12px/1.4 var(--twin-font-sans)',
        color: 'var(--twin-fg)',
      }}
    >
      {cuantos === 1
        ? `Un movimiento viene sin cuánto. Pregúntale a ${quien} en el box.`
        : `${cuantos} movimientos vienen sin cuánto. Pregúntale a ${quien} en el box.`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// La fila de ejercicio
// ---------------------------------------------------------------------------

const RESET_BOTON: CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 0,
  padding: 0,
  margin: 0,
  color: 'inherit',
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
  width: '100%',
};

export function FilaItem({
  item,
  numero,
  estructural = false,
  onAbrir,
}: {
  item: ItemReal;
  numero?: number;
  estructural?: boolean;
  onAbrir: (item: ItemReal) => void;
}) {
  const ficha = fichaDe(item.nombre);
  return (
    <button
      type="button"
      style={{ ...RESET_BOTON, display: 'flex', alignItems: 'center', gap: SP.m, padding: '8px 0' }}
      onClick={() => onAbrir(item)}
      aria-label={`Ver ${item.nombre}`}
    >
      {numero !== undefined && (
        <span
          style={{
            font: '700 11px/1 var(--twin-font-mono)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--twin-faint)',
            width: 15,
            flex: '0 0 auto',
          }}
        >
          {numero}
        </span>
      )}
      <FrameVideo
        pose={ficha.pose}
        videoS={ficha.videoS}
        tinte={COLOR_MODALIDAD[item.modalidad]}
        ancho={estructural ? MINI.estructural : MINI.normal}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <PuntoModalidad item={item} size={estructural ? 6 : 7} />
          <span
            style={{
              font: `600 ${estructural ? 13 : 15}px/1.2 var(--twin-font-sans)`,
              color: 'var(--twin-fg)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.nombre}
          </span>
        </div>
        <LineaDosis item={item} />
      </div>
      <span style={{ color: 'var(--twin-faint)', display: 'inline-flex', flex: '0 0 auto' }}>
        <IconChevron size={12} />
      </span>
    </button>
  );
}

/**
 * El caso corto — 9 de cada 11 asignaciones son 1 bloque / 1 ítem. Con tan poco
 * que contar, el vídeo pasa de miniatura a sujeto y las claves del coach suben
 * a la ficha en vez de esperar dentro del detalle: el hueco se gana con lo que
 * da sentido al trabajo, nunca con aire (§6.1 y §6.2).
 */
export function TarjetaItem({ item, onAbrir }: { item: ItemReal; onAbrir: (item: ItemReal) => void }) {
  const ficha = fichaDe(item.nombre);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}>
      <button
        type="button"
        style={{ ...RESET_BOTON, display: 'flex', flexDirection: 'column', gap: SP.m }}
        onClick={() => onAbrir(item)}
        aria-label={`Ver ${item.nombre}`}
      >
        <FrameVideo pose={ficha.pose} videoS={ficha.videoS} tinte={COLOR_MODALIDAD[item.modalidad]} grande />
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.s, width: '100%' }}>
          <PuntoModalidad item={item} size={8} />
          <span style={{ font: 'italic 800 20px/1.15 var(--twin-font-sans)', color: 'var(--twin-fg)', flex: 1 }}>
            {item.nombre}
          </span>
          <span style={{ color: 'var(--twin-faint)', display: 'inline-flex' }}>
            <IconChevron size={13} />
          </span>
        </div>
        <LineaDosis item={item} grande />
      </button>
      <Claves claves={ficha.claves} />
    </div>
  );
}

/** Las dos o tres cosas que el coach repite. Vive aquí porque la ficha corta y
 * el detalle enseñan LA MISMA lista, y dos copias divergen (§0). */
export function Claves({ claves }: { claves: string[] }) {
  if (claves.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SP.m }}>
      <Label size={10}>Las claves</Label>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: SP.m }}>
        {claves.map((clave, i) => (
          <li key={clave} style={{ display: 'flex', gap: SP.m, alignItems: 'flex-start' }}>
            <span
              style={{
                font: '700 12px/1.5 var(--twin-font-mono)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--twin-accent-text)',
                flex: '0 0 auto',
              }}
            >
              {i + 1}
            </span>
            <span style={{ font: '400 14px/1.45 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>{clave}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El bloque
// ---------------------------------------------------------------------------

export function CabeceraBloque({
  bloque,
  numero,
  total,
}: {
  bloque: BloqueReal;
  numero: number;
  total: number;
}) {
  // Con un bloque único, el título de la sesión YA es el del bloque: repetirlo
  // debajo (y con un «Bloque 1 de 1» encima) es decir tres veces lo mismo antes
  // de llegar al ejercicio. Solo sobrevive el formato, que sí añade.
  if (total === 1) {
    if (!bloque.formato) return null;
    return (
      <span className="tw-pill" style={{ alignSelf: 'flex-start', padding: '4px 9px', fontSize: 11 }}>
        {bloque.formato}
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <Label size={10} color="var(--twin-accent-text)">
        Bloque {numero} de {total}
      </Label>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.s, flexWrap: 'wrap' }}>
        <span className="t-headline-s" style={{ color: 'var(--twin-fg)' }}>
          {bloque.titulo}
        </span>
        {bloque.formato && (
          <span className="tw-pill" style={{ padding: '4px 9px', fontSize: 11 }}>
            {bloque.formato}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * El mapa del bloque: un segmento por ítem, del color de su modalidad. En la
 * simulación HYROX enseña de un vistazo la alternancia correr/estación, que es
 * la forma de la prueba. Con menos de cuatro ítems no hay forma que enseñar.
 */
export function Carril({ items }: { items: ItemReal[] }) {
  if (items.length < 4) return null;
  return (
    <div aria-hidden style={{ display: 'flex', gap: 2, height: 4 }}>
      {items.map((item, i) => (
        <span
          key={`${item.nombre}-${i}`}
          style={{ flex: 1, borderRadius: 2, background: COLOR_MODALIDAD[item.modalidad], opacity: 0.85 }}
        />
      ))}
    </div>
  );
}

/**
 * Calentamiento y vuelta a la calma, plegados. Es la regla 4 del §6: lo
 * secundario se pliega. Solo se pliega cuando la sesión desborda de verdad;
 * en un circuito de once ítems no hay nada que ahorrar y van abiertos.
 */
export function TiraEstructural({
  bloque,
  abierto,
  onAlternar,
}: {
  bloque: BloqueReal;
  abierto: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      style={{
        ...RESET_BOTON,
        display: 'flex',
        alignItems: 'center',
        gap: SP.m,
        padding: '11px 13px',
        borderRadius: 12,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <span style={{ display: 'flex', gap: 3 }} aria-hidden>
        {bloque.items.map((item, i) => (
          <span
            key={`${item.nombre}-${i}`}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: COLOR_MODALIDAD[item.modalidad],
            }}
          />
        ))}
      </span>
      <span style={{ flex: 1, font: '600 13px/1.2 var(--twin-font-sans)', color: 'var(--twin-fg)' }}>
        {bloque.titulo}
      </span>
      <span style={{ font: '500 12px/1.2 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
        {bloque.items.length} {palabraMovimientos(bloque.items.length)}
      </span>
      <span
        style={{
          color: 'var(--twin-faint)',
          display: 'inline-flex',
          transform: abierto ? 'rotate(90deg)' : 'none',
          transition: 'transform 180ms ease-out',
        }}
      >
        <IconChevron size={12} />
      </span>
    </button>
  );
}
