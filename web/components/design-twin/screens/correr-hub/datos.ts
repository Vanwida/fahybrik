// LOS TRES ATLETAS DEL HUB.
//
// El hub reutiliza EXACTAMENTE el modelo de `analiticas-correr`
// (`RunningHistory`, y con él `veredictoDe`/`coberturaDe`/`salidaDe`): es la
// misma pantalla en otra composición, así que no puede tener un motor
// distinto para la misma pregunta. Lo único que este hub añade son dos cosas
// que la tira nunca necesitó porque nunca navegaba a ningún sitio — un
// agregado del mes (para la puerta «Este mes») y una lista de sesiones
// sueltas (para «Tus carreras»), que es justo lo que las vistas NIVEL 1
// (Tendencias, Historial) van a servir el día que existan.
//
// SOLO TRES ESCENARIOS, no los cuatro de la tira: el hub no necesita
// «sin zonas» porque ninguna de sus nueve puertas lo pide explícitamente, y
// la regla del §6.2bis (encargo, 13-ago) ya se prueba con el «nuevo» — sus
// puertas de Forma y Capacidad se apagan por la MISMA razón, «historia», y
// las dos se callan.

import type { RunningHistory } from '../analiticas-correr/modelo';

export interface SesionReciente {
  /** ISO `YYYY-MM-DD`. */
  fecha: string;
  tipo: string;
  km: number;
  ritmo_s_km: number;
  fc_media: number | null;
}

export interface MesActual {
  km: number;
  segundos: number;
  desnivel_m: number;
  salidas: number;
}

export interface HubRunningData extends RunningHistory {
  mes: MesActual;
  recientes: SesionReciente[];
}

const semana = (vals: number[], desde: string[]) => vals.map((valor, i) => ({ semana: desde[i]!, valor }));

// ---------------------------------------------------------------------------
// ① El veterano que mejora — siete meses dentro, veredicto verde
// ---------------------------------------------------------------------------

const SEMANAS_8: string[] = ['2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-10'];

const VETERANO: HubRunningData = {
  semanas: 30,
  zonas_medidas: true,
  con_pulso: true,
  ppm_referencia: 156,
  zona_referencia: 2,
  vo2: { valor: 53, delta: 2, ventana_semanas: 8, serie: [51, 51, 52, 52, 52, 53, 53, 53] },
  al_pulso: semana([322, 320, 317, 316, 314, 312, 310, 309], SEMANAS_8),
  esfuerzos: [
    { metros: 400, segundos: 76 },
    { metros: 800, segundos: 166 },
    { metros: 1000, segundos: 216 },
    { metros: 1600, segundos: 368 },
    { metros: 3000, segundos: 732 },
    { metros: 5000, segundos: 1278 },
    { metros: 10000, segundos: 2688 },
  ],
  esfuerzos_antes: [
    { metros: 400, segundos: 78 },
    { metros: 800, segundos: 171 },
    { metros: 1000, segundos: 222 },
    { metros: 1600, segundos: 378 },
    { metros: 3000, segundos: 753 },
    { metros: 5000, segundos: 1314 },
    { metros: 10000, segundos: 2760 },
  ],
  semanas_km: semana([36, 39, 38, 43, 45, 42, 48, 51], SEMANAS_8),
  zonas_s: { z1: 5200, z2: 33000, z3: 3200, z4: 5600, z5: 1900 },
  segundos_corriendo: 52400,
  pedido: { evaluadas: 42, dentro: 35, fuera_lento: 4, fuera_rapido: 3, pct_en_banda: 83, juzgable: true },
  cansado: [
    { semana: '2026-07-06', coste_s_km: 13.4, parejas: 5 },
    { semana: '2026-07-13', coste_s_km: 12.2, parejas: 6 },
    { semana: '2026-07-20', coste_s_km: 11.3, parejas: 5 },
    { semana: '2026-07-27', coste_s_km: 10.4, parejas: 6 },
    { semana: '2026-08-03', coste_s_km: 9.2, parejas: 7 },
  ],
  carrera: { nombre: 'HYROX Málaga', dias: 27, predicho_s: 4380 },
  mismo_tipo: null,
  umbral: { ritmo_s_km: 258, vdot: 50, vdot_desde: '10 km · 20 jul', origen: 'coach_test', sin_revisar: false },
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [
    { tipo: 'Rodajes', ritmo_s_km: 314, metros: 224000, sesiones: 18 },
    { tipo: 'Series', ritmo_s_km: 256, metros: 52000, sesiones: 12 },
    { tipo: 'Largos', ritmo_s_km: 302, metros: 98000, sesiones: 6 },
    { tipo: 'Tempo', ritmo_s_km: 274, metros: 30000, sesiones: 5 },
    { tipo: 'Fartlek', ritmo_s_km: 292, metros: 16000, sesiones: 3 },
  ],
  mes: { km: 92, segundos: 29100, desnivel_m: 340, salidas: 12 },
  recientes: [
    { fecha: '2026-08-11', tipo: 'Series', km: 9.2, ritmo_s_km: 250, fc_media: 167 },
    { fecha: '2026-08-09', tipo: 'Largo', km: 18.4, ritmo_s_km: 298, fc_media: 151 },
    { fecha: '2026-08-07', tipo: 'Rodaje', km: 8.0, ritmo_s_km: 312, fc_media: 142 },
  ],
};

// ---------------------------------------------------------------------------
// ② El recién llegado — tres semanas. «Aún no» con plazo, y dos puertas
// silenciadas por la MISMA razón que el veredicto: falta TIEMPO, no un test.
// ---------------------------------------------------------------------------

const SEMANAS_3: string[] = ['2026-07-27', '2026-08-03', '2026-08-10'];

const NUEVO: HubRunningData = {
  semanas: 3,
  // El ancla de PULSO existe (test al alta, como en `analiticas-correr`).
  zonas_medidas: true,
  con_pulso: true,
  ppm_referencia: 150,
  zona_referencia: 2,
  // Dos puntos no bastan para un VO₂máx con base.
  vo2: null,
  al_pulso: semana([352, 346], SEMANAS_3.slice(1)),
  esfuerzos: [
    { metros: 400, segundos: 88 },
    { metros: 1000, segundos: 246 },
    { metros: 3000, segundos: 882 },
  ],
  esfuerzos_antes: [],
  semanas_km: semana([9, 14, 17], SEMANAS_3),
  zonas_s: { z1: 900, z2: 2600, z3: 700 },
  segundos_corriendo: 7200,
  // 8 evaluadas < min_reps_to_judge_band (15): se enseña, no se juzga.
  pedido: { evaluadas: 8, dentro: 6, fuera_lento: 0, fuera_rapido: 2, pct_en_banda: 75, juzgable: false },
  // Nunca ha corrido cansado todavía: 'ocasion', se calla sola.
  cansado: [],
  carrera: null,
  mismo_tipo: null,
  // El ancla de RITMO es OTRO test — derivado en el alta de una marca
  // reciente, real pero sin confirmar (`sin_revisar`). Que exista no cambia
  // nada: Capacidad se apaga por FALTA DE TIEMPO (3 semanas), no por ancla.
  umbral: { ritmo_s_km: 280, vdot: 38, vdot_desde: '3 km · en el alta', origen: 'onboarding_auto', sin_revisar: true },
  zonas_ritmo: [],
  cadencia: [],
  // Con 9 sesiones ya se puede contar por tipo — no hace falta una tendencia
  // para eso, así que esta puerta SÍ se enseña.
  por_tipo: [
    { tipo: 'Rodajes', ritmo_s_km: 355, metros: 32000, sesiones: 7 },
    { tipo: 'Series', ritmo_s_km: 298, metros: 8400, sesiones: 2 },
  ],
  mes: { km: 23, segundos: 10200, desnivel_m: 55, salidas: 5 },
  recientes: [
    { fecha: '2026-08-11', tipo: 'Rodaje', km: 5.0, ritmo_s_km: 352, fc_media: 158 },
    { fecha: '2026-08-09', tipo: 'Series', km: 4.2, ritmo_s_km: 298, fc_media: 172 },
    { fecha: '2026-08-06', tipo: 'Rodaje', km: 4.5, ritmo_s_km: 358, fc_media: 155 },
  ],
};

// ---------------------------------------------------------------------------
// ③ Recién dado de alta — cero carreras. El hub entero degrada a Vacío
// (§6.2: «una Lista sin elementos ES un Vacío»), así que casi nada de esto
// se lee: solo hace falta que el tipo no mienta si algo lo toca.
// ---------------------------------------------------------------------------

const VACIO: HubRunningData = {
  semanas: 0,
  zonas_medidas: false,
  con_pulso: false,
  ppm_referencia: 0,
  zona_referencia: null,
  vo2: null,
  al_pulso: [],
  esfuerzos: [],
  esfuerzos_antes: [],
  semanas_km: [],
  zonas_s: {},
  segundos_corriendo: 0,
  pedido: null,
  cansado: [],
  carrera: null,
  mismo_tipo: null,
  umbral: null,
  zonas_ritmo: [],
  cadencia: [],
  por_tipo: [],
  mes: { km: 0, segundos: 0, desnivel_m: 0, salidas: 0 },
  recientes: [],
};

export const ESCENAS: Record<string, HubRunningData> = {
  veterano: VETERANO,
  nuevo: NUEVO,
  vacio: VACIO,
};
