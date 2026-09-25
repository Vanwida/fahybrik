'use client';

// LAS PÁGINAS DE LA CORONA en un circuito: Paso → Ruta → Datos.
//
//   Ruta   la lista del coach (tramos y estaciones, agrupados por ronda), con
//          lo hecho y su parcial (el que deja el motor del kit por paso), lo
//          de ahora con su crono y lo que viene. En 492 se ve que la ronda 5
//          ya no lleva Farmers (cuentas por ítem, M4).
//   Datos  la sesión (`PaginaFilas` del kit): el total, los km CORRIDOS y su
//          ritmo medio (solo los tramos de carrera: hoy se divide por el tiempo
//          con estaciones y sale 9:30/km), la Roxzone sumada y el pulso.

import {
  ANCHO_CABEZA,
  C,
  Columna,
  ContextoLinea,
  PaginaFilas,
  T,
  fmtDistancia,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  type EstadoSecuencia,
  type Lecturas,
  type ZonasCoach,
} from '../../kit-reloj';
import { esPuntuacion, type Circuito } from './planes';

// ---------------------------------------------------------------------------
// Ruta
// ---------------------------------------------------------------------------

type FilaRuta =
  | { tipo: 'ronda'; texto: string }
  | { tipo: 'paso'; nombre: string; estado: 'hecho' | 'ahora' | 'pendiente'; valor: string | null; suelta?: boolean };

/** Cuántas líneas caben bajo la cabecera sin scroll. */
const LINEAS = 6;

/** Las reps dichas en la campana del paso `i` (la del AMRAP `i - 1`), si las hay. */
export type RepsDe = (i: number) => number | null;

function filasDeRuta(c: Circuito, e: EstadoSecuencia, reps: RepsDe): FilaRuta[] {
  const filas: FilaRuta[] = [];
  const hechos = new Map(e.parciales.map((x) => [x.i, x]));
  let ronda: number | null = null;
  c.plan.pasos.forEach((p, i) => {
    if (i < c.inicio) return;
    const ahora = i === e.i && !e.terminado;
    const listado = (p.clase === 'carrera' || p.clase === 'estacion' || p.clase === 'amrap') && p.rol === 'trabajo';
    // Un paso que no está en la lista del coach (Roxzone, descanso, campana) solo sale mientras estás en él.
    if (!listado) {
      if (ahora) {
        const nombre = p.roxzone ? `Roxzone · ${p.roxzone}` : esPuntuacion(p) ? 'Puntuación' : 'Descanso';
        filas.push({ tipo: 'paso', nombre, estado: 'ahora', valor: fmtReloj(e.t), suelta: true });
      }
      return;
    }
    const r = p.posicion?.ronda;
    if (c.formato !== 'hyrox' && r && r.n !== ronda) {
      ronda = r.n;
      filas.push({ tipo: 'ronda', texto: `Ronda ${r.n}/${r.de}` });
    }
    const nombre =
      p.clase === 'carrera' ? (c.formato === 'hyrox' && r ? `Run ${r.n}` : `Run ${fmtPrescrito(p.medida)}`) : (p.nombre ?? '');
    const hecho = hechos.get(i);
    // El AMRAP enseña las reps que se dijeron en su campana; mientras no se digan, su tiempo.
    const dichas = p.clase === 'amrap' ? reps(i + 1) : null;
    const valor = dichas != null ? `${dichas} reps` : hecho ? fmtReloj(hecho.segundos) : ahora ? fmtReloj(e.t) : null;
    filas.push({ tipo: 'paso', nombre, estado: hecho ? 'hecho' : ahora ? 'ahora' : 'pendiente', valor });
  });
  return filas;
}

/** La Roxzone sumada: lo cerrado más lo de ahora. `null` si el coach no la activó. */
function roxzoneDe(c: Circuito, e: EstadoSecuencia): number | null {
  if (!c.roxzone) return null;
  return e.parciales.filter((x) => c.plan.pasos[x.i]?.clase === 'roxzone').reduce((a, x) => a + x.segundos, 0) + (c.plan.pasos[e.i]?.clase === 'roxzone' ? e.t : 0);
}

function Punto({ estado }: { estado: 'hecho' | 'ahora' | 'pendiente' }) {
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        flex: '0 0 auto',
        background: estado === 'ahora' ? C.tinta : estado === 'hecho' ? C.tinta2 : 'transparent',
        boxShadow: estado === 'pendiente' ? `inset 0 0 0 1.5px ${C.tinta2}` : undefined,
      }}
    />
  );
}

/**
 * La ventana alrededor de «ahora»: dos líneas antes y lo que viene. Si la
 * primera línea es un paso, arriba va SU ronda (fija), para que se sepa de
 * qué ronda es lo que asoma.
 */
function ventanaDe(filas: FilaRuta[], idx: number): Array<{ f: FilaRuta; k: number }> {
  const conK = filas.map((f, k) => ({ f, k }));
  const desde = Math.max(0, Math.min(idx - 2, filas.length - LINEAS));
  if (filas[desde]?.tipo !== 'paso') return conK.slice(desde, desde + LINEAS);
  const d = Math.max(0, Math.min(idx - 1, filas.length - (LINEAS - 1)));
  const cab = conK.slice(0, d + 1).reverse().find((x) => x.f.tipo === 'ronda');
  if (!cab) return conK.slice(desde, desde + LINEAS);
  if (cab.k === d) return conK.slice(d, d + LINEAS);
  return [cab, ...conK.slice(d, d + LINEAS - 1)];
}

export function PaginaRuta({ c, e, reps }: { c: Circuito; e: EstadoSecuencia; reps: RepsDe }) {
  const filas = filasDeRuta(c, e, reps);
  const idx = Math.max(0, filas.findIndex((f) => f.tipo === 'paso' && f.estado === 'ahora'));
  const ventana = ventanaDe(filas, idx);
  const listados = filas.filter((f) => f.tipo === 'paso' && !f.suelta);
  const hechos = listados.filter((f) => f.tipo === 'paso' && f.estado === 'hecho').length;
  const rox = roxzoneDe(c, e);
  return (
    <Columna estilo={{ alignItems: 'stretch', gap: 6 }}>
      <ContextoLinea partes={['Ruta', rox != null ? `Roxzone ${fmtReloj(rox)}` : `${hechos}/${listados.length}`]} tono={C.tinta2} />
      {ventana.map(({ f, k }) =>
        f.tipo === 'ronda' ? (
          <div key={k} style={{ height: 20, display: 'flex', alignItems: 'flex-end', padding: '0 6px' }}>
            <span style={{ fontSize: T.nota.cuerpo, fontWeight: 600, color: C.tinta2, lineHeight: 1 }}>{f.texto}</span>
          </div>
        ) : (
          <div key={k} style={{ height: 24, display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px', maxWidth: ANCHO_CABEZA + 6 }}>
            {f.suelta ? <span style={{ width: 8, flex: '0 0 auto' }} /> : <Punto estado={f.estado} />}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: f.suelta ? T.nota.cuerpo : T.contexto.cuerpo,
                fontWeight: f.estado === 'ahora' && !f.suelta ? 700 : 500,
                color: f.estado === 'ahora' && !f.suelta ? C.tinta : C.tinta2,
              }}
            >
              {f.nombre}
            </span>
            {f.valor ? (
              <span
                style={{
                  flex: '0 0 auto',
                  fontSize: T.contexto.cuerpo,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: f.estado === 'hecho' ? C.tinta2 : C.tinta,
                }}
              >
                {f.valor}
              </span>
            ) : null}
          </div>
        ),
      )}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

export function PaginaDatosCircuito({
  c,
  e,
  total,
  lecturas,
  zonas,
}: {
  c: Circuito;
  e: EstadoSecuencia;
  total: number | null;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
}) {
  // Solo los tramos de carrera: ni el calentamiento ni el PM5 ni la Roxzone.
  const esTramo = (i: number) => i >= c.inicio && c.plan.pasos[i]?.clase === 'carrera';
  const corridos = e.parciales.filter((x) => esTramo(x.i) && x.metros != null);
  const enCurso = esTramo(e.i) && e.midio ? { m: e.metros, s: e.t } : { m: 0, s: 0 };
  const m = corridos.reduce((a, x) => a + (x.metros ?? 0), 0) + enCurso.m;
  const s = corridos.reduce((a, x) => a + x.segundos, 0) + enCurso.s;
  const d = m > 0 ? fmtDistancia(m) : null;
  const rox = roxzoneDe(c, e);
  const ppm = lecturas.viejos?.includes('ppm') ? null : lecturas.ppm;
  return (
    <PaginaFilas
      titulo={['Sesión']}
      zonas={zonas}
      alto={34}
      filas={[
        { valor: fmtReloj(total ?? e.sesionT), unidad: c.cap != null ? `total · cap ${Math.round(c.cap / 60)}′` : 'total' },
        { valor: d ? d.valor : '—', unidad: `${d ? d.unidad : 'km'} corridos` },
        { valor: m > 50 ? fmtRitmo(s / (m / 1000)) : '—', unidad: '/km al correr' },
        ...(rox != null ? [{ valor: fmtReloj(rox), unidad: 'Roxzone' }] : []),
        { valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm', ppm },
      ]}
    />
  );
}
