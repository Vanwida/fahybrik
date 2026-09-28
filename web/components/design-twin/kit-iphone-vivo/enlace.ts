// LOS ENLACES DEL IPHONE — funciones PURAS (I10 del modelo del iPhone).
//
// El móvil tiene periféricos que la muñeca no tiene: el GPS, la máquina por
// Bluetooth, el pulsómetro (banda o reloj) y el propio reloj como segunda
// pantalla o como motor. Lo que se PINTA de cada uno sale de aquí, derivado
// de lo que ya dicen las lecturas del kit (`gps`, `viejos`, `ppm`) y de qué
// hay emparejado (`Dispositivos`): no hay un segundo estado de conexión que
// pueda contradecir al dato.
//
// Reglas (I10, memoria del proyecto):
//   · lo que no llega en 5 s se pinta «—» con su nota («sin señal del remo»);
//   · nada se conecta solo: reconectar es un toque en el chip;
//   · GPS «buscando» ANTES de empezar, no a mitad;
//   · copy de box: «el remo», «la bici», nunca PM5 ni BLE.

import { familiaDe } from '../kit-reloj/metricas';
import type { Lecturas, PasoBase } from '../kit-reloj/paso';
import { deMaquina, nombreMaquina, nombreMaquinaCorto, type TipoMaquina } from '../kit-reloj/reglas';
import type { EstadoChip, NombreIcono } from './piezas';

export interface Dispositivos {
  /** El reloj: lleva el motor, es segunda pantalla, o no hay. */
  reloj: 'motor' | 'segunda-pantalla' | 'sin';
  /** La máquina emparejada, si hay (si el paso lleva máquina y no está, hay que conectarla). */
  maquina: TipoMaquina | null;
  /** De dónde viene el pulso. */
  pulsometro: 'reloj' | 'banda' | 'sin';
}

export const SIN_DISPOSITIVOS: Dispositivos = { reloj: 'sin', maquina: null, pulsometro: 'sin' };

export type ClaveEnlace = 'reloj' | 'gps' | 'maquina' | 'pulso';

export interface ChipEnlace {
  clave: ClaveEnlace;
  icono: NombreIcono;
  texto: string;
  estado: EstadoChip;
  /** La nota de honestidad bajo el sujeto cuando algo no llega; null si todo va. */
  nota: string | null;
}

/** Un dato de la máquina que dependía del enlace y no llega (5 s). */
const maquinaVieja = (l: Lecturas): boolean => !!l.viejos && (l.viejos.includes('split500') || l.viejos.includes('hecho') || l.viejos.includes('vatios'));

/** ¿Este paso corre con GPS? Solo si SE CORRE (la familia, no la clase): calle o pista, nunca cinta ni un tabata de burpees. */
export function usaGps(p: PasoBase): boolean {
  return familiaDe(p) === 'correr' && p.entorno !== 'cinta';
}

/**
 * LOS CHIPS DE LA CABECERA, derivados. Solo los que importan a este paso: el
 * GPS en una carrera de calle, la máquina si el paso la lleva, el pulso
 * siempre, el reloj si hay.
 */
export function enlacesDe(d: Dispositivos, p: PasoBase, l: Lecturas): ChipEnlace[] {
  const chips: ChipEnlace[] = [];

  if (d.reloj !== 'sin') {
    chips.push({
      clave: 'reloj',
      icono: 'reloj',
      texto: 'Reloj',
      estado: 'ok',
      nota: d.reloj === 'motor' ? 'el reloj lleva el entreno · el móvil es su segunda pantalla' : null,
    });
  }

  if (usaGps(p)) {
    const buscando = l.gps === 'buscando';
    chips.push({ clave: 'gps', icono: 'gps', texto: 'GPS', estado: buscando ? 'buscando' : 'ok', nota: buscando ? 'GPS · buscando señal' : null });
  }

  const tipo = p.maquina?.tipo ?? null;
  if (tipo) {
    const m = { tipo };
    const nombre = nombreMaquina(m) ?? 'la máquina';
    const corto = nombreMaquinaCorto(m) ?? 'Máquina';
    if (d.maquina !== tipo) {
      chips.push({ clave: 'maquina', icono: 'maquina', texto: `Conectar ${nombre}`, estado: 'apagado', nota: `sin ${nombre} · lo dices tú` });
    } else if (maquinaVieja(l)) {
      chips.push({ clave: 'maquina', icono: 'maquina', texto: `${corto} · sin señal`, estado: 'perdido', nota: `sin señal ${deMaquina(m)} · toca para reconectar` });
    } else {
      chips.push({ clave: 'maquina', icono: 'maquina', texto: corto, estado: 'ok', nota: null });
    }
  }

  if (d.pulsometro === 'sin') {
    chips.push({ clave: 'pulso', icono: 'pulso', texto: 'Sin pulso', estado: 'apagado', nota: null });
  } else {
    const viejo = l.viejos?.includes('ppm') ?? false;
    const sin = l.ppm == null || viejo;
    chips.push({
      clave: 'pulso',
      icono: 'pulso',
      texto: d.pulsometro === 'banda' ? 'Banda' : 'Pulso',
      estado: viejo ? 'perdido' : sin ? 'buscando' : 'ok',
      nota: viejo ? 'sin señal del pulso' : sin ? 'pulso · buscando' : null,
    });
  }

  return chips;
}

/** La primera nota de honestidad que toque enseñar bajo el sujeto (una, no una lista). */
export function notaEnlace(chips: ChipEnlace[]): string | null {
  // Lo que se ha PERDIDO va antes que lo que aún busca; lo apagado, antes que lo informativo.
  const orden: EstadoChip[] = ['perdido', 'buscando', 'apagado', 'ok'];
  for (const e of orden) {
    const c = chips.find((x) => x.estado === e && x.nota);
    if (c) return c.nota;
  }
  return null;
}
