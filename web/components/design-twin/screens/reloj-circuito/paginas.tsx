'use client';

// LAS PÁGINAS DE LA CORONA en un circuito: Paso → Ruta → Datos.
//
//   Ruta   la lista del coach (tramos y estaciones, agrupados por ronda), con
//          lo hecho y su parcial, lo de ahora con su crono y lo que viene. En
//          492 se ve que la ronda 5 ya no lleva Farmers (cuentas por ítem, M4).
//   Datos  la sesión: el total, los km CORRIDOS y su ritmo medio (solo los
//          tramos de carrera: hoy se divide por el tiempo con estaciones y sale
//          9:30/km), la Roxzone sumada y el pulso.

import type { ReactNode } from 'react';
import {
  ANCHO_CABEZA,
  C,
  ChipZona,
  Columna,
  ContextoLinea,
  T,
  colorZona,
  fmtDistancia,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  zonaDe,
  type Lecturas,
  type ZonasCoach,
} from '../../kit-reloj';
import type { EstadoCircuito } from './motor';
import { sentidoRoxzone, type Circuito } from './planes';

// ---------------------------------------------------------------------------
// Ruta
// ---------------------------------------------------------------------------

type FilaRuta =
  | { tipo: 'ronda'; texto: string }
  | { tipo: 'paso'; nombre: string; estado: 'hecho' | 'ahora' | 'pendiente'; valor: string | null; suelta?: boolean };

/** Cuántas líneas caben bajo la cabecera sin scroll. */
const LINEAS = 6;

function filasDeRuta(c: Circuito, e: EstadoCircuito): FilaRuta[] {
  const filas: FilaRuta[] = [];
  const hechos = new Map(e.parciales.map((x) => [x.i, x]));
  let ronda: number | null = null;
  c.plan.pasos.forEach((p, i) => {
    if (i < c.inicio) return;
    const ahora = i === e.s.i && !e.s.terminado;
    const listado = p.clase === 'carrera' || p.clase === 'estacion' || p.clase === 'amrap';
    // Un paso que no está en la lista del coach (Roxzone, descanso) solo sale mientras estás en él.
    if (!listado) {
      if (ahora) {
        const nombre = p.clase === 'roxzone' ? `Roxzone · ${sentidoRoxzone(p) === 'entrada' ? 'entrada' : 'salida'}` : 'Descanso';
        filas.push({ tipo: 'paso', nombre, estado: 'ahora', valor: fmtReloj(e.s.t), suelta: true });
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
    const reps = p.clase === 'amrap' ? (hecho?.reps ?? e.reps[i] ?? null) : null;
    const valor = hecho
      ? reps != null
        ? `${reps} reps`
        : fmtReloj(hecho.segundos)
      : ahora
        ? reps != null
          ? `${reps} reps`
          : fmtReloj(e.s.t)
        : null;
    filas.push({ tipo: 'paso', nombre, estado: hecho ? 'hecho' : ahora ? 'ahora' : 'pendiente', valor });
  });
  return filas;
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

export function PaginaRuta({ c, e }: { c: Circuito; e: EstadoCircuito }) {
  const filas = filasDeRuta(c, e);
  const idx = Math.max(0, filas.findIndex((f) => f.tipo === 'paso' && f.estado === 'ahora'));
  const ventana = ventanaDe(filas, idx);
  const listados = filas.filter((f) => f.tipo === 'paso' && !f.suelta);
  const hechos = listados.filter((f) => f.tipo === 'paso' && f.estado === 'hecho').length;
  const rox = c.roxzone
    ? e.parciales.filter((x) => c.plan.pasos[x.i]?.clase === 'roxzone').reduce((a, x) => a + x.segundos, 0) +
      (c.plan.pasos[e.s.i]?.clase === 'roxzone' ? e.s.t : 0)
    : null;
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

function FilaDato({ valor, unidad, extra }: { valor: string; unidad: string; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, height: 34, width: '100%', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: T.segundo.cuerpo, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{valor}</span>
      <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2, fontWeight: 500 }}>{unidad}</span>
      {extra}
    </div>
  );
}

export function PaginaDatosCircuito({
  c,
  e,
  total,
  lecturas,
  zonas,
}: {
  c: Circuito;
  e: EstadoCircuito;
  total: number | null;
  lecturas: Lecturas;
  zonas: ZonasCoach | null;
}) {
  // Solo los tramos de carrera: ni el calentamiento ni el PM5 ni la Roxzone.
  const esTramo = (i: number) => i >= c.inicio && c.plan.pasos[i]?.clase === 'carrera';
  const corridos = e.parciales.filter((x) => esTramo(x.i) && x.metros != null);
  const enCurso = esTramo(e.s.i) && e.s.midio ? { m: e.s.metros, s: e.s.t } : { m: 0, s: 0 };
  const m = corridos.reduce((a, x) => a + (x.metros ?? 0), 0) + enCurso.m;
  const s = corridos.reduce((a, x) => a + x.segundos, 0) + enCurso.s;
  const d = m > 0 ? fmtDistancia(m) : null;
  const rox = c.roxzone
    ? e.parciales.filter((x) => c.plan.pasos[x.i]?.clase === 'roxzone').reduce((a, x) => a + x.segundos, 0) +
      (c.plan.pasos[e.s.i]?.clase === 'roxzone' ? e.s.t : 0)
    : null;
  const ppm = lecturas.viejos?.includes('ppm') ? null : lecturas.ppm;
  const z = ppm != null && zonas ? zonaDe(ppm, zonas) : null;
  return (
    <Columna estilo={{ alignItems: 'flex-start', paddingLeft: 'calc(var(--twin-safe-left) + 10px)' }}>
      <ContextoLinea partes={['Sesión']} tono={C.tinta2} />
      <FilaDato valor={fmtReloj(total ?? e.s.sesionT)} unidad={c.cap != null ? `total · cap ${Math.round(c.cap / 60)}′` : 'total'} />
      <FilaDato valor={d ? d.valor : '—'} unidad={`${d ? d.unidad : 'km'} corridos`} />
      <FilaDato valor={m > 50 ? fmtRitmo(s / (m / 1000)) : '—'} unidad="/km al correr" />
      {rox != null ? <FilaDato valor={fmtReloj(rox)} unidad="Roxzone" /> : null}
      <FilaDato
        valor={ppm == null ? '—' : String(Math.round(ppm))}
        unidad="ppm"
        extra={z != null && zonas ? <ChipZona n={z} color={colorZona(z, zonas.techos.length)} /> : undefined}
      />
    </Columna>
  );
}
