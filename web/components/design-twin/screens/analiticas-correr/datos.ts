// LOS CUATRO ATLETAS — la prueba de esfuerzo del diseño.
//
// No son cuatro decorados del mismo caso bonito con más o menos números: cada
// uno rompe el diseño por un sitio distinto, y si los cuatro entran sin texto
// libre y sin una sola casilla vacía, el modelo aguanta.
//
//   ① VETERANO      todo lleno. El caso fácil, y el único que casi todas las
//                   apps saben pintar.
//   ② RECIÉN LLEGADO  casi nada se puede afirmar. Aquí se separa un diseño
//                   honesto de uno que rellena: la pantalla sale CORTA.
//   ③ CARGANDO      el veredicto tiene que ser incómodo, y la evidencia de
//                   debajo tiene que EXPLICARLO — se ve que corre todo a ritmo
//                   medio, y por eso el motor responde peor.
//   ④ SIN ZONAS     no hizo el test de umbral, así que se caen DOS piezas por
//                   la misma razón. La petición del test sale una vez, arriba,
//                   no tres veces seguidas.
//
// Las semanas van etiquetadas por su lunes, que es como las cuenta el atleta.

import type { Historia } from './modelo';

const SEMANAS = ['23 jun', '30 jun', '7 jul', '14 jul', '21 jul', '28 jul', '4 ago', '11 ago'];

/** Los siete puntos de la curva, en el orden en que se pintan. */
const DISTANCIAS = [400, 800, 1000, 1600, 3000, 5000, 10000];

function curva(segundos: number[]) {
  return DISTANCIAS.map((metros, i) => ({ metros, segundos: segundos[i]! }));
}

function serieAlPulso(skm: number[]) {
  return skm.map((s, i) => ({ semana: SEMANAS[SEMANAS.length - skm.length + i]!, skm: s }));
}

function serieKm(km: number[]) {
  return km.map((k, i) => ({ semana: SEMANAS[SEMANAS.length - km.length + i]!, km: k }));
}

// ---------------------------------------------------------------------------
// ① El veterano que mejora — siete meses dentro
// ---------------------------------------------------------------------------

const VETERANO: Historia = {
  semanas: 28,
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 158,
  zonaReferencia: 2,
  // 5:14 → 5:03 al mismo pulso. Once segundos por km, que a este nivel es mucho.
  alPulso: serieAlPulso([314, 312, 309, 310, 306, 305, 302, 303]),
  esfuerzos: curva([70, 152, 196, 330, 660, 1152, 2445]),
  esfuerzosAntes: curva([72, 157, 202, 341, 684, 1194, 2532]),
  semanasKm: serieKm([32, 35, 34, 38, 40, 37, 42, 44]),
  // Cuatro semanas de tiempo corriendo. Sobra pulso sin clasificar: se declara.
  zonasS: { z1: 6000, z2: 31000, z3: 3000, z4: 5200, z5: 1800 },
  segundosCorriendo: 48600,
  pedido: { evaluadas: 46, dentro: 39, fueraLento: 5, fueraRapido: 2, seRompeEnLaRepeticion: null },
  cansado: [
    { semana: '14 jul', costeSkm: 14.2, parejas: 5 },
    { semana: '21 jul', costeSkm: 13.0, parejas: 6 },
    { semana: '28 jul', costeSkm: 11.5, parejas: 5 },
    { semana: '4 ago', costeSkm: 10.8, parejas: 7 },
    { semana: '11 ago', costeSkm: 9.4, parejas: 6 },
  ],
  carrera: {
    nombre: 'HYROX Barcelona',
    dias: 34,
    predicho: { segundos: 4830, base: 'tu HYROX de Valencia y lo que has corrido desde entonces' },
  },
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ② El recién llegado — tres semanas, y hay que tener el valor de decirlo
// ---------------------------------------------------------------------------

const NUEVO: Historia = {
  semanas: 3,
  // Hizo el test de zonas al darse de alta, así que el ancla existe. Lo que no
  // existe es TIEMPO, que es otra falta y se cuenta distinto.
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 152,
  zonaReferencia: 2,
  alPulso: serieAlPulso([336, 333]),
  // Tiene marcas: son de sus tres semanas. Lo que no tiene es contra qué.
  esfuerzos: [
    { metros: 400, segundos: 84 },
    { metros: 1000, segundos: 232 },
    { metros: 3000, segundos: 780 },
    { metros: 5000, segundos: 1380 },
  ],
  esfuerzosAntes: [],
  semanasKm: serieKm([12, 18, 21]),
  zonasS: { z1: 2400, z2: 6100, z3: 1900, z4: 900 },
  segundosCorriendo: 11800,
  pedido: { evaluadas: 8, dentro: 6, fueraLento: 0, fueraRapido: 2, seRompeEnLaRepeticion: null },
  cansado: [],
  carrera: null,
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ③ El que carga de más — y la evidencia lo explica
// ---------------------------------------------------------------------------

const CARGANDO: Historia = {
  semanas: 14,
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 156,
  zonaReferencia: 2,
  // 4:58 → 5:09 al mismo pulso: once segundos por km PEOR.
  alPulso: serieAlPulso([298, 299, 301, 300, 304, 306, 307, 309]),
  esfuerzos: curva([71, 155, 200, 338, 678, 1188, 2520]),
  esfuerzosAntes: curva([70, 153, 197, 332, 666, 1164, 2478]),
  semanasKm: serieKm([33, 32, 34, 33, 37, 40, 42, 43]),
  // La causa, y se ve a simple vista: casi un tercio del tiempo en Z3. Es el
  // error clásico del amateur — correr todo a ritmo medio, ni suave ni fuerte.
  zonasS: { z1: 3000, z2: 20000, z3: 14000, z4: 8000, z5: 1500 },
  segundosCorriendo: 47800,
  pedido: { evaluadas: 38, dentro: 22, fueraLento: 3, fueraRapido: 13, seRompeEnLaRepeticion: 4 },
  cansado: [
    { semana: '21 jul', costeSkm: 11.0, parejas: 5 },
    { semana: '28 jul', costeSkm: 11.8, parejas: 4 },
    { semana: '4 ago', costeSkm: 12.4, parejas: 6 },
    { semana: '11 ago', costeSkm: 13.1, parejas: 5 },
  ],
  carrera: {
    nombre: 'HYROX Madrid',
    dias: 21,
    predicho: { segundos: 5100, base: 'tu HYROX de Sevilla y lo que has corrido desde entonces' },
  },
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ④ Sin zonas medidas — dos piezas caen por la MISMA razón
// ---------------------------------------------------------------------------

const SIN_ZONAS: Historia = {
  semanas: 11,
  // Nunca hizo el test. Tiene pulso en las carreras, pero sin saber dónde están
  // sus bandas ese pulso no clasifica nada.
  zonasMedidas: false,
  conPulso: true,
  ppmReferencia: 0,
  zonaReferencia: null,
  alPulso: [],
  // El veredicto baja al segundo peldaño y sale igual de defendible: los
  // mejores esfuerzos no necesitan zonas, solo un cronómetro y memoria.
  esfuerzos: curva([73, 158, 204, 344, 690, 1206, 2556]),
  esfuerzosAntes: curva([74, 162, 210, 355, 714, 1254, 2664]),
  semanasKm: serieKm([26, 28, 27, 30, 31, 29, 33, 34]),
  zonasS: {},
  segundosCorriendo: 41200,
  // Las bandas de ritmo del coach SÍ funcionan sin zonas: se miden en s/km, no
  // en pulso. Por eso esta pieza sobrevive donde las dos de arriba se caen.
  pedido: { evaluadas: 31, dentro: 25, fueraLento: 4, fueraRapido: 2, seRompeEnLaRepeticion: null },
  cansado: [
    { semana: '21 jul', costeSkm: 15.5, parejas: 4 },
    { semana: '28 jul', costeSkm: 14.1, parejas: 5 },
    { semana: '4 ago', costeSkm: 13.6, parejas: 4 },
    { semana: '11 ago', costeSkm: 12.9, parejas: 5 },
  ],
  // Tiene carrera pero nunca ha hecho una: no hay de dónde proyectar un tiempo,
  // y no se inventa. El bloque existe, la cifra no.
  carrera: { nombre: 'HYROX Valencia', dias: 58, predicho: null },
  mismoTipo: null,
};

export const ESCENAS: Record<string, Historia> = {
  veterano: VETERANO,
  nuevo: NUEVO,
  cargando: CARGANDO,
  'sin-zonas': SIN_ZONAS,
};
