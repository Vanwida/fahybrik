'use client';

// Las DOS listas, juntas a propósito.
//
// `ListaDeHoy` reproduce `StrikeList` (WorkoutFormatHUDs.swift) fila a fila: dos
// líneas por ronda —«Ronda 7» y debajo su trabajo—, con relleno de 11 arriba y
// abajo. Son 54 pt por ronda, y por eso el WOD de cuatro rondas de la
// biblioteca ya no cabe en los 213 que deja la banda del sujeto.
//
// `ListaClasica` es la misma lista con el trabajo FUERA: sube a la banda y se
// escribe una vez (§10.6), así que la fila baja a una línea y a 35 pt. Eso
// compra dos rondas de lista — de tres a cinco — sin quitar nada de la pantalla.
//
// Están en el mismo fichero para que la diferencia se lea de un vistazo: es la
// misma lista, y lo único que cambia es dónde vive el trabajo.

import type { ReactNode } from 'react';
import { reloj } from '../../datos-reales';
import { Card, Hairline, IconCheckCircle, IconCircle, Label, Mono, SP } from '../../kit';
import { FILA_HOY_PT, FILA_PROPUESTA_PT, type Metcon, trabajoEnUnaLinea } from './data';

type Estado = 'hecha' | 'activa' | 'pendiente';

function estadoDe(indice: number, activa: number, cerradas: number): Estado {
  if (indice < cerradas) return 'hecha';
  return indice === activa ? 'activa' : 'pendiente';
}

/** La cabecera de la lista: cómo se llama y qué se espera que hagas con ella. */
function Cabecera({ izquierda, derecha }: { izquierda: string; derecha: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `10px ${SP.m}px`,
      }}
    >
      <Label size={10}>{izquierda}</Label>
      <span
        style={{
          font: '800 9px/1 var(--twin-font-sans)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--twin-muted)',
        }}
      >
        {derecha}
      </span>
    </div>
  );
}

function Marca({ estado }: { estado: Estado }) {
  if (estado === 'hecha') {
    return (
      <span style={{ color: 'var(--twin-ok)', display: 'inline-flex', flex: '0 0 auto' }}>
        <IconCheckCircle size={15} />
      </span>
    );
  }
  return (
    <span
      style={{
        color: estado === 'activa' ? 'var(--twin-accent-text)' : 'var(--twin-faint)',
        display: 'inline-flex',
        flex: '0 0 auto',
      }}
    >
      <IconCircle size={15} />
    </span>
  );
}

/** El cuerpo común de una fila: el fondo de la activa y su filo, y la marca. */
function Fila({
  estado,
  alto,
  children,
  cola,
}: {
  estado: Estado;
  alto: number;
  children: ReactNode;
  cola: string | null;
}) {
  const activa = estado === 'activa';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: alto - 1,
        padding: `0 ${SP.m}px`,
        background: activa ? 'color-mix(in srgb, var(--twin-accent) 8%, transparent)' : 'transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {cola && (
        <Mono size={11} weight={activa ? 700 : 600} color={activa ? 'var(--twin-accent-text)' : 'var(--twin-faint)'}>
          {cola}
        </Mono>
      )}
      <Marca estado={estado} />
    </div>
  );
}

/**
 * La cola de una fila: lo que costó la cerrada, y lo que lleva la de ahora. Una
 * pendiente no dice nada — no hay nada que decir todavía, y un guion ahí se lee
 * como un parcial de cero (§7). Es la misma regla que `StrikeList.trailing`.
 */
function colaDe(estado: Estado, indice: number, cerradas: readonly number[], parcialVivoS: number): string | null {
  if (estado === 'hecha') return reloj(cerradas[indice]);
  return estado === 'activa' ? reloj(parcialVivoS) : null;
}

export interface ListaProps {
  metcon: Metcon;
  activa: number;
  cerradas: readonly number[];
  parcialVivoS: number;
}

// ---------------------------------------------------------------------------
// HOY — `StrikeList`, fila a fila
// ---------------------------------------------------------------------------

export function ListaDeHoy({ metcon, activa, cerradas, parcialVivoS }: ListaProps) {
  const trabajo = trabajoEnUnaLinea(metcon);
  return (
    <Card padding={0} topAccent>
      <Cabecera izquierda="Recorre las rondas" derecha="marca cada ronda" />
      {Array.from({ length: metcon.rondas }, (_, i) => {
        const estado = estadoDe(i, activa, cerradas.length);
        return (
          <div key={i}>
            <Hairline />
            <Fila estado={estado} alto={FILA_HOY_PT} cola={colaDe(estado, i, cerradas, parcialVivoS)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                <span
                  style={{
                    font: `${estado === 'activa' ? 800 : 600} 14px/1.2 var(--twin-font-sans)`,
                    color: estado === 'hecha' ? 'var(--twin-faint)' : 'var(--twin-fg)',
                    textDecoration: estado === 'hecha' ? 'line-through' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {`Ronda ${i + 1}`}
                </span>
                {/* La segunda línea: el trabajo, repetido en TODAS las rondas.
                    Es la línea que multiplica el alto por el número de rondas y
                    la que la propuesta sube a la banda. */}
                <Mono size={11} weight={500} color="var(--twin-muted)">
                  {trabajo}
                </Mono>
              </div>
            </Fila>
          </div>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// LA PROPUESTA con pocas rondas — la misma lista, sin el trabajo dentro
// ---------------------------------------------------------------------------

export function ListaClasica({ metcon, activa, cerradas, parcialVivoS }: ListaProps) {
  return (
    <Card padding={0} topAccent>
      <Cabecera izquierda="Recorre las rondas" derecha={`${activa + 1} de ${metcon.rondas}`} />
      {Array.from({ length: metcon.rondas }, (_, i) => {
        const estado = estadoDe(i, activa, cerradas.length);
        return (
          <div key={i}>
            <Hairline />
            <Fila estado={estado} alto={FILA_PROPUESTA_PT} cola={colaDe(estado, i, cerradas, parcialVivoS)}>
              <span
                style={{
                  font: `${estado === 'activa' ? 800 : 600} 14px/1.2 var(--twin-font-sans)`,
                  color: estado === 'hecha' ? 'var(--twin-faint)' : 'var(--twin-fg)',
                  textDecoration: estado === 'hecha' ? 'line-through' : 'none',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'block',
                }}
              >
                {`Ronda ${i + 1}`}
              </span>
            </Fila>
          </div>
        );
      })}
    </Card>
  );
}
