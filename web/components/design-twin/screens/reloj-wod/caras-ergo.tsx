'use client';

// EL ERGO (remo, ski, bici) — el objetivo manda, como corriendo (P3).
//
//   a /500 con PM5    héroe = el /500 ACTUAL contra su banda (BandaObjetivo, ▲▼
//                     y palabra), debajo los metros que quedan y el pulso
//   a /500 sin PM5    los metros los dices tú: el héroe cae a lo que llevas, el
//                     /500 va como instrucción (lo lees en el monitor) y la
//                     serie se cierra con la acción; lo que va por tiempo CUENTA
//                     ATRÁS (hoy sube)
//   a zona            héroe = el pulso contra la zona del coach, fondo teñido,
//                     debajo lo que queda y, si hay PM5, el /500 de apoyo
//   techo de pulso    «máx 142 ppm» a la vista; solo avisa por arriba (M1)

import type { ReactNode } from 'react';
import {
  ANCHO_PIE,
  BandaObjetivo,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PistaAccion,
  altoHeroe,
  fmtObjetivo,
  fmtPrescrito,
  fmtReloj,
  fmtRitmo,
  laminaDelPaso,
  lineasDeNota,
  objetivoDe,
  palabraVeredicto,
  principal,
  useFilaAccion,
  type FILA,
  type LineaVista,
  type PaginaVivo,
} from '../../kit-reloj';
import { PaginaFilas, PaginaLista, PaginaSplits, type FilaSplit } from './paginas';
import { Centro } from './piezas';
import { wodDe, type PlanWod } from './planes';
import { esErgo, lecturasErgo, splitDe, veredictoSerie, type Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

export function CaraErgo({ v }: { v: Vivo }) {
  const fila = useFilaAccion();
  const { seq, plan } = v;
  const p = seq.paso;
  if (wodDe(p)?.formato !== 'ergo') return null;
  const l = lecturasErgo(p, seq.lecturas);
  const lam = laminaDelPaso(p, l, plan.zonas, plan.reglas);
  const o = principal(p);
  const techo = objetivoDe(p, 'techo');
  const declarada = p.medida.mide === 'atleta';
  const pos = p.posicion;
  const nombre = p.nombre ?? 'Ergo';
  const cabeza = pos?.serie
    ? `${nombre} ${pos.serie.n}/${pos.serie.de}`
    : pos?.ronda
      ? `${nombre} ${pos.ronda.n}/${pos.ronda.de}`
      : pos?.tramo
        ? `${nombre} · tramo ${pos.tramo.n}/${pos.tramo.de}`
        : nombre;

  const nota = declarada ? 'sin PM5 · lo dices tú' : lam.nota;
  // Sin máquina que lo mida, el /500 es la instrucción (se lee en el monitor):
  // una banda sin marca durante toda la serie sería un calibre roto.
  const banda = declarada ? null : lam.banda;
  const instruccion = declarada && o ? `a ${fmtObjetivo(o)}` : lam.instruccion;
  // El techo (M1) acompaña sin mandar: solo avisa por arriba, así que va de nota.
  const tope = techo ? fmtObjetivo(techo) : null;
  const segundo = lam.segundo;
  // Con el pulso de héroe, el apoyo es lo que da la máquina (si la hay).
  const tercero: LineaVista | null =
    lam.heroe.clase === 'pulso' ? (esErgo(p) && p.medida.mide === 'ergo' ? { valor: fmtRitmo(l.split500), unidad: '/500' } : null) : lam.tercero;
  const conPista = p.cierre === 'atleta' && v.accion != null;

  const filas: NombreFila[] = ['contexto'];
  if (nota) filas.push(lineasDeNota(nota) === 2 ? 'nota2' : 'nota');
  if (banda) filas.push('banda');
  if (instruccion) filas.push('instruccion');
  if (tope) filas.push('nota');
  if (segundo) filas.push('segundo');
  if (conPista) filas.push(fila);
  if (tercero) filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={[cabeza, fmtPrescrito(p.medida)]} />
      {nota ? <Nota>{nota}</Nota> : null}
      <Centro>
        <Heroe heroe={lam.heroe} altoMax={altoHeroe(filas)} />
      </Centro>
      {banda ? <BandaObjetivo banda={banda} /> : null}
      {instruccion ? <Instruccion texto={instruccion} /> : null}
      {tope ? <Nota>{tope}</Nota> : null}
      {segundo ? <Linea linea={segundo} cuerpo={30} ancho={tercero || conPista ? undefined : ANCHO_PIE} /> : null}
      {conPista ? <PistaAccion accion={v.accion!.etiqueta} /> : null}
      {tercero ? <Linea linea={tercero} cuerpo={22} ancho={ANCHO_PIE} /> : null}
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las páginas: Paso → Series (contra su objetivo) → Datos → Estructura
// ---------------------------------------------------------------------------

export function paginasErgo(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const { seq, plan } = v;
    const e = seq.estado;
    const trabajo = plan.pasos.find((x) => wodDe(x)?.formato === 'ergo' && (x.posicion?.serie || x.posicion?.tramo));
    const o = trabajo ? principal(trabajo) : null;
    const porSplit = o?.eje === 'split500';
    const filas: FilaSplit[] = e.vueltas.map((vv) => {
      if (porSplit && o) {
        const s = splitDe(vv);
        const ver = s != null ? veredictoSerie(o, s, plan) : null;
        const w = ver ? palabraVeredicto('split500', ver) : null;
        // Sin metros medidos (sin PM5) no hay /500 que juzgar: su tiempo, y se dice por qué.
        if (s == null) return { n: String(vv.n), valor: fmtReloj(vv.segundos), juicio: { texto: 'sin /500', fuera: false } };
        // El /500 medio de la serie contra su objetivo (el tiempo de 250 m ya lo dice).
        return { n: String(vv.n), valor: fmtRitmo(s), juicio: w ? { texto: w.marca ? `${w.marca} ${w.texto}` : w.texto, fuera: !!w.marca } : null };
      }
      const w = vv.veredicto ? palabraVeredicto(vv.eje ?? 'zona', vv.veredicto) : null;
      return { n: String(vv.n), valor: fmtReloj(vv.segundos), detalle: vv.ppm != null ? `${vv.ppm} ppm` : null, juicio: w ? { texto: w.marca ? `${w.marca} ${w.texto}` : w.texto, fuera: !!w.marca } : null };
    });
    const cuenta = seq.paso.posicion?.serie ?? seq.paso.posicion?.tramo;
    const enCurso = seq.paso.rol === 'trabajo' && cuenta ? { n: String(cuenta.n), valor: fmtReloj(seq.lecturas.t) } : null;
    // El /500 medio de lo trabajado (las recuperaciones no reman).
    const conMetros = e.vueltas.filter((vv) => vv.metros != null && vv.metros > 0);
    const medio = conMetros.length > 0 ? (conMetros.reduce((a, x) => a + x.segundos, 0) * 500) / conMetros.reduce((a, x) => a + x.metros!, 0) : null;
    const paginas: PaginaVivo[] = [{ id: 'paso', titulo: 'Paso', contenido: cara }];
    if (trabajo) {
      paginas.push({
        id: 'series',
        titulo: porSplit ? 'Series' : 'Tramos',
        contenido: <PaginaSplits titulo={porSplit && o ? ['Series', fmtObjetivo(o)] : ['Tramos']} filas={filas} enCurso={enCurso} />,
      });
    }
    paginas.push(
      {
        id: 'datos',
        titulo: 'Datos',
        contenido: (
          <PaginaFilas
            titulo={['Sesión']}
            zonas={plan.zonas}
            filas={[
              { valor: fmtReloj(e.sesionT), unidad: 'total' },
              ...(e.sesionM > 0 ? [{ valor: String(Math.round(e.sesionM)), unidad: 'm' }] : []),
              ...(medio != null ? [{ valor: fmtRitmo(medio), unidad: '/500 medio' }] : []),
              { valor: seq.lecturas.ppm == null ? '—' : String(Math.round(seq.lecturas.ppm)), unidad: 'ppm', ppm: seq.lecturas.ppm },
            ]}
          />
        ),
      },
      { id: 'estructura', titulo: 'Estructura', contenido: <PaginaLista titulo={[datos.titulo]} filas={datos.estructura(e.i)} /> },
    );
    return paginas;
  };
}
