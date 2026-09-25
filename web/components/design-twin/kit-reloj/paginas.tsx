'use client';

// LAS PÁGINAS FIJAS — las de la gramática de Apple Entreno (P4).
//
//   PaginaControles  izquierda: Pausa/Reanudar, Siguiente paso o Vuelta,
//                    Water Lock, Terminar (→ «¿Terminar y guardar?»).
//   PaginaDatos      corona ↓: la sesión entera (tiempo, distancia, ritmo
//                    medio, pulso) — el ritmo medio rotulado «medio», nunca
//                    «ritmo» a secas.
//   PaginaVueltas    corona ↓↓: cada serie contra su objetivo, o cada km.
//   PaginaEstructura corona ↓↓↓: la sesión del coach, y dónde estás.
//   AhoraSuena       derecha: la música del sistema.
//
// Iconos: trazos propios, sin librería (el lienzo del reloj no carga nada).

import type { ReactNode } from 'react';
import type { FilaEstructura, Lecturas, Sesion, Vuelta, ZonasCoach } from './paso';
import {
  fmtDistancia,
  fmtDuracion,
  fmtObjetivo,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  num,
  palabraVeredicto,
  principal,
  zonaDe,
} from './reglas';
import { ChipZona, ContextoLinea } from './piezas';
import { Columna } from './pasos';
import { NOMBRE_CLASE_DEFECTO } from './paso';
import { ANCHO_CABEZA, C, T, colorZona } from './tokens';

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export type IconoControl = 'pausa' | 'reanudar' | 'siguiente' | 'vuelta' | 'agua' | 'terminar';

function Icono({ tipo, tono }: { tipo: IconoControl; tono: string }) {
  const p = { fill: 'none', stroke: tono, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (tipo) {
    case 'pausa':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill={tono} />
          <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill={tono} />
        </svg>
      );
    case 'reanudar':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M7 4.5v15l12.5-7.5Z" fill={tono} />
        </svg>
      );
    case 'siguiente':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M5 5.5 13 12l-8 6.5M17.5 5.5v13" {...p} />
        </svg>
      );
    case 'vuelta':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4h-4" {...p} />
        </svg>
      );
    case 'agua':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3.5s6 6.6 6 10.8a6 6 0 0 1-12 0C6 10.1 12 3.5 12 3.5Z" {...p} />
        </svg>
      );
    case 'terminar':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" {...p} />
        </svg>
      );
  }
}

/** Un control de la página izquierda: botón redondeado ≥ 44 pt y su rótulo a 15 pt. */
export function Control({
  icono,
  etiqueta,
  activo = false,
  onPulsa,
}: {
  icono: IconoControl;
  etiqueta: string;
  activo?: boolean;
  onPulsa: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPulsa();
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        padding: 0,
        border: 0,
        background: 'transparent',
        color: C.tinta,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          width: 86,
          height: 58,
          borderRadius: 20,
          background: activo ? C.accion : C.superficie2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icono tipo={icono} tono={activo ? C.sobreAccion : C.accion} />
      </span>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1 }}>{etiqueta}</span>
    </button>
  );
}

export interface PaginaControlesProps {
  pausado: boolean;
  onPausa: () => void;
  /** «Siguiente paso», «Vuelta», «Siguiente serie»: la etiqueta es del contexto. */
  siguiente?: { etiqueta: string; icono?: 'siguiente' | 'vuelta'; onPulsa: () => void };
  agua: boolean;
  onAgua: () => void;
  onTerminar: () => void;
}

/** LOS CONTROLES, a la izquierda del vivo — el orden y el sitio de Apple Entreno. */
export function PaginaControles(p: PaginaControlesProps) {
  return (
    <Columna estilo={{ justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '86px 86px', columnGap: 12, rowGap: 12 }}>
        <Control
          icono={p.pausado ? 'reanudar' : 'pausa'}
          etiqueta={p.pausado ? 'Reanudar' : 'Pausa'}
          activo={p.pausado}
          onPulsa={p.onPausa}
        />
        {p.siguiente ? (
          <Control icono={p.siguiente.icono ?? 'siguiente'} etiqueta={p.siguiente.etiqueta} onPulsa={p.siguiente.onPulsa} />
        ) : (
          <span />
        )}
        <Control icono="agua" etiqueta="Bloqueo" activo={p.agua} onPulsa={p.onAgua} />
        <Control icono="terminar" etiqueta="Terminar" onPulsa={p.onTerminar} />
      </div>
    </Columna>
  );
}

/** «¿Terminar y guardar?» — Terminar (la acción, naranja) o Seguir. Nunca un tercer botón. */
export function ConfirmarTerminar({ onTerminar, onSeguir }: { onTerminar: () => void; onSeguir: () => void }) {
  const boton = (texto: string, accion: boolean, f: () => void) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        f();
      }}
      style={{
        width: '100%',
        height: 48,
        border: 0,
        borderRadius: 24,
        background: accion ? C.accion : C.superficie2,
        color: accion ? C.sobreAccion : C.tinta,
        fontSize: T.boton.cuerpo,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {texto}
    </button>
  );
  return (
    <Columna estilo={{ background: C.fondo, justifyContent: 'center', gap: 10 }}>
      <span style={{ fontSize: 22, fontWeight: 600, textAlign: 'center', lineHeight: 1.15, marginBottom: 8 }}>
        ¿Terminar y guardar?
      </span>
      {boton('Terminar', true, onTerminar)}
      {boton('Seguir', false, onSeguir)}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

function FilaDato({ valor, unidad, extra }: { valor: string; unidad: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, height: 38, width: '100%', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: T.segundo.cuerpo, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontWeight: 500 }}>{unidad}</span>
      {extra}
    </div>
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
  const z = ppm != null && zonas ? zonaDe(ppm, zonas) : null;
  return (
    <Columna estilo={{ alignItems: 'flex-start', paddingLeft: 'calc(var(--twin-safe-left) + 10px)' }}>
      <ContextoLinea partes={['Sesión']} tono={C.tinta2} />
      <FilaDato valor={fmtReloj(sesion.t)} unidad="total" />
      <FilaDato valor={d ? d.valor : '—'} unidad={`${d ? d.unidad : 'km'}${fuente ? ` · ${fuente}` : ''}`} />
      <FilaDato valor={sinMetros ? '—' : fmtRitmo(sesion.ritmoMedio)} unidad="/km medio" />
      <FilaDato
        valor={ppm == null ? '—' : String(Math.round(ppm))}
        unidad="ppm"
        extra={z != null && zonas ? <ChipZona n={z} color={colorZona(z, zonas.techos.length)} /> : undefined}
      />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Vueltas
// ---------------------------------------------------------------------------

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
  return (
    <Columna estilo={{ alignItems: 'stretch' }}>
      <ContextoLinea partes={objetivo ? [titulo, objetivo] : [titulo]} tono={C.tinta2} />
      {enCurso ? (
        <div style={{ display: 'flex', alignItems: 'baseline', height: 30, gap: 8, whiteSpace: 'nowrap', padding: '0 4px' }}>
          <span style={{ fontSize: T.nota.cuerpo, color: C.tinta, width: 34, fontVariantNumeric: 'tabular-nums' }}>{enCurso.n}</span>
          <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>
            {enCurso.valor}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: T.nota.cuerpo, color: C.tinta2 }}>ahora</span>
        </div>
      ) : null}
      {ultimas.length === 0 && !enCurso ? (
        <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 30 }}>
          Aún ninguna
        </span>
      ) : null}
      {ultimas.map((v, i) => {
        const juicio = v.veredicto ? palabraVeredicto(v.eje ?? 'ritmo', v.veredicto) : null;
        // Una serie por TIEMPO siempre dura lo mismo: su resultado son los metros.
        const porTiempo = v.clase !== 'km' && ultimas.every((x) => x.segundos === v.segundos) && ultimas.length > 1;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', height: 30, gap: 8, whiteSpace: 'nowrap', padding: '0 4px' }}>
            <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, width: 34, fontVariantNumeric: 'tabular-nums' }}>
              {v.clase === 'km' ? `km ${v.n}` : v.tanda ? `${v.tanda}·${v.n}` : v.n}
            </span>
            <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {porTiempo && v.metros != null ? `${v.metros}\u00A0m` : fmtReloj(v.segundos)}
            </span>
            {v.clase !== 'km' && v.metros != null && v.metros !== 1000 ? (
              <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>
                {fmtRitmo(v.ritmo)}
              </span>
            ) : null}
            {v.clase === 'km' && v.ppm != null ? (
              <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{v.ppm} ppm</span>
            ) : null}
            {juicio ? (
              <span style={{ marginLeft: 'auto', fontSize: T.nota.cuerpo, fontWeight: juicio.marca ? 700 : 500, color: juicio.marca ? C.tinta : C.tinta2 }}>
                {juicio.marca ? `${juicio.marca} ${juicio.texto}` : juicio.texto}
              </span>
            ) : null}
          </div>
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------------

const MODO = { trote: 'trote', andar: 'caminando', parado: 'parado' } as const;

/** Una fila de la estructura en dos líneas: el bloque y su recuperación. */
export function textoFila(f: FilaEstructura): { linea: string; detalle: string | null } {
  const o = principal(f.trabajo);
  const objetivo = o ? (o.eje === 'rpe' ? `RPE ${num(o.min ?? o.max ?? 0)}` : `a ${fmtObjetivo(o)}`) : null;
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

/** Cuántas filas caben en la página sin hacer scroll: se enseña una ventana alrededor de «ahora». */
const FILAS_VISIBLES = 4;

/**
 * LA ESTRUCTURA — la sesión del coach entera, con lo hecho apagado y lo de
 * ahora en tinta. Si no cabe, una ventana: la fila anterior, la de ahora y las
 * que vienen. Cada fila en dos líneas (qué · contra qué), sin pasar de 15 pt.
 */
export function PaginaEstructura({ filas }: { filas: FilaEstructura[] }) {
  const ahora = Math.max(0, filas.findIndex((f) => f.estado === 'ahora'));
  const desde = Math.max(0, Math.min(ahora - 1, filas.length - FILAS_VISIBLES));
  const ventana = filas.slice(desde, desde + FILAS_VISIBLES);
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 8 }}>
      <ContextoLinea partes={['Estructura']} tono={C.tinta2} />
      {ventana.map((f, i) => {
        const t = textoFila(f);
        const esAhora = f.estado === 'ahora';
        return (
          <div key={desde + i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '0 4px', maxWidth: ANCHO_CABEZA }}>
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
              <span style={{ fontSize: 16, fontWeight: 600, color: esAhora ? C.tinta : C.tinta2, lineHeight: 1.15 }}>
                {t.linea}
              </span>
              {t.detalle ? (
                <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, lineHeight: 1.15 }}>{t.detalle}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Ahora suena (derecha) — del sistema, por eso sus iconos no son naranjas
// ---------------------------------------------------------------------------

export function AhoraSuena() {
  const redondo = (hijo: ReactNode, grande = false) => (
    <span
      style={{
        width: grande ? 52 : 44,
        height: grande ? 52 : 44,
        borderRadius: '50%',
        background: grande ? C.superficie2 : 'transparent',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {hijo}
    </span>
  );
  return (
    <Columna estilo={{ justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: T.contexto.cuerpo, fontWeight: 600, color: C.tinta2 }}>Ahora suena</span>
      <span style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>Lista de series</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>Pista 4 de 18</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
        {redondo(
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M19 5v14L9 12Zm-13 0h2.5v14H6Z" fill={C.tinta} />
          </svg>,
        )}
        {redondo(
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill={C.tinta} />
            <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill={C.tinta} />
          </svg>,
          true,
        )}
        {redondo(
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 5v14l10-7Zm13 0h-2.5v14H18Z" fill={C.tinta} />
          </svg>,
        )}
      </div>
    </Columna>
  );
}
