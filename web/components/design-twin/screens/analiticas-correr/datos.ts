// LOS CUATRO ATLETAS — la prueba de esfuerzo del diseño.
//
// Cada uno rompe la pantalla por un sitio distinto. Si los cuatro entran sin
// una casilla vacía y sin un párrafo, el diseño aguanta.
//
//   ① VETERANO   todo lleno. El caso que casi todas las apps saben pintar.
//   ② NUEVO      casi nada se puede afirmar, y el plazo se DIBUJA.
//   ③ CARGANDO   el veredicto incómodo, y la evidencia de debajo lo explica
//                sin una sola frase: se ve el tercio en ritmo medio.
//   ④ SIN ZONAS  dos lecturas caídas por la misma razón: se enseñan apagadas
//                con candado y un botón, no con un texto pidiendo el test.

import type { Historia } from './modelo';

const SEMANAS = ['23 jun', '30 jun', '7 jul', '14 jul', '21 jul', '28 jul', '4 ago', '11 ago'];
const DISTANCIAS = [400, 800, 1000, 1600, 3000, 5000, 10000];

const curva = (segundos: number[]) => DISTANCIAS.map((metros, i) => ({ metros, segundos: segundos[i]! }));
const serie = (vals: number[]) => vals.map((valor, i) => ({ semana: SEMANAS[SEMANAS.length - vals.length + i]!, valor }));

// ---------------------------------------------------------------------------
// ① El veterano que mejora — siete meses dentro
// ---------------------------------------------------------------------------

const VETERANO: Historia = {
  semanas: 28,
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 158,
  zonaReferencia: 2,
  vo2: { valor: 52, delta: 3, ventanaSemanas: 8, serie: [49, 49, 50, 50, 51, 51, 52, 52] },
  // 5:14 → 5:03 al mismo pulso. Once segundos por km, que a este nivel es mucho.
  alPulso: serie([314, 312, 309, 310, 306, 305, 302, 303]),
  esfuerzos: curva([70, 152, 196, 330, 660, 1152, 2445]),
  esfuerzosAntes: curva([72, 157, 202, 341, 684, 1194, 2532]),
  semanasKm: serie([32, 35, 34, 38, 40, 37, 42, 44]),
  zonasS: { z1: 6000, z2: 31000, z3: 3000, z4: 5200, z5: 1800 },
  segundosCorriendo: 48600,
  pedido: { evaluadas: 46, dentro: 39, fueraLento: 5, fueraRapido: 2 },
  cansado: [
    { semana: '14 jul', costeSkm: 14.2, parejas: 5 },
    { semana: '21 jul', costeSkm: 13.0, parejas: 6 },
    { semana: '28 jul', costeSkm: 11.5, parejas: 5 },
    { semana: '4 ago', costeSkm: 10.8, parejas: 7 },
    { semana: '11 ago', costeSkm: 9.4, parejas: 6 },
  ],
  carrera: { nombre: 'HYROX Barcelona', dias: 34, predichoS: 4830 },
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ② El recién llegado — tres semanas, y hay que tener el valor de decirlo
// ---------------------------------------------------------------------------

const NUEVO: Historia = {
  semanas: 3,
  // Hizo el test al darse de alta: el ancla existe. Lo que no existe es TIEMPO.
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 152,
  zonaReferencia: 2,
  // Tres semanas no mueven un VO₂máx: hay número, no hay delta que dibujar.
  vo2: { valor: 44, delta: 0, ventanaSemanas: 3, serie: [44, 44, 44] },
  alPulso: serie([336, 333]),
  esfuerzos: [
    { metros: 400, segundos: 84 },
    { metros: 1000, segundos: 232 },
    { metros: 3000, segundos: 780 },
    { metros: 5000, segundos: 1380 },
  ],
  esfuerzosAntes: [],
  semanasKm: serie([12, 18, 21]),
  zonasS: { z1: 2400, z2: 6100, z3: 1900, z4: 900 },
  segundosCorriendo: 11800,
  pedido: { evaluadas: 8, dentro: 6, fueraLento: 0, fueraRapido: 2 },
  cansado: [],
  carrera: null,
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ③ El que carga de más — y la evidencia lo explica sin decirlo
// ---------------------------------------------------------------------------

const CARGANDO: Historia = {
  semanas: 14,
  zonasMedidas: true,
  conPulso: true,
  ppmReferencia: 156,
  zonaReferencia: 2,
  vo2: { valor: 48, delta: -2, ventanaSemanas: 8, serie: [50, 50, 50, 49, 49, 49, 48, 48] },
  // 4:58 → 5:09 al mismo pulso: once segundos por km PEOR.
  alPulso: serie([298, 299, 301, 300, 304, 306, 307, 309]),
  esfuerzos: curva([71, 155, 200, 338, 678, 1188, 2520]),
  esfuerzosAntes: curva([70, 153, 197, 332, 666, 1164, 2478]),
  semanasKm: serie([33, 32, 34, 33, 37, 40, 42, 43]),
  // La causa, y se ve a simple vista: casi un tercio del tiempo en Z3. El error
  // clásico del amateur — correr todo a ritmo medio, ni suave ni fuerte.
  zonasS: { z1: 3000, z2: 20000, z3: 14000, z4: 8000, z5: 1500 },
  segundosCorriendo: 47800,
  pedido: { evaluadas: 38, dentro: 22, fueraLento: 3, fueraRapido: 13 },
  cansado: [
    { semana: '21 jul', costeSkm: 11.0, parejas: 5 },
    { semana: '28 jul', costeSkm: 11.8, parejas: 4 },
    { semana: '4 ago', costeSkm: 12.4, parejas: 6 },
    { semana: '11 ago', costeSkm: 13.1, parejas: 5 },
  ],
  carrera: { nombre: 'HYROX Madrid', dias: 21, predichoS: 5100 },
  mismoTipo: null,
};

// ---------------------------------------------------------------------------
// ④ Sin zonas medidas — dos lecturas caen por la MISMA razón
// ---------------------------------------------------------------------------

const SIN_ZONAS: Historia = {
  semanas: 11,
  zonasMedidas: false,
  conPulso: true,
  ppmReferencia: 0,
  zonaReferencia: null,
  // Sin reloj que lo estime tampoco hay VO₂máx: el titular de forma cae entero
  // y el bloque se apaga. Que se vea el hueco es el objetivo.
  vo2: null,
  alPulso: [],
  // El veredicto baja al segundo peldaño y sale igual de defendible: los
  // mejores esfuerzos no necesitan zonas, solo un cronómetro y memoria.
  esfuerzos: curva([73, 158, 204, 344, 690, 1206, 2556]),
  esfuerzosAntes: curva([74, 161, 208, 351, 704, 1238, 2620]),
  semanasKm: serie([26, 28, 27, 30, 31, 29, 33, 34]),
  zonasS: {},
  segundosCorriendo: 41200,
  // Las bandas de ritmo SÍ funcionan sin zonas: se miden en s/km, no en pulso.
  pedido: { evaluadas: 31, dentro: 25, fueraLento: 4, fueraRapido: 2 },
  cansado: [
    { semana: '21 jul', costeSkm: 15.5, parejas: 4 },
    { semana: '28 jul', costeSkm: 14.1, parejas: 5 },
    { semana: '4 ago', costeSkm: 13.6, parejas: 4 },
    { semana: '11 ago', costeSkm: 12.9, parejas: 5 },
  ],
  // Tiene carrera pero será su primera: no hay de dónde proyectar, y no se inventa.
  carrera: { nombre: 'HYROX Valencia', dias: 58, predichoS: null },
  mismoTipo: null,
};

export const ESCENAS: Record<string, Historia> = {
  veterano: VETERANO,
  nuevo: NUEVO,
  cargando: CARGANDO,
  'sin-zonas': SIN_ZONAS,
};
