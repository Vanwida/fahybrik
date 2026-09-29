// LAS FILAS DE LAS PÁGINAS DE FUERZA — del plan y de lo hecho a filas de dato.
// PURAS: lo que se dice sale de `kit-reloj` (`fuerza.ts`, `anotar.ts`) y de
// «Muñeca · fuerza» (`reloj-fuerza/modelo.ts`); aquí solo se ELIGE qué filas.
//
//   filasEjercicios  la sesión por EJERCICIOS (la página Estructura): hecho,
//                    ahora o por venir, con su dosis; el de ahora dice en qué
//                    serie estás y con qué carga (la de la cascada, si el
//                    atleta declaró otra).
//   filasSeries      la página Vueltas: las series ya hechas del ejercicio en
//                    curso (o de su superserie), con lo anotado; propuesto o
//                    declarado, que no es lo mismo.
//   filasDatos       la página Datos: tiempo, series, volumen DECLARADO y, si
//                    hay, cuántas series siguen sin confirmar.
//
// Qué NO hacer: sumar como volumen lo que nadie ha dicho (G7); marcar «ahora»
// un ejercicio que ya acabó mientras el atleta descansa antes del siguiente.

import {
  cargaArrastrada,
  dosisEjercicio,
  dosisSerie,
  esFuerza,
  fmtDuracion,
  fmtPrescrito,
  fmtReloj,
  medidaDe,
  nombreCuenta,
  pendiente,
  quienSerie,
  textoAnotacion,
  textoCargaImplemento,
  type EstadoSecuencia,
  type FilaDatoVista,
  type Lecturas,
  type Paso,
  type PasoBase,
  type PlanSesion,
  type Registro,
  type Simulador,
} from '../../kit-reloj';
import { anteriorTrabajo, ejercicioDe, ejerciciosDe, fmtMiles, siguienteTrabajo, type Ejercicio } from '../reloj-fuerza/modelo';
import { conSlot } from '../reloj-fuerza/textos';
import { anotacionDeSerie, resumenDeclarado } from './modelo';

// ---------------------------------------------------------------------------
// Ejercicios (Estructura)
// ---------------------------------------------------------------------------

export interface FilaEjercicio {
  /** «A1 · Back Squat». */
  nombre: string;
  /** Su dosis, o en qué serie estás si es el de ahora. `null` si el coach no prescribió nada medible. */
  linea2: string | null;
  estado: 'hecho' | 'ahora' | 'pendiente';
}

/** La serie de una estación o un ergo, dicha como la del kit: «Serie 3/8», «Estación 1/6». */
function posicionCorta(q: PasoBase): string {
  const s = q.posicion?.serie;
  return s ? `${nombreCuenta(q).nombre} ${s.n}/${s.de}` : '';
}

/** Lo que se hace en UNA serie (no en una aproximación), con la carga que está en la barra. */
function serieEnPalabras(plan: PlanSesion, j: number, registro: Registro): string {
  const q = plan.pasos[j]!;
  if (esFuerza(q)) return `${quienSerie(q)} · ${dosisSerie(q, cargaArrastrada(plan, j, registro))}`;
  return [posicionCorta(q), fmtPrescrito(q.medida), textoCargaImplemento(q.carga)].filter(Boolean).join(' · ');
}

/** La dosis del ejercicio entero, por su primera serie de trabajo (las aproximaciones no son la dosis). */
function dosisDelEjercicio(plan: PlanSesion, e: Ejercicio): string | null {
  const primero = e.pasos.map((j) => plan.pasos[j]!).find((q) => !(esFuerza(q) && q.fuerza.aproximacion));
  if (!primero) return null;
  if (esFuerza(primero)) return dosisEjercicio(primero, e.series);
  const veces = e.series > 1 ? `${e.series} ×` : '';
  return [veces, fmtPrescrito(primero.medida), textoCargaImplemento(primero.carga)].filter(Boolean).join(' ') || null;
}

/**
 * Los ejercicios de la sesión con su estado. «Ahora» es el ejercicio que estás
 * haciendo o, en un descanso, el que viene (el que acabas de terminar ya está
 * hecho); en una superserie, lo son los dos compañeros mientras dure la ronda.
 */
export function filasEjercicios(plan: PlanSesion, i: number, registro: Registro): { filas: FilaEjercicio[]; ahora: number } {
  const p = plan.pasos[i]!;
  const ref = p.rol === 'trabajo' ? i : (siguienteTrabajo(plan, i + 1) ?? anteriorTrabajo(plan, i) ?? i);
  const ejs = ejerciciosDe(plan);
  const deRef = ejs.find((e) => e.pasos.includes(ref));
  const filas = ejs.map<FilaEjercicio>((e) => {
    const acabado = e.pasos.every((j) => j < i);
    const empezado = e.pasos.some((j) => j < i);
    const estado = e === deRef ? 'ahora' : acabado ? 'hecho' : empezado ? 'ahora' : 'pendiente';
    const siguiente = e.pasos.find((j) => j >= i && plan.pasos[j]!.rol === 'trabajo');
    const linea2 = estado === 'ahora' && siguiente != null ? serieEnPalabras(plan, siguiente, registro) : dosisDelEjercicio(plan, e);
    return { nombre: conSlot(plan.pasos[e.pasos[0]!]!) || e.nombre, linea2, estado };
  });
  const ahora = filas.findIndex((f) => f.estado === 'ahora');
  return { filas, ahora: ahora >= 0 ? ahora : Math.max(0, filas.findIndex((f) => f.estado === 'pendiente')) };
}

// ---------------------------------------------------------------------------
// Series (Vueltas)
// ---------------------------------------------------------------------------

export interface FilaSerie {
  /** «2», «A1·2». */
  n: string;
  /** «8 × 125 kg», «20″», «1:12». */
  valor: string;
  /** Declarada (el atleta lo dijo o lo midió el reloj), propuesta (sin confirmar) o la que se hace ahora. */
  estado: 'declarada' | 'propuesta' | 'ahora';
}

/** Cuántas series se enseñan (la página redonda no da para más). */
export const SERIES_VISIBLES = 4;

/**
 * Las series hechas del ejercicio en curso, la última arriba, y la que se está
 * haciendo encima de todas. En una superserie, las de los dos compañeros.
 */
export function filasSeries(
  plan: PlanSesion,
  estado: EstadoSecuencia,
  registro: Registro,
  sim: Simulador,
  paso: Paso,
  lecturas: Lecturas,
): { nombre: string | null; filas: FilaSerie[] } {
  const i = estado.i;
  const ref = paso.rol === 'trabajo' ? i : (siguienteTrabajo(plan, i + 1) ?? anteriorTrabajo(plan, i) ?? i);
  const ej = ejercicioDe(plan, ref);
  const grupo = ej ? (ej.slot ? ejerciciosDe(plan).filter((e) => e.slot && e.bloque === ej.bloque) : [ej]) : [];
  const claves = new Set(grupo.map((e) => e.clave));
  const deGrupo = (j: number) => {
    const e = ejercicioDe(plan, j);
    return !!e && claves.has(e.clave);
  };
  const etiqueta = (j: number) => {
    const q = plan.pasos[j]!;
    const n = q.posicion?.serie?.n ?? 0;
    return q.posicion?.slot ? `${q.posicion.slot}·${n}` : String(n);
  };

  const filas: FilaSerie[] = [];
  if (paso.rol === 'trabajo' && paso.fase === 'principal' && paso.posicion?.serie && deGrupo(i)) {
    filas.push({ n: etiqueta(i), valor: fmtReloj(lecturas.t), estado: 'ahora' });
  }
  for (let j = i - 1; j >= 0 && filas.length < SERIES_VISIBLES; j--) {
    const q = plan.pasos[j]!;
    if (q.rol !== 'trabajo' || q.fase !== 'principal' || !q.posicion?.serie || !deGrupo(j)) continue;
    const m = medidaDe(plan, estado, j, sim);
    if (esFuerza(q) && q.medida.tipo === 'reps') {
      const a = anotacionDeSerie({ plan, estado, sim }, registro, j);
      filas.push({ n: etiqueta(j), valor: textoAnotacion(a, q.fuerza, false), estado: pendiente(a) ? 'propuesta' : 'declarada' });
    } else if (esFuerza(q)) {
      filas.push({ n: etiqueta(j), valor: fmtDuracion(Math.round(m?.segundos ?? q.medida.prescrito ?? 0)), estado: 'declarada' });
    } else {
      const parcial = estado.parciales.find((x) => x.i === j);
      filas.push({ n: etiqueta(j), valor: fmtReloj(parcial?.segundos ?? m?.segundos ?? 0), estado: 'declarada' });
    }
  }
  // El ejercicio da nombre a la página; en una superserie (dos o más) las filas llevan su hueco: «A1·2».
  return { nombre: grupo.length === 1 && ej ? conSlot(plan.pasos[ej.pasos[0]!]!) || ej.nombre : null, filas };
}

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/** La sesión entera: tiempo, series, volumen declarado, lo que falta por confirmar, y el pulso. */
export function filasDatos(plan: PlanSesion, estado: EstadoSecuencia, registro: Registro, sim: Simulador, ppm: number | null): FilaDatoVista[] {
  const r = resumenDeclarado(plan, estado, registro, sim);
  const filas: FilaDatoVista[] = [
    { valor: fmtReloj(estado.sesionT), unidad: 'total' },
    { valor: `${r.hechas}/${r.total}`, unidad: 'series' },
    { valor: r.kg > 0 ? fmtMiles(r.kg) : '—', unidad: 'kg de volumen' },
  ];
  if (r.sinConfirmar > 0) filas.push({ valor: String(r.sinConfirmar), unidad: 'sin confirmar' });
  filas.push({ valor: ppm == null ? '—' : String(Math.round(ppm)), unidad: 'ppm', ppm, glifo: 'pulso' });
  return filas;
}
