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

import type { ReactNode } from 'react';
import {
  ANCHO_HEROE,
  ANCHO_PIE,
  C,
  FILA,
  T,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  PistaAccion,
  altoHeroe,
  faltaDe,
  fmtReloj,
  lineaPulso,
  lineasDeNota,
  tallaHeroe,
  textoPasoCorto,
  useCabe,
  useFilaAccion,
  type PaginaVivo,
} from '../../kit-reloj';
import { PaginaFilas, PaginaLista, PaginaSplits, PaginaTarea, type FilaSplit } from './paginas';
import { CapturaCorona, Centro } from './piezas';
import { cargaDe, wodDe, type PlanWod, type Tarea } from './planes';
import type { Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

const repsPorRonda = (tareas: Tarea[]) => tareas.reduce((a, t) => a + (t.dosis?.prescrito ?? 0), 0);

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
        <Instruccion texto={[t.nombre, cargaDe(t)].filter(Boolean).join(' · ')} />
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
// La campana: la puntuación con la corona
// ---------------------------------------------------------------------------

/** 18 reps de una ronda 12/10/8 → «12 Wall Ball + 6 KB Swing»: dónde te quedaste. */
function desglose(tareas: Tarea[], reps: number): string {
  const partes: string[] = [];
  let resto = reps;
  for (const t of tareas) {
    if (resto <= 0) break;
    const n = Math.min(resto, t.dosis?.prescrito ?? 0);
    partes.push(`${n} ${t.nombre}`);
    resto -= n;
  }
  return partes.join(' + ');
}

/**
 * «7 + 18»: las rondas (contadas en vivo) en tinta; el «+» y las reps en tinta2
 * hasta que se dicen. El tamaño, el del héroe del kit (`tallaHeroe`).
 */
function HeroePuntuacion({ rondas, reps, altoMax }: { rondas: number; reps: number | null; altoMax: number }) {
  const texto = `${rondas} + ${reps ?? '—'}`;
  // Tres piezas y dos huecos: 20 pt de aire para que no toque el bisel.
  const talla = tallaHeroe(texto, undefined, ANCHO_HEROE - 20, altoMax - FILA.etiquetaHeroe);
  const cifra = { fontSize: talla.cuerpo, fontWeight: T.heroe.peso, lineHeight: T.heroe.caja, fontVariantNumeric: 'tabular-nums' as const };
  // El cinturón del kit: si el navegador no tiene SF y se pasa de ancho, escala.
  const ref = useCabe<HTMLSpanElement>();
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: T.nota.cuerpo, fontWeight: T.nota.peso, color: C.tinta2, lineHeight: `${FILA.etiquetaHeroe}px` }}>rondas + reps</span>
      <span ref={ref} style={{ whiteSpace: 'nowrap', display: 'inline-block', transformOrigin: 'center' }}>
        <span style={{ ...cifra, color: C.tinta }}>{rondas}</span>
        <span style={{ ...cifra, color: C.tinta2 }}>{' + '}</span>
        <span style={{ ...cifra, color: reps == null ? C.tinta2 : C.tinta }}>{reps ?? '—'}</span>
      </span>
    </div>
  );
}

export function CaraPuntuacion({ v }: { v: Vivo }) {
  const fila = useFilaAccion();
  const { seq, plan, dial } = v;
  const p = seq.paso;
  const w = wodDe(p);
  if (w?.formato !== 'puntuacion' || !dial) return null;
  // La campana es «deja de trabajar»: monocroma, como Recupera (P6).
  const pulso = { ...lineaPulso(p, seq.lecturas, plan.zonas), zona: undefined };
  const multi = w.tareas.length > 1;
  const reps = dial.reps == null ? '—' : String(dial.reps);
  // En un chipper el reloj sigue: lo que viene, y cuándo.
  const falta = faltaDe(p, seq.lecturas);
  const luego = falta != null ? trasPuntuacion(plan, seq.estado.i) : null;

  const lineas: string[] = [];
  if (multi) {
    lineas.push(dial.reps == null || dial.reps === 0 ? `reps de la ronda ${dial.rondas + 1}` : desglose(w.tareas, dial.reps));
  }
  lineas.push(dial.reps == null ? 'gira la corona' : 'sin guardar');

  const filas: NombreFila[] = ['contexto', ...lineas.map(() => 'nota' as const)];
  if (luego) filas.push('nota');
  filas.push(fila, 'tercero');
  // Lo que falta por decir va en tinta2: «7 + —» no puede leerse como un número.
  const pendiente = dial.reps == null;
  return (
    <CapturaCorona onPaso={v.girar}>
      <Columna>
        <ContextoLinea partes={['Puntuación', `AMRAP ${w.duracionS / 60}′`]} />
        <Centro>
          {multi ? (
            <HeroePuntuacion rondas={dial.rondas} reps={dial.reps} altoMax={altoHeroe(filas)} />
          ) : (
            <Heroe
              heroe={{ clase: 'crono', texto: reps, unidad: 'reps', etiqueta: w.tareas[0]!.nombre }}
              altoMax={altoHeroe(filas)}
              tono={pendiente ? C.tinta2 : C.tinta}
            />
          )}
        </Centro>
        {lineas.map((x, k) => (
          <Nota key={k} tono={k === 0 && multi && dial.reps ? C.tinta : C.tinta2}>
            {x}
          </Nota>
        ))}
        {luego && falta != null ? (
          <Nota tono={C.tinta} prefijo="Luego ·">
            {`${luego.split(' · ')[0]} en ${fmtReloj(Math.ceil(falta))}`}
          </Nota>
        ) : null}
        <PistaAccion accion="guardar" />
        <Linea linea={pulso} cuerpo={22} ancho={ANCHO_PIE} />
      </Columna>
    </CapturaCorona>
  );
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
