'use client';

// EL EMOM (P12) — ¿cuánto queda de este minuto y qué hago en él?
//
//   héroe      lo que queda de la ventana (el aro del bisel lleva la ventana:
//              cada minuto es un tramo de la sesión y se vacía con el reloj)
//   tarea      «6 Bench Press · 60 kg», con su carga (hoy no llega)
//   luego      la tarea del minuto que viene
//   acción     «doble toque · hecho»: NO cierra la ventana (el reloj no se para
//              porque tú acabes antes); convierte lo que queda en el respiro.
//              Monocromo: el respiro no se tiñe, cambia la palabra.
//   el remo    si la tarea es la ventana entera, sin acción; el PM5 da metros y /500.
//
// Una ventana de correr (572, Run en cinta) NO pasa por aquí: usa la cara de
// correr del kit (P10), con el mismo contexto «EMOM 9/15 · 75″», lo que queda
// de la ventana como héroe, el ritmo de la cinta y el pulso.

import type { ReactNode } from 'react';
import {
  ANCHO_PIE,
  C,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  PistaAccion,
  altoHeroe,
  contextoDe,
  faltaDe,
  fmtReloj,
  fmtRitmo,
  lineaPulso,
  useFilaAccion,
  type FILA,
  type PaginaVivo,
} from '../../kit-reloj';
import { PaginaFilas, PaginaLista, PaginaSplits, type FilaSplit } from './paginas';
import { Centro, Luego, ParDatos, filasLuego } from './piezas';
import { cargaDe, textoTarea, textoTareaCorto, wodDe, type PlanWod } from './planes';
import { esErgo, lecturasErgo, type Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

export function CaraEmom({ v }: { v: Vivo }) {
  const fila = useFilaAccion();
  const { seq, plan } = v;
  const p = seq.paso;
  const w = wodDe(p);
  if (w?.formato !== 'emom') return null;
  const hecha = v.wod.hechas[p.id];
  const falta = faltaDe(p, seq.lecturas) ?? 0;
  const l = lecturasErgo(p, seq.lecturas);
  const pm5 = !w.tarea.dosis && esErgo(p);
  const sig = wodDe(p.siguiente);
  const luego = sig?.formato === 'emom' ? { que: textoTareaCorto({ ...sig.tarea, carga: undefined }, sig.ventanaS), carga: cargaDe(sig.tarea) } : null;
  const conPista = v.accion != null;

  const filas: NombreFila[] = ['contexto', 'instruccion'];
  if (pm5) filas.push('tercero');
  if (luego) filas.push(...filasLuego(luego.que, luego.carga));
  if (conPista) filas.push(fila);
  filas.push('tercero');

  const tarea = hecha != null ? `✓ ${w.tarea.nombre} en ${fmtReloj(hecha)}` : textoTarea(w.tarea, w.ventanaS);
  return (
    <Columna>
      <ContextoLinea partes={contextoDe(p)} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(Math.ceil(falta)), etiqueta: hecha != null ? 'respiro' : 'quedan' }} altoMax={altoHeroe(filas)} />
      </Centro>
      <Instruccion texto={tarea} tono={hecha != null ? C.tinta2 : C.tinta} />
      {pm5 ? (
        <ParDatos a={{ valor: seq.estado.midio ? String(Math.round(seq.estado.metros)) : '—', unidad: 'm' }} b={{ valor: fmtRitmo(l.split500), unidad: '/500' }} />
      ) : null}
      {luego ? <Luego que={luego.que} carga={luego.carga} /> : null}
      {conPista ? <PistaAccion accion={v.accion!.etiqueta} /> : null}
      <Linea linea={lineaPulso(p, l, plan.zonas)} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

// ---------------------------------------------------------------------------
// Las páginas: Minuto → Rotación → Minutos → Datos
// ---------------------------------------------------------------------------

export function paginasEmom(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const { seq, plan } = v;
    const e = seq.estado;
    const w = wodDe(seq.paso);
    const ventanaS = w?.formato === 'emom' ? w.ventanaS : 60;
    const total = plan.pasos.length * ventanaS;
    const pasados = plan.pasos.slice(0, e.i);
    // Lo que quedó de cada ventana pasada: la tarea marcada (y cuándo) o lo que midió la máquina.
    const minutos: FilaSplit[] = pasados.map((x) => {
      const wx = wodDe(x);
      const n = String(x.posicion?.serie?.n ?? '');
      const vuelta = e.vueltas.find((vv) => vv.n === x.posicion?.serie?.n);
      const nombre = { texto: x.nombre ?? '', fuera: false };
      if (wx?.formato === 'emom' && wx.tarea.dosis) {
        const h = v.wod.hechas[x.id];
        // Marcada: cuándo (lo que tardó la tarea); sin marcar: no se sabe, no «fallada».
        return { n, valor: h != null ? fmtReloj(h) : '—', juicio: nombre };
      }
      return { n, valor: vuelta?.metros != null ? `${vuelta.metros} m` : '—', juicio: nombre };
    });
    const tareas = pasados.filter((x) => {
      const wx = wodDe(x);
      return wx?.formato === 'emom' && !!wx.tarea.dosis;
    });
    const aTiempo = tareas.filter((x) => v.wod.hechas[x.id] != null).length;
    // Los metros medios por ventana, solo si los da UNA máquina (en 572 remo,
    // ski y cinta no se promedian entre sí).
    const medidas = pasados.filter((x) => e.vueltas.some((vv) => vv.n === x.posicion?.serie?.n && vv.metros != null));
    const unaMaquina = new Set(medidas.map((x) => x.nombre)).size === 1;
    const metros = unaMaquina ? medidas.map((x) => e.vueltas.find((vv) => vv.n === x.posicion?.serie?.n)!.metros!) : [];
    const quedaTotal = Math.max(0, total - (e.i * ventanaS + seq.lecturas.t));
    return [
      { id: 'paso', titulo: 'Minuto', contenido: cara },
      {
        id: 'rotacion',
        titulo: 'Rotación',
        contenido: (
          <PaginaLista
            titulo={[datos.titulo, `cada ${ventanaS === 60 ? '1′' : `${ventanaS}″`}`]}
            filas={datos.estructura(e.i)}
            pie={`quedan ${fmtReloj(quedaTotal)} de ${fmtReloj(total)}`}
          />
        ),
      },
      {
        id: 'minutos',
        titulo: ventanaS === 60 ? 'Minutos' : 'Ventanas',
        contenido: (
          <PaginaSplits
            titulo={[ventanaS === 60 ? 'Minutos' : 'Ventanas', tareas.length > 0 ? `${aTiempo}/${tareas.length} a tiempo` : ''].filter(Boolean)}
            filas={minutos}
            enCurso={{ n: String(seq.paso.posicion?.serie?.n ?? ''), valor: fmtReloj(seq.lecturas.t), detalle: `${seq.paso.nombre ?? ''} · ahora` }}
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
              { valor: fmtReloj(e.sesionT), unidad: `de ${fmtReloj(total)}` },
              ...(tareas.length > 0 ? [{ valor: `${aTiempo}/${tareas.length}`, unidad: 'tareas a tiempo' }] : []),
              ...(metros.length > 0 ? [{ valor: String(Math.round(metros.reduce((a, b) => a + b, 0) / metros.length)), unidad: `m de ${medidas[0]!.nombre} medio` }] : []),
              { valor: seq.lecturas.ppm == null ? '—' : String(Math.round(seq.lecturas.ppm)), unidad: 'ppm', ppm: seq.lecturas.ppm },
            ]}
          />
        ),
      },
    ];
  };
}
