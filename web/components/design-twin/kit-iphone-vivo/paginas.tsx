'use client';

// LAS PÁGINAS LATERALES (I6) — pocas y fijas: Vivo · Estructura · Mapa (solo
// con GPS). Se deslizan en horizontal; lo crítico nunca está fuera de Vivo.
//
//   PaginasLaterales   el paginador: deslizar o los puntos bajo la cabecera.
//   PaginaEstructura   la sesión del coach entera, con lo hecho contra su
//                      objetivo (las vueltas del motor) y dónde estás. Es la
//                      única lista larga del vivo y SÍ scrollea: para eso
//                      es una página aparte y no un panel sobre el sujeto.
//   PaginaMapa         la ruta (una traza, honesta: «la ruta va a Salud»).

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { estructuraDe } from '../kit-reloj/estructura';
import { juicioDe, textoFila } from '../kit-reloj/listas';
import type { FilaEstructura, Vuelta } from '../kit-reloj/paso';
import { fmtReloj, fmtRitmo } from '../kit-reloj/reglas';
import type { EstadoSecuencia, PlanSesion } from '../kit-reloj/secuencia';
import { Cuerpo, Etiqueta, Numeral } from './piezas';
import { CI, MARGEN, RADIO, TI } from './tokens';

export type IdPagina = 'vivo' | 'estructura' | 'mapa';

export interface PaginaLateral {
  id: IdPagina;
  titulo: string;
  contenido: ReactNode;
}

const DESLIZ = 48;

/** El paginador horizontal. `activa` la lleva el vivo (la tira abre Estructura). */
export function PaginasLaterales({ paginas, activa, onCambiar, children }: { paginas: PaginaLateral[]; activa: number; onCambiar: (i: number) => void; children?: ReactNode }) {
  const toque = useRef<{ x: number; y: number } | null>(null);
  const abajo = (e: ReactPointerEvent) => {
    toque.current = { x: e.clientX, y: e.clientY };
  };
  const arriba = (e: ReactPointerEvent) => {
    const o = toque.current;
    toque.current = null;
    if (!o) return;
    const dx = e.clientX - o.x;
    const dy = e.clientY - o.y;
    if (Math.abs(dx) < DESLIZ || Math.abs(dx) < Math.abs(dy)) return;
    const n = Math.min(paginas.length - 1, Math.max(0, activa + (dx < 0 ? 1 : -1)));
    if (n !== activa) onCambiar(n);
  };
  return (
    <div onPointerDown={abajo} onPointerUp={arriba} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', width: `${paginas.length * 100}%`, transform: `translateX(${(-activa * 100) / paginas.length}%)`, transition: 'transform 320ms cubic-bezier(.2,.8,.2,1)' }}>
        {paginas.map((p) => (
          <section key={p.id} aria-label={p.titulo} style={{ position: 'relative', width: `${100 / paginas.length}%`, height: '100%' }}>
            {p.contenido}
          </section>
        ))}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------------

const [PUNTO_HECHO, PUNTO_AHORA] = [CI.tinta2, CI.tinta];

function FilaVuelta({ v }: { v: Vuelta }) {
  const j = juicioDe(v);
  const n = v.clase === 'km' ? `km ${v.n}` : v.tanda ? `${v.tanda}·${v.n}` : String(v.n);
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0 4px 20px' }}>
      <Etiqueta estilo={{ minWidth: 34 }}>{n}</Etiqueta>
      <Numeral texto={fmtReloj(v.segundos)} cuerpo={TI.datoTexto.cuerpo} />
      {v.clase !== 'km' && v.metros != null && v.metros !== 1000 ? <Etiqueta>{`${fmtRitmo(v.ritmo)} /km`}</Etiqueta> : null}
      {v.ppm != null ? <Etiqueta>{`${v.ppm} ppm`}</Etiqueta> : null}
      {j ? <span style={{ marginLeft: 'auto', fontSize: TI.etiqueta.cuerpo, fontWeight: j.fuera ? 700 : 600, color: j.fuera ? CI.tinta : CI.tinta2 }}>{j.texto}</span> : null}
    </div>
  );
}

/**
 * Una fila de la Estructura: el bloque del coach en dos líneas (qué · contra
 * qué) y sus vueltas debajo. La MISMA fila en la Estructura de cualquier familia
 * y en la del circuito (los bloques de antes de la ruta).
 */
export function FilaDeEstructura({ f, vueltas = [] }: { f: FilaEstructura; vueltas?: Vuelta[] }) {
  const t = textoFila(f);
  const esAhora = f.estado === 'ahora';
  return (
    <div style={{ background: esAhora ? CI.superficie : 'transparent', borderRadius: RADIO.superficie, padding: esAhora ? '12px 14px' : '8px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span aria-hidden style={{ marginTop: 7, width: 9, height: 9, borderRadius: 5, flex: '0 0 auto', background: esAhora ? PUNTO_AHORA : f.estado === 'hecho' ? PUNTO_HECHO : 'transparent', boxShadow: f.estado === 'pendiente' ? `inset 0 0 0 1.5px ${CI.tinta2}` : undefined }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Cuerpo tono={f.estado === 'pendiente' ? CI.tinta2 : CI.tinta} peso={600}>
            {t.linea}
          </Cuerpo>
          {t.detalle ? <Etiqueta estilo={{ whiteSpace: 'normal' }}>{t.detalle}</Etiqueta> : null}
        </div>
      </div>
      {vueltas.map((v, i) => (
        <FilaVuelta key={i} v={v} />
      ))}
    </div>
  );
}

/**
 * LA ESTRUCTURA: cada bloque del coach en dos líneas (qué · contra qué), lo
 * hecho con sus vueltas y su veredicto, lo de ahora en tinta, lo que viene en
 * tinta2. Scrollea (es una página, no un panel).
 */
export function PaginaEstructura({ plan, estado }: { plan: PlanSesion; estado: EstadoSecuencia }) {
  const filas = estructuraDe(plan.pasos)(estado.i);
  // Las vueltas de cada bloque (las series, por orden): se reparten ANTES de
  // pintar, no mutando un cursor durante el render.
  const series = estado.vueltas.filter((v) => v.clase !== 'km');
  const reparto = filas.reduce<{ desde: number; propias: Vuelta[][] }>(
    (acc, f) => {
      const cuenta = !!(f.trabajo.posicion?.serie ?? f.trabajo.posicion?.tramo) && f.trabajo.fase === 'principal';
      const n = f.estado === 'pendiente' || !cuenta ? 0 : (f.veces ?? 1) * (f.tandas?.veces ?? 1);
      return { desde: acc.desde + n, propias: [...acc.propias, series.slice(acc.desde, acc.desde + n)] };
    },
    { desde: 0, propias: [] },
  ).propias;
  return (
    <div className="twin-scroll" style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: `12px ${MARGEN}px calc(var(--twin-safe-bottom) + 24px)`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: TI.posicion.peso, color: CI.tinta, marginBottom: 8 }}>Estructura</span>
      {filas.map((f, k) => {
        const kms = f.trabajo.vueltaAutoM ? estado.vueltas.filter((v) => v.clase === 'km') : [];
        return <FilaDeEstructura key={k} f={f} vueltas={[...(reparto[k] ?? []), ...kms]} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa
// ---------------------------------------------------------------------------

/** Una traza determinista con la forma de una vuelta al parque: solo para el doble (el mapa real lo pone Apple Mapas). */
function trazaDe(metros: number): string {
  const puntos: string[] = [];
  const n = 90;
  const hecho = Math.min(1, metros / 6000);
  for (let i = 0; i <= n * hecho; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = 160 + 120 * Math.cos(t) + 18 * Math.sin(3 * t);
    const y = 160 + 92 * Math.sin(t) + 14 * Math.cos(2 * t);
    puntos.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return puntos.join(' ');
}

/** LA RUTA — el mapa de la carrera, y dónde estás. Honesto: el mapa del sistema y la ruta se guarda en Salud. */
export function PaginaMapa({ metros, ritmoMedio }: { metros: number; ritmoMedio: number | null }) {
  const traza = trazaDe(metros);
  return (
    <div style={{ position: 'absolute', inset: 0, padding: `12px ${MARGEN}px calc(var(--twin-safe-bottom) + 24px)`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: TI.posicion.cuerpo, fontWeight: TI.posicion.peso, color: CI.tinta }}>Mapa</span>
      <div style={{ flex: '1 1 auto', minHeight: 0, borderRadius: RADIO.superficie, background: CI.superficie, position: 'relative', overflow: 'hidden' }}>
        <svg viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
          <defs>
            <pattern id="calles" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0v40" fill="none" stroke={CI.superficie2} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="320" height="320" fill="url(#calles)" />
          <path d={trazaDe(6000)} fill="none" stroke={CI.carril} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <path d={traza} fill="none" stroke={CI.tinta} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ position: 'absolute', left: 14, bottom: 12, display: 'inline-flex', gap: 8, alignItems: 'baseline' }}>
          <Etiqueta>{`${(metros / 1000).toFixed(2).replace('.', ',')} km`}</Etiqueta>
          {ritmoMedio != null ? <Etiqueta>{`${fmtRitmo(ritmoMedio)} /km medio`}</Etiqueta> : null}
        </span>
      </div>
      <Etiqueta estilo={{ whiteSpace: 'normal' }}>la ruta se guarda en Salud · el mapa es el del sistema</Etiqueta>
    </div>
  );
}
