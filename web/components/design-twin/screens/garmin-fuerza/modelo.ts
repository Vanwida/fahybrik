// ANOTAR EN EL DESCANSO, CON LOS BOTONES — el estado de la anotación, PURO.
//
// El dato, la regla de honestidad y los textos son los de `kit-reloj/anotar.ts`
// (la muñeca y el iPhone anotan la misma serie con la misma regla): lo propuesto
// (lo prescrito, o la carga de la serie anterior) NO cuenta como declarado hasta
// que el atleta lo toca o lo confirma. Aquí solo cambia el MANDO: en Garmin no
// hay corona ni toque en el vivo, y §5 da a la fila «Anotar la serie»:
//
//   UP / DOWN   valor + / valor −          (`girar` del kit: paso de barra, RIR, reps)
//   START       confirmar el campo y pasar al siguiente (reps → carga → esfuerzo)
//   BACK/LAP    volver al campo anterior
//
// Lo que §5 NO dice y aquí se decide (y va a la lista de huecos del modelo):
//   · CUÁNDO está abierta la anotación: en cada descanso con series por anotar,
//     desde el primer segundo (salvo los 5 s de deshacer, donde UP deshace).
//   · CÓMO se cierra: START en el último campo, o BACK en el primero. Cerrada, el
//     descanso vuelve a su fila de §5 (BACK = Empezar ya, START = Pausa, UP/DOWN
//     = páginas, UP largo = Controles). Lo que quede propuesto sigue propuesto.
//   · CÓMO se reabre: al volver a la página del descanso con algo sin confirmar.
//   · Tocar un valor (UP/DOWN) lo declara, como girar la corona; START confirma
//     el valor que se ve, propuesto o tocado.
//
// Qué NO hacer: guardar lo propuesto (`Registro` solo guarda lo declarado); dejar
// que la cascada de la carga cierre la serie que se está anotando.

import {
  anotacionDe,
  esFuerza,
  fmtKg,
  fmtValor,
  girar,
  medidaDe,
  pendiente,
  seriesDelDescanso,
  type Anotacion,
  type Campo,
  type Dato,
  type EstadoSecuencia,
  type PasoFuerza,
  type PlanSesion,
  type Registro,
  type Simulador,
} from '../../kit-reloj';

/** Un dato de una serie, en el orden en que se recorre: reps → carga → esfuerzo. */
export interface CampoAnotar {
  /** El índice de la serie en el plan. */
  j: number;
  campo: Campo;
}

/** Los campos que se recorren en el descanso `i`: los de cada serie de la ronda, por orden. */
export function camposDelDescanso(plan: PlanSesion, i: number): CampoAnotar[] {
  return seriesDelDescanso(plan, i).flatMap((j) => {
    const f = (plan.pasos[j] as PasoFuerza).fuerza;
    const campos: Campo[] = ['reps'];
    if (f.carga.tipo !== 'corporal') campos.push('kg');
    if (f.esfuerzo) campos.push('esfuerzo');
    return campos.map((campo) => ({ j, campo }));
  });
}

/** Lo que el atleta tiene abierto en un descanso. Se olvida solo al cambiar de paso. */
export interface UiAnotar {
  paso: string | null;
  /** El campo enfocado (índice en `camposDelDescanso`). */
  k: number;
  /** Cerrada por el atleta (o al confirmar el último): el descanso vuelve a su fila de §5. */
  cerrada: boolean;
}

export const UI_VACIA: UiAnotar = { paso: null, k: 0, cerrada: false };

export interface Anotando {
  registro: Registro;
  ui: UiAnotar;
}

/** Lo que hace falta saber del momento para aplicar una tecla. */
export interface ContextoAnotar {
  plan: PlanSesion;
  estado: EstadoSecuencia;
  sim: Simulador;
  /** El paso en curso (un descanso). */
  i: number;
  pasoId: string;
}

/** Las cuatro acciones de la fila «Anotar la serie» de §5. */
export type AccionAnotar = 'confirmar-campo' | 'campo-anterior' | 'valor-mas' | 'valor-menos';

export const ACCIONES_ANOTAR: readonly AccionAnotar[] = ['confirmar-campo', 'campo-anterior', 'valor-mas', 'valor-menos'];

export const NOMBRE_CAMPO: Record<Campo, string> = { reps: 'reps', kg: 'carga', esfuerzo: 'esfuerzo' };

/** La anotación de la serie `j` con lo que el reloj sabe ahora (registro + lo medido). */
export function anotacionDeSerie(c: Pick<ContextoAnotar, 'plan' | 'estado' | 'sim'>, registro: Registro, j: number): Anotacion {
  return anotacionDe(c.plan, j, registro, medidaDe(c.plan, c.estado, j, c.sim))!;
}

export function datoDe(a: Anotacion, campo: Campo): Dato | null {
  return campo === 'reps' ? a.reps : campo === 'kg' ? a.kg : a.esfuerzo;
}

const declarar = (r: Registro, id: string, campo: Campo, valor: number): Registro => ({ ...r, [id]: { ...r[id], [campo]: valor } });

/** ¿Algún campo del descanso sigue propuesto? (lo que hace que volver a la página lo reabra) */
export function hayPendientes(c: ContextoAnotar, registro: Registro): boolean {
  return camposDelDescanso(c.plan, c.i).some(({ j, campo }) => datoDe(anotacionDeSerie(c, registro, j), campo)?.estado === 'propuesto');
}

/** El campo enfocado, dentro de rango (los campos cambian si cambia el descanso). */
export function focoDe(ui: UiAnotar, n: number): number {
  return Math.max(0, Math.min(ui.k, n - 1));
}

function textoValor(campo: Campo, valor: number): string {
  return campo === 'kg' ? fmtKg(valor) : fmtValor(valor);
}

/**
 * Una tecla de la fila «Anotar la serie». Devuelve el estado siguiente y la
 * línea de la cronología. Sin campos por anotar, o cerrada, no hace nada.
 */
export function aplicarTecla(a: Anotando, accion: AccionAnotar, c: ContextoAnotar): { siguiente: Anotando; linea: string | null } {
  const campos = camposDelDescanso(c.plan, c.i);
  const ui: UiAnotar = a.ui.paso === c.pasoId ? a.ui : { ...UI_VACIA, paso: c.pasoId };
  if (campos.length === 0 || ui.cerrada) return { siguiente: a, linea: null };
  const k = focoDe(ui, campos.length);
  const { j, campo } = campos[k]!;
  const paso = c.plan.pasos[j] as PasoFuerza;
  const dato = datoDe(anotacionDeSerie(c, a.registro, j), campo);
  const quien = paso.posicion?.slot ? `${paso.posicion.slot} · ${NOMBRE_CAMPO[campo]}` : NOMBRE_CAMPO[campo];

  if (accion === 'valor-mas' || accion === 'valor-menos') {
    const nuevo = girar(paso, campo, dato?.valor ?? null, accion === 'valor-mas' ? 1 : -1);
    return {
      siguiente: { registro: declarar(a.registro, paso.id, campo, nuevo), ui: { ...ui, k } },
      linea: `${accion === 'valor-mas' ? 'UP' : 'DOWN'} → ${quien} ${textoValor(campo, nuevo)}, declarado`,
    };
  }
  if (accion === 'confirmar-campo') {
    const registro = dato?.valor != null ? declarar(a.registro, paso.id, campo, dato.valor) : a.registro;
    const ultimo = k >= campos.length - 1;
    const siguiente: Anotando = { registro, ui: ultimo ? { ...ui, k, cerrada: true } : { ...ui, k: k + 1 } };
    const que = dato?.valor != null ? `${quien} ${textoValor(campo, dato.valor)} confirmado` : `${quien} sin valor: nada que confirmar`;
    return { siguiente, linea: `START → ${que}${ultimo ? ' · anotación cerrada' : ''}` };
  }
  // campo-anterior
  if (k > 0) return { siguiente: { registro: a.registro, ui: { ...ui, k: k - 1 } }, linea: `BACK/LAP → vuelve al campo anterior` };
  return { siguiente: { registro: a.registro, ui: { ...ui, k, cerrada: true } }, linea: 'BACK/LAP → cierra la anotación (lo propuesto sigue sin confirmar)' };
}

/** Volver a la página del descanso con algo sin confirmar reabre la anotación, en el primer campo pendiente. */
export function reabrir(a: Anotando, c: ContextoAnotar): Anotando {
  const ui = a.ui.paso === c.pasoId ? a.ui : { ...UI_VACIA, paso: c.pasoId };
  if (!ui.cerrada) return a;
  const campos = camposDelDescanso(c.plan, c.i);
  const primero = campos.findIndex(({ j, campo }) => datoDe(anotacionDeSerie(c, a.registro, j), campo)?.estado === 'propuesto');
  if (primero < 0) return a;
  return { registro: a.registro, ui: { paso: c.pasoId, k: primero, cerrada: false } };
}

// ---------------------------------------------------------------------------
// Lo que dicen las páginas
// ---------------------------------------------------------------------------

export interface ResumenSesion {
  /** Kilos movidos por las series con reps y carga DECLARADAS. */
  kg: number;
  /** Series hechas con algo aún propuesto. */
  sinConfirmar: number;
  hechas: number;
  total: number;
}

/**
 * Lo hecho de la sesión, honesto: el volumen suma solo lo que el atleta dijo
 * (G7). Una serie con las reps o la carga propuestas no suma, y se cuenta aparte
 * como «sin confirmar». `total` y `hechas` cuentan las series de la parte
 * principal que el motor cuenta como serie.
 */
export function resumenDeclarado(plan: PlanSesion, estado: EstadoSecuencia, registro: Registro, sim: Simulador): ResumenSesion {
  let kg = 0;
  let sinConfirmar = 0;
  let hechas = 0;
  let total = 0;
  plan.pasos.forEach((p, j) => {
    if (p.rol !== 'trabajo' || p.fase !== 'principal' || !(p.posicion?.serie ?? p.posicion?.tramo)) return;
    total += 1;
    if (j >= estado.i) return;
    hechas += 1;
    if (!esFuerza(p) || p.medida.tipo !== 'reps') return;
    const a = anotacionDe(plan, j, registro, medidaDe(plan, estado, j, sim));
    if (!a) return;
    if (pendiente(a)) sinConfirmar += 1;
    const dicho = (d: Dato | null) => d != null && d.valor != null && d.estado !== 'propuesto';
    if (dicho(a.reps) && dicho(a.kg)) kg += a.kg!.valor! * a.reps.valor!;
  });
  return { kg, sinConfirmar, hechas, total };
}
