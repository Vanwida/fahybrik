// LA VUELTA AUTOMÁTICA — funciones PURAS (P9; el Swift las espeja).
//
// El coach pide una vuelta cada N metros (`PasoBase.vueltaAutoM`, dato del
// coach): el km en calle, los 400 m de la pista, la milla si trabaja en millas.
// La vuelta se llama por lo que es: «Kilómetro 5» solo cuando es de 1000 m;
// cualquier otra, «Vuelta 7». Su ritmo es por km (lo que el atleta lee en toda
// la muñeca) y, si el paso va a ritmo, se juzga contra la banda del coach con
// su holgura, como una serie.
//
// La cuenta es de la SESIÓN (Kilómetro 5 = el quinto km corrido desde que
// empezó), con la longitud del paso en curso. Al entrar en un paso con otra
// longitud (o arrancar a mitad), la cuenta se re-ancla a esa longitud: la
// primera vuelta que suena es la que de verdad se cruza, nunca una falsa al
// primer segundo.
//
// Qué NO hacer: escribir un 1000 o un 400 fuera de aquí; el único 1000 es la
// definición del km (una unidad, no método).

import type { EjeObjetivo, PasoBase, ReglasAviso, Veredicto, Vuelta, ZonasCoach } from './paso';
import { fmtReloj, fmtRitmo, holguraDe, palabraVeredicto, principal, veredictoDe } from './reglas';

/** Metros de un kilómetro: la única vuelta automática que se llama por su nombre. */
export const METROS_KM = 1000;

/** Segundos que la tarjeta de la vuelta se queda encima de la cara. */
export const TARJETA_VUELTA_S = 4;

/** ¿Esta longitud de vuelta es el km? */
export const esVueltaKm = (vueltaM: number | undefined): boolean => vueltaM === METROS_KM;

/** «Kilómetro 5» o «Vuelta 7»: el título de la tarjeta y de la voz. */
export function nombreVueltaAuto(n: number, vueltaM: number | undefined): string {
  return esVueltaKm(vueltaM) ? `Kilómetro ${n}` : `Vuelta ${n}`;
}

/** «km 5» o «v 7»: el número de la vuelta en una lista (la columna estrecha). */
export function rotuloVueltaAuto(n: number, vueltaM: number | undefined): string {
  return esVueltaKm(vueltaM) ? `km ${n}` : `v ${n}`;
}

/** «Kilómetros» o «Vueltas»: el título de la lista de vueltas automáticas. */
export function tituloVueltasAuto(vueltas: ReadonlyArray<Pick<Vuelta, 'vueltaM'>>): string {
  return vueltas.every((v) => esVueltaKm(v.vueltaM)) ? 'Kilómetros' : 'Vueltas';
}

/** La longitud de una vuelta automática ya hecha: la del paso; si un resultado viejo no la trae, sus metros. */
export const longitudDe = (v: Pick<Vuelta, 'vueltaM' | 'metros'>): number | undefined => v.vueltaM ?? v.metros ?? undefined;

/**
 * El número de una vuelta automática en la lista del resumen: su número, o si
 * es la última y no llegó a su longitud, lo que corrió en km («0,49»).
 */
export function numeroDeVueltaAuto(v: Pick<Vuelta, 'n' | 'metros' | 'vueltaM'>): string {
  const largo = v.vueltaM ?? METROS_KM;
  return v.metros != null && v.metros < largo ? (v.metros / METROS_KM).toFixed(2).replace('.', ',') : String(v.n);
}

/** El ritmo por km de `metros` corridos en `segundos`; `null` si no hay metros. */
export function ritmoPorKm(segundos: number, metros: number | null | undefined): number | null {
  return metros != null && metros > 0 ? (segundos * METROS_KM) / metros : null;
}

/** Cuántas vueltas completas lleva la sesión con esta longitud: el ancla de la cuenta. */
export const vueltasDeSesion = (sesionM: number, vueltaM: number): number => Math.floor(sesionM / vueltaM);

/**
 * El segundo de sesión en que empezó la vuelta en curso, estimado a ritmo
 * uniforme (al arrancar a mitad o re-anclar: el motor no sabe cuándo se cruzó).
 */
export function inicioVueltaEstimado(sesionM: number, sesionT: number, vueltaM: number): number {
  const hechas = vueltasDeSesion(sesionM, vueltaM);
  return sesionT - Math.round(((sesionM - hechas * vueltaM) / Math.max(1, sesionM)) * sesionT);
}

/** El veredicto de una vuelta contra el ritmo del paso (con la holgura del coach); `null` si el paso no va a ritmo. */
function veredictoDeVuelta(p: PasoBase, ritmo: number | null, reglas: ReglasAviso, zonas: ZonasCoach | null): { veredicto: Veredicto | null; eje?: EjeObjetivo } {
  const o = principal(p);
  if (!o || o.eje !== 'ritmo' || ritmo == null) return { veredicto: null };
  return { veredicto: veredictoDe(o, ritmo, holguraDe('ritmo', reglas), zonas), eje: 'ritmo' };
}

/** La vuelta automática recién cruzada, con su ritmo por km y su veredicto. */
export function vueltaAutomatica(
  p: PasoBase & { vueltaAutoM: number },
  n: number,
  segundos: number,
  ppm: number | null,
  reglas: ReglasAviso,
  zonas: ZonasCoach | null,
): Vuelta {
  const ritmo = ritmoPorKm(segundos, p.vueltaAutoM);
  return { n, clase: 'auto', segundos, metros: p.vueltaAutoM, vueltaM: p.vueltaAutoM, ritmo, ppm, ...veredictoDeVuelta(p, ritmo, reglas, zonas) };
}

/**
 * La tarjeta de la vuelta: «Kilómetro 5 · 4:52 · ritmo del km» (en el km, el
 * tiempo ES el ritmo) o «Vuelta 7 · 1:40 · 4:10 /km». Si el paso va a ritmo,
 * el veredicto detrás: «· dentro», «· ▲ rápido».
 */
export function tarjetaDeVuelta(v: Vuelta): { titulo: string; valor: string; pie: string } {
  const base = esVueltaKm(v.vueltaM) ? 'ritmo del km' : `${fmtRitmo(v.ritmo)} /km`;
  const j = v.veredicto ? palabraVeredicto(v.eje ?? 'ritmo', v.veredicto) : null;
  const juicio = j ? ` · ${j.marca ? `${j.marca} ${j.texto}` : j.texto}` : '';
  return { titulo: nombreVueltaAuto(v.n, v.vueltaM), valor: fmtReloj(v.segundos), pie: `${base}${juicio}` };
}
