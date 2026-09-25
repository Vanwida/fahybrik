'use client';

// EL AMRAP (P12) — ¿cuántas rondas llevo y cuánto queda?
//
//   contexto   «AMRAP · quedan 6:18»: lo que queda va arriba, siempre a la vista
//   héroe      las rondas (las cuentas tú: «doble toque · ronda hecha», con
//              deshacer); un AMRAP de UN movimiento no tiene rondas que contar
//              y su héroe es lo que queda de la ventana
//   debajo     la ronda en curso contra la anterior («ronda 5 · 1:18», «última 1:58»)
//   corona     Ronda → Tarea (la ronda EN LA MUÑECA, no en el móvil) → Rondas → Datos
//   campana    la corona pasa a las reps de la ronda a medias: la puntuación es
//              rondas + reps, y lo que no se dice queda «sin declarar», nunca 0.
//              Es la cara del kit (`CaraPuntuacion`): las reps SOLO se dicen
//              aquí (Alex, 25-09); durante el AMRAP no hay corona de reps.

import type { ReactNode } from 'react';
import {
  ANCHO_PIE,
  C,
  CaraPuntuacion as Campana,
  Centro,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PaginaFilas,
  PaginaLista,
  PaginaSplits,
  PistaAccion,
  altoHeroe,
  cargaTarea,
  faltaDe,
  fmtReloj,
  lineaPulso,
  lineasDeNota,
  repsPorRonda,
  textoPasoCorto,
  useFilaAccion,
  wodDe,
  type FILA,
  type FilaSplit,
  type PaginaVivo,
} from '../../kit-reloj';
import { PaginaTarea } from './paginas';
import type { PlanWod } from './planes';
import type { Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

/** Lo que viene tras la puntuación de un AMRAP en un chipper: «Run · 800 m a RPE 8». */
function trasPuntuacion(plan: Vivo['plan'], i: number): string | null {
  const sig = plan.pasos[i + 1];
  const tras = wodDe(sig)?.formato === 'puntuacion' ? plan.pasos[i + 2] : sig;
  if (!tras || tras.rol !== 'trabajo') return null;
  return textoPasoCorto(tras);
}

// ---------------------------------------------------------------------------
// La ventana
// ---------------------------------------------------------------------------

export function CaraAmrap({ v }: { v: Vivo }) {
  const fila = useFilaAccion();
  const { seq, plan } = v;
  const p = seq.paso;
  const w = wodDe(p);
  if (w?.formato !== 'amrap') return null;
  const falta = Math.ceil(faltaDe(p, seq.lecturas) ?? 0);
  const pulso = lineaPulso(p, seq.lecturas, plan.zonas);

  // Un solo movimiento: nada que contar en vivo; manda lo que queda.
  if (w.tareas.length === 1) {
    const t = w.tareas[0]!;
    const ronda = p.posicion?.ronda;
    const luego = trasPuntuacion(plan, seq.estado.i);
    const filas: NombreFila[] = ['contexto', 'instruccion', 'nota'];
    if (luego) filas.push(lineasDeNota(`Luego · ${luego}`) === 2 ? 'nota2' : 'nota');
    filas.push('tercero');
    return (
      <Columna>
        <ContextoLinea partes={[ronda ? `Ronda ${ronda.n}/${ronda.de}` : '', `AMRAP ${w.duracionS / 60}′`].filter(Boolean)} />
        <Centro>
          <Heroe heroe={{ clase: 'crono', texto: fmtReloj(falta), etiqueta: 'quedan' }} altoMax={altoHeroe(filas)} />
        </Centro>
        <Instruccion texto={[t.nombre, cargaTarea(t)].filter(Boolean).join(' · ')} />
        <Nota>reps: al final, con la corona</Nota>
        {luego ? (
          <Nota tono={C.tinta} prefijo="Luego ·">
            {luego}
          </Nota>
        ) : null}
        <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} />
      </Columna>
    );
  }

  const rondas = v.wod.rondas[p.id] ?? [];
  const desde = rondas.at(-1) ?? 0;
  const ultima = rondas.length > 0 ? rondas.at(-1)! - (rondas.at(-2) ?? 0) : null;
  const filas: NombreFila[] = ['contexto', 'tercero'];
  if (ultima != null) filas.push('nota');
  filas.push(fila, 'tercero');
  return (
    <Columna>
      <ContextoLinea partes={['AMRAP', `quedan ${fmtReloj(falta)}`]} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: String(rondas.length), unidad: rondas.length === 1 ? 'ronda' : 'rondas' }} altoMax={altoHeroe(filas)} />
      </Centro>
      <Linea linea={{ etiqueta: `ronda ${rondas.length + 1}`, valor: fmtReloj(seq.lecturas.t - desde) }} cuerpo={22} />
      {ultima != null ? <Nota>{`anterior · ${fmtReloj(ultima)}`}</Nota> : null}
      <PistaAccion accion="ronda hecha" />
      <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// La campana: la puntuación con la corona (la cara del kit; la corona la enfoca el vivo)
// ---------------------------------------------------------------------------

export function CaraPuntuacion({ v }: { v: Vivo }) {
  const { seq, plan, dial } = v;
  if (wodDe(seq.paso)?.formato !== 'puntuacion' || !dial) return null;
  return <Campana paso={seq.paso} lecturas={seq.lecturas} zonas={plan.zonas} dial={dial} />;
}

// ---------------------------------------------------------------------------
// Las páginas: Ronda → Tarea → Rondas → Datos  (la puntuación, sola: la corona es suya)
// ---------------------------------------------------------------------------

function datosAmrap(v: Vivo, extra: Array<{ valor: string; unidad: string }>) {
  const { seq, plan } = v;
  return (
    <PaginaFilas
      titulo={['Sesión']}
      zonas={plan.zonas}
      filas={[
        { valor: fmtReloj(seq.estado.sesionT), unidad: 'total' },
        ...extra,
        { valor: seq.lecturas.ppm == null ? '—' : String(Math.round(seq.lecturas.ppm)), unidad: 'ppm', ppm: seq.lecturas.ppm },
        { valor: seq.estado.ppmN > 0 ? String(Math.round(seq.estado.ppmSuma / seq.estado.ppmN)) : '—', unidad: 'ppm medio' },
      ]}
    />
  );
}

export function paginasAmrap() {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const p = v.seq.paso;
    const w = wodDe(p);
    if (w?.formato === 'puntuacion') return [{ id: 'puntuacion', titulo: 'Puntuación', contenido: cara }];
    const tareas = w?.formato === 'amrap' ? w.tareas : [];
    const rondas = v.wod.rondas[p.id] ?? [];
    const splits: FilaSplit[] = rondas.map((s, k) => ({ n: String(k + 1), valor: fmtReloj(s - (rondas[k - 1] ?? 0)) }));
    const media = rondas.length > 0 ? rondas.at(-1)! / rondas.length : null;
    return [
      { id: 'paso', titulo: 'Ronda', contenido: cara },
      {
        id: 'tarea',
        titulo: 'Tarea',
        contenido: <PaginaTarea titulo={[`Ronda ${rondas.length + 1}`, `${repsPorRonda(tareas)} reps`]} tareas={tareas} pie={w?.formato === 'amrap' ? `AMRAP · quedan ${fmtReloj(Math.ceil(faltaDe(p, v.seq.lecturas) ?? 0))}` : null} />,
      },
      {
        id: 'rondas',
        titulo: 'Rondas',
        contenido: (
          <PaginaSplits
            titulo={media != null ? ['Rondas', `media ${fmtReloj(media)}`] : ['Rondas']}
            filas={splits}
            enCurso={{ n: String(rondas.length + 1), valor: fmtReloj(v.seq.lecturas.t - (rondas.at(-1) ?? 0)) }}
          />
        ),
      },
      { id: 'datos', titulo: 'Datos', contenido: datosAmrap(v, media != null ? [{ valor: fmtReloj(media), unidad: '/ronda media' }] : []) },
    ];
  };
}

/** 506: el chipper entero en la corona — Paso → Estructura → Datos. */
export function paginasChipper(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    if (wodDe(v.seq.paso)?.formato === 'puntuacion') return [{ id: 'puntuacion', titulo: 'Puntuación', contenido: cara }];
    return [
      { id: 'paso', titulo: 'Paso', contenido: cara },
      { id: 'estructura', titulo: 'Estructura', contenido: <PaginaLista titulo={[datos.titulo]} filas={datos.estructura(v.seq.estado.i)} /> },
      { id: 'datos', titulo: 'Datos', contenido: datosAmrap(v, []) },
    ];
  };
}
