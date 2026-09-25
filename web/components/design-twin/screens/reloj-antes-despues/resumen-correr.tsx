'use client';

// EL RESUMEN DE CORREDOR (P13) — primero lo que un corredor mira: si las
// series salieron («5 de 6 dentro»), cuánto y cuánto tiempo, y el ritmo de lo
// FUERTE (no la media, que mezcla trote y calentamiento). Luego cada serie
// contra SU objetivo con la marca ▲▼, el pulso con las zonas del coach y, en
// rodajes y tiradas con vuelta automática, cada km con su desnivel.
//
// Hoy el resumen es de gimnasio: tiempo + «Bloques», sin distancia, ni ritmo,
// ni cumplimiento por serie, y los splits cuentan el calentamiento (P1-17).

import {
  ALTO_UTIL,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  T,
  altoHeroe,
  fmtDistancia,
  fmtObjetivo,
  fmtReloj,
  fmtRitmo,
  palabraVeredicto,
  principal,
  filasDePasos,
  grupoPrincipal,
  hoyDe,
  paginar,
  type Completitud,
  type MetodoResumen,
  type PaginaVivo,
  type PasoBase,
} from '../../kit-reloj';
import type { EstadoGuardado, Resultado } from './calculo';
import { paginasEjercicios } from './resumen-fuerza';
import { FilaLista, LineaGuardado } from './resumen-piezas';

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;
const ALTO_FILA = 24;
const HUECO_LISTA = 4;
/** Alto para filas de lista bajo el contexto. */
const ALTO_LISTA = ALTO_UTIL - FILA.contexto - HUECO_LISTA;

const valor = { fontSize: T.tercero.cuerpo, fontWeight: 600, color: C.tinta } as const;
const unidad = { fontSize: T.nota.cuerpo, color: C.tinta2 } as const;
const fila = { height: FILA.tercero, display: 'flex', alignItems: 'baseline', justifyContent: 'center', whiteSpace: 'nowrap', lineHeight: 1 } as const;

function DosDatos({ a, ua, b, ub }: { a: string; ua?: string; b: string; ub?: string }) {
  return (
    <div style={{ ...fila, gap: 4 }}>
      <span style={valor}>{a}</span>
      {ua ? <span style={unidad}>{ua}</span> : null}
      <span style={{ ...unidad, margin: '0 2px' }}>·</span>
      <span style={valor}>{b}</span>
      {ub ? <span style={unidad}>{ub}</span> : null}
    </div>
  );
}

function UnDato({ a, ua }: { a: string; ua: string }) {
  return (
    <div style={{ ...fila, gap: 5 }}>
      <span style={valor}>{a}</span>
      <span style={unidad}>{ua}</span>
    </div>
  );
}

/** Las series de carrera de la parte principal, por bloque (las estaciones van en su propio resumen). */
function bloquesDeSeries(pasos: PasoBase[]): PasoBase[][] {
  const porBloque = new Map<number, PasoBase[]>();
  pasos
    .filter((p) => p.rol === 'trabajo' && p.fase === 'principal' && (p.posicion?.serie || p.posicion?.tramo) && p.clase !== 'estacion' && p.clase !== 'fuerza')
    .forEach((p) => porBloque.set(p.bloque ?? 0, [...(porBloque.get(p.bloque ?? 0) ?? []), p]));
  return [...porBloque.values()];
}

/** % del tiempo dentro de lo que pide el objetivo a zona del paso principal: «98 % hasta Z2», «74 % en Z4». */
function enZona(r: Resultado): { pct: string; donde: string } | null {
  const o = principal(grupoPrincipal(filasDePasos(r.pasos)).paso);
  if (!o || o.eje !== 'zona' || o.max == null) return null;
  const techo = o.papel === 'techo' || o.avisa === 'solo-arriba';
  const desde = techo ? 1 : (o.min ?? 1);
  const dentro = r.zonasS.slice(desde - 1, o.max).reduce((a, s) => a + s, 0);
  const total = r.zonasS.reduce((a, s) => a + s, 0);
  if (total <= 0) return null;
  return { pct: `${Math.round((dentro / total) * 100)} %`, donde: techo ? `hasta Z${o.max}` : desde === o.max ? `en Z${o.max}` : `en Z${desde}–Z${o.max}` };
}

// ---------------------------------------------------------------------------
// Página 1 — lo que un corredor mira primero
// ---------------------------------------------------------------------------

function PaginaCorredor({ r, c, guardado }: { r: Resultado; c: Completitud; guardado: EstadoGuardado }) {
  const juzgadas = r.series.filter((s) => s.veredicto != null);
  const dentro = juzgadas.filter((s) => s.veredicto === 'dentro').length;
  const d = r.metros != null ? fmtDistancia(r.metros) : null;
  const libre = c.estado === 'libre';
  const titulo = libre ? 'Correr libre' : hoyDe(r.pasos).titulo;
  const heroe = juzgadas.length > 0 ? { clase: 'crono' as const, texto: `${dentro} de ${juzgadas.length}`, unidad: 'dentro' } : { clase: 'crono' as const, texto: d?.valor ?? '—', unidad: d?.unidad ?? 'km' };
  // El ritmo de lo fuerte: metros y segundos de las series, no la media de la sesión.
  const conMetros = r.series.filter((s) => s.metros != null && s.metros > 0);
  const ritmoSeries = conMetros.length > 0 ? conMetros.reduce((a, s) => a + s.segundos, 0) / (conMetros.reduce((a, s) => a + s.metros!, 0) / 1000) : null;
  const ritmoMedio = r.metros ? r.t / (r.metros / 1000) : null;
  const zona = enZona(r);
  return (
    <Columna>
      <ContextoLinea partes={libre ? [titulo] : [titulo, ESTADO[c.estado]]} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Heroe heroe={heroe} altoMax={altoHeroe(['contexto', 'tercero', 'tercero', 'nota'])} />
      </div>
      {juzgadas.length > 0 ? (
        <>
          <DosDatos a={d?.valor ?? '—'} ua={d?.unidad} b={fmtReloj(r.t)} />
          <UnDato a={fmtRitmo(ritmoSeries)} ua="/km en las series" />
        </>
      ) : (
        <>
          <DosDatos a={fmtReloj(r.t)} b={fmtRitmo(ritmoMedio)} ub="/km" />
          {zona ? <UnDato a={zona.pct} ua={zona.donde} /> : <UnDato a={r.ppmMedio == null ? '—' : String(Math.round(r.ppmMedio))} ua="ppm medio" />}
        </>
      )}
      <LineaGuardado estado={guardado} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las series contra su objetivo
// ---------------------------------------------------------------------------

function PaginaSeries({ r, pasos, titulo, metodo }: { r: Resultado; pasos: PasoBase[]; titulo: string[]; metodo: MetodoResumen }) {
  return (
    <Columna estilo={{ gap: HUECO_LISTA }}>
      <ContextoLinea partes={titulo} tono={C.tinta2} />
      {pasos.map((p) => {
        const s = r.series.find((x) => x.pasoId === p.id);
        const pos = p.posicion!;
        const n = `${pos.tanda ? `${pos.tanda.n}·` : ''}${(pos.serie ?? pos.tramo)!.n}`;
        if (!s) return <FilaLista key={p.id} n={n} valor="—" derecha={<span style={{ color: C.tinta2 }}>sin hacer</span>} tenue />;
        const pr = p.medida.prescrito ?? 0;
        const hecho = p.medida.tipo === 'distancia' ? (s.metros ?? 0) : s.segundos;
        if (hecho < pr * metodo.umbralHecho) {
          // Cortada: lo que se corrió, sin juicio (no llegó a ser la serie del coach).
          return (
            <FilaLista
              key={p.id}
              n={n}
              valor={p.medida.tipo === 'distancia' && s.metros != null ? `${s.metros}\u00A0m` : fmtReloj(s.segundos)}
              derecha={<span style={{ color: C.tinta2 }}>cortada</span>}
            />
          );
        }
        const j = s.veredicto ? palabraVeredicto(s.eje ?? 'ritmo', s.veredicto) : null;
        const ritmo = s.metros != null && s.metros !== 1000 ? fmtRitmo(s.ritmo) : null;
        return (
          <FilaLista
            key={p.id}
            n={n}
            valor={fmtReloj(s.segundos)}
            apoyo={ritmo}
            derecha={j ? <span style={{ fontWeight: j.marca ? 700 : 500, color: j.marca ? C.tinta : C.tinta2 }}>{j.marca ? `${j.marca} ${j.texto}` : j.texto}</span> : null}
          />
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Kilómetros, con su desnivel
// ---------------------------------------------------------------------------

const conSigno = (m: number) => (m > 0 ? `+${m} m` : m < 0 ? `−${-m} m` : '0 m');

function PaginaKm({ r, desde, hasta, primera }: { r: Resultado; desde: number; hasta: number; primera: boolean }) {
  const partes = primera && r.desnivel != null ? ['Kilómetros', `+${r.desnivel} m`] : ['Kilómetros', `${desde + 1}–${hasta}`];
  return (
    <Columna estilo={{ gap: HUECO_LISTA }}>
      <ContextoLinea partes={partes} tono={C.tinta2} />
      {r.km.slice(desde, hasta).map((k) => {
        const parcial = k.metros != null && k.metros < 1000;
        return (
          <FilaLista
            key={k.n}
            anchoN={32}
            n={parcial ? (k.metros! / 1000).toFixed(2).replace('.', ',') : String(k.n)}
            valor={fmtRitmo(k.ritmo)}
            apoyo={k.desnivel == null ? '—' : conSigno(k.desnivel)}
            derecha={<span style={{ color: C.tinta2 }}>{k.ppm ?? '—'}</span>}
          />
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las páginas de correr
// ---------------------------------------------------------------------------

export function paginasCorrer(r: Resultado, c: Completitud, guardado: EstadoGuardado, metodo: MetodoResumen): PaginaVivo[] {
  const paginas: PaginaVivo[] = [{ id: 'resumen', titulo: 'Resumen', contenido: <PaginaCorredor r={r} c={c} guardado={guardado} /> }];
  bloquesDeSeries(r.pasos).forEach((pasos, b) => {
    const o = principal(pasos[0]!);
    const titulo = ['Series', ...(o ? [fmtObjetivo(o)] : [])];
    paginar(pasos.map(() => ALTO_FILA), ALTO_LISTA, HUECO_LISTA).forEach((idx, k) => {
      paginas.push({
        id: `series-${b}-${k}`,
        titulo: 'Series',
        contenido: <PaginaSeries r={r} pasos={idx.map((i) => pasos[i]!)} titulo={titulo} metodo={metodo} />,
      });
    });
  });
  paginas.push(...paginasEjercicios(r.fuerza));
  if (r.km.length > 0) {
    paginar(r.km.map(() => ALTO_FILA), ALTO_LISTA, HUECO_LISTA).forEach((idx, k) => {
      paginas.push({
        id: `km-${k}`,
        titulo: 'Kilómetros',
        contenido: <PaginaKm r={r} desde={idx[0]!} hasta={idx[idx.length - 1]! + 1} primera={k === 0} />,
      });
    });
  }
  return paginas;
}
