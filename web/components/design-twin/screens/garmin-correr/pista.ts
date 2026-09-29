// LA VUELTA DE PISTA — funciones PURAS: lo que la vuelta automática por metros
// (`PasoBase.vueltaAutoM`, aquí 400 m) le dice al atleta en la pista.
//
// El motor de `kit-reloj` ya cierra una vuelta cada `vueltaAutoM` metros, pero
// la escribió pensando en el km: su tarjeta dice «Kilómetro 7», la vuelta lleva
// `clase: 'km'` y la página Vueltas la rotula «km 7». En una pista de 400 m eso
// es mentira (lo que se cruza es la VUELTA 7). Como el motor es de la muñeca y
// no se toca, aquí se traduce lo que el motor deja en el estado:
//
//   · `bannerDeVuelta`     la tarjeta: «Vuelta 7» · el tiempo de la vuelta · su
//                          ritmo por km y, si el paso va a ritmo, si fue dentro
//                          o ▲ rápido / ▼ lento (el mismo `veredictoDe` de siempre,
//                          con la holgura del coach).
//   · `vueltasDePista`     las vueltas del estado con su veredicto puesto (el
//                          motor no juzga las automáticas).
//   · `rotuloDeVuelta`     «km 7» → «v 7» y «Kilómetros» → «Vueltas».
//
// Un paso es «de pista» cuando su vuelta automática NO es de 1000 m: con 1000
// la tarjeta y la lista del km son correctas y no se traducen.
//
// Qué NO hacer: contar vueltas aquí (las cuenta el motor: `estado.kmN`);
// escribir 400 (es dato del paso); decidir un veredicto sin la holgura del plan.
//
// HUECO DEL MODELO (para el arquitecto): la vuelta automática de `kit-reloj`
// asume el km en cuatro sitios (título, `clase: 'km'`, `estadoInicial` que
// cuenta `sesionM / 1000` y las listas «km N»). La raíz es una clase de vuelta
// que no diga «km» — ver el informe de esta pantalla.

import { juicioDe } from '../../kit-reloj/listas';
import type { PasoBase, Vuelta } from '../../kit-reloj/paso';
import { fmtRitmo, holguraDe, principal, veredictoDe } from '../../kit-reloj/reglas';
import type { EstadoSecuencia, PlanSesion } from '../../kit-reloj/secuencia';

/** La vuelta automática del km de siempre, m: la única que el motor rotula bien. */
const KM_M = 1000;

/** ¿La vuelta automática de este paso es de otra longitud que el km (una pista)? */
export const esVueltaDePista = (p: Pick<PasoBase, 'vueltaAutoM'>): boolean => p.vueltaAutoM != null && p.vueltaAutoM !== KM_M;

/** El ritmo por km de una vuelta de `metros` que duró `segundos`. `null` si no se sabe. */
export function ritmoDeVuelta(v: Pick<Vuelta, 'segundos' | 'metros'>): number | null {
  return v.metros != null && v.metros > 0 ? (v.segundos * KM_M) / v.metros : null;
}

/** El veredicto de una vuelta contra el objetivo de ritmo del paso (con la holgura del plan); `null` si el paso no va a ritmo. */
function veredictoDeLaVuelta(v: Vuelta, paso: PasoBase, plan: PlanSesion): Vuelta['veredicto'] {
  const o = principal(paso);
  const r = ritmoDeVuelta(v);
  if (!o || o.eje !== 'ritmo' || r == null) return null;
  return veredictoDe(o, r, holguraDe('ritmo', plan.reglas), plan.zonas);
}

/** Las vueltas del estado con su veredicto: el motor deja las automáticas sin juzgar. */
export function vueltasDePista(vueltas: Vuelta[], paso: PasoBase, plan: PlanSesion): Vuelta[] {
  return vueltas.map((v) => (v.clase === 'km' && v.veredicto == null ? { ...v, veredicto: veredictoDeLaVuelta(v, paso, plan), eje: 'ritmo' as const } : v));
}

/** La tarjeta de la vuelta recién cruzada, lista para `disponerKm`. `null` si no hay vuelta que enseñar. */
export function bannerDeVuelta(estado: EstadoSecuencia, paso: PasoBase, plan: PlanSesion): { titulo: string; valor: string; pie: string } | null {
  const banner = estado.banner;
  const ultima = estado.vueltas[estado.vueltas.length - 1];
  if (!banner || !ultima || ultima.clase !== 'km') return null;
  const juzgada = vueltasDePista([ultima], paso, plan)[0]!;
  const juicio = juicioDe(juzgada);
  const ritmo = `${fmtRitmo(ritmoDeVuelta(ultima))} /km`;
  return { titulo: `Vuelta ${ultima.n}`, valor: banner.valor, pie: juicio ? `${ritmo} · ${juicio.texto}` : ritmo };
}

/** «km 7» → «v 7», «Kilómetros» → «Vueltas»: la lista de vueltas de una pista, con su nombre. */
export function rotuloDeVuelta<T extends { n: string }>(f: T): T {
  return { ...f, n: f.n.replace(/^km /, 'v ') };
}

/** El título de la lista de vueltas de una pista. */
export function tituloDeVueltas(titulo: string[]): string[] {
  return titulo.map((t) => (t === 'Kilómetros' ? 'Vueltas' : t));
}
