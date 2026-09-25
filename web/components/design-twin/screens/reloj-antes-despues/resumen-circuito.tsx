'use client';

// EL RESUMEN DEL CIRCUITO (493 / 482) — cada tramo de carrera y cada estación
// fue su propia vuelta (P10), así que el resumen los tiene: el tiempo del
// circuito (la puntuación), la carrera y las estaciones por separado, la
// Roxzone si el coach la activó, cada tramo y cada estación.
//
// Y la carrera comprometida (Alex, 25-09): en vivo se juzga contra el objetivo
// del coach; el COSTE propio («+14 s/km sobre tu fresco») sale aquí, y solo con
// los pares que pide el coach (4 por defecto). Con menos no se da un número:
// se dice por qué no. Los segundos de más por tramo tampoco se enseñan sin
// pares suficientes: serían el mismo número sin validar, por la puerta de atrás.

import {
  ALTO_UTIL,
  ANCHO_UTIL,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  Instruccion,
  Nota,
  T,
  altoHeroe,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  num,
  principal,
  type PaginaVivo,
  type PasoBase,
} from '../../kit-reloj';
import { costeTrasEstacion, paginar, type Coste, type Completitud, type EstadoGuardado, type MetodoResumen, type Resultado, type TramoHecho } from './calculo';
import { LineaAjustada } from './ajuste';
import { tiempoCircuito } from './resultados';
import { Dato, FilaLista, LineaGuardado } from './resumen-piezas';

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;
const HUECO_LISTA = 4;
/** Entre estaciones, menos aire: cinco caben en una página. */
const HUECO_ESTACIONES = 2;
const COL_TIEMPO = 54;
const ANCHO_NOMBRE = ANCHO_UTIL - 12 - COL_TIEMPO - 8;

const carreras = (r: Resultado) => r.circuito.filter((t) => t.paso.clase === 'carrera');
const estaciones = (r: Resultado) => r.circuito.filter((t) => t.paso.clase === 'estacion');
const suma = (ts: TramoHecho[]) => ts.reduce((a, t) => a + t.segundos, 0);

// ---------------------------------------------------------------------------
// Página 1
// ---------------------------------------------------------------------------

function PaginaCircuito({ r, c, guardado }: { r: Resultado; c: Completitud; guardado: EstadoGuardado }) {
  const filas: Array<keyof typeof FILA> = ['contexto', 'tercero', 'tercero', 'nota'];
  if (r.roxzoneS != null) filas.push('nota');
  return (
    <Columna>
      <ContextoLinea partes={[c.cuenta ?? 'Circuito', ESTADO[c.estado]]} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(tiempoCircuito(r)), etiqueta: 'circuito' }} altoMax={altoHeroe(filas)} />
      </div>
      <Dato etiqueta="Carrera" valor={fmtReloj(suma(carreras(r)))} />
      <Dato etiqueta="Estaciones" valor={fmtReloj(suma(estaciones(r)))} />
      {r.roxzoneS != null ? <Nota>{`Roxzone ${fmtReloj(r.roxzoneS)}`}</Nota> : null}
      <LineaGuardado estado={guardado} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// La carrera, tramo a tramo
// ---------------------------------------------------------------------------

function objetivoTexto(p: PasoBase): string | null {
  const o = principal(p);
  if (!o) return null;
  return o.eje === 'rpe' ? `RPE ${num(o.min ?? o.max ?? 0)}` : null;
}

function PaginaCarrera({ r, coste }: { r: Resultado; coste: Coste }) {
  const ts = carreras(r);
  const primero = ts[0]?.paso;
  const partes = ['Carrera', ...(primero ? [fmtPrescrito(primero.medida)] : []), ...(primero && objetivoTexto(primero) ? [objetivoTexto(primero)!] : [])];
  const fresco = coste.estado === 'hay' ? coste.fresco : null;
  return (
    <Columna estilo={{ gap: HUECO_LISTA }}>
      <ContextoLinea partes={partes} tono={C.tinta2} />
      {ts.map((t) => {
        const ritmo = t.metros ? t.segundos / (t.metros / 1000) : null;
        const d = fresco != null && ritmo != null && t.tras != null ? Math.round(ritmo - fresco) : null;
        return (
          <FilaLista
            key={t.paso.id}
            n={String(t.ronda)}
            valor={fmtReloj(t.segundos)}
            apoyo={t.metros != null && t.metros !== 1000 ? fmtRitmo(ritmo) : null}
            derecha={
              t.tras == null ? (
                <span style={{ color: C.tinta2 }}>fresco</span>
              ) : d != null ? (
                <span style={{ fontWeight: 700 }}>{`${d >= 0 ? '+' : '−'}${Math.abs(d)} s`}</span>
              ) : null
            }
          />
        );
      })}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las estaciones
// ---------------------------------------------------------------------------

function dosisEstacion(p: PasoBase): string {
  const carga = p.carga ? `${p.carga.implementos ? `${p.carga.implementos} × ` : ''}${num(p.carga.kg)} kg` : null;
  return [fmtPrescrito(p.medida), carga].filter(Boolean).join(' · ');
}

/** Cada estación en dos líneas fijas: el nombre de catálogo y su dosis. Nada se parte ni se sale (`LineaAjustada`). */
const ALTO_ESTACION = 36;

function FilaEstacion({ t }: { t: TramoHecho }) {
  const linea = { fontSize: T.nota.cuerpo, lineHeight: '18px' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', padding: '0 6px', boxSizing: 'border-box', height: ALTO_ESTACION }}>
      <span style={{ width: COL_TIEMPO, flex: '0 0 auto', fontSize: T.tercero.cuerpo, fontWeight: 600, fontVariantNumeric: 'tabular-nums', lineHeight: '18px' }}>
        {fmtReloj(t.segundos)}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', width: ANCHO_NOMBRE, minWidth: 0 }}>
        <LineaAjustada texto={t.paso.nombre ?? ''} estilo={{ ...linea, fontWeight: 600 }} />
        <LineaAjustada texto={dosisEstacion(t.paso)} estilo={{ ...linea, fontWeight: 500, color: C.tinta2 }} />
      </div>
    </div>
  );
}

function PaginaEstaciones({ ts, total }: { ts: TramoHecho[]; total: string }) {
  return (
    <Columna estilo={{ gap: HUECO_ESTACIONES, alignItems: 'stretch' }}>
      <ContextoLinea partes={['Estaciones', total]} tono={C.tinta2} />
      {ts.map((t) => (
        <FilaEstacion key={t.paso.id} t={t} />
      ))}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// El coste tras estación — o por qué no lo hay
// ---------------------------------------------------------------------------

function PaginaCoste({ coste }: { coste: Coste }) {
  const filas: Array<keyof typeof FILA> = ['contexto', 'instruccion', 'nota', 'nota'];
  if (coste.estado === 'hay') {
    return (
      <Columna>
        <ContextoLinea partes={['Tus km tras estación']} tono={C.tinta2} />
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Heroe heroe={{ clase: 'crono', texto: `${coste.seg >= 0 ? '+' : '−'}${Math.abs(coste.seg)}`, unidad: 's/km' }} altoMax={altoHeroe(filas)} />
        </div>
        <Instruccion texto="sobre tu fresco" />
        <Nota>{`${fmtRitmo(coste.fresco)} fresco · ${fmtRitmo(coste.tras)} tras`}</Nota>
        <Nota>{`${coste.pares} pares · en prueba`}</Nota>
      </Columna>
    );
  }
  // Sin coste: el número grande dice cuántos pares hay frente a los que pide el coach.
  const faltan = coste.estado === 'faltan';
  return (
    <Columna>
      <ContextoLinea partes={['Tus km tras estación']} tono={C.tinta2} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Heroe
          heroe={faltan ? { clase: 'crono', texto: `${coste.pares} de ${coste.minimo}`, unidad: 'pares' } : { clase: 'crono', texto: '—' }}
          altoMax={altoHeroe(filas)}
          tono={C.tinta2}
        />
      </div>
      <Instruccion texto={faltan ? 'Aún sin coste' : 'Sin km fresco'} />
      <Nota>{faltan ? `Tu coach pide ${coste.minimo} pares` : 'Hoy no hubo con qué comparar'}</Nota>
      <Nota>Con menos, sería adivinar</Nota>
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las páginas del circuito
// ---------------------------------------------------------------------------

export function paginasCircuito(r: Resultado, c: Completitud, guardado: EstadoGuardado, metodo: MetodoResumen): PaginaVivo[] {
  const coste = costeTrasEstacion(r.circuito, metodo);
  const est = estaciones(r);
  const total = fmtReloj(suma(est));
  const paginas: PaginaVivo[] = [
    { id: 'resumen', titulo: 'Resumen', contenido: <PaginaCircuito r={r} c={c} guardado={guardado} /> },
    { id: 'carrera', titulo: 'Carrera', contenido: <PaginaCarrera r={r} coste={coste} /> },
  ];
  paginar(est.map(() => ALTO_ESTACION), ALTO_UTIL - FILA.contexto - HUECO_ESTACIONES, HUECO_ESTACIONES).forEach((idx, k) => {
    paginas.push({ id: `estaciones-${k}`, titulo: 'Estaciones', contenido: <PaginaEstaciones ts={idx.map((i) => est[i]!)} total={total} /> });
  });
  paginas.push({ id: 'coste', titulo: 'Tras estación', contenido: <PaginaCoste coste={coste} /> });
  return paginas;
}
