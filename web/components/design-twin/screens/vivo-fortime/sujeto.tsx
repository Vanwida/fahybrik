'use client';

// El sujeto: UNO por estado, y cuál es lo decide el modelo, no la pantalla.
//
//   SujetoMedida  → alguien lo mide, así que el sujeto es la medida corriendo.
//   SujetoTrabajo → no lo mide nadie, así que el sujeto es el trabajo que
//                   tienes delante. Aquí NO hay contador de repeticiones ni
//                   barra de progreso: la app no las sabe (CONTRATO-UI §7).
//   SujetoSello   → se acabó, y el sujeto pasa a ser el resultado.
//
// Los tres son CONTENIDO de la banda del sujeto (`MarcoVivo`), no una caja: la
// banda ya centra, ya reserva el alto y ya deja el número directo sobre el
// lienzo teñido (§10.4). Y el número grande de los tres pasa por `Numeral`
// (§10.2) — antes iban a `t-readout-hero` a pelo, o sea 72 px clavados,
// mientras el botón de la acción medía 76 pt de alto: el botón era físicamente
// más grande que la cifra que gobierna la pantalla.

import type { ReactNode } from 'react';
import { SP } from '../../kit';
import { EtiquetaSujeto, Numeral } from '../../kit-vivo';

/** La regla de salida y el pie: la voz pequeña que cierra el sujeto. */
function Pie({ children, tono = 'var(--twin-faint)' }: { children: ReactNode; tono?: string }) {
  return <span style={{ font: '500 12px/1.3 var(--twin-font-sans)', color: tono }}>{children}</span>;
}

/** Alguien lo mide: el sujeto es la medida, y corre sola. */
export function SujetoMedida({
  cifra,
  objetivo,
  cumplido,
  titulo,
  regla,
  horizontal = false,
}: {
  cifra: string;
  objetivo: string;
  cumplido: boolean;
  titulo: string;
  regla: string;
  horizontal?: boolean;
}) {
  return (
    <>
      <EtiquetaSujeto>Llevas</EtiquetaSujeto>
      <Numeral horizontal={horizontal}>{cifra}</Numeral>
      {/* Al pasar del objetivo la cifra NO se topa ahí: sigue, y la línea de
          abajo cambia de voz. Eso es lo que hace que lo tachado pueda leer
          1.014 sin que nadie lo redondee. */}
      <span className="t-readout-s" style={{ color: cumplido ? 'var(--twin-ok)' : 'var(--twin-muted)' }}>
        {cumplido ? `${objetivo} hechos · suelta` : `de ${objetivo}`}
      </span>
      <span className="t-headline-m" style={{ marginTop: SP.xs }}>
        {titulo}
      </span>
      <Pie>{regla}</Pie>
    </>
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
  horizontal = false,
}: {
  /** Nulo cuando la prescripción no trae medida: entonces manda el nombre. */
  cifra: string | null;
  titulo: string;
  carga: string | null;
  regla: string;
  pie?: string;
  horizontal?: boolean;
}) {
  return (
    <>
      <EtiquetaSujeto>Te toca</EtiquetaSujeto>
      {cifra && <Numeral horizontal={horizontal}>{cifra}</Numeral>}
      {/* Sin dosis (pasa: el circuito de pierna del coach trae cuatro), el
          nombre NO sube a la voz de instrumento: un movimiento no es una
          medida (§4). Se queda de titular y el sujeto es él. */}
      <span className={cifra ? 't-headline-m' : 't-headline-l'}>{titulo}</span>
      {carga && <span className="tw-pill">{carga}</span>}
      <Pie>{regla}</Pie>
      {pie && <Pie tono="var(--twin-muted)">{pie}</Pie>}
    </>
  );
}

// ---------------------------------------------------------------------------
// El sello — cómo acaba un For Time, con o sin cap
// ---------------------------------------------------------------------------

/**
 * El resultado, en la misma banda donde vivía la medida. Cae a la misma altura
 * que el sujeto de la estación anterior a propósito (§10.3): la pantalla de
 * «hecho» no es otra pantalla, es la misma diciendo cómo acabó.
 */
export function SujetoSello({
  label,
  cifra,
  unidad,
  titulo,
  horizontal = false,
}: {
  label: string;
  cifra: string;
  unidad?: string;
  titulo: string;
  horizontal?: boolean;
}) {
  return (
    <>
      <EtiquetaSujeto>{label}</EtiquetaSujeto>
      <Numeral horizontal={horizontal} unidad={unidad}>
        {cifra}
      </Numeral>
      <span className="t-headline-m" style={{ marginTop: SP.xs }}>
        {titulo}
      </span>
    </>
  );
}

/** Las líneas que explican el sello. Van en apoyos, no en la banda. */
export function LineasSello({ lineas }: { lineas: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'center', padding: `0 ${SP.s}px` }}>
      {lineas.map((l) => (
        <span key={l} style={{ font: '500 13px/1.4 var(--twin-font-sans)', color: 'var(--twin-muted)' }}>
          {l}
        </span>
      ))}
    </div>
  );
}
