// EL DÍA, LA SEMANA Y LA SESIÓN — estado, sujeto, duración y cabecera. Puro sobre
// los tipos de `contrato.ts`: nada aquí sabe de pantallas (eso es `modelo.ts`).
// Espejo de `PlanHoyModel.swift` (`EstadoDiaPlan`, `SemanaDelPlan`,
// `PosicionEnBloque`, `DuracionDeSesion`).

import { durationUnknownEs } from '@fahybrid/shared/domain/prescription';
import { ETIQUETA_ESTADO } from '../screens/hoy-dia/momento';
import type {
  DiaDelPlan,
  Desglose,
  DesgloseSesion,
  DuracionEscrita,
  EstadoDiaPlan,
  EstadoSesion,
  LecturaPlan,
  ModalidadHoy,
  PosicionEnBloque,
  SemanaDelPlan,
  SesionDelPlan,
} from './contrato';
import { diaSemanaDe } from './fechas';

// ---------------------------------------------------------------------------
// El estado de un día y de una sesión
// ---------------------------------------------------------------------------

/**
 * El estado de un día a partir del estado REAL de sus sesiones (`estado(dia:…)`).
 * El orden importa: dos sesiones, una hecha y otra sin tocar, se leen como
 * trabajado. Y «saltada» no es un veredicto: o el servidor lo dice, o el día ya
 * pasó y no quedó nada registrado (un hecho que la app sí sabe: ningún job del
 * servidor caduca una sesión pasada a `missed`).
 */
export function estadoDeDia(sesiones: SesionDelPlan[], iso: string, hoyIso: string): EstadoDiaPlan {
  if (sesiones.length === 0) return 'descanso';
  const e = sesiones.map((s) => s.estado);
  if (e.includes('hecha')) return 'hecha';
  if (e.includes('parcial')) return 'parcial';
  if (e.includes('saltada')) return 'saltada';
  return iso < hoyIso ? 'saltada' : 'pendiente';
}

export function resolverDia(iso: string, hoyIso: string, sesiones: SesionDelPlan[]): DiaDelPlan {
  return {
    iso,
    diaSemana: diaSemanaDe(iso),
    sesiones,
    estado: estadoDeDia(sesiones, iso, hoyIso),
    esHoy: iso === hoyIso,
  };
}

/** Lo que el DÍA dice de una sesión: una pendiente de un día que ya pasó es «sin hacer», igual que su sello. */
export function estadoEfectivo(sesion: SesionDelPlan, diaIso: string, hoyIso: string): EstadoSesion {
  if (sesion.estado === 'pendiente' && diaIso < hoyIso) return 'saltada';
  return sesion.estado;
}

/** Se trabajó (entero o a medias): el día ya no pide nada. */
export const trabajado = (e: EstadoSesion | EstadoDiaPlan): boolean => e === 'hecha' || e === 'parcial';

export const terminada = (s: SesionDelPlan): boolean => trabajado(s.estado);

export const ETIQUETA_DIA: Record<EstadoDiaPlan, string> = { ...ETIQUETA_ESTADO, descanso: 'Descanso' };

/** Las modalidades que MANDAN en el día, como mucho dos distintas: en una ficha de 48 pt un tercer punto ya no se distingue. */
export function modalidadesDelDia(dia: DiaDelPlan): ModalidadHoy[] {
  const vistas: ModalidadHoy[] = [];
  for (const s of dia.sesiones) {
    if (!vistas.includes(s.modalidad)) vistas.push(s.modalidad);
    if (vistas.length === 2) break;
  }
  return vistas;
}

/** Lo que la app puede decir de un día sin fabricar nada (voz de accesibilidad). */
export function resumenDeDia(dia: DiaDelPlan, hoyIso: string): string {
  if (dia.sesiones.length === 0) return 'descanso, nada en el plan';
  const titulos = dia.sesiones.map((s) => s.titulo).join(', ');
  const estados = dia.sesiones.map((s) => ETIQUETA_ESTADO[estadoEfectivo(s, dia.iso, hoyIso)].toLowerCase());
  return `${titulos}, ${[...new Set(estados)].join(' y ')}`;
}

// ---------------------------------------------------------------------------
// La semana
// ---------------------------------------------------------------------------

export const tieneAlgunaSesion = (s: SemanaDelPlan): boolean => s.dias.some((d) => d.sesiones.length > 0);

export interface DiaConSesion {
  dia: DiaDelPlan;
  sesion: SesionDelPlan;
}

/** La última sesión ANTES de hoy (a cualquier distancia: quien la rotule dirá qué día fue). */
export function sesionAnterior(semana: SemanaDelPlan): DiaConSesion | null {
  if (semana.indiceHoy === null) return null;
  for (let i = semana.indiceHoy - 1; i >= 0; i -= 1) {
    const dia = semana.dias[i]!;
    if (dia.sesiones.length > 0) return { dia, sesion: dia.sesiones[dia.sesiones.length - 1]! };
  }
  return null;
}

/** La siguiente sesión de la semana. Null = la semana ya está cerrada. */
export function sesionSiguiente(semana: SemanaDelPlan): DiaConSesion | null {
  if (semana.indiceHoy === null) return null;
  for (let i = semana.indiceHoy + 1; i < semana.dias.length; i += 1) {
    const dia = semana.dias[i]!;
    if (dia.sesiones.length > 0) return { dia, sesion: dia.sesiones[0]! };
  }
  return null;
}

/**
 * El día que la card muestra: el que el atleta eligió a mano dentro de la semana
 * visible; si no eligió, hoy (en esta semana) o el primero con algo (hojeando
 * otra). Nunca se inventa un día (§7).
 */
export function diaMostrado(semana: SemanaDelPlan, seleccion: string | null): DiaDelPlan | null {
  if (seleccion) {
    const elegido = semana.dias.find((d) => d.iso === seleccion);
    if (elegido) return elegido;
  }
  if (semana.indiceHoy !== null) return semana.dias[semana.indiceHoy] ?? null;
  return semana.dias.find((d) => d.sesiones.length > 0) ?? null;
}

/**
 * El SUJETO de un día con sesiones: la primera que aún toca hacer; si ninguna, la
 * primera. Coincide con `momento()` de Hoy, que dice «Fuerza tren superior» y
 * lleva aquí: si el Plan enseñara otra, la portada mentiría sobre a dónde lleva.
 */
export function sesionPrincipal(dia: DiaDelPlan): SesionDelPlan | null {
  return dia.sesiones.find((s) => s.estado === 'pendiente') ?? dia.sesiones[0] ?? null;
}

/** Las demás del día, compactas. Son una lista y no «la otra»: un libre montado sobre un día con dos no puede quedar huérfano. */
export function sesionesSecundarias(dia: DiaDelPlan, principal: SesionDelPlan): SesionDelPlan[] {
  return dia.sesiones.filter((s) => s.id !== principal.id);
}

// ---------------------------------------------------------------------------
// Cabecera: dónde estás dentro del bloque
// ---------------------------------------------------------------------------

/** «Semana 3 de 6» · «Semana 3» (`PosicionEnBloque.texto`). */
export function textoPosicion(p: PosicionEnBloque): string {
  return p.total === null ? `Semana ${p.semana}` : `Semana ${p.semana} de ${p.total}`;
}

/**
 * El título de la semana que se mira. Con posición del servidor, esa; sin ella
 * (plan sin bloque) se nombra por su distancia a hoy, que es un hecho.
 */
export function tituloDeSemana(posicion: PosicionEnBloque | null, offset: number): string {
  if (posicion) return textoPosicion(posicion);
  if (offset === 0) return 'Esta semana';
  if (offset === 1) return 'Semana que viene';
  return `En ${offset} semanas`;
}

// ---------------------------------------------------------------------------
// Duración: el reloj que escribe el plan, o por qué no lo hay
// ---------------------------------------------------------------------------

/** «45 min» · «1 h» · «1 h 10» (`Formato.duracion`). Null por debajo del minuto: «0 min» es un valor por defecto que parece un dato. */
export function formatoMinutos(minutos: number): string | null {
  if (!(minutos > 0)) return null;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m}`;
}

/** «desde 45 min» (un SUELO: lo que nadie escribe solo suma) o la razón. Null si el servidor no dice nada. */
export function textoDuracion(d: DuracionEscrita | null): string | null {
  if (!d) return null;
  if ('minutos' in d) {
    const cifra = formatoMinutos(d.minutos);
    return cifra ? `desde ${cifra}` : null;
  }
  return durationUnknownEs(d.razon);
}

/** True cuando el texto lleva cifra: lo único que se puede acentuar. Una razón no es un dato. */
export function llevaNumero(d: DuracionEscrita | null): boolean {
  return d !== null && 'minutos' in d && formatoMinutos(d.minutos) !== null;
}

/** El desglose de una sesión, leído del contrato: sin entrada = `sin-detalle`. */
export function desgloseDe(l: LecturaPlan, sesionId: string): Desglose {
  return l.desgloses[sesionId] ?? { estado: 'sin-detalle' };
}

export function desgloseListo(d: Desglose): DesgloseSesion | null {
  return d.estado === 'listo' ? d : null;
}

/** Cuántas partes caben en el héroe, y cuántos ejercicios por parte antes de «+ N más». */
export const MAX_PARTES = 4;
export const MAX_EJERCICIOS_EN_FILA = 3;


/** Una sesión se mueve mientras no esté completada: el servidor congela las hechas y devolvería 409. */
export const puedeMoverse = (s: SesionDelPlan): boolean => s.estado !== 'hecha';

// ---------------------------------------------------------------------------
// Título del sujeto: baja un escalón en vez de partirse en cinco líneas
// ---------------------------------------------------------------------------

/** Escalones del título (px). El más pequeño sigue siendo el sujeto: manda sobre todo lo demás. */
export function tamanoDeTitulo(titulo: string): 44 | 36 | 30 {
  if (titulo.length <= 24) return 44;
  if (titulo.length <= 40) return 36;
  return 30;
}
