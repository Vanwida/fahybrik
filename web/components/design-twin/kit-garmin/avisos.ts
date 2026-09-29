'use client';

// LOS AVISOS — §6 del modelo: vibración + tono, sin voz (H5). Un evento, un
// aviso, con CODIFICACIÓN REDUNDANTE: la vibración se distingue por el NÚMERO
// de pulsos (los Forerunner no cambian de intensidad) y el tono por su
// MELODÍA (si el atleta silencia los tonos, queda la vibración).
//
// El motor es el de `kit-reloj` y emite sus `EventoVivo`; aquí se traduce
// cada uno a su fila de §6 (`AVISOS`), o a «ninguno» dicho explícitamente.
// Garmin suma cinco eventos que la muñeca no tiene: el acuse de una tecla
// (`paso-a-mano`, G4), el sensor o GPS que vuelve (`recuperado`), la batería
// baja (`bateria`), la campana de un AMRAP (`campana`: la emite la familia en
// vez del «recupera» del motor cuando se acaba el tiempo) y el campo de una
// anotación que se confirma (`campo-confirmado`). El GPS o el pulso que se pierden los detecta `sistemaDe`
// en las lecturas, no una pantalla.
//
// «Sin apilar» (la regla de la muñeca, `useLote`): en un instante suena UN
// aviso, el de más prioridad. El acuse de una tecla es la excepción: va
// DELANTE, porque es la respuesta del botón (una pulsación = una acción + un
// aviso propio, G4) y no un aviso más. Todo junto cabe en una llamada a
// `Attention.vibrate` (≤ 8 perfiles).
//
// Qué NO hacer: vibrar desde una pantalla (se emite el evento); inventar un
// evento sin su fila en §6; usar la voz de `kit-reloj` (no existe en Garmin).

import { useCallback, useState } from 'react';
import { VOCABULARIO, useLote, type EventoVivo, type Eventos } from '../kit-reloj/eventos';
import type { Transicion } from '../kit-reloj/gancho';
import { wodDe } from '../kit-reloj/tarea';
import type { LecturaSim } from '../kit-reloj/secuencia';

export type EventoGarmin = EventoVivo | 'paso-a-mano' | 'recuperado' | 'bateria' | 'campana' | 'campo-confirmado';

// ---------------------------------------------------------------------------
// El vocabulario (mecanismo nuestro: la duración de cada pulso, las notas)
// ---------------------------------------------------------------------------

export type TipoPulso = 'muyCorta' | 'corta' | 'larga';

/** Duración de cada pulso, ms. Distinguibles a ciegas: muy corta ≈ un clic, larga ≈ medio segundo. */
export const PULSO_MS: Record<TipoPulso, number> = { muyCorta: 60, corta: 180, larga: 520 };
/** El silencio entre dos pulsos (un perfil de intensidad 0), ms. */
export const HUECO_PULSOS_MS = 160;
/** `Attention.vibrate` admite como mucho 8 perfiles por llamada (H5). */
export const MAX_PERFILES = 8;

/** Los tonos de sistema de `Attention.playTone` (19, H5). */
export type ToneSistema =
  | 'KEY'
  | 'START'
  | 'STOP'
  | 'MSG'
  | 'ALERT_HI'
  | 'ALERT_LO'
  | 'LOUD_BEEP'
  | 'INTERVAL_ALERT'
  | 'ALARM'
  | 'RESET'
  | 'LAP'
  | 'CANARY'
  | 'TIME_ALERT'
  | 'DISTANCE_ALERT'
  | 'FAILURE'
  | 'SUCCESS'
  | 'POWER'
  | 'LOW_BATTERY'
  | 'ERROR';

export interface Nota {
  hz: number;
  ms: number;
}

export type TonoAviso = { sistema: ToneSistema; veces?: number } | { melodia: Nota[] };

export interface AvisoGarmin {
  /** El evento, como lo nombra la fila de §6. */
  nombre: string;
  pulsos: TipoPulso[];
  tono: TonoAviso;
  /** Se emite una vez por segundo, `repite` veces seguidas (el 3-2-1). */
  repite?: number;
  /** Si coinciden varios en un instante, suena el de más prioridad. */
  prioridad: number;
}

/** Un evento que, a propósito, no avisa: el motivo va escrito. */
export interface Ninguno {
  nombre: string;
  ninguno: string;
}

export const esAviso = (a: AvisoGarmin | Ninguno): a is AvisoGarmin => 'pulsos' in a;

const pri = (e: EventoVivo) => VOCABULARIO[e].prioridad;
const BAJAN: Nota[] = [
  { hz: 1047, ms: 140 },
  { hz: 784, ms: 180 },
];
const SUBEN: Nota[] = [
  { hz: 784, ms: 140 },
  { hz: 1047, ms: 180 },
];

/** Cinco notas: dos iguales, una que sube y una que baja a una larga, como una campana. Mecanismo (el sonido), no método del coach. */
const CAMPANA: Nota[] = [
  { hz: 1319, ms: 120 },
  { hz: 1319, ms: 120 },
  { hz: 1568, ms: 140 },
  { hz: 1319, ms: 140 },
  { hz: 988, ms: 480 },
];

/** Por encima de todo lo que puede coincidir con ella en el mismo segundo (bloque, sesión, enlace). */
const PRIORIDAD_CAMPANA = 12;

/** LA TABLA DE §6 — una fila por evento del motor y por evento propio de Garmin. */
export const AVISOS: Record<EventoGarmin, AvisoGarmin | Ninguno> = {
  cuenta: { nombre: '3-2-1 antes de un paso de trabajo', pulsos: ['corta'], tono: { sistema: 'KEY' }, repite: 3, prioridad: pri('cuenta') },
  go: { nombre: 'Empieza trabajo (GO)', pulsos: ['larga', 'larga'], tono: { sistema: 'START' }, prioridad: pri('go') },
  recupera: { nombre: 'Empieza recuperación / descanso', pulsos: ['larga'], tono: { sistema: 'STOP' }, prioridad: pri('recupera') },
  preaviso: { nombre: 'Preaviso', pulsos: ['corta'], tono: { sistema: 'INTERVAL_ALERT' }, prioridad: pri('preaviso') },
  afloja: { nombre: 'Afloja', pulsos: ['corta', 'corta'], tono: { melodia: BAJAN }, prioridad: pri('afloja') },
  aprieta: { nombre: 'Aprieta', pulsos: ['corta', 'corta', 'corta'], tono: { melodia: SUBEN }, prioridad: pri('aprieta') },
  vuelta: { nombre: 'Vuelta automática', pulsos: ['corta', 'corta'], tono: { sistema: 'LAP' }, prioridad: pri('vuelta') },
  'paso-a-mano': { nombre: 'Paso cerrado a mano', pulsos: ['muyCorta'], tono: { sistema: 'KEY' }, prioridad: 0 },
  campana: { nombre: 'Campana de un AMRAP', pulsos: ['larga', 'larga', 'larga', 'larga'], tono: { melodia: CAMPANA }, prioridad: PRIORIDAD_CAMPANA },
  'campo-confirmado': { nombre: 'Campo de anotación confirmado', pulsos: ['muyCorta'], tono: { sistema: 'KEY' }, prioridad: 0 },
  bloque: { nombre: 'Bloque hecho', pulsos: ['larga', 'corta'], tono: { sistema: 'SUCCESS' }, prioridad: pri('bloque') },
  sesion: { nombre: 'Sesión hecha', pulsos: ['larga', 'larga', 'larga'], tono: { sistema: 'SUCCESS', veces: 2 }, prioridad: pri('sesion') },
  gps: { nombre: 'GPS listo', pulsos: ['larga'], tono: { sistema: 'SUCCESS' }, prioridad: pri('gps') },
  enlace: { nombre: 'Sensor o GPS perdido', pulsos: ['larga', 'larga', 'larga'], tono: { sistema: 'FAILURE' }, prioridad: pri('enlace') },
  recuperado: { nombre: 'Sensor o GPS recuperado', pulsos: ['corta'], tono: { sistema: 'KEY' }, prioridad: pri('accion') },
  bateria: { nombre: 'Batería baja', pulsos: ['larga', 'larga'], tono: { sistema: 'LOW_BATTERY' }, prioridad: pri('enlace') },
  'fin-serie': { nombre: 'Fin de serie', ninguno: 'sin voz en Garmin (H5); ya avisa la entrada en el paso siguiente' },
  accion: {
    nombre: 'Acción del atleta',
    ninguno: 'pausa, reanudar, +30 s y deshacer no tienen fila en §6: un evento sin aviso propio no vibra',
  },
};

// ---------------------------------------------------------------------------
// Cómo suena: perfiles de vibración y texto
// ---------------------------------------------------------------------------

export interface PerfilVibracion {
  /** 0–100 (dutyCycle). 0 = el silencio entre pulsos. */
  intensidad: number;
  ms: number;
}

/** Los perfiles de `Attention.vibrate`: pulso, silencio, pulso… */
export function perfilesDe(pulsos: readonly TipoPulso[]): PerfilVibracion[] {
  return pulsos.flatMap((p, k) => [...(k > 0 ? [{ intensidad: 0, ms: HUECO_PULSOS_MS }] : []), { intensidad: 100, ms: PULSO_MS[p] }]);
}

const NOMBRE_PULSO: Record<TipoPulso, [string, string]> = { muyCorta: ['muy corta', 'muy cortas'], corta: ['corta', 'cortas'], larga: ['larga', 'largas'] };

/**
 * «2 largas», «1 larga + 1 corta», «1 corta por segundo»: como lo dice §6.
 * `instante` = lo que suena en UN instante (el 3-2-1 suena una vez por tic).
 */
export function fmtPulsos(a: AvisoGarmin, instante = false): string {
  const grupos: Array<{ tipo: TipoPulso; n: number }> = [];
  a.pulsos.forEach((p) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.tipo === p) ultimo.n += 1;
    else grupos.push({ tipo: p, n: 1 });
  });
  const texto = grupos.map((g) => `${g.n} ${NOMBRE_PULSO[g.tipo][g.n > 1 ? 1 : 0]}`).join(' + ');
  return a.repite && !instante ? `${texto} por segundo` : texto;
}

/** «START», «SUCCESS ×2», «KEY ×3», «dos notas que bajan», «melodía propia». */
export function fmtTono(a: AvisoGarmin, instante = false): string {
  const t = a.tono;
  if ('sistema' in t) {
    const veces = t.veces ?? (instante ? undefined : a.repite);
    return veces && veces > 1 ? `${t.sistema} ×${veces}` : t.sistema;
  }
  const [x, y] = t.melodia;
  if (t.melodia.length === 2 && x && y) return y.hz < x.hz ? 'dos notas que bajan' : 'dos notas que suben';
  return 'melodía propia';
}

// ---------------------------------------------------------------------------
// De la transición del motor a los eventos de Garmin
// ---------------------------------------------------------------------------

/** El GPS o el pulso que se pierden o vuelven, leído en las lecturas (no lo dice ninguna pantalla). */
export function sistemaDe(antes: LecturaSim, despues: LecturaSim): EventoGarmin[] {
  const out: EventoGarmin[] = [];
  const gpsPerdido = antes.gps === 'listo' && despues.gps === 'buscando';
  const gpsVuelve = antes.gps === 'buscando' && despues.gps === 'listo';
  const pulsoPerdido = antes.ppm != null && despues.ppm == null;
  const pulsoVuelve = antes.ppm == null && despues.ppm != null;
  if (gpsPerdido || pulsoPerdido) out.push('enlace');
  if (gpsVuelve || pulsoVuelve) out.push('recuperado');
  return out;
}

/**
 * ¿Es esta transición la campana de un AMRAP? El motor pasa solo (`quien:
 * 'motor'`) de la ventana de un AMRAP a su puntuación. Si el atleta salta el
 * AMRAP desde Controles no ha acabado el tiempo y no suena.
 */
export function esCampana(t: Transicion): boolean {
  const antes = wodDe(t.plan.pasos[t.antes.i]);
  const despues = wodDe(t.plan.pasos[t.despues.i]);
  return t.quien === 'motor' && t.antes.i !== t.despues.i && antes?.formato === 'amrap' && despues?.formato === 'puntuacion';
}

/**
 * Lo que avisa una transición del motor: sus eventos (el acuse de la tecla
 * en vez de «acción» si la cerró el atleta; la campana en vez del «empieza
 * recuperación» con el que el motor cierra un AMRAP) y lo que dicen los
 * sensores. Sin repetidos. La voz de cada evento se ignora (H5).
 */
export function eventosDeTransicion(t: Transicion): EventoGarmin[] {
  const campana = esCampana(t);
  const del = t.eventos.flatMap((e): EventoGarmin[] => {
    if (e.evento === 'recupera' && campana) return ['campana'];
    return [e.evento === 'accion' && t.quien === 'atleta' ? 'paso-a-mano' : e.evento];
  });
  return [...new Set([...del, ...sistemaDe(t.antes.lect, t.despues.lect)])];
}

// ---------------------------------------------------------------------------
// Un instante: el acuse delante, y UN aviso
// ---------------------------------------------------------------------------

export interface EmisionGarmin {
  /** Sube en cada emisión: `key` del destello y del lector. */
  n: number;
  eventos: EventoGarmin[];
  /** El acuse de la tecla, si lo hay: suena primero. */
  acuse: EventoGarmin | null;
  /** El aviso que suena (el de más prioridad), o null. */
  suena: EventoGarmin | null;
  perfiles: PerfilVibracion[];
  linea: string;
}

export function componerAvisos(n: number, eventos: readonly EventoGarmin[]): EmisionGarmin {
  const acuse = eventos.includes('paso-a-mano') ? ('paso-a-mano' as const) : null;
  const suena = eventos
    .filter((e) => e !== 'paso-a-mano')
    .reduce<EventoGarmin | null>((mejor, e) => {
      const a = AVISOS[e];
      if (!esAviso(a)) return mejor;
      const m = mejor ? AVISOS[mejor] : null;
      return !m || !esAviso(m) || a.prioridad > m.prioridad ? e : mejor;
    }, null);
  const sonando = [acuse, suena].filter((e): e is EventoGarmin => e != null).map((e) => AVISOS[e] as AvisoGarmin);
  const perfiles = sonando.flatMap((a, k) => [...(k > 0 ? [{ intensidad: 0, ms: HUECO_PULSOS_MS }] : []), ...perfilesDe(a.pulsos)]);
  const nombres = [...new Set(eventos.map((e) => AVISOS[e].nombre))].join(' + ');
  const cuerpo =
    sonando.length === 0
      ? 'sin aviso'
      : `vibra ${sonando.map((a) => fmtPulsos(a, true)).join(', luego ')} · tono ${sonando.map((a) => fmtTono(a, true)).join(', luego ')}`;
  return { n, eventos: [...eventos], acuse, suena, perfiles, linea: `${nombres} — ${cuerpo}` };
}

// ---------------------------------------------------------------------------
// El emisor de una pantalla
// ---------------------------------------------------------------------------

export interface Avisos {
  emitir: (e: EventoGarmin) => void;
  /** Lo que avisa una transición del motor (el `traducir` del vivo). */
  transicion: (t: Transicion) => void;
  ultimo: EmisionGarmin | null;
  /** El adaptador para `useSecuencia` de kit-reloj: su «acción» (pausa, deshacer, +30 s) entra aquí. */
  comoEventos: Eventos;
}

/** El emisor: junta lo de un instante (`useLote`) y lo escribe en la cronología del panel. */
export function useAvisos(onLog: (linea: string) => void): Avisos {
  const [ultimo, setUltimo] = useState<EmisionGarmin | null>(null);
  const meter = useLote<EventoGarmin>((lote, n) => {
    const e = componerAvisos(n, lote);
    setUltimo(e);
    onLog(e.linea);
  });
  const emitir = useCallback((e: EventoGarmin) => meter(e), [meter]);
  const transicion = useCallback((t: Transicion) => eventosDeTransicion(t).forEach(meter), [meter]);
  return { emitir, transicion, ultimo, comoEventos: { emitir: (e) => meter(e), ultimo: null } };
}
