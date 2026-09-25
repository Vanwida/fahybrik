'use client';

// EL BRIEF — lo que se ve al abrir lo de hoy (P13): la estructura REAL del
// coach en líneas de dato, no «N bloques». Cada fila es un grupo de pasos tal
// como lo escribió el coach («6 × 800 m @Z5 / r 2′30″ trote», «A1 Back Squat /
// 4 × 8 · 121–131 kg»), con su marca a la izquierda (naranja = trabajo de la
// parte principal, como en el aro) y el cue del coach donde lo puso (M8).
//
// Abajo, fija (la barra de watchOS 10), lo que dice si se puede salir ya: el
// GPS (o la cinta, que no lo necesita) y el pulso fijado; y «Empezar», que
// también sale con doble toque. Si no cabe en una página, la corona baja.

import type { ReactNode } from 'react';
import {
  ANCHO_UTIL,
  BotonAccion,
  C,
  Columna,
  ContextoLinea,
  Corazon,
  FILA,
  HUECO,
  SAFE,
  LIENZO,
  T,
  type Emision,
  type GestoGuion,
  type ModeloReloj,
} from '../../kit-reloj';
import { LineaAjustada, cuerpoNombre, enLineas } from './ajuste';
import { filasDePasos, hoyDe, lineaBrief, paginar, type LineaBrief } from './calculo';
import { Pila } from './pila';
import type { Sesion } from './sesiones';

// ---------------------------------------------------------------------------
// Medidas: cada fila sabe su alto antes de pintarse (nada se sale del reloj)
// ---------------------------------------------------------------------------

/**
 * Ancho de texto de una fila: el útil menos la marca y su hueco. Con más de
 * una página, los puntos de la corona viven arriba a la derecha: las filas
 * les dejan su carril (`CARRIL_PUNTOS`) para no tocarlos.
 */
const ANCHO_FILA = ANCHO_UTIL - 4 - 3 - 8;
const CARRIL_PUNTOS = 12;
const L_LINEA = 18;
const L_NOTA = 17;
const HUECO_FILAS = 8;
/** El degradado que separa la barra fija de las filas que pasan por debajo. */
const FUNDIDO = 8;
/** Lo que ocupa la barra fija de abajo: el estado de salida y el botón. */
const ALTO_BARRA = FUNDIDO + FILA.nota + HUECO + FILA.boton;
/** Lo que queda para las filas en cada página. */
const ALTO_FILAS = LIENZO.alto - SAFE.arriba - SAFE.abajo - FILA.contexto - HUECO_FILAS - ALTO_BARRA;

/** El cue del coach (M8) va con su procedencia: es coaching, no prescripción. */
const PREFIJO_CUE = 'Coach · ';

/** Las líneas de una fila, decididas de antemano: así cada fila sabe su alto. */
function lineasDeFila(f: LineaBrief, ancho: number) {
  const cuerpo = cuerpoNombre(f.linea, ancho);
  return {
    cuerpo,
    linea: enLineas(f.linea, ancho, cuerpo, 600),
    detalle: f.detalle ? enLineas(f.detalle, ancho, T.nota.cuerpo, 500, true) : [],
    cue: f.cue ? enLineas(`${PREFIJO_CUE}${f.cue}`, ancho, T.nota.cuerpo, 500) : [],
  };
}

function altoFila(f: LineaBrief, ancho: number): number {
  const l = lineasDeFila(f, ancho);
  return l.linea.length * L_LINEA + (l.detalle.length + l.cue.length) * L_NOTA;
}

/** Las páginas del brief: si no cabe en una, se vuelve a medir dejando el carril de los puntos. */
function paginasBrief(filas: LineaBrief[]): { paginas: number[][]; ancho: number } {
  const una = paginar(filas.map((f) => altoFila(f, ANCHO_FILA)), ALTO_FILAS, HUECO_FILAS);
  if (una.length === 1) return { paginas: una, ancho: ANCHO_FILA };
  const ancho = ANCHO_FILA - CARRIL_PUNTOS;
  return { paginas: paginar(filas.map((f) => altoFila(f, ancho)), ALTO_FILAS, HUECO_FILAS), ancho };
}

// ---------------------------------------------------------------------------
// Las piezas
// ---------------------------------------------------------------------------

export function FilaBrief({ f, ancho = ANCHO_FILA }: { f: LineaBrief; ancho?: number }) {
  const l = lineasDeFila(f, ancho);
  const nota = { fontSize: T.nota.cuerpo, fontWeight: 500, lineHeight: `${L_NOTA}px` } as const;
  return (
    <div style={{ display: 'flex', gap: 8, width: '100%', padding: '0 4px 0 2px', boxSizing: 'border-box' }}>
      <span
        aria-hidden
        style={{ width: 3, borderRadius: 2, flex: '0 0 auto', background: f.principal ? C.accion : C.tinta2, opacity: f.principal ? 1 : 0.38 }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: ancho }}>
        {l.linea.map((t, i) => (
          <LineaAjustada
            key={`l${i}`}
            texto={t}
            estilo={{ fontSize: l.cuerpo, fontWeight: 600, color: f.principal ? C.tinta : C.tinta2, lineHeight: `${L_LINEA}px` }}
          />
        ))}
        {l.detalle.map((t, i) => (
          <LineaAjustada key={`d${i}`} texto={t} estilo={{ ...nota, color: C.tinta2 }} />
        ))}
        {l.cue.map((t, i) => {
          const pre = i === 0 && t.startsWith(PREFIJO_CUE);
          return (
            <LineaAjustada
              key={`c${i}`}
              texto={pre ? t.slice(PREFIJO_CUE.length) : t}
              prefijo={pre ? { texto: PREFIJO_CUE, color: C.tinta2 } : undefined}
              estilo={{ ...nota, color: C.tinta }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** El anillo que gira mientras algo busca (GPS, pulso). */
export function Buscando({ talla = 13 }: { talla?: number }) {
  return (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ animation: 'ad-gira 900ms linear infinite', flex: '0 0 auto' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={C.carril} strokeWidth="3.2" />
      <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke={C.tinta2} strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

export function Hecho({ talla = 13, tono = C.tinta }: { talla?: number; tono?: string }) {
  return (
    <svg width={talla} height={talla} viewBox="0 0 24 24" aria-hidden style={{ flex: '0 0 auto' }}>
      <path d="M5 12.5 9.8 17.3 19 7.5" fill="none" stroke={tono} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export type EstadoGps = 'buscando' | 'listo';

/** Qué mide los metros y si ya está: el GPS, la cinta o nada (fuerza). */
export function necesitaGps(s: Sesion): boolean {
  return (s.familia === 'correr' || s.familia === 'circuito' || s.familia === 'libre') && s.entorno !== 'cinta';
}

/** El estado de salida: GPS (si hace falta) a la izquierda, el pulso a la derecha. */
export function Preparado({ sesion, gps, ppm }: { sesion: Sesion; gps: EstadoGps; ppm: number | null }) {
  const nota = { fontSize: T.nota.cuerpo, fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1 } as const;
  let izquierda: ReactNode;
  if (sesion.entorno === 'cinta') izquierda = <span style={{ ...nota, color: C.tinta2 }}>Cinta · sin GPS</span>;
  else if (!necesitaGps(sesion))
    // Sin GPS que esperar (fuerza): solo el pulso dice si se puede salir.
    izquierda =
      ppm == null ? (
        <span style={{ ...nota, color: C.tinta2 }}>Fijando pulso</span>
      ) : (
        <span style={{ ...nota, color: C.tinta, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Hecho />
          Listo
        </span>
      );
  else if (gps === 'buscando')
    izquierda = (
      <span style={{ ...nota, color: C.tinta2, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Buscando />
        Buscando GPS
      </span>
    );
  else
    izquierda = (
      <span style={{ ...nota, color: C.tinta, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Hecho />
        GPS listo
      </span>
    );
  return (
    <div style={{ height: FILA.nota, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 14px' }}>
      {izquierda}
      <span style={{ ...nota, display: 'inline-flex', alignItems: 'center', gap: 4, color: ppm == null ? C.tinta2 : C.tinta }}>
        <Corazon talla={12} />
        {ppm == null ? <Buscando /> : ppm}
      </span>
    </div>
  );
}

/** La barra fija de abajo: el estado de salida y «Empezar». */
export function BarraEmpezar({ children, onEmpezar, etiqueta = 'Empezar' }: { children: ReactNode; onEmpezar: () => void; etiqueta?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: `${FUNDIDO}px calc(var(--twin-safe-right) + 4px) var(--twin-safe-bottom) calc(var(--twin-safe-left) + 4px)`,
        background: `linear-gradient(180deg, rgba(0,0,0,0) 0, ${C.fondo} ${FUNDIDO}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: HUECO,
        pointerEvents: 'auto',
      }}
    >
      {children}
      <BotonAccion etiqueta={etiqueta} onPulsa={onEmpezar} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// El brief entero
// ---------------------------------------------------------------------------

const ENTORNO = { calle: 'calle', cinta: 'cinta', pista: 'pista' } as const;

export function contextoHoy(s: Sesion): string[] {
  const hoy = hoyDe(s.plan.pasos);
  const donde = s.entorno && s.familia !== 'circuito' ? ENTORNO[s.entorno] : s.familia === 'fuerza' ? 'fuerza' : s.familia === 'circuito' ? 'circuito' : null;
  return ['Hoy', hoy.dur, ...(donde ? [donde] : [])];
}

export function Brief({
  sesion,
  gps,
  ppm,
  onEmpezar,
  ultimo,
  guion,
  modelo,
  onLog,
}: {
  sesion: Sesion;
  gps: EstadoGps;
  ppm: number | null;
  onEmpezar: () => void;
  ultimo: Emision | null;
  guion?: Array<{ en: number; gesto: GestoGuion }>;
  modelo?: ModeloReloj;
  onLog: (l: string) => void;
}) {
  const filas = filasDePasos(sesion.plan.pasos).map(lineaBrief);
  const { paginas, ancho } = paginasBrief(filas);
  const contexto = contextoHoy(sesion);
  return (
    <Pila
      paginas={paginas.map((idx, k) => ({
        id: `brief-${k}`,
        titulo: paginas.length > 1 ? `Brief ${k + 1}/${paginas.length}` : 'Brief',
        contenido: (
          <Columna estilo={{ alignItems: 'stretch', gap: HUECO_FILAS }}>
            <ContextoLinea partes={contexto} tono={C.tinta2} />
            {idx.map((i) => (
              <FilaBrief key={i} f={filas[i]!} ancho={ancho} />
            ))}
          </Columna>
        ),
      }))}
      fija={
        <BarraEmpezar onEmpezar={onEmpezar}>
          <Preparado sesion={sesion} gps={gps} ppm={ppm} />
        </BarraEmpezar>
      }
      accion={{ etiqueta: 'empezar', hacer: onEmpezar }}
      ultimo={ultimo}
      guion={guion}
      modelo={modelo}
      sinLados="Antes de empezar no hay Controles ni Ahora suena: la corona recorre el brief"
      onLog={onLog}
    />
  );
}
