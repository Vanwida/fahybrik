'use client';

// EL RESUMEN DE FUERZA (529) — cada ejercicio con sus series como quedaron:
// la dosis, la serie más pesada, la carga serie a serie y el RIR, y — honesto
// (P11) — lo que el atleta CONFIRMÓ frente a lo que se quedó con el valor por
// defecto (lo prescrito, que no cuenta como declarado). Lo que quedó por
// defecto se pinta atenuado y se cuenta.
//
// La superserie se lee junta (A1 + A2 en la misma página), como se entrenó.
// El volumen (Σ reps × kg) solo suma lo que lleva carga: el trineo es por
// metros y va con su tiempo.

import { Fragment } from 'react';
import {
  ALTO_UTIL,
  ANCHO_UTIL,
  C,
  Columna,
  ContextoLinea,
  FILA,
  Heroe,
  Nota,
  T,
  altoHeroe,
  anchoTexto,
  fmtPrescrito,
  fmtReloj,
  num,
  type PaginaVivo,
} from '../../kit-reloj';
import { masPesada, miles, paginar, volumen, type Completitud, type EjercicioHecho, type EstadoGuardado, type Resultado, type SerieFuerza } from './calculo';
import { Dato, LineaGuardado } from './resumen-piezas';

const L_NOMBRE = 18;
const L_NOTA = 17;
const ANCHO_TEXTO = ANCHO_UTIL - 12;
const HUECO_EJ = 10;
const ALTO_PAGINA = ALTO_UTIL - FILA.contexto - HUECO_EJ;

const nombreDe = (e: EjercicioHecho) => `${e.paso.posicion?.slot ? `${e.paso.posicion.slot} ` : ''}${e.paso.nombre ?? ''}`;
const cabeNombre = (t: string) => anchoTexto(t, T.suelo, 600) <= ANCHO_TEXTO;
const kgTexto = (e: EjercicioHecho, s: SerieFuerza) => {
  const imp = s.implementos ?? e.paso.carga?.implementos;
  return s.kg == null ? '—' : imp && imp > 1 ? `${imp} × ${num(s.kg)}` : num(s.kg);
};

const tieneRir = (e: EjercicioHecho) => e.series.some((s) => s.rir != null);
const porDefecto = (e: EjercicioHecho) => e.series.filter((s) => !s.confirmada).length;
const cargaVaria = (e: EjercicioHecho) => new Set(e.series.map((s) => s.kg)).size > 1;

export function altoEjercicio(e: EjercicioHecho): number {
  const nombre = cabeNombre(nombreDe(e)) ? L_NOMBRE : 2 * L_NOMBRE;
  return nombre + FILA.tercero + L_NOTA + (tieneRir(e) ? L_NOTA : 0) + (porDefecto(e) > 0 ? L_NOTA : 0);
}

/** Una lista de valores por serie, con las que quedaron por defecto atenuadas. */
function PorSerie({ e, valor, prefijo }: { e: EjercicioHecho; valor: (s: SerieFuerza) => string; prefijo?: string }) {
  return (
    <span style={{ fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, lineHeight: `${L_NOTA}px`, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {prefijo ? `${prefijo} ` : ''}
      {e.series.map((s, i) => (
        <Fragment key={i}>
          {i > 0 ? ' · ' : ''}
          <span style={{ color: s.confirmada ? C.tinta : C.tinta2, opacity: s.confirmada ? 1 : 0.6 }}>{valor(s)}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function EjercicioVista({ e }: { e: EjercicioHecho }) {
  const nombre = nombreDe(e);
  const pesada = masPesada(e);
  const pr = e.paso.medida;
  const iguales = pr.tipo === 'reps' && e.series.every((s) => s.reps === pr.prescrito);
  const dosis = pr.tipo === 'reps' ? (iguales ? `${e.series.length} × ${pr.prescrito}` : `${e.series.length} series`) : `${e.series.length} × ${fmtPrescrito(pr)}`;
  const carga = pesada ? `${cargaVaria(e) ? 'máx ' : ''}${kgTexto(e, pesada)} kg` : pr.tipo === 'reps' ? 'reps' : null;
  const tiempos = e.series.map((s) => s.segundos).filter((x): x is number => x != null);
  const defecto = porDefecto(e);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '0 6px', boxSizing: 'border-box' }}>
      <span style={{ fontSize: cabeNombre(nombre) && anchoTexto(nombre, T.contexto.cuerpo, 600) > ANCHO_TEXTO ? T.suelo : T.contexto.cuerpo, fontWeight: 600, lineHeight: `${L_NOMBRE}px`, textWrap: 'balance' }}>
        {nombre}
      </span>
      <div style={{ height: FILA.tercero, display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap', lineHeight: 1 }}>
        <span style={{ fontSize: T.tercero.cuerpo, fontWeight: 600 }}>{dosis}</span>
        {carga ? <span style={{ fontSize: T.nota.cuerpo, color: C.tinta2 }}>{carga}</span> : null}
      </div>
      {cargaVaria(e) ? (
        <PorSerie e={e} valor={(s) => kgTexto(e, s)} />
      ) : tiempos.length > 0 ? (
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, lineHeight: `${L_NOTA}px`, whiteSpace: 'nowrap' }}>
          {`media ${fmtReloj(tiempos.reduce((a, x) => a + x, 0) / tiempos.length)} · mejor ${fmtReloj(Math.min(...tiempos))}`}
        </span>
      ) : (
        <PorSerie e={e} valor={(s) => (s.reps == null ? '—' : String(s.reps))} />
      )}
      {tieneRir(e) ? <PorSerie e={e} prefijo="RIR" valor={(s) => (s.rir == null ? '—' : num(s.rir))} /> : null}
      {defecto > 0 ? (
        <span style={{ fontSize: T.nota.cuerpo, fontWeight: 500, color: C.tinta2, lineHeight: `${L_NOTA}px` }}>
          {defecto === e.series.length ? 'por defecto: sin anotar' : `${defecto} por defecto`}
        </span>
      ) : null}
    </div>
  );
}

/** El título de un bloque: «Superserie A» si dos ejercicios comparten letra; si no, el nombre. */
function tituloBloque(es: EjercicioHecho[]): string {
  const letras = new Set(es.map((e) => e.paso.posicion?.slot?.charAt(0)).filter(Boolean));
  if (es.length > 1 && letras.size === 1) return `Superserie ${[...letras][0]}`;
  return es.map((e) => e.paso.nombre ?? '').join(' + ');
}

/** Las páginas de ejercicios: una por bloque del coach (y más si no caben). */
export function paginasEjercicios(ejercicios: EjercicioHecho[]): PaginaVivo[] {
  const porBloque = new Map<number, EjercicioHecho[]>();
  ejercicios.forEach((e) => porBloque.set(e.paso.bloque ?? 0, [...(porBloque.get(e.paso.bloque ?? 0) ?? []), e]));
  const paginas: PaginaVivo[] = [];
  [...porBloque.entries()].forEach(([b, es]) => {
    const titulo = tituloBloque(es);
    paginar(es.map(altoEjercicio), ALTO_PAGINA, HUECO_EJ).forEach((idx, k) => {
      paginas.push({
        id: `ej-${b}-${k}`,
        titulo,
        contenido: (
          <Columna estilo={{ gap: HUECO_EJ, alignItems: 'stretch' }}>
            <ContextoLinea partes={[titulo]} tono={C.tinta2} />
            {idx.map((i) => (
              <EjercicioVista key={i} e={es[i]!} />
            ))}
          </Columna>
        ),
      });
    });
  });
  return paginas;
}

// ---------------------------------------------------------------------------
// Página 1 de fuerza
// ---------------------------------------------------------------------------

const ESTADO = { completa: 'completa', parcial: 'parcial', libre: 'libre' } as const;

function PaginaFuerza({ r, c, guardado }: { r: Resultado; c: Completitud; guardado: EstadoGuardado }) {
  const m = /^(\d+) de (\d+)/.exec(c.cuenta ?? '');
  const series = r.fuerza.flatMap((e) => e.series);
  const defecto = series.filter((s) => !s.confirmada).length;
  const vol = r.fuerza.reduce((a, e) => a + volumen(e), 0);
  const nota = defecto > 0 ? `${series.length - defecto} anotadas · ${defecto} por defecto` : 'Todas anotadas';
  return (
    <Columna>
      <ContextoLinea partes={['Fuerza', ESTADO[c.estado]]} />
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Heroe
          heroe={{ clase: 'crono', texto: m ? `${m[1]} de ${m[2]}` : String(series.length), unidad: 'series' }}
          altoMax={altoHeroe(['contexto', 'tercero', 'tercero', 'nota2', 'nota'])}
        />
      </div>
      <Dato valor={`${miles(vol)} kg`} unidad="volumen" />
      <Dato valor={fmtReloj(r.t)} unidad={r.ppmMedio == null ? 'total' : `total · ${Math.round(r.ppmMedio)} ppm`} />
      <Nota>{nota}</Nota>
      <LineaGuardado estado={guardado} />
    </Columna>
  );
}

export function paginasFuerza(r: Resultado, c: Completitud, guardado: EstadoGuardado): PaginaVivo[] {
  return [{ id: 'resumen', titulo: 'Resumen', contenido: <PaginaFuerza r={r} c={c} guardado={guardado} /> }, ...paginasEjercicios(r.fuerza)];
}

