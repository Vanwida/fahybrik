'use client';

// LAS PÁGINAS DE LA CORONA — tres formas genéricas y sus usos de correr.
//
//   PaginaFilas   «valor unidad» a 30 pt, como la vista de varias métricas de
//                 Apple: la sesión, una ronda, el volumen de fuerza.
//   PaginaSplits  la última arriba: series, rondas, minutos, km — el valor, su
//                 detalle y el veredicto a la derecha (lejos de los puntos).
//   PaginaLista   la sesión del coach como lista con lo de ahora en tinta:
//                 estructura, rotación del EMOM, la ronda del For Time.
//
//   PaginaDatos       corona ↓: la sesión entera (tiempo, distancia, ritmo
//                     medio, pulso) — el ritmo medio rotulado «medio».
//   PaginaVueltas     corona ↓↓: cada serie contra su objetivo, o cada km.
//   PaginaEstructura  corona ↓↓↓: la sesión del coach, y dónde estás.

import type { ReactNode } from 'react';
import type { FilaEstructura, Lecturas, Sesion, Vuelta, ZonasCoach } from './paso';
import { NOMBRE_CLASE_DEFECTO } from './paso';
import { Columna } from './pasos';
import { ChipZona, ContextoLinea, Corazon } from './piezas';
import {
  fmtDistancia,
  fmtDuracion,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  palabraVeredicto,
  principal,
  textoObjetivo,
  zonaDe,
} from './reglas';
import { ANCHO_CABEZA, ANCHO_PIE, C, T, anchoTexto, colorZona } from './tokens';

// ---------------------------------------------------------------------------
// Filas de dato
// ---------------------------------------------------------------------------

export interface FilaDatoVista {
  valor: string;
  unidad: string;
  /** El pulso lleva su zona. */
  ppm?: number | null;
  /** El corazón delante (la página de fuerza lo pone en el pulso). */
  glifo?: 'pulso';
}

/** Una fila «valor unidad»: el valor a 30 pt, la unidad a 15 en tinta2, y la zona si es el pulso. */
export function FilaDato({ valor, unidad, extra, glifo, alto = 38 }: { valor: string; unidad: string; extra?: ReactNode; glifo?: 'pulso'; alto?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, height: alto, width: '100%', whiteSpace: 'nowrap' }}>
      {glifo ? (
        <span style={{ alignSelf: 'center', display: 'inline-flex' }}>
          <Corazon talla={18} />
        </span>
      ) : null}
      <span style={{ fontSize: T.segundo.cuerpo, fontWeight: T.segundo.peso, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontWeight: T.nota.peso }}>{unidad}</span>
      {extra}
    </div>
  );
}

/**
 * LA PÁGINA DE FILAS — el título en tinta2 y una fila por dato. `alto` baja a
 * 34 pt cuando van cinco; `pie` es una nota bajo las filas (lo que sigue sin
 * confirmar), a ANCHO_PIE.
 */
export function PaginaFilas({
  titulo,
  filas,
  zonas,
  alto,
  sangria = 10,
  pie,
}: {
  titulo: string[];
  filas: FilaDatoVista[];
  zonas: ZonasCoach | null;
  alto?: number;
  /** Lo que se mete la columna por la izquierda, además del safe. */
  sangria?: number;
  pie?: ReactNode;
}) {
  return (
    <Columna estilo={{ alignItems: 'flex-start', paddingLeft: `calc(var(--twin-safe-left) + ${sangria}px)` }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {filas.map((f, k) => {
        const z = f.ppm != null && zonas ? zonaDe(f.ppm, zonas) : null;
        return (
          <FilaDato
            key={k}
            valor={f.valor}
            unidad={f.unidad}
            glifo={f.glifo}
            alto={alto}
            extra={z != null && zonas ? <ChipZona n={z} color={colorZona(z, zonas.techos.length)} /> : undefined}
          />
        );
      })}
      {pie ? <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>{pie}</div> : null}
    </Columna>
  );
}

/** LA SESIÓN ENTERA — lo que Apple pone en su vista de varias métricas. */
export function PaginaDatos({
  sesion,
  lecturas,
  zonas,
  fuente,
}: {
  sesion: Sesion;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
  /** Quién da los metros si no es el GPS: «cinta». Se dice, no se supone. */
  fuente?: string;
}) {
  // Los metros que vienen del móvil (cinta) y no llegan: «—», no el último valor congelado.
  const sinMetros = lecturas.viejos?.includes('hecho') ?? false;
  const d = sesion.metros != null && !sinMetros ? fmtDistancia(sesion.metros) : null;
  const ppm = lecturas.viejos?.includes('ppm') ? null : lecturas.ppm;
  return (
    <PaginaFilas
      titulo={['Sesión']}
      zonas={zonas}
      filas={[
        { valor: fmtReloj(sesion.t), unidad: 'total' },
        { valor: d ? d.valor : '—', unidad: `${d ? d.unidad : 'km'}${fuente ? ` · ${fuente}` : ''}` },
        { valor: sinMetros ? '—' : fmtRitmo(sesion.ritmoMedio), unidad: '/km medio' },
        { valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm', ppm },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Splits — la última arriba
// ---------------------------------------------------------------------------

export interface FilaSplit {
  n: string;
  valor: string;
  detalle?: string | null;
  /** El veredicto: con marca (▲▼) va en tinta y negrita; «dentro», en tinta2. */
  juicio?: { texto: string; fuera: boolean } | null;
}

// A la derecha, 10 pt libres: ahí viven los puntos de la corona (7 pt de aire
// hasta ellos). Lo que cuesta se lo devuelve el hueco entre columnas (6, no 8):
// «1·1 2:00 4:10 dentro» cabe entero, como antes.
const filaSplit = { display: 'flex', alignItems: 'baseline', height: 30, gap: 6, whiteSpace: 'nowrap', padding: '0 10px 0 4px', minWidth: 0 } as const;
const cola = { marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 } as const;

/**
 * LOS SPLITS — la última arriba (y la que se está haciendo, encima de todas).
 * `anchoN` alinea la columna del número: mide lo que su número más ancho
 * («km 12», «2·4», «3»), con `anchoN` de tope. Lo que no gasta el número es
 * del veredicto: «10:00 5:20 dentro» cabe entero con los 10 pt de los puntos.
 */
export function PaginaSplits({
  titulo,
  filas,
  enCurso,
  anchoN,
}: {
  titulo: string[];
  filas: FilaSplit[];
  enCurso?: FilaSplit | null;
  anchoN?: number;
}) {
  const ultimas = [...filas].reverse().slice(0, enCurso ? 4 : 5);
  const anchoMax = Math.max(0, ...[...(enCurso ? [enCurso] : []), ...ultimas].map((f) => Math.ceil(anchoTexto(f.n, T.nota.cuerpo, T.nota.peso))));
  const n = anchoN != null ? { width: Math.min(anchoN, anchoMax), flexShrink: 0 } : { minWidth: 22 };
  return (
    <Columna estilo={{ alignItems: 'stretch' }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {enCurso ? (
        <div style={filaSplit}>
          <span style={{ ...n, fontSize: T.nota.cuerpo, color: C.tinta, fontVariantNumeric: 'tabular-nums' }}>{enCurso.n}</span>
          <span style={{ fontSize: T.tercero.cuerpo, fontWeight: T.tercero.peso, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{enCurso.valor}</span>
          <span style={{ ...cola, fontSize: T.nota.cuerpo, color: C.tinta2 }}>{enCurso.detalle ?? 'ahora'}</span>
        </div>
      ) : null}
      {ultimas.length === 0 && !enCurso ? (
        <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 30 }}>Aún ninguna</span>
      ) : null}
      {ultimas.map((f, k) => (
        <div key={k} style={filaSplit}>
          <span style={{ ...n, fontSize: T.nota.cuerpo, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{f.n}</span>
          <span style={{ fontSize: T.tercero.cuerpo, fontWeight: T.tercero.peso, fontVariantNumeric: 'tabular-nums' }}>{f.valor}</span>
          {f.detalle ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{f.detalle}</span> : null}
          {f.juicio ? (
            <span style={{ ...cola, fontSize: T.nota.cuerpo, fontWeight: f.juicio.fuera ? 700 : T.nota.peso, color: f.juicio.fuera ? C.tinta : C.tinta2 }}>
              {f.juicio.texto}
            </span>
          ) : null}
        </div>
      ))}
    </Columna>
  );
}

/** El veredicto de una vuelta, dicho para la lista: «▲ rápido», «dentro». */
export function juicioDe(v: Vuelta): FilaSplit['juicio'] {
  if (!v.veredicto) return null;
  const j = palabraVeredicto(v.eje ?? 'ritmo', v.veredicto);
  return { texto: j.marca ? `${j.marca} ${j.texto}` : j.texto, fuera: !!j.marca };
}

/**
 * LAS VUELTAS — la última arriba. En series: el tiempo, el ritmo y el
 * veredicto contra el objetivo de ESA serie; en rodajes, cada km.
 */
export function PaginaVueltas({
  vueltas,
  objetivo,
  enCurso,
}: {
  vueltas: Vuelta[];
  /** El objetivo de las series, para la cabecera: «Series · 3:45–3:55». */
  objetivo?: string | null;
  /** La vuelta que se está corriendo: «3 · ahora · 616 m». */
  enCurso?: { n: string; valor: string } | null;
}) {
  const ultimas = [...vueltas].reverse().slice(0, enCurso ? 4 : 5);
  const series = vueltas.some((v) => v.clase !== 'km') || (vueltas.length === 0 && !!objetivo);
  const titulo = series ? 'Series' : 'Kilómetros';
  const filas: FilaSplit[] = vueltas.map((v) => {
    // Una serie por TIEMPO siempre dura lo mismo: su resultado son los metros.
    const porTiempo = v.clase !== 'km' && ultimas.every((x) => x.segundos === v.segundos) && ultimas.length > 1;
    const detalle =
      v.clase !== 'km' && v.metros != null && v.metros !== 1000 ? fmtRitmo(v.ritmo) : v.clase === 'km' && v.ppm != null ? `${v.ppm} ppm` : null;
    return {
      n: v.clase === 'km' ? `km ${v.n}` : v.tanda ? `${v.tanda}·${v.n}` : String(v.n),
      valor: porTiempo && v.metros != null ? `${v.metros} m` : fmtReloj(v.segundos),
      detalle,
      juicio: juicioDe(v),
    };
  });
  return <PaginaSplits titulo={objetivo ? [titulo, objetivo] : [titulo]} filas={filas} enCurso={enCurso} anchoN={34} />;
}

// ---------------------------------------------------------------------------
// Lista — la sesión del coach, y dónde estás
// ---------------------------------------------------------------------------

/** Una fila de las páginas de lista (Estructura, Tarea, Rotación). */
export interface FilaLista {
  linea: string;
  detalle?: string | null;
  estado: 'hecho' | 'ahora' | 'pendiente';
}

/** Cuántas filas caben en la página sin hacer scroll: se enseña una ventana alrededor de «ahora». */
const FILAS_VISIBLES = 4;

/** El pie de una página: la última fila, así que cabe en ANCHO_PIE (las esquinas de abajo). */
function Pie({ children }: { children: string }) {
  return (
    <span style={{ alignSelf: 'center', maxWidth: ANCHO_PIE, fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 'auto', lineHeight: 1.2, textWrap: 'balance' }}>
      {children}
    </span>
  );
}

/**
 * LA LISTA — lo hecho apagado y lo de ahora en tinta. Si no cabe, una ventana:
 * la fila anterior, la de ahora y las que vienen. Cada fila en dos líneas (qué
 * · contra qué), sin pasar de 15 pt. `pie`: una nota al fondo («quedan 6:18»).
 */
export function PaginaLista({ titulo, filas, pie }: { titulo: string[]; filas: FilaLista[]; pie?: string | null }) {
  const ahora = Math.max(0, filas.findIndex((f) => f.estado === 'ahora'));
  const cabe = pie ? FILAS_VISIBLES - 1 : FILAS_VISIBLES;
  const desde = Math.max(0, Math.min(ahora - 1, filas.length - cabe));
  const ventana = filas.slice(desde, desde + cabe);
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 8 }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {ventana.map((f, k) => {
        const esAhora = f.estado === 'ahora';
        return (
          <div key={desde + k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0 4px', maxWidth: ANCHO_CABEZA }}>
            <span
              aria-hidden
              style={{
                marginTop: 5,
                width: 8,
                height: 8,
                borderRadius: 4,
                flex: '0 0 auto',
                background: esAhora ? C.tinta : f.estado === 'hecho' ? C.tinta2 : 'transparent',
                boxShadow: f.estado === 'pendiente' ? `inset 0 0 0 1.5px ${C.tinta2}` : undefined,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
              <span style={{ fontSize: T.contexto.cuerpo, fontWeight: T.contexto.peso, color: esAhora ? C.tinta : C.tinta2, lineHeight: 1.15 }}>
                {f.linea}
              </span>
              {f.detalle ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, lineHeight: 1.15 }}>{f.detalle}</span> : null}
            </div>
          </div>
        );
      })}
      {pie ? <Pie>{pie}</Pie> : null}
    </Columna>
  );
}

const MODO = { trote: 'trote', andar: 'caminando', parado: 'parado' } as const;

/** Una fila de la estructura en dos líneas: el bloque y contra qué (con la notación de `textoObjetivo`). */
export function textoFila(f: FilaEstructura): { linea: string; detalle: string | null } {
  const o = principal(f.trabajo);
  const objetivo = o ? textoObjetivo(o) : null;
  const rec = f.recupera
    ? `r ${fmtPrescrito(f.recupera.medida)} ${MODO[f.recupera.modoRecupera ?? 'trote']}`
    : null;
  const quien = f.trabajo.nombre ? `${f.trabajo.nombre} · ` : '';
  if (f.tandas && f.veces) {
    const dentro = `${f.veces} × ${fmtPrescrito(f.trabajo.medida)}${f.recupera ? ` / ${fmtPrescrito(f.recupera.medida)}` : ''}`;
    const entre = `${fmtDuracion(f.tandas.descanso.medida.prescrito ?? 0)} entre tandas`;
    return { linea: `${f.tandas.veces} × (${dentro})`, detalle: [objetivo, rec, entre].filter(Boolean).join(' · ') };
  }
  if (f.veces) {
    return { linea: `${f.veces} × ${quien}${fmtPrescrito(f.trabajo.medida)}`, detalle: [objetivo, rec].filter(Boolean).join(' · ') || null };
  }
  const tramo = f.trabajo.posicion?.tramo;
  const nombre = tramo ? `Tramo ${tramo.n}/${tramo.de}` : (f.trabajo.nombre ?? NOMBRE_CLASE_DEFECTO[f.trabajo.clase]);
  return { linea: `${nombre} · ${fmtPrescrito(f.trabajo.medida)}`, detalle: objetivo };
}

/** LA ESTRUCTURA — la sesión del coach entera: la lista con cada bloque en dos líneas. */
export function PaginaEstructura({ filas }: { filas: FilaEstructura[] }) {
  return <PaginaLista titulo={['Estructura']} filas={filas.map((f) => ({ ...textoFila(f), estado: f.estado }))} />;
}
