// LAS DECISIONES DE «PLAN» — qué se enseña, y por qué, sin tocar SwiftUI.
//
// Espejo de `PlanHoyModel.swift` (estado de un día, posición en el bloque,
// duración escrita) y de las decisiones que `PlanView` toma dentro de su `body`
// (qué día muestra la card, qué acción se ancla, qué menú sale). Todas son PURAS
// sobre `LecturaPlan` (kit-plan/contrato): la pantalla pinta lo que decidan y no
// decide nada por su cuenta. Las fija `tests/design-twin/plan-rehecho.test.ts`.
//
// DONDE ESTE MODELO CORRIGE AL SWIFT (todas verificadas leyendo PlanView.swift;
// se listan en el informe para que el port a iOS no las reproduzca):
//  1. `contenido` decide por la semana 0, no por la VISIBLE: el botón «Ver la
//     semana que viene» del vacío con inicio futuro no hacía nada. Aquí decide
//     la visible.
//  2. Mientras la semana que viene carga (o falla) el Swift dice «Tu coach aún
//     no ha llenado la semana que viene», que es falso. Aquí hay cargando y fallo.
//  3. El sujeto de un día de dos sesiones es la PRIMERA PENDIENTE, no la primera
//     del array: con AM hecha y PM por hacer, el Swift enseñaba lo hecho y dejaba
//     «Empezar» apuntando a lo hecho. Hoy ya elige así (`momento()`).
//  4. «Ayer» y «Mañana» del descanso son en realidad «la última sesión anterior»
//     y «la siguiente», a cualquier distancia: se rotulan con el día que son.
//  5. «Ver lo de mañana» y el contexto de ayer/mañana dependían de si el atleta
//     había TOCADO el chip de hoy: mismo día, dos pantallas. Ahora dependen solo
//     de que el día mostrado sea hoy.
//  6. Una sesión pasada y sin registrar se llamaba «por hacer» en la card y
//     «sin hacer» en el carril. Ahora la card dice lo mismo que el carril.
//  7. El texto de pausa decía «mientras te recuperas» aunque el motivo fuera
//     vacaciones. El código del motivo no sale al atleta: el texto es genérico.
//
// Repartido en cuatro ficheros para que ninguno pase de 500 líneas: `fechas.ts`
// (el ISO y cómo se nombra un día), `dias.ts` (día, semana, sesión y duración),
// `mutaciones.ts` (lo que la demo aplica) y este (qué pantalla, tono, acción y menú).
// Este re-exporta los otros tres: quien importe `kit-plan/modelo` lo ve todo junto.

import type { TonoClave } from '../kit-dia/hero';
import type { DiaDelPlan, EstadoSesion, LecturaPlan, SemanaDelPlan, SesionDelPlan } from './contrato';
import { diaMostrado, estadoEfectivo, puedeMoverse, sesionPrincipal, sesionesSecundarias, sesionSiguiente, terminada, tieneAlgunaSesion } from './dias';
import { diasEntre, diaSemanaDe, nombreDeDia, numeroDelMes } from './fechas';

export * from './fechas';
export * from './dias';
export * from './mutaciones';
export { ETIQUETA_ESTADO, NOMBRE_MODALIDAD } from '../screens/hoy-dia/momento';

// ---------------------------------------------------------------------------
// La vista: qué pinta la pantalla AHORA
// ---------------------------------------------------------------------------

export type Cuerpo =
  | { tipo: 'sesion'; dia: DiaDelPlan; principal: SesionDelPlan; otras: SesionDelPlan[]; estado: EstadoSesion }
  /** `conContexto`: el día mostrado es hoy de verdad, así que ayer y mañana sitúan. */
  | { tipo: 'descanso'; dia: DiaDelPlan; conContexto: boolean }
  | { tipo: 'semana-cargando' }
  | { tipo: 'semana-falla' }
  /** La semana llegó y no trae nada que mostrar (el coach aún no la llenó). */
  | { tipo: 'semana-vacia' };

export type Vista =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'pausa'; desde: string | null }
  | { tipo: 'sin-plan'; motivo: 'empieza-despues' | 'preparando'; inicio: string | null }
  | { tipo: 'semana'; offset: number; semana: SemanaDelPlan | null; cuerpo: Cuerpo };

export interface Navegacion {
  /** 0 = esta semana; 1+ = hojeando hacia delante. */
  offset: number;
  /** El día elegido a mano dentro de la semana visible. Null = el que toca por defecto. */
  seleccion: string | null;
  /** La semana que viene se está pidiendo (efímero, de la demo). */
  cargandoSiguiente: boolean;
}

export function semanaVisible(l: LecturaPlan, offset: number): SemanaDelPlan | null {
  if (offset === 0) return l.actual;
  return typeof l.siguiente === 'object' && l.siguiente !== null ? l.siguiente : null;
}

/**
 * La escalera de qué pantalla toca. Es la de `PlanView.contenido`, con el orden
 * que ya tenía (cargando → pausa → error → semana → sin plan) y una corrección:
 * decide por la semana VISIBLE. Quien hojea la que viene desde un vacío con
 * inicio futuro llega a ella (antes se quedaba en el vacío).
 */
export function vista(l: LecturaPlan, nav: Navegacion): Vista {
  if (l.cargando && !l.actual) return { tipo: 'cargando' };
  if (l.pausa) return { tipo: 'pausa', desde: l.pausa.desde };
  if (l.errorCarga && !l.actual) return { tipo: 'error' };

  if (nav.offset === 0) {
    const s = l.actual;
    if (!s || !tieneAlgunaSesion(s)) {
      return {
        tipo: 'sin-plan',
        motivo: s?.planStartsOn ? 'empieza-despues' : 'preparando',
        inicio: s?.planStartsOn ?? null,
      };
    }
    return { tipo: 'semana', offset: 0, semana: s, cuerpo: cuerpoDe(s, nav.seleccion, l.hoyIso, 0) };
  }

  if (nav.cargandoSiguiente) return { tipo: 'semana', offset: nav.offset, semana: null, cuerpo: { tipo: 'semana-cargando' } };
  if (l.siguiente === 'falla') return { tipo: 'semana', offset: nav.offset, semana: null, cuerpo: { tipo: 'semana-falla' } };
  const s = semanaVisible(l, nav.offset);
  if (!s) return { tipo: 'semana', offset: nav.offset, semana: null, cuerpo: { tipo: 'semana-vacia' } };
  return { tipo: 'semana', offset: nav.offset, semana: s, cuerpo: cuerpoDe(s, nav.seleccion, l.hoyIso, nav.offset) };
}

function cuerpoDe(s: SemanaDelPlan, seleccion: string | null, hoyIso: string, offset: number): Cuerpo {
  const dia = diaMostrado(s, seleccion);
  // Sin día que mostrar: solo pasa con una semana hojeada que llegó vacía (la de hoy sin sesiones ya es «sin plan»).
  if (!dia) return { tipo: 'semana-vacia' };
  const principal = sesionPrincipal(dia);
  if (!principal) return { tipo: 'descanso', dia, conContexto: dia.esHoy && offset === 0 };
  return {
    tipo: 'sesion',
    dia,
    principal,
    otras: sesionesSecundarias(dia, principal),
    estado: estadoEfectivo(principal, dia.iso, hoyIso),
  };
}

// ---------------------------------------------------------------------------
// El tono del sujeto: el color dice el MOMENTO y nunca lleva el texto
// ---------------------------------------------------------------------------

/**
 * `aviso` es el único tono que no existe en `kit-dia/hero`: el «a medias» es un
 * estado propio (ni hecho ni sin hacer) y no debe leerse ni como aplauso ni como
 * alarma. Se propone subirlo al kit (informe).
 */
export type TonoPlan = TonoClave | 'aviso';

/**
 * El naranja SÓLIDO es solo «haz esto ahora»: hoy y por hacer. Un día por hacer
 * que no es hoy lleva el naranja suave (es lo que viene, no lo de ahora); todo lo
 * demás va en tintes suaves. Un día sin hacer es un HECHO («no quedó nada
 * registrado»), no un fallo: gris, nunca rojo.
 */
export function tonoDelSujeto(v: Vista): TonoPlan {
  switch (v.tipo) {
    case 'cargando':
    case 'pausa':
      return 'neutro';
    case 'error':
      return 'peligro';
    case 'sin-plan':
      return v.motivo === 'empieza-despues' ? 'acento' : 'neutro';
    case 'semana': {
      const c = v.cuerpo;
      if (c.tipo === 'descanso') return 'soporte';
      if (c.tipo === 'semana-falla') return 'peligro';
      if (c.tipo !== 'sesion') return 'neutro';
      switch (c.estado) {
        case 'pendiente':
          return c.dia.esHoy ? 'accion' : 'acento';
        case 'hecha':
          return 'ok';
        case 'parcial':
          return 'aviso';
        case 'saltada':
          return 'neutro';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// La acción anclada: UNA, y siempre la misma puerta
// ---------------------------------------------------------------------------

export type AccionAnclada =
  | { tipo: 'empezar'; sesion: SesionDelPlan; dia: DiaDelPlan }
  | { tipo: 'ver-hecho'; sesion: SesionDelPlan; dia: DiaDelPlan }
  /** `cuando`: «mañana» o «del viernes». */
  | { tipo: 'ver-siguiente'; sesion: SesionDelPlan; dia: DiaDelPlan; cuando: string }
  | { tipo: 'escribir-al-coach' }
  | { tipo: 'reintentar' }
  | { tipo: 'ver-semana-que-viene' }
  | { tipo: 'volver-a-esta-semana' };

/**
 * Qué puede hacer el atleta AHORA con lo que la card enseña. Sigue al día
 * MOSTRADO: actuar sobre una sesión que no es la de la pantalla sería la propia
 * mentira que este botón existe para evitar. Sin sesión ni siguiente no hay una
 * tercera acción que inventar: el cromo ya lleva al ciclo.
 */
export function accionAnclada(v: Vista, l: LecturaPlan): AccionAnclada | null {
  switch (v.tipo) {
    case 'cargando':
      return null;
    case 'error':
      return { tipo: 'reintentar' };
    case 'pausa':
      return { tipo: 'escribir-al-coach' };
    case 'sin-plan':
      if (v.motivo === 'preparando') return { tipo: 'escribir-al-coach' };
      return l.actual?.hayMasAdelante ? { tipo: 'ver-semana-que-viene' } : null;
    case 'semana': {
      const c = v.cuerpo;
      if (c.tipo === 'sesion') {
        return terminada(c.principal)
          ? { tipo: 'ver-hecho', sesion: c.principal, dia: c.dia }
          : { tipo: 'empezar', sesion: c.principal, dia: c.dia };
      }
      if (c.tipo === 'descanso' && c.conContexto && v.semana) {
        const sig = sesionSiguiente(v.semana);
        if (sig) return { tipo: 'ver-siguiente', ...sig, cuando: cuandoDeSiguiente(sig.dia.iso, l.hoyIso) };
        return null;
      }
      if (c.tipo === 'semana-falla') return { tipo: 'reintentar' };
      if (c.tipo === 'semana-vacia') return { tipo: 'volver-a-esta-semana' };
      return null;
    }
  }
}

/** «mañana» o «del viernes»: el complemento de «Ver lo de …». */
export function cuandoDeSiguiente(iso: string, hoyIso: string): string {
  if (diasEntre(hoyIso, iso) === 1) return 'mañana';
  return `del ${nombreDeDia(diaSemanaDe(iso)).toLowerCase()}`;
}

export function textoAccion(a: AccionAnclada, coach: string | null): string {
  switch (a.tipo) {
    case 'empezar':
      return 'Empezar';
    case 'ver-hecho':
      return 'Ver lo que hiciste';
    case 'ver-siguiente':
      return `Ver lo de ${a.cuando}`;
    case 'escribir-al-coach':
      return coach ? `Escribir a ${coach}` : 'Escribir a tu coach';
    case 'reintentar':
      return 'Reintentar';
    case 'ver-semana-que-viene':
      return 'Ver la semana que viene';
    case 'volver-a-esta-semana':
      return 'Volver a esta semana';
  }
}

/** La acción anclada abre el menú «···» solo cuando hay una sesión delante. */
export function conMenu(a: AccionAnclada | null): boolean {
  return a !== null && (a.tipo === 'empezar' || a.tipo === 'ver-hecho');
}

// ---------------------------------------------------------------------------
// El menú de una sesión (`accionesDeSesion`): mover · técnica · corregir · borrar libre
// ---------------------------------------------------------------------------

export type ClaveAccion =
  | 'tecnica'
  | 'preguntar'
  | 'mover'
  | 'marcar-hecha'
  | 'completar'
  | 'deshacer'
  | 'editar-libre'
  | 'borrar-libre';

export interface AccionDeSesion {
  clave: ClaveAccion;
  etiqueta: string;
  destructiva?: boolean;
}


/**
 * El menú, contextual a su estado. Ninguna acción es nueva: son las de cada fila
 * de la vieja lista de días. Sin coach no hay a quién preguntar, así que esa fila
 * tampoco existe. Las del coach se deshacen, no se borran; un libre es del
 * atleta y se borra del todo.
 */
export function accionesDeSesion(s: SesionDelPlan, opts: { conCoach: boolean }): AccionDeSesion[] {
  const a: AccionDeSesion[] = [{ clave: 'tecnica', etiqueta: 'Ver ejercicios y técnica' }];
  if (opts.conCoach) a.push({ clave: 'preguntar', etiqueta: 'Preguntar al coach' });
  if (puedeMoverse(s)) a.push({ clave: 'mover', etiqueta: 'Mover a otro día' });
  switch (s.estado) {
    case 'pendiente':
    case 'saltada':
      a.push({ clave: 'marcar-hecha', etiqueta: 'Marcar como hecha' });
      a.push({ clave: 'completar', etiqueta: 'Completar ahora' });
      break;
    case 'parcial':
      a.push({ clave: 'completar', etiqueta: 'Completar ahora' });
      a.push({ clave: 'deshacer', etiqueta: 'Deshacer hecho', destructiva: true });
      break;
    case 'hecha':
      a.push({ clave: 'deshacer', etiqueta: 'Deshacer hecho', destructiva: true });
      break;
  }
  if (s.libre) {
    if (s.estado === 'pendiente' || s.estado === 'saltada') a.push({ clave: 'editar-libre', etiqueta: 'Editar entreno libre' });
    a.push({ clave: 'borrar-libre', etiqueta: 'Borrar entreno libre', destructiva: true });
  }
  return a;
}

/** «Lunes 21 · libre» / «Hoy · 1 sesión»: el día, su fecha y su carga, para elegir con contexto. */
export function etiquetaDeDiaDestino(dia: DiaDelPlan): string {
  const nombre = dia.esHoy ? 'Hoy' : `${nombreDeDia(dia.diaSemana)} ${numeroDelMes(dia.iso)}`;
  const n = dia.sesiones.length;
  const carga = n === 0 ? 'libre' : n === 1 ? '1 sesión' : `${n} sesiones`;
  return `${nombre} · ${carga}`;
}

export function diasDestino(semana: SemanaDelPlan, sesion: SesionDelPlan): DiaDelPlan[] {
  const origen = semana.dias.find((d) => d.sesiones.some((s) => s.id === sesion.id));
  return semana.dias.filter((d) => d.iso !== origen?.iso);
}

