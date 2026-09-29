// LOS AVISOS DE SISTEMA ANTES DE EMPEZAR (G26) — la tarjeta de «antes». PURA.
//
// Al pulsar START, si hay algo que cambia lo que el atleta va a ver o a poder
// hacer, el reloj lo dice ANTES de la cuenta atrás, con la misma tarjeta de
// sistema que ya usa la carrera (`garmin-correr/sistema.ts`: título, qué sigue,
// qué queda sin dato). Aquí solo se coloca para el momento de antes de salir:
//
//   Batería baja   el % que hay, y para cuánto (la duración estimada de la
//                  sesión). Se dicen los DOS hechos; no se promete «no llegarás»
//                  (el gasto por hora está sin medir, T12).
//   Sin pulso      la raya «—» (jamás un cero) y qué se queda sin medir: lo que va
//                  a zona. Se sale igual: es decisión del atleta.
//   Sin móvil      no bloquea nada («se graba igual») y va como línea del brief; la
//                  tarjeta existe para el final de la sesión y se comprueba aquí.
//
// START = «Empezar» (sigue a la cuenta atrás); BACK = volver al brief. No suena
// nada: §6 no tiene fila para un aviso previo, y el atleta acaba de pulsar START y
// está mirando el reloj. Un evento sin aviso propio no vibra.
//
// Qué NO hacer: poner aquí un texto que ya esté en `TEXTO_SISTEMA` (se importa);
// pintar un pulso a cero; decir «no llegarás» (nadie lo ha medido).

import { lineasContexto } from '../../kit-garmin/caras';
import { chica, colocar, heroeEn, type Disposicion, type LineaG } from '../../kit-garmin/disponer';
import { REJILLA, caja } from '../../kit-garmin/geometria';
import { AIRE } from '../../kit-garmin/tokens';
import { TEXTO_SISTEMA, type AvisoDeSistema } from '../garmin-correr/sistema';
import { TEXTO_EMPEZAR } from './brief';
import type { AvisoPrevio } from './estado';
import { ALTO_NOTA, finDe, lineaAccion, textoEn } from './filas';

/** Los avisos que caben en la tarjeta de antes: los dos que bloquean y el móvil (informativo). */
export type AvisoDeAntes = AvisoPrevio | 'sin-movil';

/** Todo lo que se puede decir antes de empezar, en el orden en que se dice. */
export const AVISOS_DE_ANTES: readonly AvisoDeAntes[] = ['bateria-baja', 'pulso-ausente', 'sin-movil'];

/** Lo que la tarjeta necesita para decir el número y el «para cuánto». */
export interface DatosPrevio {
  bateriaPct: number;
  /** La duración estimada, como la diría un atleta («80′»). */
  duracion: string;
}

/** Cada aviso de antes es una entrada de la tarjeta de sistema de la carrera. */
const CLAVE: Record<AvisoDeAntes, AvisoDeSistema> = { 'bateria-baja': 'bateria-baja', 'pulso-ausente': 'pulso-ausente', 'sin-movil': 'sin-movil' };

export interface TextoPrevio {
  titulo: string;
  etiqueta: string | null;
  heroe: { texto: string; unidad?: string } | null;
  detalle: string | null;
  sigue: string;
  sinDato: string | null;
}

/** Lo que dice cada tarjeta: el héroe (si lo hay) y el «para cuánto», sacados del aviso y de los datos. */
export function textoDePrevio(a: AvisoDeAntes, d: DatosPrevio): TextoPrevio {
  const t = TEXTO_SISTEMA[CLAVE[a]];
  const base = { titulo: t.titulo, sigue: t.sigue, sinDato: t.sinDato };
  switch (a) {
    case 'bateria-baja':
      return { ...base, etiqueta: 'tienes', heroe: { texto: String(Math.round(d.bateriaPct)), unidad: '%' }, detalle: `para ${d.duracion} de sesión` };
    case 'pulso-ausente':
      return { ...base, etiqueta: 'banda o reloj', heroe: { texto: '—' }, detalle: null };
    case 'sin-movil':
      return { ...base, etiqueta: null, heroe: null, detalle: null };
  }
}

/** Dónde vive el héroe de la tarjeta, en fracción de D: lo justo para que quepa dentro de 0,20–0,26 D. */
const HEROE_PREVIO = [REJILLA.heroe[0] + ALTO_NOTA + AIRE.lineas, 0.5] as const;

/** LA TARJETA: título · (etiqueta y héroe) · detalle · qué sigue · qué queda sin dato · «START · Empezar». */
export function disponerPrevio(a: AvisoDeAntes, datos: DatosPrevio, D: number): Disposicion {
  const t = textoDePrevio(a, datos);
  const lineas: LineaG[] = [...lineasContexto([t.titulo], D)];
  let y = Math.max(REJILLA.heroe[0], finDe(lineas, D, REJILLA.heroe[0]));
  let heroe: Disposicion['heroe'] = null;
  if (t.heroe && t.etiqueta) {
    lineas.push(colocar('etiqueta', [chica(t.etiqueta, D)], caja(y, ALTO_NOTA), D));
    heroe = heroeEn(t.heroe.texto, t.heroe.unidad, HEROE_PREVIO[0], HEROE_PREVIO[1], D);
    y = HEROE_PREVIO[1] + AIRE.lineas;
  }
  if (t.detalle) {
    const p = textoEn('detalle', t.detalle, y, D, { tono: 'tinta' });
    lineas.push(...p.lineas);
    y = p.fin;
  }
  const sigue = textoEn('sigue', t.sigue, y, D, { tono: t.detalle ? 'tinta2' : 'tinta' });
  lineas.push(...sigue.lineas);
  y = sigue.fin;
  if (t.sinDato) {
    const s = textoEn('sin-dato', t.sinDato, y, D, { tono: 'tinta2' });
    lineas.push(...s.lineas);
    y = s.fin;
  }
  lineas.push(lineaAccion(TEXTO_EMPEZAR, y + AIRE.lineas, D));
  return { D, lineas, heroe, pista: null };
}
