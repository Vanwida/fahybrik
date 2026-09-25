'use client';

// LAS PÁGINAS DE LA CORONA DEL WOD — las mismas formas que las del kit
// (Datos, Vueltas, Estructura), con filas genéricas: el kit las tiene atadas a
// correr (/km medio, km, «Series · 3:45–3:55») y un WOD cuenta otras cosas
// (rondas, minutos, /500). Para el kit: PaginaDatos/PaginaVueltas con filas.

import { ANCHO_CABEZA, ANCHO_PIE, C, ChipZona, Columna, ContextoLinea, T, colorZona, zonaDe, type ZonasCoach } from '../../kit-reloj';
import { cargaDe, type FilaLista, type Tarea } from './planes';

// ---------------------------------------------------------------------------
// Datos — filas «valor unidad», como la vista de varias métricas de Apple
// ---------------------------------------------------------------------------

export interface FilaDato {
  valor: string;
  unidad: string;
  /** El pulso lleva su zona. */
  ppm?: number | null;
}

export function PaginaFilas({ titulo, filas, zonas }: { titulo: string[]; filas: FilaDato[]; zonas: ZonasCoach | null }) {
  return (
    <Columna estilo={{ alignItems: 'flex-start', paddingLeft: 'calc(var(--twin-safe-left) + 10px)' }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {filas.slice(0, 4).map((f, k) => {
        const z = f.ppm != null && zonas ? zonaDe(f.ppm, zonas) : null;
        return (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 5, height: 38, width: '100%', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: T.segundo.cuerpo, fontWeight: T.segundo.peso, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{f.valor}</span>
            <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontWeight: T.nota.peso }}>{f.unidad}</span>
            {z != null && zonas ? <ChipZona n={z} color={colorZona(z, zonas.techos.length)} /> : null}
          </div>
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Splits — rondas del AMRAP, minutos del EMOM, series del ergo: la última arriba
// ---------------------------------------------------------------------------

export interface FilaSplit {
  n: string;
  valor: string;
  detalle?: string | null;
  /** El veredicto: con marca (▲▼) va en tinta y negrita; «dentro», en tinta2. */
  juicio?: { texto: string; fuera: boolean } | null;
}

// A la derecha, 12 pt libres: ahí viven los puntos de la corona.
const filaSplit = { display: 'flex', alignItems: 'baseline', height: 30, gap: 8, whiteSpace: 'nowrap', padding: '0 12px 0 4px', minWidth: 0 } as const;
const cola = { marginLeft: 'auto', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 } as const;

/** El pie de una página: la última fila, así que cabe en ANCHO_PIE (las esquinas de abajo). */
function Pie({ children }: { children: string }) {
  return (
    <span style={{ alignSelf: 'center', maxWidth: ANCHO_PIE, fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 'auto', lineHeight: 1.2, textWrap: 'balance' }}>
      {children}
    </span>
  );
}

export function PaginaSplits({ titulo, filas, enCurso }: { titulo: string[]; filas: FilaSplit[]; enCurso?: FilaSplit | null }) {
  const ultimas = [...filas].reverse().slice(0, enCurso ? 4 : 5);
  return (
    <Columna estilo={{ alignItems: 'stretch' }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {enCurso ? (
        <div style={filaSplit}>
          <span style={{ fontSize: T.nota.cuerpo, color: C.tinta, minWidth: 22, fontVariantNumeric: 'tabular-nums' }}>{enCurso.n}</span>
          <span style={{ fontSize: T.tercero.cuerpo, fontWeight: T.tercero.peso, color: C.tinta2, fontVariantNumeric: 'tabular-nums' }}>{enCurso.valor}</span>
          <span style={{ ...cola, fontSize: T.nota.cuerpo, color: C.tinta2 }}>{enCurso.detalle ?? 'ahora'}</span>
        </div>
      ) : null}
      {ultimas.length === 0 && !enCurso ? (
        <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, textAlign: 'center', marginTop: 30 }}>Aún ninguna</span>
      ) : null}
      {ultimas.map((f, k) => (
        <div key={k} style={filaSplit}>
          <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, minWidth: 22, fontVariantNumeric: 'tabular-nums' }}>{f.n}</span>
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

// ---------------------------------------------------------------------------
// Lista — la estructura, la rotación del EMOM, la ronda del For Time
// ---------------------------------------------------------------------------

const VISIBLES = 4;

export function PaginaLista({ titulo, filas, pie }: { titulo: string[]; filas: FilaLista[]; pie?: string | null }) {
  const ahora = Math.max(0, filas.findIndex((f) => f.estado === 'ahora'));
  const cabe = pie ? VISIBLES - 1 : VISIBLES;
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

// ---------------------------------------------------------------------------
// Tarea — la ronda del AMRAP en la muñeca (no en el móvil): reps, movimiento, carga
// ---------------------------------------------------------------------------

export function PaginaTarea({ titulo, tareas, pie }: { titulo: string[]; tareas: Tarea[]; pie?: string | null }) {
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 6 }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 6, padding: '4px 8px 0', alignItems: 'baseline' }}>
        {tareas.map((t) => {
          const n = t.dosis?.tipo === 'reps' ? String(t.dosis.prescrito) : null;
          const carga = cargaDe(t);
          return [
            <span key={`${t.nombre}-n`} style={{ fontSize: T.tercero.cuerpo, fontWeight: T.tercero.peso, textAlign: 'right', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {n ?? '·'}
            </span>,
            <div key={`${t.nombre}-t`} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: T.contexto.cuerpo, fontWeight: T.contexto.peso, color: C.tinta, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{t.nombre}</span>
              {carga ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, lineHeight: 1.15 }}>{carga}</span> : null}
            </div>,
          ];
        })}
      </div>
      {pie ? <Pie>{pie}</Pie> : null}
    </Columna>
  );
}
