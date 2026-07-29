'use client';

// El sujeto: UNO por estado, y cuál es lo decide el modelo, no la pantalla.
//
//   SujetoMedida  → alguien lo mide, así que el sujeto es la medida corriendo.
//   SujetoTrabajo → no lo mide nadie, así que el sujeto es el trabajo que
//                   tienes delante. Aquí NO hay contador de repeticiones ni
//                   barra de progreso: la app no las sabe (CONTRATO-UI §7).
//   Sello         → se acabó, y el sujeto pasa a ser el resultado.
//
// Los tamaños son los tokens de twin.css (t-readout-*, t-headline-*): aquí no
// se inventa ninguno.

import type { ReactNode } from 'react';
import { Label, Mono, RAD, SP } from '../../kit';

// ---------------------------------------------------------------------------
// El sujeto — dos caras, según quién mida
// ---------------------------------------------------------------------------

/**
 * El hueco del sujeto, y qué se hace con él.
 *
 * La estrategia es `gobierna`: el sujeto se queda todo lo que le dejen el
 * cromo y la ruta. Pero `t-readout-hero` son 72 pt y ahí se acaba la escala de
 * la app — pasar de ahí sería inventarse un tamaño, que es justo lo que
 * prohíbe el §4. Así que cuando sobra alto, `gobierna` DEGRADA A `centra`, que
 * el §6.1 contempla expresamente: el bloque se centra y el aire queda
 * simétrico. Lo que no puede pasar (y es lo que se ve en media app) es que el
 * sobrante se acumule en una cola debajo.
 */
function Marco({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center', padding: `0 ${SP.m}px` }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.xs, textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/** Alguien lo mide: el sujeto es la medida, y corre sola. */
export function SujetoMedida({
  cifra,
  objetivo,
  cumplido,
  titulo,
  regla,
}: {
  cifra: string;
  objetivo: string;
  cumplido: boolean;
  titulo: string;
  regla: string;
}) {
  return (
    <Marco>
      <Label size={10}>Llevas</Label>
      <span className="t-readout-hero" style={{ color: 'var(--twin-fg)' }}>
        {cifra}
      </span>
      {/* Al pasar del objetivo la cifra NO se topa ahí: sigue, y la línea de
          abajo cambia de voz. Eso es lo que hace que lo tachado pueda leer
          1.014 sin que nadie lo redondee. */}
      <span
        className="t-readout-s"
        style={{ color: cumplido ? 'var(--twin-ok)' : 'var(--twin-muted)' }}
      >
        {cumplido ? `${objetivo} hechos · suelta` : `de ${objetivo}`}
      </span>
      <span className="t-headline-m" style={{ marginTop: SP.xs }}>
        {titulo}
      </span>
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>{regla}</span>
    </Marco>
  );
}

/**
 * No lo mide nadie: el sujeto es el TRABAJO que tienes delante. Sin contador
 * de repeticiones, sin barra, sin porcentaje — la app no sabe cuántas llevas y
 * no lo insinúa.
 */
export function SujetoTrabajo({
  cifra,
  titulo,
  carga,
  regla,
  pie,
}: {
  /** Nulo cuando la prescripción no trae medida: entonces manda el nombre. */
  cifra: string | null;
  titulo: string;
  carga: string | null;
  regla: string;
  pie?: string;
}) {
  return (
    <Marco>
      <Label size={10}>Te toca</Label>
      {cifra && (
        <span className="t-readout-hero" style={{ color: 'var(--twin-fg)' }}>
          {cifra}
        </span>
      )}
      <span className={cifra ? 't-headline-m' : 't-headline-l'}>{titulo}</span>
      {carga && <span className="tw-pill">{carga}</span>}
      <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: 'var(--twin-faint)', marginTop: SP.xs }}>
        {regla}
      </span>
      {pie && <span style={{ font: '600 13px/1.3 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>{pie}</span>}
    </Marco>
  );
}

// ---------------------------------------------------------------------------
// Las lecturas de apoyo
// ---------------------------------------------------------------------------

export interface Celda {
  label: string;
  valor: string;
  unidad?: string;
  /** Zona de pulso, cuando la lectura es FC. Pinta el chip `tw-zone`. */
  zona?: 1 | 2 | 3 | 4 | 5;
}

/**
 * UNA baldosa de lectura, y una sola.
 *
 * `flex: 1` a propósito: en una fila se reparten el ancho (el trío del
 * retrato) y en una columna se reparten el alto (el raíl del monitor en
 * horizontal). La misma pieza sirve para las dos caras, que es justo lo que
 * evita que la misma cifra se pinte de dos maneras según cómo gires el móvil.
 */
export function Baldosa({ celda }: { celda: Celda }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: SP.xs,
        padding: `${SP.s}px ${SP.m}px`,
        borderRadius: RAD.m,
        background: 'var(--twin-surface)',
        border: '1px solid var(--twin-hairline)',
      }}
    >
      <Label size={9}>{celda.label}</Label>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
        <Mono size={20} weight={800} color={celda.zona ? `var(--twin-z${celda.zona})` : 'var(--twin-fg)'}>
          {celda.valor}
        </Mono>
        {celda.unidad && (
          <span style={{ font: '600 10px var(--twin-font-mono)', color: 'var(--twin-muted)' }}>{celda.unidad}</span>
        )}
        {celda.zona && (
          <span className="tw-zone" data-zone={celda.zona}>
            Z{celda.zona}
          </span>
        )}
      </span>
    </div>
  );
}

export function Trio({ celdas }: { celdas: Celda[] }) {
  return (
    <div style={{ display: 'flex', gap: SP.xs, flex: '0 0 auto' }}>
      {celdas.map((c) => (
        <Baldosa key={c.label} celda={c} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// El sello — cómo acaba un For Time, con o sin cap
// ---------------------------------------------------------------------------

export function Sello({
  label,
  cifra,
  unidad,
  titulo,
  lineas,
  extra,
}: {
  label: string;
  cifra: string;
  unidad?: string;
  titulo: string;
  lineas: string[];
  extra?: ReactNode;
}) {
  return (
    <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', placeItems: 'center', padding: SP.l }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SP.s, textAlign: 'center' }}>
        <Label size={10}>{label}</Label>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: SP.s }}>
          <span className="t-readout-l">{cifra}</span>
          {unidad && <Label size={11}>{unidad}</Label>}
        </span>
        <span className="t-headline-s" style={{ marginTop: SP.xs }}>
          {titulo}
        </span>
        {lineas.map((l) => (
          <span key={l} style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)', maxWidth: 280 }}>
            {l}
          </span>
        ))}
        {extra}
      </div>
    </div>
  );
}
