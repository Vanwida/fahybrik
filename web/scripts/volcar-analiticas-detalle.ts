/**
 * volcar-analiticas-detalle.ts — los detalles por familia de las analíticas, tal como los sirve el
 * motor (`progresoAtleta`, el MISMO que llama `cargarDetalleFamilia`), para los tests del iPhone.
 *
 * El JSON de cada fichero es el sobre de `GET /api/athlete/analytics/familia/{familia}?ventana=12s`
 * (`DetalleAnaliticas`): ventana, historia, método, anclas y las lecturas del detalle. Lo único que
 * no es del motor son las ENTRADAS (los tramos, las series y las marcas de cinco atletas de prueba,
 * sintéticas y deterministas): sin base de datos, y sin que una fila real de nadie acabe en un test.
 * Nada del JSON se escribe a mano: si el contrato cambia, se vuelve a volcar.
 *
 *   lleno   un año dentro: correr con umbral medido, remo y ski medidos, fuerza, estaciones y simulaciones
 *   mixto   correr medido, ergo declarado, fuerza sin pulso, tres estaciones y ningún WOD
 *   poco    tres semanas, pulso estimado y nada de ergo
 *   viejo   26 semanas de historia y NADA en la ventana (todo, antes)
 *   vacio   recién dado de alta
 *
 * Run (contexto web: alias `@/`):
 *   cd web && ../infra/node_modules/.bin/tsx --tsconfig ./tsconfig.json scripts/volcar-analiticas-detalle.ts
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  anclasVacias,
  defaultCoachAnalyticsMethod,
  historiaDe,
  progresoAtleta,
  resolverVentana,
  FAMILIAS_DETALLE,
  type AnclaResuelta,
  type AnclasAtleta,
  type EntradaErgo,
  type EntradaProgresoAtleta,
  type Maquina,
  type PuntuacionWod,
  type SerieFuerza,
  type TramoCorrer,
  type TramoErgo,
  type TramoEstacion,
  type VentanaClave,
} from '@fahybrid/shared/domain/analytics';
import { defaultCoachRunningThresholds } from '@fahybrid/shared/domain/coach/running-thresholds';
import { DEFAULT_HR_ZONE_FRACTIONS } from '@fahybrid/shared/domain/methodology/hr-zones';

const HOY = '2026-09-29';
const PRIMERA = '2026-01-05';
const DESTINO = resolve(process.cwd(), '../ios/FAHYBRIKTests/Analytics/Detalle/Fixtures');
const VENTANAS: readonly VentanaClave[] = ['12s'];

// ---------------------------------------------------------------------------
// Utilidades deterministas
// ---------------------------------------------------------------------------

function azar(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MS_DIA = 86_400_000;
const sumar = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * MS_DIA).toISOString().slice(0, 10);
const entre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_DIA);

/** Los lunes de las semanas del atleta, de `desde` a `hasta`, y cuánto de la carrera va (0 al inicio, 1 hoy). */
function semanas(desde: string, hasta: string): Array<{ lunes: string; avance: number }> {
  const total = Math.max(1, entre(desde, hasta));
  const out: Array<{ lunes: string; avance: number }> = [];
  for (let l = desde; l <= hasta; l = sumar(l, 7)) out.push({ lunes: l, avance: entre(desde, l) / total });
  return out;
}

const ancla = (valor: number, tipo: AnclaResuelta['ancla'], fuente: string, explica_es: string, desde_iso: string | null): AnclaResuelta => ({ valor, ancla: tipo, fuente, explica_es, desde_iso });

// ---------------------------------------------------------------------------
// Los cinco atletas
// ---------------------------------------------------------------------------

interface Atleta {
  id: string;
  /** Primer y último día con entreno; null = nada. */
  desde: string | null;
  hasta: string | null;
  anclas: AnclasAtleta;
  /** Qué familias entrena. */
  correr: boolean;
  ergo: Record<Maquina, boolean>;
  fuerza: 'completa' | 'poca' | false;
  estaciones: 'completa' | 'tres' | false;
  wod: boolean;
  /** Una marca de test (5 km) en el periodo. */
  test5k: boolean;
  semanasHistoria: number | null;
}

/** Las anclas de las tres máquinas de ergo (la carrera lleva la suya aparte en `ritmoRun`). */
type AnclasDeErgo = { row: AnclaResuelta | null; ski: AnclaResuelta | null; bike: AnclaResuelta | null };

function anclasDe(p: { pulso?: AnclaResuelta | null; ritmoRun?: AnclaResuelta | null; ritmo?: AnclasDeErgo; potencia?: AnclasDeErgo }): AnclasAtleta {
  const a = anclasVacias();
  a.pulso = p.pulso ?? null;
  a.ritmo.run = p.ritmoRun ?? null;
  a.ritmo.row = p.ritmo?.row ?? null;
  a.ritmo.ski = p.ritmo?.ski ?? null;
  a.ritmo.bike = p.ritmo?.bike ?? null;
  a.potencia.row = p.potencia?.row ?? null;
  a.potencia.ski = p.potencia?.ski ?? null;
  a.potencia.bike = p.potencia?.bike ?? null;
  return a;
}

const ATLETAS: Record<'lleno' | 'mixto' | 'poco' | 'viejo' | 'vacio', Atleta> = {
  lleno: {
    id: '101',
    desde: PRIMERA,
    hasta: '2026-09-28',
    anclas: anclasDe({
      pulso: ancla(170, 'medida', 'perfil_test', 'Test de 30 min · 3 sep', '2026-09-03'),
      ritmoRun: ancla(252, 'medida', 'perfil_test', 'Test de umbral · 3 sep', '2026-09-03'),
      ritmo: { row: ancla(112, 'medida', 'marca_row_2k', '2000 m de remo · 20 sep', '2026-09-20'), ski: ancla(118, 'medida', 'marca_ski_1k', '1000 m de ski · 12 sep', '2026-09-12'), bike: null },
      potencia: { row: ancla(268, 'medida', 'marca_row_2k', '2000 m de remo · 20 sep', '2026-09-20'), ski: ancla(238, 'medida', 'marca_ski_1k', '1000 m de ski · 12 sep', '2026-09-12'), bike: ancla(190, 'declarada', 'declarada_atleta', 'Lo declaraste tú · 2 jul', '2026-07-02') },
    }),
    correr: true,
    ergo: { row: true, ski: true, bike: true },
    fuerza: 'completa',
    estaciones: 'completa',
    wod: true,
    test5k: true,
    semanasHistoria: 38,
  },
  mixto: {
    id: '102',
    desde: PRIMERA,
    hasta: '2026-09-27',
    anclas: anclasDe({
      pulso: ancla(168, 'declarada', 'declarada_atleta', 'Lo declaraste tú · 4 may', '2026-05-04'),
      ritmoRun: ancla(266, 'medida', 'perfil_test', 'Test de umbral · 21 ago', '2026-08-21'),
      ritmo: { row: ancla(122, 'declarada', 'declarada_atleta', 'Lo declaraste tú · 4 may', '2026-05-04'), ski: null, bike: null },
      potencia: { row: ancla(216, 'declarada', 'declarada_atleta', 'Lo declaraste tú · 4 may', '2026-05-04'), ski: null, bike: null },
    }),
    correr: true,
    ergo: { row: true, ski: false, bike: false },
    fuerza: 'completa',
    estaciones: 'tres',
    wod: false,
    test5k: false,
    semanasHistoria: 30,
  },
  poco: {
    id: '103',
    desde: '2026-09-07',
    hasta: '2026-09-28',
    anclas: anclasDe({ pulso: ancla(158, 'estimada', 'from_max_hr', 'Estimado desde tu pulso máximo declarado', null) }),
    correr: true,
    ergo: { row: false, ski: false, bike: false },
    fuerza: 'poca',
    estaciones: false,
    wod: false,
    test5k: false,
    semanasHistoria: 3,
  },
  viejo: {
    id: '104',
    desde: PRIMERA,
    hasta: '2026-06-28',
    anclas: anclasDe({
      pulso: ancla(172, 'medida', 'perfil_test', 'Test de 30 min · 14 may', '2026-05-14'),
      ritmoRun: ancla(258, 'medida', 'perfil_test', 'Test de umbral · 14 may', '2026-05-14'),
      ritmo: { row: ancla(118, 'medida', 'marca_row_2k', '2000 m de remo · 30 jun', '2026-06-30'), ski: null, bike: null },
      potencia: { row: ancla(242, 'medida', 'marca_row_2k', '2000 m de remo · 30 jun', '2026-06-30'), ski: null, bike: null },
    }),
    correr: true,
    ergo: { row: true, ski: false, bike: false },
    fuerza: 'completa',
    estaciones: 'completa',
    wod: true,
    test5k: false,
    semanasHistoria: 26,
  },
  vacio: {
    id: '105',
    desde: null,
    hasta: null,
    anclas: anclasVacias(),
    correr: false,
    ergo: { row: false, ski: false, bike: false },
    fuerza: false,
    estaciones: false,
    wod: false,
    test5k: false,
    semanasHistoria: null,
  },
};

// ---------------------------------------------------------------------------
// Los tramos de cada familia
// ---------------------------------------------------------------------------

let seq = 0;
const sesion = () => `s${++seq}`;

function tramosDeCorrer(a: Atleta, semilla: number): TramoCorrer[] {
  if (!a.desde || !a.hasta || !a.correr) return [];
  const rnd = azar(semilla);
  const out: TramoCorrer[] = [];
  const base = (over: Partial<TramoCorrer> & Pick<TramoCorrer, 'dia' | 'sesion_id'>): TramoCorrer => ({
    segundos: 0, metros: null, ritmo_s_km: null, pulso: null, pendiente_pct: null, contexto: 'calle', trabajo: true, tipo: null, esfuerzo: null, ...over,
  });
  for (const { lunes, avance } of semanas(a.desde, a.hasta)) {
    // Mejora de ~10 s/km a lo largo del periodo, con su ruido.
    const forma = 10 * (1 - avance);
    const suave = 300 + forma + (rnd() - 0.5) * 4;
    // Rodaje en zona 2: el pulso de referencia del Motor (145) con su tolerancia.
    const dia1 = sumar(lunes, 1);
    if (dia1 <= a.hasta) {
      const metros = 8000;
      out.push(base({ dia: dia1, sesion_id: sesion(), metros, segundos: Math.round((suave * metros) / 1000), ritmo_s_km: Math.round(suave), pulso: 144 + Math.round(rnd() * 3), tipo: 'steady', esfuerzo: 'fresco' }));
    }
    // Series de 1000 m con su recuperación.
    const dia2 = sumar(lunes, 3);
    if (dia2 <= a.hasta) {
      const s = sesion();
      const ritmo = 232 + forma * 0.6 + (rnd() - 0.5) * 3;
      for (let i = 0; i < 5; i++) {
        out.push(base({ dia: dia2, sesion_id: s, metros: 1000, segundos: Math.round(ritmo), ritmo_s_km: Math.round(ritmo), pulso: 163, tipo: 'intervals', esfuerzo: 'fresco' }));
        out.push(base({ dia: dia2, sesion_id: s, metros: 200, segundos: 90, ritmo_s_km: 450, pulso: 140, tipo: 'intervals', trabajo: false }));
      }
    }
    // Tirada larga el domingo, cada dos semanas.
    const dia3 = sumar(lunes, 6);
    if (dia3 <= a.hasta && Math.round(avance * 100) % 2 === 0) {
      const metros = 14000;
      const ritmo = suave + 22;
      out.push(base({ dia: dia3, sesion_id: sesion(), metros, segundos: Math.round((ritmo * metros) / 1000), ritmo_s_km: Math.round(ritmo), pulso: 148, tipo: 'steady', esfuerzo: 'fresco' }));
    }
    // Esfuerzos máximos a distintos largos (la curva de mejores y la velocidad crítica): 400 m de progresivos
    // cada tres semanas, la milla cada seis, los 3 km cada ocho y una carrera de 10 km al mes.
    const dia4 = sumar(lunes, 2);
    const n = Math.round(avance * 100);
    const maximo = (metros: number, sKm: number, tipo: string) =>
      out.push(base({ dia: dia4, sesion_id: sesion(), metros, segundos: Math.round((sKm * metros) / 1000), ritmo_s_km: Math.round(sKm), pulso: 172, tipo, esfuerzo: 'fresco' }));
    if (dia4 <= a.hasta && a.correr) {
      if (n % 3 === 0) maximo(400, 200 + forma * 0.5, 'intervals');
      if (n % 6 === 0) maximo(1609, 228 + forma * 0.7, 'for_time');
      if (n % 4 === 0) maximo(3000, 240 + forma * 0.8, 'for_time');
      if (n % 12 === 0) maximo(10000, 262 + forma * 0.9, 'steady');
    }
  }
  return out;
}

/** Un desacople por tirada larga: el pulso se despega del ritmo un poco menos al ir a más. */
function desacoplesDe(a: Atleta, semilla: number): Array<{ dia: string; pct: number }> {
  if (!a.desde || !a.hasta || !a.correr) return [];
  const rnd = azar(semilla + 3);
  return semanas(a.desde, a.hasta)
    .filter(({ lunes }) => sumar(lunes, 6) <= a.hasta!)
    .map(({ lunes, avance }) => ({ dia: sumar(lunes, 6), pct: Math.round((6.4 - 2.4 * avance + (rnd() - 0.5)) * 10) / 10 }));
}

function tramosDeErgo(a: Atleta, m: Maquina, semilla: number): TramoErgo[] {
  if (!a.desde || !a.hasta || !a.ergo[m]) return [];
  const rnd = azar(semilla);
  const out: TramoErgo[] = [];
  const split = m === 'row' ? 112 : m === 'ski' ? 118 : 124;
  for (const { lunes, avance } of semanas(a.desde, a.hasta)) {
    const dia = sumar(lunes, m === 'row' ? 2 : 4);
    if (dia > a.hasta || (m !== 'row' && Math.round(avance * 100) % 3 !== 0)) continue;
    const mejora = 1 + 0.03 * (1 - avance);
    const s500 = split * mejora + (rnd() - 0.5) * 1.2;
    const s = sesion();
    // 4 × 500 m (parciales de un mismo intervalo del monitor) y una pieza de 2000 m cada tres semanas.
    for (let i = 0; i < 4; i++) {
      const seg = Math.round(s500 * 0.96);
      out.push({ dia, sesion_id: s, maquina: m, segundos: seg, metros: 500, ritmo_s_500m: Math.round((seg / 500) * 500 * 10) / 10, vatios: null, pulso: 150 + i, cadencia: m === 'ski' ? 42 : 30, trabajo: true, parciales: [] });
    }
    if (Math.round(avance * 100) % 3 === 0) {
      const seg = Math.round(s500 * 4);
      out.push({ dia, sesion_id: sesion(), maquina: m, segundos: seg, metros: 2000, ritmo_s_500m: Math.round(s500 * 10) / 10, vatios: null, pulso: 152, cadencia: m === 'ski' ? 42 : 30, trabajo: true, parciales: [{ segundos: Math.round(s500 * 2), metros: 1000 }] });
    }
    // Un rodaje largo con pulso en la referencia, para los vatios al mismo pulso.
    out.push({ dia: sumar(dia, 1), sesion_id: sesion(), maquina: m, segundos: 1500, metros: Math.round(1500 / (s500 * 1.18) * 500), ritmo_s_500m: Math.round(s500 * 1.18 * 10) / 10, vatios: null, pulso: 145, cadencia: m === 'ski' ? 38 : 24, trabajo: true, parciales: [] });
  }
  return out;
}

const EJERCICIOS: Array<{ id: string; nombre: string; patron: string; rm: number; reps: number }> = [
  { id: 'sq', nombre: 'Sentadilla', patron: 'squat', rm: 132, reps: 5 },
  { id: 'dl', nombre: 'Peso muerto', patron: 'hinge', rm: 158, reps: 3 },
  { id: 'bp', nombre: 'Press banca', patron: 'horizontal_push', rm: 92, reps: 5 },
  { id: 'op', nombre: 'Press militar', patron: 'vertical_push', rm: 60, reps: 8 },
  { id: 'rb', nombre: 'Remo con barra', patron: 'horizontal_pull', rm: 82, reps: 8 },
];

function seriesDeFuerza(a: Atleta, semilla: number): SerieFuerza[] {
  if (!a.desde || !a.hasta || !a.fuerza) return [];
  const rnd = azar(semilla);
  const out: SerieFuerza[] = [];
  const lista = a.fuerza === 'poca' ? EJERCICIOS.filter((e) => e.id === 'sq' || e.id === 'bp') : EJERCICIOS;
  for (const { lunes, avance } of semanas(a.desde, a.hasta)) {
    lista.forEach((e, i) => {
      const dia = sumar(lunes, i % 2 === 0 ? 0 : 4);
      if (dia > a.hasta!) return;
      const s = sesion();
      const rm = e.rm * (0.93 + 0.07 * avance);
      const kg = Math.round((rm / (1 + e.reps / 30)) * 0.9 * 2) / 2;
      for (let k = 0; k < 4; k++) out.push({ dia, sesion_id: s, ejercicio_id: e.id, ejercicio: e.nombre, patron: e.patron, peso_corporal: false, reps: e.reps, kg: kg + (k === 3 && rnd() > 0.5 ? 2.5 : 0), estado: 'done' });
    });
    // Acarreo del granjero: series sin kilos apuntados, a peso corporal no; cuenta en el volumen del patrón.
    if (a.fuerza === 'completa') out.push({ dia: sumar(lunes, 5), sesion_id: sesion(), ejercicio_id: 'fc', ejercicio: 'Paseo del granjero', patron: 'carry', peso_corporal: false, reps: 1, kg: null, estado: 'done' });
  }
  return out;
}

const ESTACIONES_HYROX: Array<{ slug: string; nombre: string; metros: number | null; reps: number | null; kg: number | null; base: number }> = [
  { slug: 'sled_push', nombre: 'Sled push', metros: 50, reps: null, kg: 152, base: 184 },
  { slug: 'sled_pull', nombre: 'Sled pull', metros: 50, reps: null, kg: 103, base: 226 },
  { slug: 'burpee_broad_jump', nombre: 'Burpee broad jump', metros: 80, reps: null, kg: null, base: 262 },
  { slug: 'farmers_carry', nombre: 'Farmers carry', metros: 200, reps: null, kg: 48, base: 118 },
  { slug: 'sandbag_lunges', nombre: 'Sandbag lunges', metros: 100, reps: null, kg: 20, base: 258 },
  { slug: 'wall_balls', nombre: 'Wall balls', metros: null, reps: 100, kg: 6, base: 318 },
];

function tramosDeEstaciones(a: Atleta, semilla: number): TramoEstacion[] {
  if (!a.desde || !a.hasta || !a.estaciones) return [];
  const rnd = azar(semilla);
  const out: TramoEstacion[] = [];
  const lista = a.estaciones === 'tres' ? ESTACIONES_HYROX.slice(0, 3) : ESTACIONES_HYROX;
  for (const { lunes, avance } of semanas(a.desde, a.hasta)) {
    if (Math.round(avance * 100) % 2 !== 0) continue;
    const s = sesion();
    const dia = sumar(lunes, 5);
    if (dia > a.hasta) continue;
    lista.forEach((e) => {
      const seg = Math.round(e.base * (1.05 - 0.05 * avance) * (0.985 + rnd() * 0.03));
      out.push({ dia, sesion_id: s, slug: e.slug, nombre: e.nombre, segundos: seg, metros: e.metros, reps: e.reps, kg: e.kg, formato: 'for_time', trabajo: true });
    });
  }
  return out;
}

function puntuacionesDeWod(a: Atleta, semilla: number): PuntuacionWod[] {
  if (!a.desde || !a.hasta || !a.wod) return [];
  const rnd = azar(semilla);
  const out: PuntuacionWod[] = [];
  for (const { lunes, avance } of semanas(a.desde, a.hasta)) {
    const dia = sumar(lunes, 5);
    if (dia > a.hasta) continue;
    // La simulación completa cada cuatro semanas, bajando de 1:21 a 1:14.
    if (Math.round(avance * 100) % 4 === 0) out.push({ dia, sesion_id: sesion(), wod_id: 'sim', nombre: 'Simulación HYROX completa', formato: 'hyrox_sim', tiempo_s: Math.round(4860 - 420 * avance + (rnd() - 0.5) * 30), rondas: null, reps: null, reps_por_ronda: null });
    // El AMRAP del coach cada tres semanas, en rondas + reps.
    if (Math.round(avance * 100) % 3 === 0) out.push({ dia: sumar(dia, 1), sesion_id: sesion(), wod_id: 'amrap', nombre: 'AMRAP 12′ del coach', formato: 'amrap', tiempo_s: null, rondas: 9 + Math.round(avance * 3), reps: Math.round(rnd() * 8), reps_por_ronda: 24 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// El sobre de cada detalle
// ---------------------------------------------------------------------------

function entradaDe(a: Atleta, ventana: VentanaClave, semilla: number): { entrada: EntradaProgresoAtleta; ventana: ReturnType<typeof resolverVentana> } {
  const v = resolverVentana({ clave: ventana, hoy_local: HOY, primera_sesion_iso: a.desde });
  const metodo = defaultCoachAnalyticsMethod();
  const umbrales = defaultCoachRunningThresholds();
  const sin_historia = a.desde == null;
  const comun = { ventana: v, anclas: a.anclas, fracciones_hr: DEFAULT_HR_ZONE_FRACTIONS, umbrales, metodo, sin_historia };
  const ergo = (m: Maquina): EntradaErgo => ({ ...comun, maquina: m, tramos: tramosDeErgo(a, m, semilla + m.length), marcas: [] });
  const marcas =
    a.test5k && a.hasta
      ? [
          { dia: '2026-06-14', slug: 'run_5k', segundos: 1290, contexto: 'calle' as const, fuente: 'test' as const },
          { dia: '2026-09-12', slug: 'run_5k', segundos: 1260, contexto: 'calle' as const, fuente: 'test' as const },
        ]
      : [];
  const entrada: EntradaProgresoAtleta = {
    ventana: v,
    correr: { ...comun, tramos: tramosDeCorrer(a, semilla), trazas: [], marcas, desacoples: desacoplesDe(a, semilla), semanas_historia: a.semanasHistoria },
    ergo: { row: ergo('row'), ski: ergo('ski'), bike: ergo('bike') },
    fuerza: { ventana: v, series: seriesDeFuerza(a, semilla + 7), formula: 'Epley', metodo, sin_historia },
    estaciones: { ventana: v, tramos: tramosDeEstaciones(a, semilla + 9), puntuaciones: puntuacionesDeWod(a, semilla + 11), metodo, sin_historia },
    tests: { ventana: v, metodo, resultados: [] },
  };
  return { entrada, ventana: v };
}

function volcar(): void {
  mkdirSync(DESTINO, { recursive: true });
  const escritos = new Set<string>();
  const generado_iso = `${HOY}T08:00:00.000Z`;
  for (const [nombre, a] of Object.entries(ATLETAS)) {
    for (const clave of VENTANAS) {
      const { entrada, ventana } = entradaDe(a, clave, a.id.length * 1000 + Number(a.id));
      const p = progresoAtleta(entrada);
      const dias = a.desde == null ? null : entre(a.desde, HOY) + 1;
      for (const familia of FAMILIAS_DETALLE) {
        const sobre = {
          athlete_id: a.id,
          generado_iso,
          ventana,
          historia: historiaDe({ dias_de_historia: dias, primera_sesion_iso: a.desde, ventana_dias: ventana.dias }),
          metodo: defaultCoachAnalyticsMethod(),
          anclas: a.anclas,
          familia,
          lecturas: p.detalles[familia],
        };
        const fichero = `detalle-${familia}-${nombre}-${clave}.json`;
        writeFileSync(join(DESTINO, fichero), `${JSON.stringify(sobre, null, 1)}\n`);
        escritos.add(fichero);
      }
    }
  }
  // Un fichero que ya no corresponde a ningún caso se borra: nada obsoleto que despiste.
  for (const previo of readdirSync(DESTINO)) {
    if (previo.startsWith('detalle-') && previo.endsWith('.json') && !escritos.has(previo)) rmSync(join(DESTINO, previo));
  }
  process.stdout.write(`${escritos.size} ficheros en ${DESTINO}\n`);
}

volcar();
