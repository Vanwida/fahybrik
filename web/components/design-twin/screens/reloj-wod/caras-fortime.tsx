'use client';

// EL FOR TIME (P12) — el crono total ES la puntuación y no se va nunca.
//
//   contexto   «Ronda 3/3 · cap 20:00»: el cap a la vista
//   héroe      el crono total (la única excepción a «el objetivo manda» de la
//              familia: el objetivo de un For Time ES el tiempo)
//   tarea      el movimiento con su dosis («20 Wall Ball · 9 kg»); si lo mide
//              una máquina, lo que queda («Row · quedan 60 m») y se cierra solo
//   luego      lo que viene («Ronda 3/3 · 500 m Row» si abre ronda)
//   final      el crono se congela: ese es tu tiempo
//
// 552, un 5K For Time, es una contrarreloj: el crono manda, debajo lo que
// queda, el ritmo ACTUAL y a qué hora llegas al ritmo medio que llevas.

import type { ReactNode } from 'react';
import {
  ANCHO_PIE,
  C,
  Centro,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PaginaDatos,
  PaginaFilas,
  PaginaLista,
  PaginaVueltas,
  PistaAccion,
  altoHeroe,
  faltaDe,
  fmtDistancia,
  fmtReloj,
  fmtRitmo,
  lineaPulso,
  lineasDeNota,
  sesionDe,
  textoTarea,
  useFilaAccion,
  wodDe,
  type FILA,
  type PaginaVivo,
} from '../../kit-reloj';
import type { PlanWod } from './planes';
import type { Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

// ---------------------------------------------------------------------------
// El WOD
// ---------------------------------------------------------------------------

export function CaraForTime({ v }: { v: Vivo }) {
  const fila = useFilaAccion();
  const { seq, plan } = v;
  const p = seq.paso;
  const w = wodDe(p);
  if (w?.formato !== 'fortime' || !w.tarea) return null;
  const ronda = p.posicion?.ronda;
  const medido = w.tarea.mide !== 'atleta';
  const falta = faltaDe(p, seq.lecturas);
  const quedan = falta == null ? '—' : `${fmtDistancia(falta).valor} ${fmtDistancia(falta).unidad}`;
  const tarea = medido ? `${w.tarea.nombre} · quedan ${quedan}` : textoTarea(w.tarea);

  const sig = p.siguiente;
  const ws = wodDe(sig);
  const abre = sig?.posicion?.estacion?.n === 1 && sig.posicion.ronda;
  const luego = ws?.formato === 'fortime' && ws.tarea ? `${abre ? `Ronda ${abre.n}/${abre.de} · ` : ''}${textoTarea(ws.tarea)}` : null;
  const conPista = !medido && v.accion != null;

  const filas: NombreFila[] = ['contexto', 'instruccion'];
  filas.push(luego && lineasDeNota(`Luego · ${luego}`) === 2 ? 'nota2' : 'nota');
  if (conPista) filas.push(fila);
  filas.push('tercero');
  return (
    <Columna>
      <ContextoLinea partes={[ronda ? `Ronda ${ronda.n}/${ronda.de}` : 'For Time', w.capS ? `cap ${fmtReloj(w.capS)}` : ''].filter(Boolean)} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(seq.estado.sesionT) }} altoMax={altoHeroe(filas)} />
      </Centro>
      <Instruccion texto={tarea} />
      {luego ? (
        <Nota tono={C.tinta} prefijo="Luego ·">
          {luego}
        </Nota>
      ) : (
        <Nota>último movimiento</Nota>
      )}
      {conPista ? <PistaAccion accion={v.accion!.etiqueta} /> : null}
      <Linea linea={lineaPulso(p, seq.lecturas, plan.zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

/** Al acabar: el crono congelado ES la puntuación. */
export function FinalForTime({ v, rondas }: { v: Vivo; rondas: number }) {
  const w = wodDe(v.seq.paso);
  const cap = w?.formato === 'fortime' ? w.capS : null;
  const t = v.seq.estado.sesionT;
  const filas: NombreFila[] = ['contexto', 'nota', 'nota'];
  return (
    <Columna estilo={{ background: C.fondo }}>
      <ContextoLinea partes={['For Time', 'hecho']} tono={C.tinta2} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(t), etiqueta: 'tu tiempo' }} altoMax={altoHeroe(filas)} />
      </Centro>
      <Nota tono={C.tinta}>{`${rondas} rondas${cap ? ` · dentro del cap ${fmtReloj(cap)}` : ''}`}</Nota>
      <Nota>guardando…</Nota>
    </Columna>
  );
}

export function paginasForTime(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const { seq, plan } = v;
    const e = seq.estado;
    const ronda = seq.paso.posicion?.ronda;
    const w = wodDe(seq.paso);
    const cap = w?.formato === 'fortime' ? w.capS : null;
    const hechas = ronda ? ronda.n - 1 : 0;
    return [
      { id: 'paso', titulo: 'Tiempo', contenido: cara },
      {
        id: 'tarea',
        titulo: 'Tarea',
        contenido: (
          <PaginaLista
            titulo={[ronda ? `Ronda ${ronda.n}/${ronda.de}` : 'For Time', cap ? `cap en ${fmtReloj(Math.max(0, cap - e.sesionT))}` : '']}
            filas={datos.estructura(e.i)}
            pie={`${e.i}/${plan.pasos.length} movimientos`}
          />
        ),
      },
      {
        id: 'datos',
        titulo: 'Datos',
        contenido: (
          <PaginaFilas
            titulo={['Sesión']}
            zonas={plan.zonas}
            filas={[
              { valor: fmtReloj(e.sesionT), unidad: cap ? `de cap ${fmtReloj(cap)}` : 'total' },
              { valor: String(hechas), unidad: hechas === 1 ? 'ronda hecha' : 'rondas hechas' },
              { valor: seq.lecturas.ppm == null ? '—' : String(Math.round(seq.lecturas.ppm)), unidad: 'ppm', ppm: seq.lecturas.ppm },
              { valor: e.ppmN > 0 ? String(Math.round(e.ppmSuma / e.ppmN)) : '—', unidad: 'ppm medio' },
            ]}
          />
        ),
      },
    ];
  };
}

// ---------------------------------------------------------------------------
// 552 · 5K For Time — una contrarreloj
// ---------------------------------------------------------------------------

export function CaraCarreraForTime({ v }: { v: Vivo }) {
  const { seq, plan } = v;
  const p = seq.paso;
  const e = seq.estado;
  const falta = faltaDe(p, seq.lecturas);
  const d = falta == null ? null : fmtDistancia(falta);
  const total = p.medida.prescrito ?? 0;
  // Al ritmo MEDIO que llevas (el actual baila con cada cuesta y cada giro).
  const medio = e.sesionM > 200 ? e.sesionT / (e.sesionM / 1000) : null;
  const llegas = medio != null ? (medio * total) / 1000 : null;
  const filas: NombreFila[] = ['contexto', 'segundo', 'tercero', 'tercero', 'tercero'];
  return (
    <Columna>
      <ContextoLinea partes={['For Time', `${total / 1000} km`]} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(e.sesionT) }} altoMax={altoHeroe(filas)} />
      </Centro>
      <Linea linea={{ etiqueta: 'quedan', valor: d ? d.valor : '—', unidad: d?.unidad }} cuerpo={30} />
      <Linea linea={{ valor: fmtRitmo(seq.lecturas.ritmo), unidad: '/km' }} cuerpo={22} />
      <Linea linea={{ etiqueta: 'llegas', valor: llegas != null ? fmtReloj(llegas) : '—' }} cuerpo={22} />
      <Linea linea={lineaPulso(p, seq.lecturas, plan.zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

/** 552: las páginas de correr del kit (Datos, Vueltas por km), con el cue del coach en Estructura. */
export function paginasCarrera(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const { seq, plan } = v;
    const e = seq.estado;
    return [
      { id: 'paso', titulo: 'Paso', contenido: cara },
      { id: 'datos', titulo: 'Datos', contenido: <PaginaDatos sesion={sesionDe(e)} lecturas={seq.lecturas} zonas={plan.zonas} /> },
      {
        id: 'vueltas',
        titulo: 'Vueltas',
        contenido: <PaginaVueltas vueltas={e.vueltas} enCurso={{ n: `km ${e.kmN + 1}`, valor: fmtReloj(e.sesionT - e.kmDesdeT) }} />,
      },
      {
        id: 'estructura',
        titulo: 'Estructura',
        contenido: <PaginaLista titulo={['Estructura']} filas={datos.estructura(e.i)} pie={seq.paso.cue ? `Coach · ${seq.paso.cue}` : null} />,
      },
    ];
  };
}
