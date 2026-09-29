'use client';

// Lo que enseña UNA carrera pasada, en las dos superficies donde aparece: como
// sujeto (la última carrera, sobre foto) y como tarjeta de «Pasadas». Mismas
// piezas, mismos datos: las hojas de estilo de los tokens hacen que valgan sobre
// la superficie oscura anidada y sobre la del tema.

import type { CSSProperties, ReactNode } from 'react';
import type { ResumenCarrera } from '../../kit-carreras/decide';
import { reloj } from '../../kit-carreras/formato';
import { IcoBaja, IcoSube } from '../../kit-dia/iconos';
import { fuente, RADIO, TABULAR, TAM, velo } from '../../kit-dia/tokens';
import { IcoBandera } from './piezas';

/**
 * Una cinta con un dato dentro. A diferencia de `Pastilla` (una sola línea), esta
 * puede partirse en dos: a 390 pt un «2:34 más rápido que tu anterior» no cabe en
 * una línea de la foto y no se recorta ni se sale.
 */
export function Cinta({ children, sobreFoto = false, icono }: { children: ReactNode; sobreFoto?: boolean; icono?: ReactNode }) {
  return (
    <span
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'flex-start',
        gap: 8,
        minHeight: 32,
        boxSizing: 'border-box',
        padding: '6px 12px',
        borderRadius: RADIO.fila,
        background: sobreFoto ? velo('var(--twin-bg)', 62) : velo('var(--twin-fg)', 8),
        border: sobreFoto ? `1px solid ${velo('var(--twin-fg)', 26)}` : undefined,
        color: 'var(--twin-fg)',
        ...fuente(700, TAM.suelo, 1.25),
        textWrap: 'pretty',
      }}
    >
      {icono ? <span style={{ display: 'inline-flex', paddingTop: 1 }}>{icono}</span> : null}
      <span>{children}</span>
    </span>
  );
}

/** Correr · Estaciones · RoxZone. Solo los que existen; si no hay ninguno, la fila entera no existe (no tres huecos). */
export function Parciales({ r, sobreFoto = false }: { r: Pick<ResumenCarrera, 'correrS' | 'estacionesS' | 'roxzoneS'>; sobreFoto?: boolean }) {
  const filas = [
    { etiqueta: 'Carrera', s: r.correrS },
    { etiqueta: 'Estaciones', s: r.estacionesS },
    { etiqueta: 'RoxZone', s: r.roxzoneS },
  ].filter((f): f is { etiqueta: string; s: number } => f.s != null);
  if (filas.length === 0) return null;
  const etiqueta: CSSProperties = { ...fuente(700, TAM.suelo, 1.2), color: sobreFoto ? 'var(--twin-fg)' : 'var(--twin-muted)' };
  return (
    <span style={{ display: 'flex', gap: 12 }} role="group" aria-label={filas.map((f) => `${f.etiqueta} ${reloj(f.s)}`).join(', ')}>
      {filas.map((f) => (
        <span key={f.etiqueta} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={etiqueta}>{f.etiqueta}</span>
          <span style={{ ...fuente(800, 28, 1.05, true), letterSpacing: '-0.02em', color: 'var(--twin-fg)', ...TABULAR }}>{reloj(f.s)}</span>
        </span>
      ))}
    </span>
  );
}

/** «2:34 más rápido que tu anterior». El color va en la marca, la cifra en tinta. */
export function PildoraDelta({ deltaS, sobreFoto = false }: { deltaS: number | null; sobreFoto?: boolean }) {
  if (deltaS == null) return null;
  if (deltaS === 0) return <Cinta sobreFoto={sobreFoto}>Igual que tu anterior</Cinta>;
  const mejor = deltaS < 0;
  return (
    <Cinta
      sobreFoto={sobreFoto}
      icono={
        <span style={{ display: 'inline-flex', color: mejor ? 'var(--twin-ok)' : 'var(--twin-warning)' }}>
          {mejor ? <IcoBaja tam={16} /> : <IcoSube tam={16} />}
        </span>
      }
    >
      <span style={TABULAR}>{reloj(Math.abs(deltaS))}</span> {mejor ? 'más rápido' : 'más lento'} que tu anterior
    </Cinta>
  );
}

/** «Puesto 412 de 1180 · top 35 %». */
export function PildoraPuesto({ texto, sobreFoto = false }: { texto: string | null; sobreFoto?: boolean }) {
  if (!texto) return null;
  return (
    <Cinta sobreFoto={sobreFoto} icono={<IcoBandera tam={16} />}>
      <span style={TABULAR}>{texto}</span>
    </Cinta>
  );
}
