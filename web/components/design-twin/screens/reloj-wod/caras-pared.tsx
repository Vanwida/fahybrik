'use client';

// EL RELOJ DE PARED (Tabata, intervalos sin máquina) — ¿trabajo o descanso,
// cuánto queda de esta ventana y cuántas rondas faltan?
//
// Manda el reloj: no hay acción del momento (nada que cerrar), la ventana se
// corta sola. El estado lo dice la PALABRA encima del número («trabajo» /
// «descanso»), no un color (P6: el descanso es monocromo como en todo el vivo).
// La cadencia, en una marca por ronda. El 3-2-1 y el GO son los del kit, y la
// voz, corta: «Ronda 5 de 8.» / «Descanso.».

import type { ReactNode } from 'react';
import {
  ANCHO_PIE,
  C,
  Columna,
  ContextoLinea,
  Heroe,
  Instruccion,
  Linea,
  Nota,
  altoHeroe,
  faltaDe,
  fmtDuracion,
  fmtObjetivo,
  fmtReloj,
  lineaPulso,
  principal,
  type FILA,
  type PaginaVivo,
} from '../../kit-reloj';
import { PaginaFilas, PaginaLista } from './paginas';
import { Centro, RondasPared } from './piezas';
import { wodDe, type PlanWod } from './planes';
import type { Vivo } from './vivo';

type NombreFila = keyof typeof FILA;

export function CaraPared({ v }: { v: Vivo }) {
  const { seq, plan } = v;
  const p = seq.paso;
  const w = wodDe(p);
  if (w?.formato !== 'pared') return null;
  const trabajo = p.rol === 'trabajo';
  // La ronda: la del paso de trabajo, o la que acaba de terminar si es descanso.
  const ronda = trabajo ? (p.posicion?.ronda?.n ?? 1) : (v.anterior?.posicion?.ronda?.n ?? 0);
  const falta = Math.ceil(faltaDe(p, seq.lecturas) ?? 0);
  const cadencia = `${fmtDuracion(w.trabajoS)}/${fmtDuracion(w.descansoS)}`;
  const o = trabajo ? principal(p) : null;
  const sig = p.siguiente;
  // Monocromo en el descanso (P6): el pulso sin la marca de color de su zona.
  const pulso = lineaPulso(p, seq.lecturas, plan.zonas);
  const filas: NombreFila[] = ['contexto', trabajo ? 'instruccion' : 'nota', 'nota', 'tercero'];
  return (
    <Columna>
      <ContextoLinea partes={[trabajo ? `Ronda ${ronda}/${w.rondas}` : `Quedan ${w.rondas - ronda} rondas`, cadencia]} />
      <Centro>
        <Heroe heroe={{ clase: 'crono', texto: fmtReloj(falta), etiqueta: trabajo ? 'trabajo' : 'descanso' }} altoMax={altoHeroe(filas)} />
      </Centro>
      {trabajo ? (
        <Instruccion texto={[p.nombre, o ? fmtObjetivo(o) : null].filter(Boolean).join(' · ')} />
      ) : sig ? (
        <Nota tono={C.tinta} prefijo="Viene:">
          {`Ronda ${ronda + 1}/${w.rondas} · ${sig.nombre ?? ''}`}
        </Nota>
      ) : null}
      <RondasPared total={w.rondas} hechas={trabajo ? ronda - 1 : ronda} ahora={trabajo} />
      <Linea linea={trabajo ? pulso : { ...pulso, zona: undefined }} cuerpo={22} ancho={ANCHO_PIE} />
    </Columna>
  );
}

export function paginasPared(datos: PlanWod) {
  return (v: Vivo, cara: ReactNode): PaginaVivo[] => {
    const { seq, plan } = v;
    const e = seq.estado;
    const hechas = plan.pasos.slice(0, e.i).filter((x) => x.rol === 'trabajo').length;
    const total = plan.pasos.filter((x) => x.rol === 'trabajo').length;
    return [
      { id: 'paso', titulo: 'Reloj', contenido: cara },
      { id: 'estructura', titulo: 'Estructura', contenido: <PaginaLista titulo={[datos.titulo]} filas={datos.estructura(e.i)} /> },
      {
        id: 'datos',
        titulo: 'Datos',
        contenido: (
          <PaginaFilas
            titulo={['Sesión']}
            zonas={plan.zonas}
            filas={[
              { valor: fmtReloj(e.sesionT), unidad: 'total' },
              { valor: `${hechas}/${total}`, unidad: 'rondas hechas' },
              { valor: seq.lecturas.ppm == null ? '—' : String(Math.round(seq.lecturas.ppm)), unidad: 'ppm', ppm: seq.lecturas.ppm },
              { valor: e.ppmN > 0 ? String(Math.round(e.ppmSuma / e.ppmN)) : '—', unidad: 'ppm medio' },
            ]}
          />
        ),
      },
    ];
  };
}
