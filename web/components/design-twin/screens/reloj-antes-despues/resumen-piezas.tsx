'use client';

// LAS PIEZAS DEL RESUMEN — lo común a correr, fuerza y circuito: el estado de
// guardado (con el lenguaje del móvil), la página del pulso con las zonas del
// coach y la página final con «Listo».
//
// El guardado, honesto (DECISIONS 25-09, acuses del reloj): el sobre sigue en
// el reloj hasta que el móvil acusa. «Guardado» solo cuando el servidor dijo
// que sí; «En cola» cuando lo tiene el móvil sin cobertura; «Guardado en tu
// móvil» si el servidor lo rechazó (la misma frase que el resumen del móvil).
// Nunca «Guardado en el iPhone» mientras solo esté en cola (P1-17).

import type { ReactNode } from 'react';
import {
  ANCHO_CABEZA,
  ANCHO_PIE,
  BotonAccion,
  C,
  ChipZona,
  Columna,
  ContextoLinea,
  FILA,
  Nota,
  RPE_PALABRA_DEFECTO,
  T,
  colorZona,
  cuerpoQueCabe,
  fmtReloj,
} from '../../kit-reloj';
import type { EstadoGuardado, Resultado } from './calculo';

// ---------------------------------------------------------------------------
// El estado de guardado
// ---------------------------------------------------------------------------

export const GUARDADO: Record<EstadoGuardado, { corto: string; titulo: string; detalle: string }> = {
  'en-reloj': { corto: 'En tu reloj', titulo: 'En tu reloj', detalle: 'Pasa al móvil cuando lo tengas cerca' },
  'en-cola': { corto: 'En cola · sin conexión', titulo: 'En cola', detalle: 'Sube al tener conexión' },
  guardado: { corto: 'Guardado', titulo: 'Guardado', detalle: 'Ya lo tiene tu coach' },
  'en-movil': { corto: 'Guardado en tu móvil', titulo: 'Guardado en tu móvil', detalle: 'No se ha podido subir. Lo estamos revisando; no tienes que hacer nada.' },
};

/** El glifo de cada estado: reloj, nube que sube, visto, móvil. Monocromo: el verde es de una zona. */
export function GlifoGuardado({ estado, talla = 14 }: { estado: EstadoGuardado; talla?: number }) {
  const p = { fill: 'none', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const tono = estado === 'guardado' || estado === 'en-movil' ? C.tinta : C.tinta2;
  return (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      {estado === 'guardado' ? <path d="M4.5 12.5 9.5 17.5 19.5 6.5" stroke={tono} {...p} strokeWidth={2.8} /> : null}
      {estado === 'en-cola' ? (
        <>
          <path d="M7 18.5h10a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.2 10.6 4 4 0 0 0 7 18.5Z" stroke={tono} {...p} />
          <path d="M12 16v-5.5M9.5 12.8 12 10.3l2.5 2.5" stroke={tono} {...p} />
        </>
      ) : null}
      {estado === 'en-reloj' ? (
        <>
          <rect x="6.5" y="6" width="11" height="12" rx="3.2" stroke={tono} {...p} />
          <path d="M9 6V3.5h6V6M9 18v2.5h6V18" stroke={tono} {...p} />
        </>
      ) : null}
      {estado === 'en-movil' ? (
        <>
          <rect x="6.8" y="2.5" width="10.4" height="19" rx="2.8" stroke={tono} {...p} />
          <path d="M11 5.4h2M10.2 18.6h3.6" stroke={tono} {...p} strokeWidth={1.8} />
        </>
      ) : null}
    </svg>
  );
}

/** La línea corta de la página 1, abajo (cabe en `ANCHO_PIE`). */
export function LineaGuardado({ estado }: { estado: EstadoGuardado }) {
  const fuerte = estado === 'guardado' || estado === 'en-movil';
  return (
    <div style={{ height: FILA.nota, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, maxWidth: ANCHO_PIE, whiteSpace: 'nowrap' }}>
      <GlifoGuardado estado={estado} />
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: fuerte ? 600 : 500, color: fuerte ? C.tinta : C.tinta2 }}>{GUARDADO[estado].corto}</span>
    </div>
  );
}

const palabraRpe = (v: number) => (v === 0 ? 'nada' : (RPE_PALABRA_DEFECTO[v] ?? ''));

/** La última página: dónde está la sesión, el RPE que se dio y «Listo». */
export function PaginaGuardado({ estado, rpe, onListo }: { estado: EstadoGuardado; rpe: number | null; onListo: () => void }) {
  const g = GUARDADO[estado];
  return (
    <Columna estilo={{ justifyContent: 'center', gap: 6 }}>
      <GlifoGuardado estado={estado} talla={28} />
      <span style={{ fontSize: cuerpoQueCabe(g.titulo, T.tercero.cuerpo, ANCHO_PIE), fontWeight: 600, lineHeight: 1.1, whiteSpace: 'nowrap' }}>{g.titulo}</span>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, textAlign: 'center', lineHeight: 1.15, textWrap: 'balance', maxWidth: ANCHO_CABEZA }}>
        {g.detalle}
      </span>
      <Nota>{rpe == null ? 'Sin RPE' : `RPE ${rpe} · ${palabraRpe(rpe)}`}</Nota>
      <div style={{ width: '100%', padding: '0 4px', boxSizing: 'border-box', marginTop: 2 }}>
        <BotonAccion etiqueta="Listo" onPulsa={onListo} />
      </div>
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// El pulso y las zonas del coach
// ---------------------------------------------------------------------------

export function PaginaPulso({ r }: { r: Resultado }) {
  const n = r.zonas.techos.length;
  const max = Math.max(1, ...r.zonasS);
  const alto = n <= 5 ? 20 : n <= 7 ? 17 : 15;
  return (
    <Columna estilo={{ gap: 6 }}>
      <ContextoLinea partes={['Pulso', 'ppm']} tono={C.tinta2} />
      {/* Medio y máximo, sin pasar de ANCHO_PIE: arriba a la derecha viven los puntos de la corona. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, height: FILA.tercero, maxWidth: ANCHO_PIE, whiteSpace: 'nowrap', lineHeight: 1 }}>
        <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600 }}>{r.ppmMedio == null ? '—' : Math.round(r.ppmMedio)}</span>
        <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>medio</span>
        {r.ppmMax != null ? (
          <>
            <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, margin: '0 1px' }}>·</span>
            <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600 }}>{r.ppmMax}</span>
            <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>máx</span>
          </>
        ) : null}
      </div>
      {Array.from({ length: n }, (_, i) => {
        const s = r.zonasS[i] ?? 0;
        const color = colorZona(i + 1, n);
        return (
          // La columna del tiempo se ajusta a «1:03:20» (una tirada larga): lo que cede es la barra.
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', alignItems: 'center', gap: 6, width: ANCHO_PIE, height: alto }}>
            <ChipZona n={i + 1} color={color} />
            <span style={{ height: 8, borderRadius: 4, background: C.carril, position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', inset: 0, width: `${(s / max) * 100}%`, background: color, borderRadius: 4 }} />
            </span>
            <span style={{ minWidth: 40, fontSize: T.nota.cuerpo, color: s > 0 ? C.tinta : C.tinta2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {s > 0 ? fmtReloj(s) : '—'}
            </span>
          </div>
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Filas de dato
// ---------------------------------------------------------------------------

/** Un dato de 22 pt con su unidad a 15: «11,62 km · 55:18», «3:48 /km en las series». */
export function Dato({ valor, unidad, etiqueta, tono = C.tinta }: { valor: string; unidad?: string; etiqueta?: string; tono?: string }) {
  return (
    <div style={{ height: FILA.tercero, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap', lineHeight: 1 }}>
      {etiqueta ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{etiqueta}</span> : null}
      <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600, color: tono }}>{valor}</span>
      {unidad ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{unidad}</span> : null}
    </div>
  );
}

/**
 * El ancho de una fila de lista: el de la primera fila (`ANCHO_CABEZA`) menos
 * el carril de los puntos de la corona, que viven arriba a la derecha.
 */
const ANCHO_FILA_LISTA = ANCHO_CABEZA - 4;

/**
 * Una fila de lista con columnas: número, valor grande, apoyo y el juicio a la
 * derecha. «6 · 2:48 · 3:30 · dentro» cabe sin encoger ninguna columna.
 */
export function FilaLista({
  n,
  valor,
  apoyo,
  derecha,
  tenue = false,
  apagado = false,
  anchoN = 24,
}: {
  n: string;
  valor: string;
  apoyo?: string | null;
  derecha?: ReactNode;
  /** La fila entera atenuada: lo que no se hizo. */
  tenue?: boolean;
  /** Solo el apoyo atenuado: lo que se quedó con el valor por defecto (P11). */
  apagado?: boolean;
  /** Ancho de la columna del número («0,49» del último km parcial necesita más). */
  anchoN?: number;
}) {
  const fijo = { flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, height: 24, width: ANCHO_FILA_LISTA, whiteSpace: 'nowrap', opacity: tenue ? 0.55 : 1 }}>
      <span style={{ ...fijo, fontSize: T.nota.cuerpo, color: C.tinta2, width: anchoN }}>{n}</span>
      <span style={{ ...fijo, fontSize: T.tercero.cuerpo, fontWeight: 600, lineHeight: 1 }}>{valor}</span>
      {apoyo ? <span style={{ ...fijo, fontSize: T.nota.cuerpo, color: C.tinta2, opacity: apagado ? 0.6 : 1 }}>{apoyo}</span> : null}
      <span style={{ marginLeft: 'auto', fontSize: T.nota.cuerpo }}>{derecha}</span>
    </div>
  );
}
