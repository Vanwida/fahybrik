'use client';

// LAS PIEZAS DE UN DETALLE — lo que la portada no necesita: el sujeto de una
// familia (su marca clave con su delta y su ancla, con el cascarón de «El día»),
// una tabla densa con cifras tabulares (mejores por pieza, mejores por reps,
// tramo a tramo), y la lectura sin dato como fila (con su plazo o su salida),
// para que un detalle a medio llenar no sea una silueta muda.

import type { CSSProperties, ReactNode } from 'react';
import { Abajo, Apoyo, Arriba, Hero, Titulo } from '../kit-dia/hero';
import { Rotulo } from '../kit-dia/piezas';
import { fuente, TAM } from '../kit-dia/tokens';
import { type Ancla, type Comparacion, type Familia, type FamiliaGrande, type LecturaPanel, type UnidadPanel } from './contrato';
import { cifra, unidadCorta } from './fmt';
import { AnclaChip, BotonAccion, Cuerpo, Delta, Etiqueta, Numeral, Plazo, PuntoFamilia, Superficie } from './piezas';
import { PIEL_IPHONE as P } from './tokens';
import { salidaDe } from '@fahybrid/shared/domain/running/progress';

/**
 * El sujeto de un detalle: la marca clave de la familia, en el cascarón de «El día» con tinte neutro (el
 * color de la familia va solo en su punto). Es lo único grande de la pantalla. El accesorio (la máquina en
 * ergo) va dentro, abajo. Todo el texto en la tinta del tema: sobre un tinte el gris no llega a 4,5:1.
 */
export function CabeceraFamilia({ familia, etiqueta, valor, unidad, comparacion, ancla, nota, accesorio }: { familia: Familia | FamiliaGrande; etiqueta: string; valor: number | null; unidad: UnidadPanel; comparacion?: Comparacion | null; ancla?: Ancla; nota?: string | null; accesorio?: ReactNode }) {
  const u = valor != null ? unidadCorta(unidad, valor) : '';
  return (
    <Hero tono="neutro" etiqueta={etiqueta}>
      <Arriba>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 32 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <PuntoFamilia familia={familia} talla={12} />
            <span style={{ ...fuente(800, TAM.suelo, 1.25), color: P.tinta, textWrap: 'pretty' }}>{etiqueta}</span>
          </span>
          {ancla ? <AnclaChip ancla={ancla} enSujeto /> : null}
        </span>
        {valor != null ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <Numeral texto={cifra(valor, unidad)} cuerpo={TAM.display} estilo={{ letterSpacing: '-0.025em' }} />
            {u ? <span style={{ ...fuente(700, TAM.cuerpo, 1), color: P.tinta }}>{u}</span> : null}
          </span>
        ) : null}
        {valor != null && comparacion ? <Delta comparacion={comparacion} unidad={unidad} enSujeto /> : null}
        {/* Sin cifra, lo que falta se dice justo bajo la etiqueta: el sobrante cae entre ella y el accesorio, no a media frase. */}
        {valor == null && nota ? <Apoyo tono="neutro">{nota}</Apoyo> : null}
      </Arriba>
      {(valor != null && nota) || accesorio ? (
        <Abajo>
          {valor != null && nota ? <Apoyo tono="neutro">{nota}</Apoyo> : null}
          {accesorio}
        </Abajo>
      ) : null}
    </Hero>
  );
}

/**
 * Una familia sin nada todavía: el sujeto ES el vacío (§6.2: un vacío se centra y lleva su salida). El cascarón
 * crece con el alto que sobra, así la pantalla no deja una cola muerta bajo una tarjeta.
 */
export function SujetoVacio({ familia, etiqueta, titulo, cuerpo, salida, accesorio }: { familia: Familia | FamiliaGrande; etiqueta: string; titulo: string; cuerpo: string; salida: { texto: string; onTap?: () => void }; accesorio?: ReactNode }) {
  return (
    <Hero tono="neutro" etiqueta={titulo}>
      <Arriba>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
          <PuntoFamilia familia={familia} talla={12} />
          <span style={{ ...fuente(800, TAM.suelo, 1.25), color: P.tinta }}>{etiqueta}</span>
        </span>
        <Titulo tono="neutro">{titulo}</Titulo>
        <Apoyo tono="neutro">{cuerpo}</Apoyo>
      </Arriba>
      <Abajo>
        {accesorio}
        <BotonAccion texto={salida.texto} onTap={salida.onTap} />
      </Abajo>
    </Hero>
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

/** Una tabla densa en una tarjeta: cabecera a 15, cifras tabulares, rayas finas. Nada se trunca: la celda parte. */
export function Tabla<T>({ columnas, filas, clave, etiqueta }: { columnas: Columna<T>[]; filas: T[]; clave: (f: T) => string; etiqueta: string }) {
  const grid = columnas.map((c) => c.ancho ?? 'minmax(0, 1fr)').join(' ');
  const celda = (c: Columna<T>): CSSProperties => ({ textAlign: c.alinear === 'derecha' ? 'right' : 'left', minWidth: 0, fontVariantNumeric: 'tabular-nums', textWrap: 'pretty' });
  return (
    <Superficie padding="4px 16px">
      <div role="table" aria-label={etiqueta} style={{ display: 'flex', flexDirection: 'column' }}>
        <div role="row" style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, padding: '10px 0', borderBottom: '1px solid var(--twin-hairline-strong)' }}>
          {columnas.map((c) => (
            <span key={c.id} role="columnheader" style={celda(c)}>
              <Rotulo>{c.cabecera}</Rotulo>
            </span>
          ))}
        </div>
        {filas.map((f, i) => (
          <div key={clave(f)} role="row" style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'baseline', padding: '12px 0', borderTop: i > 0 ? '1px solid var(--twin-hairline)' : undefined, ...fuente(500, TAM.cuerpo, 1.3), color: P.tinta }}>
            {columnas.map((c) => (
              <span key={c.id} role="cell" style={celda(c)}>
                {c.celda(f)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Superficie>
  );
}

/** Una lectura sin dato, como tarjeta: el título, por qué falta y su salida o su plazo. */
export function FilaSinDato({ l, onSalida }: { l: LecturaPanel; onSalida?: (texto: string) => void }) {
  const f = l.cobertura.falta;
  const salida = f ? salidaDe(f) : null;
  return (
    <Superficie estilo={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Cuerpo fuerte>{l.titulo_es}</Cuerpo>
      {f?.por === 'historia' ? (
        <>
          <Etiqueta>Todavía es pronto: {l.procedencia.explica_es}</Etiqueta>
          <Plazo llevas={Math.min(f.llevas, f.hacen)} hacen={f.hacen} />
        </>
      ) : (
        <Etiqueta>{l.procedencia.explica_es}</Etiqueta>
      )}
      {salida ? <BotonAccion texto={salida} secundario onTap={() => onSalida?.(salida)} /> : null}
    </Superficie>
  );
}
