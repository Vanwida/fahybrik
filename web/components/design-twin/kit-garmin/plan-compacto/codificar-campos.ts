// LAS PIEZAS DEL CODIFICADOR — cómo se escribe cada trozo del paso.
//
// Medida, objetivo, posición, carga, tarea, WOD, ficha de fuerza y dobles, cada
// uno con su función `escribir*`, más las tablas de tareas y de listas que el
// WOD comparte entre ventanas. `codificar.ts` decide el ORDEN del cable y qué
// banderas lleva cada paso; aquí solo está el CÓMO de cada campo. Mismas reglas:
// nada se redondea, toda clave desconocida se rechaza, un decimal solo viaja en
// su escala (ejes ×10, kilos ×100).

import type {
  CargaFuerza,
  Contador,
  EsfuerzoFuerza,
  FichaFuerza,
  InfoWod,
  Medida,
  Objetivo,
  PasoBase,
  Posicion,
  Tarea,
} from '../../kit-reloj/paso';
import type { Dobles } from '../../kit-reloj/dobles';
import type { PlanSesion } from '../../kit-reloj/secuencia';
import {
  ANCHOS_FICHA,
  ANCHOS_MEDIDA,
  ANCHOS_OBJETIVO,
  ANCHOS_POSICION,
  ANCHOS_TAREA,
  CLAVES_ALTERNA,
  CLAVES_CARGA,
  CLAVES_DOBLES,
  CLAVES_FICHA,
  CLAVES_MEDIDA,
  CLAVES_OBJETIVO,
  CLAVES_POSICION,
  CLAVES_TAREA,
  CODIGO_LETRA_A,
  CONTADORES,
  EJES,
  EJES_ESFUERZO,
  FORMATOS_WOD,
  PAPELES,
  PATRON_SLOT,
  POR_LADO,
  QUIEN_MIDE,
  SENTIDOS_AVISO,
  TIPOS_CARGA,
  TIPOS_MEDIDA,
  ESCALAS_OBJETIVO,
  TIPOS_ALTERNA,
  TURNOS_DOBLES,
  empaquetar,
} from './formato';
import { ErrorPlanCompacto, Escritor, codigoDe, soloClaves } from './flujo';

// ---------------------------------------------------------------------------
// Tablas de tareas y de listas (el WOD repite la misma tarea en cada ventana)
// ---------------------------------------------------------------------------

/** Clave estructural de una tarea: dos tareas iguales comparten fila de la tabla. */
const claveTarea = (t: Tarea): string =>
  JSON.stringify([
    t.nombre,
    t.dosis ? [t.dosis.tipo, t.dosis.prescrito, t.dosis.mide] : null,
    t.carga ? [t.carga.kg, t.carga.implementos ?? null] : null,
    !!t.corporal,
    !!t.corre,
    t.mide,
  ]);

export interface Tablas {
  tareas: Tarea[];
  listas: number[][];
  idxTarea: (t: Tarea) => number;
  idxLista: (ts: Tarea[]) => number;
}

export function tablasDeTareas(pasos: PasoBase[]): Tablas {
  const tareas: Tarea[] = [];
  const porTarea = new Map<string, number>();
  const listas: number[][] = [];
  const porLista = new Map<string, number>();
  const idxTarea = (t: Tarea): number => {
    const k = claveTarea(t);
    const previo = porTarea.get(k);
    if (previo !== undefined) return previo;
    tareas.push(t);
    porTarea.set(k, tareas.length - 1);
    return tareas.length - 1;
  };
  const idxLista = (ts: Tarea[]): number => {
    const lista = ts.map(idxTarea);
    const k = lista.join(',');
    const previo = porLista.get(k);
    if (previo !== undefined) return previo;
    listas.push(lista);
    porLista.set(k, listas.length - 1);
    return listas.length - 1;
  };
  // Se recorren los pasos en orden para que las tablas salgan deterministas.
  for (const p of pasos) {
    const w = p.wod;
    if (!w) continue;
    if (w.formato === 'emom') idxLista(w.ciclo);
    else if (w.formato === 'amrap' || w.formato === 'puntuacion') idxLista(w.tareas);
    else if ((w.formato === 'fortime' || w.formato === 'deathby') && w.tarea) idxTarea(w.tarea);
  }
  return { tareas, listas, idxTarea, idxLista };
}

// ---------------------------------------------------------------------------
// Piezas pequeñas
// ---------------------------------------------------------------------------

export function escribirMedida(w: Escritor, m: Medida, ctx: string): void {
  soloClaves(m, CLAVES_MEDIDA, `${ctx}.medida`);
  w.n(empaquetar(ANCHOS_MEDIDA, [codigoDe(TIPOS_MEDIDA, m.tipo, `${ctx}.medida.tipo`), codigoDe(QUIEN_MIDE, m.mide, `${ctx}.medida.mide`)]));
  w.nOpc(m.prescrito, `${ctx}.medida.prescrito`);
}

/** Kilos por implemento y cuántos (`implementos` ausente = 0 en el cable; 0 no es un valor válido). */
export function escribirCarga(w: Escritor, c: { kg: number; implementos?: number }, ctx: string): void {
  soloClaves(c, CLAVES_CARGA, `${ctx}.carga`);
  if (c.implementos !== undefined && c.implementos < 1) {
    throw new ErrorPlanCompacto('fuera-de-rango', `${ctx}.carga.implementos: ${c.implementos} (mínimo 1; sin implementos se omite)`);
  }
  w.centi(c.kg, `${ctx}.carga.kg`);
  w.n(c.implementos ?? 0, `${ctx}.carga.implementos`);
}

/** El valor de un eje en su escala: los kilos en centésimas, todo lo demás en décimas. */
function valorDeEje(w: Escritor, eje: Objetivo['eje'], v: number | null, ctx: string): void {
  if (eje === 'kg') w.centiOpc(v, ctx);
  else w.deciOpc(v, ctx);
}

export function escribirObjetivo(w: Escritor, o: Objetivo, ctx: string): void {
  soloClaves(o, CLAVES_OBJETIVO, ctx);
  if (o.palabra !== undefined && o.eje !== 'rpe') {
    throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}: «palabra» solo viaja con el eje rpe (es la palabra del coach para un RPE)`);
  }
  w.n(
    empaquetar(ANCHOS_OBJETIVO, [
      codigoDe(EJES, o.eje, `${ctx}.eje`),
      codigoDe(PAPELES, o.papel, `${ctx}.papel`),
      o.palabra === undefined ? 0 : 1,
      o.avisa === undefined ? 0 : 1 + codigoDe(SENTIDOS_AVISO, o.avisa, `${ctx}.avisa`),
      o.escala === undefined ? 0 : 1 + codigoDe(ESCALAS_OBJETIVO, o.escala, `${ctx}.escala`),
    ]),
  );
  valorDeEje(w, o.eje, o.min, `${ctx}.min`);
  valorDeEje(w, o.eje, o.max, `${ctx}.max`);
  if (o.palabra !== undefined) w.cadena(o.palabra, 'palabra', `${ctx}.palabra`);
}

function escribirSlot(w: Escritor, slot: string, ctx: string): void {
  const m = PATRON_SLOT.exec(slot);
  if (!m) throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}.slot: «${slot}» no es letra + número (A1, B2…)`);
  w.n(m[1]!.charCodeAt(0) - CODIGO_LETRA_A, `${ctx}.slot`);
  w.n(Number(m[2]), `${ctx}.slot`);
}

export function escribirPosicion(w: Escritor, pos: Posicion, ctx: string): void {
  soloClaves(pos, CLAVES_POSICION, `${ctx}.posicion`);
  const presentes = CONTADORES.map((k) => (pos[k] ? 1 : 0));
  w.n(empaquetar(ANCHOS_POSICION, [...presentes, pos.slot === undefined ? 0 : 1]));
  for (const k of CONTADORES) {
    const c: Contador | undefined = pos[k];
    if (!c) continue;
    w.n(c.n, `${ctx}.posicion.${k}.n`);
    w.n(c.de, `${ctx}.posicion.${k}.de`);
  }
  if (pos.slot !== undefined) escribirSlot(w, pos.slot, ctx);
}

export function escribirTarea(w: Escritor, t: Tarea, ctx: string): void {
  soloClaves(t, CLAVES_TAREA, ctx);
  w.cadena(t.nombre, 'catalogo', `${ctx}.nombre`);
  w.n(empaquetar(ANCHOS_TAREA, [t.dosis ? 1 : 0, t.carga ? 1 : 0, t.corporal ? 1 : 0, t.corre ? 1 : 0, codigoDe(QUIEN_MIDE, t.mide, `${ctx}.mide`)]));
  if (t.dosis) escribirMedida(w, t.dosis, `${ctx}.dosis`);
  if (t.carga) escribirCarga(w, t.carga, ctx);
}

export function escribirWod(w: Escritor, wod: InfoWod, tablas: Tablas, ctx: string): void {
  w.n(codigoDe(FORMATOS_WOD, wod.formato, `${ctx}.wod.formato`));
  switch (wod.formato) {
    case 'emom': {
      const clave = claveTarea(wod.tarea);
      const pos = wod.ciclo.findIndex((t) => claveTarea(t) === clave);
      if (pos < 0) throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}.wod: la tarea del EMOM no está en su ciclo`);
      w.n(tablas.idxLista(wod.ciclo));
      w.n(pos);
      w.n(wod.ventanas);
      w.n(wod.ventanaS);
      return;
    }
    case 'amrap':
    case 'puntuacion':
      w.n(tablas.idxLista(wod.tareas));
      w.n(wod.duracionS);
      return;
    case 'fortime':
      w.nOpc(wod.tarea ? tablas.idxTarea(wod.tarea) : null);
      w.nOpc(wod.capS);
      return;
    case 'pared':
      w.n(wod.trabajoS);
      w.n(wod.descansoS);
      w.n(wod.rondas);
      return;
    case 'deathby':
      w.n(tablas.idxTarea(wod.tarea));
      w.n(wod.inicio);
      w.n(wod.incremento);
      w.n(wod.ventanaS);
      w.nOpc(wod.tope);
  }
}

export function escribirCargaFuerza(w: Escritor, c: CargaFuerza, ctx: string): void {
  w.n(codigoDe(TIPOS_CARGA, c.tipo, `${ctx}.carga.tipo`));
  switch (c.tipo) {
    case 'kg':
      w.centi(c.min, `${ctx}.carga.min`);
      w.centi(c.max, `${ctx}.carga.max`);
      return;
    case 'rm':
      w.deci(c.pctMin, `${ctx}.carga.pctMin`);
      w.deci(c.pctMax, `${ctx}.carga.pctMax`);
      w.centiOpc(c.rmKg, `${ctx}.carga.rmKg`);
      return;
    case 'corporal':
      return;
    case 'tuya':
      w.centiOpc(c.ultimaKg, `${ctx}.carga.ultimaKg`);
      w.n(c.lastre ? 1 : 0);
  }
}

function escribirEsfuerzo(w: Escritor, e: EsfuerzoFuerza | null, ctx: string): void {
  if (e === null) {
    w.n(0);
    return;
  }
  w.n(1 + codigoDe(EJES_ESFUERZO, e.eje, `${ctx}.esfuerzo.eje`));
  w.deci(e.min, `${ctx}.esfuerzo.min`);
  w.deci(e.max, `${ctx}.esfuerzo.max`);
}

export function escribirFicha(w: Escritor, f: FichaFuerza, ejercicios: Map<string, number>, ctx: string): void {
  soloClaves(f, CLAVES_FICHA, `${ctx}.fuerza`);
  if (!ejercicios.has(f.ejercicio)) ejercicios.set(f.ejercicio, ejercicios.size);
  w.n(ejercicios.get(f.ejercicio)!);
  escribirCargaFuerza(w, f.carga, `${ctx}.fuerza`);
  escribirEsfuerzo(w, f.esfuerzo, `${ctx}.fuerza`);
  w.n(empaquetar(ANCHOS_FICHA, [f.porLado ? 1 + codigoDe(POR_LADO, f.porLado, `${ctx}.fuerza.porLado`) : 0, f.aproximacion ? 1 : 0, f.vaciaKg !== undefined ? 1 : 0]));
  w.centi(f.pasoKg, `${ctx}.fuerza.pasoKg`);
  if (f.vaciaKg !== undefined) w.centi(f.vaciaKg, `${ctx}.fuerza.vaciaKg`);
}

/**
 * Un relevo de dobles. NO lleva texto: la pareja es `PlanSesion.pareja` (una por
 * sesión), la estación se deriva del paso y el pacto es `alternaCada` (dato).
 * Un `nota` en texto libre se rechaza: es un pacto que el modelo no sabe leer.
 */
export function escribirDobles(w: Escritor, d: Dobles, plan: Pick<PlanSesion, 'pareja'>, ctx: string): void {
  soloClaves(d, CLAVES_DOBLES, `${ctx}.dobles`);
  if (d.nota !== undefined && d.alternaCada === undefined) {
    throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}.dobles.nota: «${d.nota}» es un pacto en texto libre; el contrato lleva \`alternaCada: { tipo, n }\``);
  }
  if (d.pareja !== undefined && d.pareja !== plan.pareja) {
    throw new ErrorPlanCompacto('fuera-de-limites', `${ctx}.dobles.pareja: la pareja es una por sesión (\`plan.pareja\`), no una por estación`);
  }
  w.n(codigoDe(TURNOS_DOBLES, d.turno, `${ctx}.dobles.turno`));
  w.nOpc(d.tuyas, `${ctx}.dobles.tuyas`);
  w.nOpc(d.suyas, `${ctx}.dobles.suyas`);
  w.n(d.pctTuyo, `${ctx}.dobles.pctTuyo`);
  if (d.alternaCada === undefined) {
    w.n(0);
    return;
  }
  soloClaves(d.alternaCada, CLAVES_ALTERNA, `${ctx}.dobles.alternaCada`);
  w.n(1 + codigoDe(TIPOS_ALTERNA, d.alternaCada.tipo, `${ctx}.dobles.alternaCada.tipo`));
  w.n(d.alternaCada.n, `${ctx}.dobles.alternaCada.n`);
}
