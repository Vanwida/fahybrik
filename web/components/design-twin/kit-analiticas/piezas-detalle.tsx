'use client';

// LAS PIEZAS DE UN DETALLE — lo que la portada no necesita: la cabecera fija
// de una familia (la marca clave con su delta y su ancla), una tabla densa
// con cifras tabulares (mejores por pieza, mejores por reps, tramo a tramo),
// y la lectura sin dato como fila (con su plazo o su salida), para que un
// detalle a medio llenar no sea una silueta muda.

import type { CSSProperties, ReactNode } from 'react';
import { ANCLA_ETIQUETA, type Ancla, type Comparacion, type Familia, type FamiliaGrande, type LecturaPanel, type UnidadPanel } from './contrato';
import { cifra, fechaLegible, unidadCorta } from './fmt';
import { AnclaChip, BotonAccion, Delta, Etiqueta, Cuerpo, Numeral, Plazo, PuntoFamilia, Sello, Superficie } from './piezas';
import { PIEL_IPHONE as P, TA } from './tokens';
import { salidaDe } from '@fahybrid/shared/domain/running/progress';

/** La cabecera que no se va en un detalle: la marca clave de la familia. */
export function CabeceraFamilia({ familia, etiqueta, valor, unidad, comparacion, ancla, nota, accesorio }: { familia: Familia | FamiliaGrande; etiqueta: string; valor: number | null; unidad: UnidadPanel; comparacion?: Comparacion | null; ancla?: Ancla; nota?: string | null; accesorio?: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {accesorio}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PuntoFamilia familia={familia} />
        <Etiqueta>{etiqueta}</Etiqueta>
        {ancla ? <AnclaChip ancla={ancla} /> : null}
      </div>
      {valor != null ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
            <Numeral texto={cifra(valor, unidad)} cuerpo={TA.dato.cuerpo} />
            {unidadCorta(unidad, valor ?? undefined) ? <Etiqueta>{unidadCorta(unidad, valor ?? undefined)}</Etiqueta> : null}
          </span>
          {comparacion ? <Delta comparacion={comparacion} unidad={unidad} /> : null}
        </div>
      ) : null}
      {nota ? <Etiqueta estilo={{ textWrap: 'pretty' }}>{nota}</Etiqueta> : null}
    </div>
  );
}

export interface Columna<T> {
  id: string;
  cabecera: string;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
  /** Ancho CSS; sin él, se reparte. */
  ancho?: string;
}

/** Una tabla densa: cabecera en tinta2 a 15 pt, cifras tabulares, rayas finas. Nada se trunca: la celda parte. */
export function Tabla<T>({ columnas, filas, clave, etiqueta }: { columnas: Columna<T>[]; filas: T[]; clave: (f: T) => string; etiqueta: string }) {
  const grid = columnas.map((c) => c.ancho ?? 'minmax(0, 1fr)').join(' ');
  const celda = (c: Columna<T>): CSSProperties => ({ textAlign: c.alinear === 'derecha' ? 'right' : 'left', minWidth: 0, fontVariantNumeric: 'tabular-nums', textWrap: 'pretty' });
  return (
    <div role="table" aria-label={etiqueta} style={{ display: 'flex', flexDirection: 'column' }}>
      <div role="row" style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, padding: '4px 0 8px', borderBottom: `1px solid ${P.rejilla}` }}>
        {columnas.map((c) => (
          <span key={c.id} role="columnheader" style={celda(c)}>
            <Etiqueta>{c.cabecera}</Etiqueta>
          </span>
        ))}
      </div>
      {filas.map((f) => (
        <div key={clave(f)} role="row" style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'baseline', padding: '10px 0', borderBottom: `1px solid ${P.rejilla}`, font: `500 ${TA.cuerpo.cuerpo}px/1.3 ${P.fuente}`, color: P.tinta }}>
          {columnas.map((c) => (
            <span key={c.id} role="cell" style={celda(c)}>
              {c.celda(f)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Una lectura sin dato, como fila: el título, por qué falta y su salida o su plazo. */
export function FilaSinDato({ l, onSalida }: { l: LecturaPanel; onSalida?: (texto: string) => void }) {
  const f = l.cobertura.falta;
  const salida = f ? salidaDe(f) : null;
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Cuerpo fuerte>{l.titulo_es}</Cuerpo>
      {f?.por === 'historia' ? (
        <>
          <Etiqueta>Todavía es pronto: {l.procedencia.explica_es}</Etiqueta>
          <Plazo llevas={Math.min(f.llevas, f.hacen)} hacen={f.hacen} />
        </>
      ) : (
        <Etiqueta estilo={{ textWrap: 'pretty' }}>{l.procedencia.explica_es}</Etiqueta>
      )}
      {salida ? <BotonAccion texto={salida} secundario onTap={() => onSalida?.(salida)} /> : null}
    </Superficie>
  );
}

/** «12 sep · antes 3:58 · declarado»: la línea de apoyo de una marca. */
export function ApoyoMarca({ fecha, hoy, anterior, ancla }: { fecha: string | null; hoy: string; anterior?: string | null; ancla?: Ancla }) {
  const partes = [fecha ? fechaLegible(fecha, hoy) : null, anterior ? `antes ${anterior}` : null, ancla && ancla !== 'medida' ? ANCLA_ETIQUETA[ancla] : null].filter(Boolean);
  return <Etiqueta>{partes.join(' · ')}</Etiqueta>;
}

export { Sello };
