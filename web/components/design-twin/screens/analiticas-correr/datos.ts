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
//
// `semana` es el lunes ISO (`YYYY-MM-DD`) de cada punto — es lo que manda el
// servidor (`RunningHistory` en `shared/domain/running/progress.ts`), no una
// etiqueta bonita. Las ocho semanas de esta maqueta van del 22-jun al 10-ago
// de 2026; sólo `graficos.tsx` las toca, y únicamente como `key` de React.

import { METODO, type Pedido, type RunningHistory } from './modelo';

/** Lo pedido, con sus dos cifras derivadas igual que las deriva el servidor
 *  (`summarizeRunCompliance` + `sePuedeJuzgarElPedido`): así el doble no puede
 *  enseñar un porcentaje que la app calcularía distinto. */
const pedido = (evaluadas: number, dentro: number, fuera_lento: number, fuera_rapido: number): Pedido => ({
  evaluadas,
  dentro,
  fuera_lento,
  fuera_rapido,
  pct_en_banda: evaluadas > 0 ? Math.round((dentro / evaluadas) * 100) : null,
  juzgable: evaluadas >= METODO.min_reps_to_judge_band,
});

const SEMANAS = [
  '2026-06-22',
  '2026-06-29',
  '2026-07-06',
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
];
const DISTANCIAS = [400, 800, 1000, 1600, 3000, 5000, 10000];

const curva = (segundos: number[]) => DISTANCIAS.map((metros, i) => ({ metros, segundos: segundos[i]! }));
const serie = (vals: number[]) => vals.map((valor, i) => ({ semana: SEMANAS[SEMANAS.length - vals.length + i]!, valor }));

// ---------------------------------------------------------------------------
// ① El veterano que mejora — siete meses dentro
// ---------------------------------------------------------------------------

const VETERANO: RunningHistory = {
  semanas: 28,
  zonas_medidas: true,
  con_pulso: true,
  ppm_referencia: 158,
  zona_referencia: 2,
  vo2: { valor: 52, delta: 3, ventana_semanas: 8, serie: [49, 49, 50, 50, 51, 51, 52, 52] },
  // 5:14 → 5:03 al mismo pulso. Once segundos por km, que a este nivel es mucho.
  al_pulso: serie([314, 312, 309, 310, 306, 305, 302, 303]),
  esfuerzos: curva([70, 152, 196, 330, 660, 1152, 2445]),
  esfuerzos_antes: curva([72, 157, 202, 341, 684, 1194, 2532]),
  semanas_km: serie([32, 35, 34, 38, 40, 37, 42, 44]),
  zonas_s: { z1: 6000, z2: 31000, z3: 3000, z4: 5200, z5: 1800 },
  segundos_corriendo: 48600,
  pedido: pedido(46, 39, 5, 2),
  cansado: [
    { semana: '2026-07-13', coste_s_km: 14.2, parejas: 5 },
    { semana: '2026-07-20', coste_s_km: 13.0, parejas: 6 },
    { semana: '2026-07-27', coste_s_km: 11.5, parejas: 5 },
    { semana: '2026-08-03', coste_s_km: 10.8, parejas: 7 },
    { semana: '2026-08-10', coste_s_km: 9.4, parejas: 6 },
  ],
  carrera: { nombre: 'HYROX Barcelona', dias: 34, predicho_s: 4830 },
  mismo_tipo: null,
  // Las cuatro que vuelven de la pestaña anterior. El doble aún no las
  // dibuja: se declaran vacías para no fingir un dato que no tiene.
  umbral: null,
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [],
};

// ---------------------------------------------------------------------------
// ② El recién llegado — tres semanas, y hay que tener el valor de decirlo
// ---------------------------------------------------------------------------

const NUEVO: RunningHistory = {
  semanas: 3,
  // Hizo el test al darse de alta: el ancla existe. Lo que no existe es TIEMPO.
  zonas_medidas: true,
  con_pulso: true,
  ppm_referencia: 152,
  zona_referencia: 2,
  // Tres semanas no mueven un VO₂máx: hay número, no hay delta que dibujar.
  vo2: { valor: 44, delta: null, ventana_semanas: 3, serie: [44, 44, 44] },
  al_pulso: serie([336, 333]),
  esfuerzos: [
    { metros: 400, segundos: 84 },
    { metros: 1000, segundos: 232 },
    { metros: 3000, segundos: 780 },
    { metros: 5000, segundos: 1380 },
  ],
  esfuerzos_antes: [],
  semanas_km: serie([12, 18, 21]),
  zonas_s: { z1: 2400, z2: 6100, z3: 1900, z4: 900 },
  segundos_corriendo: 11800,
  pedido: pedido(8, 6, 0, 2),
  cansado: [],
  carrera: null,
  mismo_tipo: null,
  // Las cuatro que vuelven de la pestaña anterior. El doble aún no las
  // dibuja: se declaran vacías para no fingir un dato que no tiene.
  umbral: null,
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [],
};

// ---------------------------------------------------------------------------
// ③ El que carga de más — y la evidencia lo explica sin decirlo
// ---------------------------------------------------------------------------

const CARGANDO: RunningHistory = {
  semanas: 14,
  zonas_medidas: true,
  con_pulso: true,
  ppm_referencia: 156,
  zona_referencia: 2,
  vo2: { valor: 48, delta: -2, ventana_semanas: 8, serie: [50, 50, 50, 49, 49, 49, 48, 48] },
  // 4:58 → 5:09 al mismo pulso: once segundos por km PEOR.
  al_pulso: serie([298, 299, 301, 300, 304, 306, 307, 309]),
  esfuerzos: curva([71, 155, 200, 338, 678, 1188, 2520]),
  esfuerzos_antes: curva([70, 153, 197, 332, 666, 1164, 2478]),
  semanas_km: serie([33, 32, 34, 33, 37, 40, 42, 43]),
  // La causa, y se ve a simple vista: casi un tercio del tiempo en Z3. El error
  // clásico del amateur — correr todo a ritmo medio, ni suave ni fuerte.
  zonas_s: { z1: 3000, z2: 20000, z3: 14000, z4: 8000, z5: 1500 },
  segundos_corriendo: 47800,
  pedido: pedido(38, 22, 3, 13),
  cansado: [
    { semana: '2026-07-20', coste_s_km: 11.0, parejas: 5 },
    { semana: '2026-07-27', coste_s_km: 11.8, parejas: 4 },
    { semana: '2026-08-03', coste_s_km: 12.4, parejas: 6 },
    { semana: '2026-08-10', coste_s_km: 13.1, parejas: 5 },
  ],
  carrera: { nombre: 'HYROX Madrid', dias: 21, predicho_s: 5100 },
  mismo_tipo: null,
  // Las cuatro que vuelven de la pestaña anterior. El doble aún no las
  // dibuja: se declaran vacías para no fingir un dato que no tiene.
  umbral: null,
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [],
};

// ---------------------------------------------------------------------------
// ④ Sin zonas medidas — dos lecturas caen por la MISMA razón
// ---------------------------------------------------------------------------

const SIN_ZONAS: RunningHistory = {
  semanas: 11,
  zonas_medidas: false,
  con_pulso: true,
  ppm_referencia: 0,
  zona_referencia: null,
  // Sin reloj que lo estime tampoco hay VO₂máx: el titular de forma cae entero
  // y el bloque se apaga. Que se vea el hueco es el objetivo.
  vo2: null,
  al_pulso: [],
  // El veredicto baja al segundo peldaño y sale igual de defendible: los
  // mejores esfuerzos no necesitan zonas, solo un cronómetro y memoria.
  esfuerzos: curva([73, 158, 204, 344, 690, 1206, 2556]),
  esfuerzos_antes: curva([74, 161, 208, 351, 704, 1238, 2620]),
  semanas_km: serie([26, 28, 27, 30, 31, 29, 33, 34]),
  zonas_s: {},
  segundos_corriendo: 41200,
  // Las bandas de ritmo SÍ funcionan sin zonas: se miden en s/km, no en pulso.
  pedido: pedido(31, 25, 4, 2),
  cansado: [
    { semana: '2026-07-20', coste_s_km: 15.5, parejas: 4 },
    { semana: '2026-07-27', coste_s_km: 14.1, parejas: 5 },
    { semana: '2026-08-03', coste_s_km: 13.6, parejas: 4 },
    { semana: '2026-08-10', coste_s_km: 12.9, parejas: 5 },
  ],
  // Tiene carrera pero será su primera: no hay de dónde proyectar, y no se inventa.
  carrera: { nombre: 'HYROX Valencia', dias: 58, predicho_s: null },
  mismo_tipo: null,
  // Las cuatro que vuelven de la pestaña anterior. El doble aún no las
  // dibuja: se declaran vacías para no fingir un dato que no tiene.
  umbral: null,
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [],
};

export const ESCENAS: Record<string, RunningHistory> = {
  veterano: VETERANO,
  nuevo: NUEVO,
  cargando: CARGANDO,
  'sin-zonas': SIN_ZONAS,
};
