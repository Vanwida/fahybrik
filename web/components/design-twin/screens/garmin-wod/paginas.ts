// LAS PÁGINAS DEL WOD — funciones PURAS: lo que se ve con UP/DOWN (Paso →
// Rotación/Estructura → Minutos/Series → Datos) en los formatos donde UP/DOWN
// pasan página. En un AMRAP no hay páginas por UP/DOWN (son las reps: §5, fila
// «AMRAP / puntuación»); allí Datos, Vueltas y Estructura están en Controles y
// las pinta el kit.
//
// Cada página es `disponer(v, D)` sobre el MISMO `VistaWod` que las caras, con
// las piezas del kit (`disponerDatos`, `disponerEstructura`, `disponerVueltas`):
// caben a 218 por construcción. Las filas y los textos salen de `PlanWod` de la
// muñeca (`reloj-wod/planes.ts`), que se importa, no se copia.
//
// Lo que nadie mide no se pinta (G7): el /500 de una serie de ergo NO es una
// lectura de la máquina; se DEDUCE del crono que cerró el atleta y de los metros
// prescritos («250 m en 1:00 = 2:00 /500») y se dice que es el crono el resultado.
//
// Qué NO hacer: escribir un umbral aquí (el veredicto sale de `veredictoDe` con la
// holgura del plan); dar como medido un /500 que sale de una distancia dicha.

import { disponerDatos, disponerEstructura, disponerVueltas, type Disposicion } from '../../kit-garmin';
import {
  fmtObjetivo,
  fmtReloj,
  fmtSplit,
  holguraDe,
  palabraVeredicto,
  principal,
  veredictoDe,
  wodDe,
  type FilaDatoVista,
  type FilaSplit,
  type PasoBase,
  type Vuelta,
} from '../../kit-reloj';
import type { PlanWod } from '../reloj-wod/planes';
import type { VistaWod } from './estado';

export interface PaginaWod {
  id: string;
  titulo: string;
  disponer: (v: VistaWod, D: number) => Disposicion;
}

const entero = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(n)));

/** Las dos filas del pulso que cierran toda página de datos: el de ahora (con su zona) y el medio de la sesión. */
function filasDePulso(v: VistaWod): FilaDatoVista[] {
  const e = v.estado;
  return [
    { valor: entero(v.lecturas.ppm), unidad: 'ppm', ppm: v.lecturas.ppm },
    { valor: e.ppmN > 0 ? entero(e.ppmSuma / e.ppmN) : '—', unidad: 'ppm medio' },
  ];
}

const datos = (v: VistaWod, D: number, delante: FilaDatoVista[]): Disposicion =>
  disponerDatos([{ valor: fmtReloj(v.estado.sesionT), unidad: 'total' }, ...delante, ...filasDePulso(v)], v.plan.zonas, D);

// ---------------------------------------------------------------------------
// EMOM
// ---------------------------------------------------------------------------

/** Las tareas con dosis (las que se marcan «hechas») de las ventanas ya pasadas, y cuántas se marcaron. */
function tareasMarcables(v: VistaWod): { pasadas: PasoBase[]; aTiempo: number } {
  const pasadas = v.plan.pasos.slice(0, v.estado.i).filter((x) => {
    const w = wodDe(x);
    return w?.formato === 'emom' && !!w.tarea.dosis && w.tarea.dosis.tipo !== 'abierta' && !w.tarea.corre;
  });
  return { pasadas, aTiempo: pasadas.filter((x) => v.wod.hechas[x.id] != null).length };
}

/** MINUTOS: cada ventana ya pasada con el segundo en que se marcó su tarea («—» si no se marcó: no se sabe, no «fallada»). */
export function disponerMinutos(v: VistaWod, D: number): Disposicion {
  const w = wodDe(v.paso);
  const ventanaS = w?.formato === 'emom' ? w.ventanaS : 60;
  const filas: FilaSplit[] = v.plan.pasos.slice(0, v.estado.i).map((x) => {
    const h = v.wod.hechas[x.id];
    // El nombre va de detalle: si no cabe se va él, no el tiempo.
    return { n: String(x.posicion?.serie?.n ?? ''), valor: h != null ? fmtReloj(h) : '—', detalle: x.nombre ?? null };
  });
  const { pasadas, aTiempo } = tareasMarcables(v);
  const titulo = [ventanaS === 60 ? 'Minutos' : 'Ventanas', pasadas.length > 0 ? `${aTiempo}/${pasadas.length} a tiempo` : ''].filter(Boolean);
  const enCurso = v.paso.rol === 'trabajo' && v.paso.posicion?.serie ? { n: String(v.paso.posicion.serie.n), valor: fmtReloj(v.lecturas.t) } : null;
  return disponerVueltas(titulo, filas, enCurso, D);
}

// ---------------------------------------------------------------------------
// Ergo: las series, con el /500 deducido del crono
// ---------------------------------------------------------------------------

/** La serie o el tramo de trabajo de un ergo del plan (el primero): de él salen el objetivo y el nombre de la página. */
const trabajoDeErgo = (pasos: PasoBase[]): PasoBase | undefined => pasos.find((x) => x.clase === 'ergo' && (x.posicion?.serie || x.posicion?.tramo));

/** El paso de una vuelta del motor: el de su misma serie o tramo. */
const pasoDeVuelta = (pasos: PasoBase[], vv: Vuelta): PasoBase | undefined =>
  pasos.find((x) => x.clase === 'ergo' && (x.posicion?.serie?.n ?? x.posicion?.tramo?.n) === vv.n);

/**
 * El /500 de una serie de distancia que dijo el atleta: crono × 500 / metros
 * prescritos. `null` si la serie no es de distancia (una por tiempo no se puede
 * deducir) o no hay metros prescritos.
 */
export function ritmoDeducido(vv: Pick<Vuelta, 'segundos'>, paso: PasoBase | undefined): number | null {
  const m = paso?.medida;
  return m?.tipo === 'distancia' && m.prescrito != null && m.prescrito > 0 ? (vv.segundos * 500) / m.prescrito : null;
}

/** SERIES (o TRAMOS): cada una con su resultado. A /500, el ritmo deducido de su crono, contra el objetivo del coach. */
export function disponerSeries(v: VistaWod, D: number): Disposicion {
  const trabajo = trabajoDeErgo(v.plan.pasos);
  const o = trabajo ? principal(trabajo) : null;
  const porSplit = o?.eje === 'split500';
  const filas: FilaSplit[] = v.estado.vueltas.map((vv) => {
    const paso = pasoDeVuelta(v.plan.pasos, vv);
    const juicio = (texto: { marca: '▲' | '▼' | null; texto: string } | null) => (texto ? { texto: texto.marca ? `${texto.marca} ${texto.texto}` : texto.texto, fuera: !!texto.marca } : null);
    if (porSplit && o) {
      const s = ritmoDeducido(vv, paso);
      // Una serie por tiempo (o sin metros prescritos) no da /500: su crono, sin juicio.
      if (s == null) return { n: String(vv.n), valor: fmtReloj(vv.segundos), juicio: null };
      return { n: String(vv.n), valor: fmtSplit(s, paso?.maquina), detalle: fmtReloj(vv.segundos), juicio: juicio(palabraVeredicto('split500', veredictoDe(o, s, holguraDe('split500', v.plan.reglas), v.plan.zonas))) };
    }
    return { n: String(vv.n), valor: fmtReloj(vv.segundos), detalle: vv.ppm != null ? `${vv.ppm} ppm` : null, juicio: juicio(vv.veredicto ? palabraVeredicto(vv.eje ?? 'zona', vv.veredicto) : null) };
  });
  const cuenta = v.paso.posicion?.serie ?? v.paso.posicion?.tramo;
  const enCurso = v.paso.rol === 'trabajo' && cuenta && v.paso.clase === 'ergo' ? { n: String(cuenta.n), valor: fmtReloj(v.lecturas.t) } : null;
  const titulo = porSplit && o ? ['Series', fmtObjetivo(o, trabajo?.maquina)] : ['Tramos'];
  return disponerVueltas(titulo, filas, enCurso, D);
}

// ---------------------------------------------------------------------------
// Las páginas de cada formato
// ---------------------------------------------------------------------------

/** El título de la cara del paso (la primera página), por formato. */
export const TITULO_DEL_PASO: Record<PlanWod['formato'], string> = {
  emom: 'Minuto',
  amrap: 'Ronda',
  chipper: 'Paso',
  fortime: 'Tiempo',
  carrera: 'Paso',
  ergo: 'Paso',
  pared: 'Reloj',
};

const estructura = (plan: PlanWod): PaginaWod => ({ id: 'estructura', titulo: 'Estructura', disponer: (v, D) => disponerEstructura(plan.estructura(v.estado.i), D) });

/**
 * Las páginas de UP/DOWN de un formato, tras la cara del paso. Un AMRAP no tiene
 * (UP/DOWN son las reps) y una carrera For Time usa las cuatro del kit (Datos,
 * Vueltas por km, Estructura): las dos devuelven vacío.
 */
export function paginasDe(plan: PlanWod): PaginaWod[] {
  const pasos = plan.plan.pasos;
  switch (plan.formato) {
    case 'emom': {
      const w = wodDe(pasos[0]);
      const ventanaS = w?.formato === 'emom' ? w.ventanaS : 60;
      return [
        estructura(plan),
        { id: 'minutos', titulo: ventanaS === 60 ? 'Minutos' : 'Ventanas', disponer: disponerMinutos },
        {
          id: 'datos',
          titulo: 'Datos',
          disponer: (v, D) => {
            const { pasadas, aTiempo } = tareasMarcables(v);
            return datos(v, D, pasadas.length > 0 ? [{ valor: `${aTiempo}/${pasadas.length}`, unidad: 'a tiempo' }] : []);
          },
        },
      ];
    }
    case 'fortime':
      return [
        estructura(plan),
        {
          id: 'datos',
          titulo: 'Datos',
          disponer: (v, D) => {
            const ronda = v.paso.posicion?.ronda;
            return datos(v, D, ronda ? [{ valor: `${ronda.n - 1}/${ronda.de}`, unidad: 'rondas' }] : []);
          },
        },
      ];
    case 'chipper':
      return [estructura(plan), { id: 'datos', titulo: 'Datos', disponer: (v, D) => datos(v, D, []) }];
    case 'pared':
      return [
        estructura(plan),
        {
          id: 'datos',
          titulo: 'Datos',
          disponer: (v, D) => {
            const hechas = v.plan.pasos.slice(0, v.estado.i).filter((x) => x.rol === 'trabajo').length;
            return datos(v, D, [{ valor: `${hechas}/${v.plan.pasos.filter((x) => x.rol === 'trabajo').length}`, unidad: 'rondas' }]);
          },
        },
      ];
    case 'ergo': {
      const trabajo = trabajoDeErgo(pasos);
      const o = trabajo ? principal(trabajo) : null;
      const series: PaginaWod[] = trabajo ? [{ id: 'series', titulo: o?.eje === 'split500' ? 'Series' : 'Tramos', disponer: disponerSeries }] : [];
      return [
        ...series,
        {
          id: 'datos',
          titulo: 'Datos',
          disponer: (v, D) => {
            // El /500 medio de lo remado, deducido de los crono de las series de distancia que cerró el atleta.
            const hechas = v.estado.vueltas.map((vv) => ({ vv, paso: pasoDeVuelta(v.plan.pasos, vv) })).filter((x) => ritmoDeducido(x.vv, x.paso) != null);
            const segundos = hechas.reduce((a, x) => a + x.vv.segundos, 0);
            const metros = hechas.reduce((a, x) => a + (x.paso?.medida.prescrito ?? 0), 0);
            return datos(v, D, metros > 0 ? [{ valor: fmtSplit((segundos * 500) / metros, hechas[0]?.paso?.maquina), unidad: '/500 medio' }] : []);
          },
        },
        estructura(plan),
      ];
    }
    case 'amrap':
    case 'carrera':
    default:
      return [];
  }
}
