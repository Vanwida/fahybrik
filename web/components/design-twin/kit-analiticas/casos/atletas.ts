// LOS ATLETAS DE EJEMPLO — cinco casos que llevan cada bloque por sus cuatro
// estados (A10), construidos con la forma del contrato (§5) y NUNCA desde la
// base de producción. Forma, fatiga y frescura salen del Banister de shared
// sobre la carga diaria generada; la proyección, de la carga planificada
// hasta la carrera (A7); el estado, de las bandas del coach.
//
//   lleno   Marta · un año dentro, umbral medido, reloj, carrera en 39 días
//   poco    Jordi · tres semanas, umbral estimado, sin carrera, reloj reciente
//   vacio   recién dado de alta: nada de nada
//   viejo   Lucía · parada 23 días, reloj sin sincronizar 19
//   mixto   Pau · correr medido, ergo declarado, fuerza por esfuerzo, sin
//           reloj, pocas estaciones, ningún WOD — el caso real (§7)
//
// Cada panel se construye por VENTANA: cambiar el selector recalcula todo
// sobre la misma historia, como hará el servidor.

import { FAMILIA_GRANDE, FAMILIA_NOMBRE, FAMILIAS, FAMILIAS_GRANDES, TRAMOS_CARRERA, TRAMO_CARRERA_NOMBRE, medida, serie, sinDato, type Ancla, type Cumplimiento, type Familia, type FamiliaGrande, type LecturaPanel, type PanelAnaliticas, type PrevisionCarrera, type PrevisionTramo, type ProcedenciaPanel, type RangoVentana, type RecordPanel, type SesionResumen, type Ventana } from '../contrato';
import { comparar, cumplimientoDe, diasEntre, estadoFrescuraDe, marcarNuevos, proyectar, rangoDe, subidaSemana, sumarDias, veredictoForma } from '../mecanismo';
import { METODO_DEFECTO, REPARTO_CARRERA_DEFECTO, palabraDisposicion, unaRmEstimada, type MetodoAnaliticas } from '../metodo';
import { HOY, PATRON_HIBRIDO, PATRON_TRES_DIAS, agregar, cubosDe, diarioDe, diasHechos, mediaDe, noches, periodizacion31, planFuturo, tendencia, type DiaHecho, type Noche, type PerfilAtleta } from './generador';

export type EscenarioPortada = 'lleno' | 'poco' | 'vacio' | 'viejo' | 'mixto';

export const ESCENARIOS_PORTADA: readonly EscenarioPortada[] = ['lleno', 'poco', 'vacio', 'viejo', 'mixto'];

// ---------------------------------------------------------------------------
// La ficha de cada atleta
// ---------------------------------------------------------------------------

interface Umbral {
  valor: number;
  ancla: Ancla;
  fecha: string;
}

interface Atleta {
  nombre: string;
  perfil: PerfilAtleta | null;
  carrera: { nombre_es: string; fecha: string; objetivo_s: number | null } | null;
  /** Noches disponibles del reloj. */
  reloj: { desde: string; hasta: string; vfc: number; fc: number; sueno: number; deriva: number } | null;
  /** El número clave de cada familia; null = esa familia no existe en su vida. */
  clave: Partial<Record<Familia, Umbral & { desdeValor: number }>>;
  /** Récords conseguidos (con fecha), de todas las familias. */
  records: Array<Omit<RecordPanel, 'nuevo' | 'id'>>;
  /** Base para la previsión por tramo (segundos). */
  tramos: Partial<Record<(typeof TRAMOS_CARRERA)[number], { s: number; ancla: Ancla; de: string }>>;
  /** Las familias que nunca ha hecho (no aplica, se calla con nota). */
  nunca: Familia[];
}

const ANCLA_MEDIDA: Record<FamiliaGrande, Ancla> = { correr: 'medida', ergo: 'medida', fuerza: 'declarada', 'estaciones-wod': 'medida' };

const LLENO: Atleta = {
  nombre: 'Marta',
  // `desde` en lunes tal que la semana de hoy sea la TERCERA de carga (ciclo 2): el caso lleno se enseña cargando bien, no en descarga.
  perfil: { patron: PATRON_HIBRIDO, desde: '2025-10-13', factorSemana: periodizacion31(0.66, 0.0095), ancla: ANCLA_MEDIDA, pulso: true, saltadas: 0.08, semilla: 11 },
  carrera: { nombre_es: 'HYROX Madrid', fecha: '2026-11-07', objetivo_s: 4440 },
  reloj: { desde: '2026-06-01', hasta: HOY, vfc: 58, fc: 51, sueno: 7.3, deriva: 4 },
  clave: {
    correr: { valor: 252, ancla: 'medida', fecha: '2026-09-03', desdeValor: 262 },
    remo: { valor: 108.1, ancla: 'medida', fecha: '2026-08-21', desdeValor: 110.4 },
    ski: { valor: 116.4, ancla: 'medida', fecha: '2026-09-12', desdeValor: 119 },
    bici: { valor: 118.2, ancla: 'declarada', fecha: '2026-07-30', desdeValor: 121 },
    fuerza: { valor: 132, ancla: 'medida', fecha: '2026-09-20', desdeValor: 124 },
    estaciones: { valor: 184, ancla: 'medida', fecha: '2026-09-18', desdeValor: 199 },
    wod: { valor: 4470, ancla: 'medida', fecha: '2026-09-19', desdeValor: 4870 },
  },
  records: [
    { familia: 'correr', prueba_es: '5 km', valor: 1308, unidad: 'segundos', fecha: '2026-09-12', ancla: 'medida', anterior: { valor: 1331, fecha: '2026-06-20' } },
    { familia: 'correr', prueba_es: '1000 m', valor: 218, unidad: 'segundos', fecha: '2026-09-22', ancla: 'medida', anterior: { valor: 222, fecha: '2026-08-05' } },
    { familia: 'correr', prueba_es: '10 km', valor: 2761, unidad: 'segundos', fecha: '2026-05-16', ancla: 'medida', anterior: null },
    { familia: 'remo', prueba_es: '2000 m remo', valor: 432.4, unidad: 'segundos', fecha: '2026-06-21', ancla: 'medida', anterior: { valor: 441.6, fecha: '2026-02-11' } },
    { familia: 'ski', prueba_es: '1000 m SkiErg', valor: 232.8, unidad: 'segundos', fecha: '2026-09-12', ancla: 'medida', anterior: { valor: 238, fecha: '2026-06-02' } },
    { familia: 'fuerza', prueba_es: 'Sentadilla · 1RM est.', valor: 132, unidad: 'kg', fecha: '2026-09-20', ancla: 'medida', anterior: { valor: 127.5, fecha: '2026-06-08' } },
    { familia: 'fuerza', prueba_es: 'Peso muerto · 1RM est.', valor: 165, unidad: 'kg', fecha: '2026-06-30', ancla: 'medida', anterior: { valor: 160, fecha: '2026-03-19' } },
    { familia: 'estaciones', prueba_es: 'Sled push 50 m · 152 kg', valor: 184, unidad: 'segundos', fecha: '2026-09-18', ancla: 'medida', anterior: { valor: 199, fecha: '2026-06-24' } },
    { familia: 'estaciones', prueba_es: 'Wall balls 100', valor: 318, unidad: 'segundos', fecha: '2026-06-14', ancla: 'medida', anterior: null },
    { familia: 'wod', prueba_es: 'Simulación HYROX', valor: 4470, unidad: 'segundos', fecha: '2026-09-19', ancla: 'medida', anterior: { valor: 4870, fecha: '2026-06-27' } },
    { familia: 'wod', prueba_es: 'HYROX Barcelona · oficial', valor: 4713, unidad: 'segundos', fecha: '2026-03-14', ancla: 'medida', anterior: null },
  ],
  tramos: {
    run1: { s: 268, ancla: 'medida', de: 'tu ritmo de series' }, ski: { s: 236, ancla: 'medida', de: 'tu 1000 m de SkiErg (12 sep)' }, run2: { s: 274, ancla: 'medida', de: 'tu ritmo de series' },
    sled_push: { s: 184, ancla: 'medida', de: 'tu sled push (18 sep)' }, run3: { s: 281, ancla: 'medida', de: 'tu ritmo de series' }, sled_pull: { s: 226, ancla: 'estimada', de: 'tu simulación (19 sep)' },
    run4: { s: 286, ancla: 'medida', de: 'tu ritmo de series' }, burpee_broad_jump: { s: 262, ancla: 'medida', de: 'tu simulación (19 sep)' }, run5: { s: 291, ancla: 'medida', de: 'tu ritmo de series' },
    row: { s: 244, ancla: 'medida', de: 'tu 2000 m de remo (21 jun)' }, run6: { s: 296, ancla: 'medida', de: 'tu ritmo de series' }, farmers: { s: 118, ancla: 'medida', de: 'tu simulación (19 sep)' },
    run7: { s: 302, ancla: 'medida', de: 'tu ritmo de series' }, lunges: { s: 258, ancla: 'estimada', de: 'tu simulación (19 sep)' }, run8: { s: 296, ancla: 'medida', de: 'tu ritmo de series' },
    wall_balls: { s: 318, ancla: 'medida', de: 'tus wall balls (14 jun)' }, roxzone: { s: 412, ancla: 'medida', de: 'tu simulación (19 sep)' },
  },
  nunca: [],
};

const POCO: Atleta = {
  nombre: 'Jordi',
  perfil: {
    patron: PATRON_TRES_DIAS,
    desde: '2026-09-08',
    factorSemana: (s) => 0.7 + s * 0.05,
    ancla: { correr: 'estimada', ergo: 'estimada', fuerza: 'declarada', 'estaciones-wod': 'estimada' },
    pulso: true,
    saltadas: 0,
    semilla: 23,
  },
  carrera: null,
  reloj: { desde: '2026-09-17', hasta: HOY, vfc: 64, fc: 56, sueno: 6.9, deriva: 0 },
  clave: {
    correr: { valor: 300, ancla: 'estimada', fecha: '2026-09-10', desdeValor: 300 },
    fuerza: { valor: 88, ancla: 'medida', fecha: '2026-09-21', desdeValor: 85 },
  },
  records: [
    { familia: 'correr', prueba_es: '5 km', valor: 1590, unidad: 'segundos', fecha: '2026-09-26', ancla: 'medida', anterior: null },
    { familia: 'fuerza', prueba_es: 'Sentadilla · 1RM est.', valor: 88, unidad: 'kg', fecha: '2026-09-21', ancla: 'medida', anterior: null },
  ],
  tramos: {},
  // A las tres semanas nada es «nunca»: lo que no ha hecho aún le falta tiempo, no ocasión.
  nunca: [],
};

const VIEJO: Atleta = {
  nombre: 'Lucía',
  perfil: { patron: PATRON_HIBRIDO, desde: '2026-01-12', ultimaSesion: '2026-09-06', factorSemana: periodizacion31(0.7, 0.01), ancla: ANCLA_MEDIDA, pulso: true, saltadas: 0.1, semilla: 37 },
  carrera: { nombre_es: 'HYROX Valencia', fecha: '2026-12-05', objetivo_s: null },
  reloj: { desde: '2026-05-01', hasta: '2026-09-10', vfc: 61, fc: 53, sueno: 7.5, deriva: -2 },
  clave: {
    correr: { valor: 262, ancla: 'medida', fecha: '2026-07-22', desdeValor: 266 },
    remo: { valor: 112.5, ancla: 'medida', fecha: '2026-06-30', desdeValor: 113.8 },
    ski: { valor: 121, ancla: 'medida', fecha: '2026-08-20', desdeValor: 123 },
    bici: { valor: 123, ancla: 'declarada', fecha: '2026-05-14', desdeValor: 124 },
    fuerza: { valor: 118, ancla: 'medida', fecha: '2026-08-28', desdeValor: 112 },
    estaciones: { valor: 210, ancla: 'medida', fecha: '2026-08-14', desdeValor: 221 },
    wod: { valor: 5010, ancla: 'medida', fecha: '2026-08-29', desdeValor: 5220 },
  },
  records: [
    { familia: 'correr', prueba_es: '5 km', valor: 1372, unidad: 'segundos', fecha: '2026-07-22', ancla: 'medida', anterior: { valor: 1401, fecha: '2026-03-02' } },
    { familia: 'remo', prueba_es: '2000 m remo', valor: 450, unidad: 'segundos', fecha: '2026-06-30', ancla: 'medida', anterior: null },
    { familia: 'fuerza', prueba_es: 'Sentadilla · 1RM est.', valor: 118, unidad: 'kg', fecha: '2026-08-28', ancla: 'medida', anterior: { valor: 112, fecha: '2026-04-10' } },
    { familia: 'estaciones', prueba_es: 'Sled push 50 m · 102 kg', valor: 210, unidad: 'segundos', fecha: '2026-08-14', ancla: 'medida', anterior: null },
    { familia: 'wod', prueba_es: 'Simulación HYROX', valor: 5010, unidad: 'segundos', fecha: '2026-08-29', ancla: 'medida', anterior: { valor: 5220, fecha: '2026-05-23' } },
  ],
  tramos: {
    run1: { s: 282, ancla: 'medida', de: 'tu ritmo de series (jul)' }, ski: { s: 245, ancla: 'medida', de: 'tu 1000 m de SkiErg (20 ago)' }, run2: { s: 288, ancla: 'medida', de: 'tu ritmo de series (jul)' },
    sled_push: { s: 210, ancla: 'medida', de: 'tu sled push (14 ago)' }, run3: { s: 295, ancla: 'medida', de: 'tu ritmo de series (jul)' }, sled_pull: { s: 248, ancla: 'estimada', de: 'tu simulación (29 ago)' },
    run4: { s: 301, ancla: 'medida', de: 'tu ritmo de series (jul)' }, burpee_broad_jump: { s: 290, ancla: 'medida', de: 'tu simulación (29 ago)' }, run5: { s: 306, ancla: 'medida', de: 'tu ritmo de series (jul)' },
    row: { s: 254, ancla: 'medida', de: 'tu 2000 m de remo (30 jun)' }, run6: { s: 312, ancla: 'medida', de: 'tu ritmo de series (jul)' }, farmers: { s: 130, ancla: 'medida', de: 'tu simulación (29 ago)' },
    run7: { s: 318, ancla: 'medida', de: 'tu ritmo de series (jul)' }, lunges: { s: 284, ancla: 'estimada', de: 'tu simulación (29 ago)' }, run8: { s: 314, ancla: 'medida', de: 'tu ritmo de series (jul)' },
    wall_balls: { s: 352, ancla: 'medida', de: 'tu simulación (29 ago)' }, roxzone: { s: 470, ancla: 'medida', de: 'tu simulación (29 ago)' },
  },
  nunca: [],
};

const MIXTO: Atleta = {
  nombre: 'Pau',
  perfil: {
    patron: PATRON_HIBRIDO.filter((p) => p.familia !== 'estaciones-wod').concat([{ dia: 5, familia: 'estaciones-wod', tss: 50, segundos: 2400, zonas: [], intensidadPrescrita: false, titulo: 'Estaciones · trineos y farmers' }]),
    desde: '2026-03-02',
    factorSemana: periodizacion31(0.74, 0.01),
    ancla: { correr: 'medida', ergo: 'declarada', fuerza: 'declarada', 'estaciones-wod': 'estimada' },
    pulso: true,
    saltadas: 0.12,
    semilla: 53,
  },
  carrera: { nombre_es: 'HYROX Madrid', fecha: '2026-11-07', objetivo_s: 4800 },
  reloj: null,
  clave: {
    correr: { valor: 266, ancla: 'medida', fecha: '2026-09-05', desdeValor: 274 },
    remo: { valor: 114.2, ancla: 'declarada', fecha: '2026-08-02', desdeValor: 115.5 },
    ski: { valor: 124, ancla: 'declarada', fecha: '2026-08-02', desdeValor: 126 },
    fuerza: { valor: 121, ancla: 'medida', fecha: '2026-09-22', desdeValor: 115 },
    estaciones: { valor: 230, ancla: 'estimada', fecha: '2026-09-25', desdeValor: 238 },
  },
  records: [
    { familia: 'correr', prueba_es: '5 km', valor: 1364, unidad: 'segundos', fecha: '2026-09-05', ancla: 'medida', anterior: { valor: 1395, fecha: '2026-05-30' } },
    { familia: 'correr', prueba_es: '1000 m', valor: 229, unidad: 'segundos', fecha: '2026-09-15', ancla: 'medida', anterior: null },
    { familia: 'remo', prueba_es: '2000 m remo', valor: 456.8, unidad: 'segundos', fecha: '2026-06-02', ancla: 'declarada', anterior: null },
    { familia: 'fuerza', prueba_es: 'Sentadilla · 1RM est.', valor: 121, unidad: 'kg', fecha: '2026-09-22', ancla: 'medida', anterior: { valor: 115, fecha: '2026-06-16' } },
    { familia: 'fuerza', prueba_es: 'Press banca · 1RM', valor: 86, unidad: 'kg', fecha: '2026-06-11', ancla: 'declarada', anterior: null },
    { familia: 'estaciones', prueba_es: 'Sled push 50 m · 102 kg', valor: 230, unidad: 'segundos', fecha: '2026-09-25', ancla: 'estimada', anterior: null },
  ],
  tramos: {
    run1: { s: 286, ancla: 'medida', de: 'tu ritmo de series' }, ski: { s: 252, ancla: 'declarada', de: 'tu SkiErg declarado (2 ago)' }, run2: { s: 292, ancla: 'medida', de: 'tu ritmo de series' },
    sled_push: { s: 230, ancla: 'estimada', de: 'tu sled push (25 sep)' }, run3: { s: 300, ancla: 'medida', de: 'tu ritmo de series' },
    run4: { s: 306, ancla: 'medida', de: 'tu ritmo de series' }, run5: { s: 311, ancla: 'medida', de: 'tu ritmo de series' },
    row: { s: 258, ancla: 'declarada', de: 'tu 2000 m de remo declarado' }, run6: { s: 318, ancla: 'medida', de: 'tu ritmo de series' },
    run7: { s: 324, ancla: 'medida', de: 'tu ritmo de series' }, run8: { s: 320, ancla: 'medida', de: 'tu ritmo de series' },
  },
  nunca: ['bici', 'wod'],
};

const VACIO: Atleta = { nombre: 'Atleta', perfil: null, carrera: null, reloj: null, clave: {}, records: [], tramos: {}, nunca: [] };

const ATLETAS: Record<EscenarioPortada, Atleta> = { lleno: LLENO, poco: POCO, vacio: VACIO, viejo: VIEJO, mixto: MIXTO };

export function nombreDe(escenario: EscenarioPortada): string {
  return ATLETAS[escenario].nombre;
}

// ---------------------------------------------------------------------------
// Memoria de la historia: la carga día a día y las noches se calculan UNA vez
// ---------------------------------------------------------------------------

const memoria = new Map<EscenarioPortada, { dias: DiaHecho[]; noches: Noche[] }>();

function historiaDe(escenario: EscenarioPortada): { dias: DiaHecho[]; noches: Noche[] } {
  let h = memoria.get(escenario);
  if (h) return h;
  const a = ATLETAS[escenario];
  h = {
    dias: a.perfil ? diasHechos(a.perfil) : [],
    noches: a.reloj ? noches({ desde: a.reloj.desde, hasta: a.reloj.hasta, vfcBasal: a.reloj.vfc, fcBasal: a.reloj.fc, suenoBasal: a.reloj.sueno, deriva: a.reloj.deriva, semilla: 7 }) : [],
  };
  memoria.set(escenario, h);
  return h;
}

// ---------------------------------------------------------------------------
// El panel por ventana
// ---------------------------------------------------------------------------

function proc(de: string, explica_es: string, ancla: Ancla, medidaFlag = ancla === 'medida'): ProcedenciaPanel {
  return { de, explica_es, medida: medidaFlag, proveedor: null, ancla };
}

const FALTA_HISTORIA = (llevas: number, hacen: number) => ({ por: 'historia' as const, llevas, hacen });

export function panelDe(escenario: EscenarioPortada, ventana: Ventana, metodo: MetodoAnaliticas = METODO_DEFECTO): PanelAnaliticas {
  const a = ATLETAS[escenario];
  const { dias, noches: nochesTodas } = historiaDe(escenario);
  const primera = a.perfil?.desde ?? null;
  const rango = rangoDe(ventana, HOY, primera);
  const semanasHistoria = primera ? Math.floor((diasEntre(primera, HOY) + 1) / 7) : null;
  const historia = { semanas: semanasHistoria, desde: primera, cubre_todo: rango.cubre_todo };
  const base: PanelAnaliticas = {
    atleta: { nombre: a.nombre, hoy: HOY, carrera: a.carrera ? { nombre_es: a.carrera.nombre_es, fecha: a.carrera.fecha } : null },
    ventana: rango,
    historia,
    estado: { clave: null, palabra_es: null, lecturas: [] },
    forma: { lecturas: [], veredicto: null },
    semanas: { lecturas: [], sesiones: [] },
    intensidad: { lecturas: [], polarizacion: null },
    progreso: [],
    records: [],
    carrera: null,
    recuperacion: [],
  };

  const ultimaSesion = dias.filter((d) => d.hecha).map((d) => d.fecha).reduce<string | null>((m, f) => (m == null || f > m ? f : m), null);
  const enVentana = dias.filter((d) => d.fecha >= rango.desde && d.fecha <= rango.hasta);
  const hechas = enVentana.filter((d) => d.hecha);

  // ── Estado y forma ────────────────────────────────────────────────────────
  if (a.perfil) {
    const diario = diarioDe(dias, a.perfil.desde, HOY, 'hecho');
    const futuro = a.carrera ? diarioDe(planFuturo(a.perfil, sumarDias(HOY, 1), a.carrera.fecha), sumarDias(HOY, 1), a.carrera.fecha, 'plan') : [];
    const proy = proyectar(diario, futuro, metodo);
    const hoy = proy.pasado[proy.pasado.length - 1]!;
    // Contra qué se compara: el final del periodo anterior, o hace 7 días. Si esa fecha es anterior a la primera
    // sesión no hay contra qué (el atleta no existía): la comparación es null, no «+16 frente a nada».
    const enAnterior = proy.pasado.find((p) => p.date === rango.anterior.hasta) ?? null;
    const hace7 = proy.pasado.find((p) => p.date === sumarDias(HOY, -7)) ?? null;
    const cmp = (actual: number, ref: { ctl: number; atl: number; tsb: number } | null, k: 'ctl' | 'atl' | 'tsb', umbral: number, etiqueta: string) =>
      ref ? comparar({ actual, referencia: ref[k], contra: 'periodo_anterior', umbral, etiqueta_es: etiqueta }) : null;
    const banda = estadoFrescuraDe(hoy.tsb, metodo.bandas_frescura);
    const semanasSuficientes = (semanasHistoria ?? 0) >= metodo.semanas_minimas_forma;
    const segundosTotal = hechas.reduce((s, d) => s + d.segundos, 0);
    const segundosConCarga = hechas.filter((d) => d.tss != null).reduce((s, d) => s + d.segundos, 0);
    const segundosEstimados = hechas.filter((d) => d.tss != null && d.ancla === 'estimada').reduce((s, d) => s + d.segundos, 0);
    const coberturaPct = segundosTotal > 0 ? (segundosConCarga / segundosTotal) * 100 : null;
    const estimadaPct = segundosConCarga > 0 ? (segundosEstimados / segundosConCarga) * 100 : null;
    const cob = (muestras: number) => ({ muestras, dias_ventana: rango.dias, dias_con_dato: hechas.length, pct: coberturaPct, estimada_pct: estimadaPct, ultimo_dato: ultimaSesion });
    const anclaCarga: Ancla = estimadaPct != null && estimadaPct > 50 ? 'estimada' : a.perfil.ancla.correr;

    // Las series de la ventana, día a día, con la proyección hasta la carrera.
    const dentro = proy.pasado.filter((p) => p.date >= rango.desde);
    const serieDe = (k: 'ctl' | 'atl' | 'tsb') =>
      serie(
        'tss',
        'dia',
        dentro.map((p) => ({ t: p.date, hecho: Math.round(p[k] * 10) / 10 })),
        { proyeccion: proy.futuro.map((p) => ({ t: p.date, v: Math.round(p[k] * 10) / 10 })) },
      );
    const subida = subidaSemana(proy.pasado);
    const ultimoDia = a.perfil.ultimaSesion ?? HOY;
    const palabraViejo = diasEntre(ultimoDia, HOY) > metodo.dato_viejo_dias;

    base.estado = {
      clave: semanasSuficientes ? banda.clave : null,
      palabra_es: semanasSuficientes ? banda.nombre_es : null,
      lecturas: [
        semanasSuficientes
          ? medida({ id: 'estado.forma', bloque: 'estado', titulo_es: 'Forma', dato: { valor: hoy.ctl, unidad: 'tss', comparacion: cmp(hoy.ctl, hace7, 'ctl', 1, 'vs hace 7 días') }, cobertura: cob(hechas.length), procedencia: proc('banister_ctl', `Media de ${metodo.ctl_days} días de la carga diaria.`, anclaCarga) })
          : sinDato({ id: 'estado.forma', bloque: 'estado', titulo_es: 'Forma', falta: FALTA_HISTORIA(semanasHistoria ?? 0, metodo.semanas_minimas_forma), cobertura: { ultimo_dato: ultimaSesion, dias_ventana: rango.dias }, procedencia: proc('banister_ctl', 'Media de 42 días de la carga diaria.', anclaCarga) }),
        medida({ id: 'estado.fatiga', bloque: 'estado', titulo_es: 'Fatiga', dato: { valor: hoy.atl, unidad: 'tss', comparacion: cmp(hoy.atl, hace7, 'atl', 1, 'vs hace 7 días') }, cobertura: cob(hechas.length), procedencia: proc('banister_atl', `Media de ${metodo.atl_days} días de la carga diaria.`, anclaCarga) }),
        semanasSuficientes
          ? medida({ id: 'estado.frescura', bloque: 'estado', titulo_es: 'Frescura', dato: { valor: hoy.tsb, unidad: 'tss', comparacion: cmp(hoy.tsb, hace7, 'tsb', 1, 'vs hace 7 días') }, cobertura: cob(hechas.length), procedencia: proc('banister_tsb', 'Forma menos fatiga.', anclaCarga) })
          : sinDato({ id: 'estado.frescura', bloque: 'estado', titulo_es: 'Frescura', falta: FALTA_HISTORIA(semanasHistoria ?? 0, metodo.semanas_minimas_forma), cobertura: { ultimo_dato: ultimaSesion, dias_ventana: rango.dias }, procedencia: proc('banister_tsb', 'Forma menos fatiga.', anclaCarga) }),
      ],
    };

    base.forma = {
      lecturas: [
        semanasSuficientes
          ? medida({ id: 'forma.forma', bloque: 'forma', titulo_es: 'Forma', dato: { valor: hoy.ctl, unidad: 'tss', comparacion: cmp(hoy.ctl, enAnterior, 'ctl', 2, `vs hace ${rango.dias} días`) }, serie: serieDe('ctl'), cobertura: cob(hechas.length), procedencia: proc('banister_ctl', `Media de ${metodo.ctl_days} días de la carga diaria.`, anclaCarga) })
          : sinDato({ id: 'forma.forma', bloque: 'forma', titulo_es: 'Forma', falta: FALTA_HISTORIA(semanasHistoria ?? 0, metodo.semanas_minimas_forma), cobertura: { ultimo_dato: ultimaSesion, dias_ventana: rango.dias, muestras: hechas.length }, procedencia: proc('banister_ctl', 'Media de 42 días.', anclaCarga) }),
        medida({ id: 'forma.fatiga', bloque: 'forma', titulo_es: 'Fatiga', dato: { valor: hoy.atl, unidad: 'tss', comparacion: cmp(hoy.atl, enAnterior, 'atl', 2, `vs hace ${rango.dias} días`) }, serie: serieDe('atl'), cobertura: cob(hechas.length), procedencia: proc('banister_atl', `Media de ${metodo.atl_days} días.`, anclaCarga) }),
        semanasSuficientes
          ? medida({ id: 'forma.frescura', bloque: 'forma', titulo_es: 'Frescura', dato: { valor: hoy.tsb, unidad: 'tss', comparacion: cmp(hoy.tsb, enAnterior, 'tsb', 2, `vs hace ${rango.dias} días`) }, serie: serieDe('tsb'), cobertura: cob(hechas.length), procedencia: proc('banister_tsb', 'Forma menos fatiga.', anclaCarga) })
          : sinDato({ id: 'forma.frescura', bloque: 'forma', titulo_es: 'Frescura', falta: FALTA_HISTORIA(semanasHistoria ?? 0, metodo.semanas_minimas_forma), cobertura: { ultimo_dato: ultimaSesion, dias_ventana: rango.dias, muestras: hechas.length }, procedencia: proc('banister_tsb', 'Forma menos fatiga.', anclaCarga) }),
        ...(subida != null && semanasSuficientes
          ? [medida({ id: 'forma.subida', bloque: 'forma', titulo_es: 'Subida de forma', dato: { valor: subida, unidad: 'tss_semana', comparacion: comparar({ actual: subida, referencia: metodo.ramp_alert_tss_per_week, contra: 'objetivo', umbral: 0.5, etiqueta_es: `aviso a partir de ${metodo.ramp_alert_tss_per_week}` }) }, cobertura: cob(hechas.length), procedencia: proc('banister_ramp', 'Cuánto ha crecido la forma en 7 días.', anclaCarga) })]
          : []),
        ...(coberturaPct != null
          ? [medida({ id: 'forma.cobertura', bloque: 'forma', titulo_es: 'Carga calculada', dato: { valor: coberturaPct, unidad: 'pct', comparacion: comparar({ actual: coberturaPct, referencia: metodo.cobertura_minima_veredicto_pct, contra: 'objetivo', umbral: 1, etiqueta_es: `mínimo ${metodo.cobertura_minima_veredicto_pct} % para el veredicto` }) }, cobertura: cob(hechas.length), procedencia: proc('cobertura_carga', 'Tiempo entrenado que entra en la curva.', anclaCarga) })]
          : []),
      ],
      veredicto: semanasSuficientes && !palabraViejo ? veredictoForma({ subida, estado: banda.clave, cobertura_pct: coberturaPct, estimada_pct: estimadaPct, metodo }) : null,
    };
  }

  // ── Semana a semana ───────────────────────────────────────────────────────
  if (a.perfil) {
    const cubos = agregar(dias, cubosDe(rango));
    const cubosAnteriores = agregar(dias, cubosDe({ ...rango.anterior, paso: rango.paso }));
    const tot = (c: typeof cubos, f: FamiliaGrande) => c.reduce((s, x) => s + x.hecho_tss[f], 0);
    const lecturas: LecturaPanel[] = [];
    for (const f of FAMILIAS_GRANDES) {
      const muestras = enVentana.filter((d) => d.familia === f && d.hecha).length;
      const ancla = a.perfil.ancla[f];
      if (muestras === 0 && !enVentana.some((d) => d.familia === f)) continue;
      lecturas.push(
        medida({
          id: `semanas.carga.${f}`,
          bloque: 'semanas',
          familia: f === 'ergo' ? 'remo' : f === 'estaciones-wod' ? 'estaciones' : f,
          titulo_es: 'Carga',
          dato: { valor: tot(cubos, f), unidad: 'tss', comparacion: comparar({ actual: tot(cubos, f), referencia: tot(cubosAnteriores, f), contra: 'periodo_anterior', umbral: metodo.umbrales_cambio.carga_semana_tss, etiqueta_es: 'vs periodo anterior' }) },
          serie: serie(
            'tss',
            rango.paso,
            cubos.map((c) => ({ t: c.t, hecho: c.sesiones.some((s) => s.hecha) ? c.hecho_tss[f] : c.t > HOY ? null : 0, plan: c.plan_por_familia[f] })),
          ),
          // La cobertura es cuántos CUBOS de la ventana tienen alguna sesión: tres semanas en doce es poco dato.
          cobertura: { muestras, dias_ventana: rango.dias, dias_con_dato: hechas.length, pct: (cubos.filter((c) => c.sesiones.some((s) => s.hecha)).length / Math.max(1, cubos.length)) * 100, estimada_pct: null, ultimo_dato: ultimaSesion },
          procedencia: proc(`carga_${ancla}`, 'Suma de la carga de cada tramo hecho; el plan, desde la prescripción.', ancla),
        }),
        medida({
          id: `semanas.horas.${f}`,
          bloque: 'semanas',
          familia: f === 'ergo' ? 'remo' : f === 'estaciones-wod' ? 'estaciones' : f,
          titulo_es: 'Horas',
          dato: { valor: cubos.reduce((s, c) => s + c.segundos[f], 0), unidad: 'segundos', comparacion: null },
          serie: serie(
            'segundos',
            rango.paso,
            cubos.map((c) => ({ t: c.t, hecho: c.segundos[f] })),
          ),
          cobertura: { muestras, dias_ventana: rango.dias, dias_con_dato: hechas.length, pct: null, estimada_pct: null, ultimo_dato: ultimaSesion },
          procedencia: proc('tiempo_sesiones', 'Duración medida de cada sesión.', 'medida'),
        }),
      );
    }
    // TODAS las sesiones de la ventana, de la más reciente a la más vieja: el resumen cuenta sobre todas y la lista enseña las últimas.
    const sesiones: SesionResumen[] = [...enVentana]
      .filter((d) => d.fecha <= HOY)
      .sort((x, y) => (x.fecha < y.fecha ? 1 : -1))
      .map((d, i) => {
        let cumplimiento: Cumplimiento;
        if (!d.hecha) cumplimiento = 'no-hecha';
        else if (d.plan_tss == null) cumplimiento = 'sin-plan';
        else cumplimiento = cumplimientoDe('tiempo', d.plan_tss, d.tss, { ...metodo.tolerancias, tiempo: { tipo: 'pct', valor: 10, masEsMas: true } });
        return {
          id: `s${i}-${d.fecha}`,
          fecha: d.fecha,
          titulo_es: d.titulo,
          familia: (d.familia === 'ergo' ? 'remo' : d.familia === 'estaciones-wod' ? 'estaciones' : d.familia) as Familia,
          plan_tss: d.plan_tss,
          hecho_tss: d.tss,
          ancla: d.hecha ? d.ancla : null,
          cumplimiento,
          detalle_es: d.hecha && d.tss != null && d.plan_tss != null ? `carga ${Math.round(d.tss)} de ${Math.round(d.plan_tss)}` : d.hecha && d.plan_tss == null ? 'sin intensidad prescrita' : null,
        };
      });
    base.semanas = { lecturas, sesiones };
  }

  // ── Intensidad ────────────────────────────────────────────────────────────
  if (a.perfil && a.perfil.pulso) {
    const cubos = agregar(dias, cubosDe(rango));
    const totalZ = [0, 0, 0, 0, 0];
    cubos.forEach((c) => c.zonasS.forEach((s, i) => (totalZ[i] = (totalZ[i] ?? 0) + s)));
    const total = totalZ.reduce((x, y) => x + y, 0);
    const anclaZonas: Ancla = a.perfil.ancla.correr;
    base.intensidad = {
      lecturas: [1, 2, 3, 4, 5].map((z) =>
        medida({
          id: `intensidad.zona.z${z}`,
          bloque: 'intensidad',
          titulo_es: `Z${z}`,
          dato: { valor: totalZ[z - 1]!, unidad: 'segundos', comparacion: null },
          serie: serie('segundos', rango.paso, cubos.map((c) => ({ t: c.t, hecho: c.sesiones.some((s) => s.hecha) ? c.zonasS[z - 1]! : c.t > HOY ? null : 0 }))),
          reparto: null,
          cobertura: { muestras: hechas.length, dias_ventana: rango.dias, dias_con_dato: hechas.length, pct: (cubos.filter((c) => c.sesiones.some((s) => s.hecha)).length / Math.max(1, cubos.length)) * 100, estimada_pct: anclaZonas === 'estimada' ? 100 : 0, ultimo_dato: ultimaSesion },
          procedencia: proc('zonas_pulso', 'Segundos con el pulso en cada zona de tu coach.', anclaZonas),
        }),
      ),
      polarizacion:
        total > 0
          ? {
              unidad: 'segundos',
              total,
              partes: [
                { code: 'baja', etiqueta_es: 'Suave', valor: totalZ.slice(0, metodo.polarizacion.zona_baja_hasta).reduce((x, y) => x + y, 0), pct: (totalZ.slice(0, metodo.polarizacion.zona_baja_hasta).reduce((x, y) => x + y, 0) / total) * 100 },
                { code: 'media', etiqueta_es: 'Media', valor: totalZ.slice(metodo.polarizacion.zona_baja_hasta, metodo.polarizacion.zona_media_hasta).reduce((x, y) => x + y, 0), pct: (totalZ.slice(metodo.polarizacion.zona_baja_hasta, metodo.polarizacion.zona_media_hasta).reduce((x, y) => x + y, 0) / total) * 100 },
                { code: 'alta', etiqueta_es: 'Dura', valor: totalZ.slice(metodo.polarizacion.zona_media_hasta).reduce((x, y) => x + y, 0), pct: (totalZ.slice(metodo.polarizacion.zona_media_hasta).reduce((x, y) => x + y, 0) / total) * 100 },
              ],
              objetivo: [
                { code: 'baja', pct: metodo.polarizacion.objetivo.baja },
                { code: 'media', pct: metodo.polarizacion.objetivo.media },
                { code: 'alta', pct: metodo.polarizacion.objetivo.alta },
              ],
            }
          : null,
    };
  } else if (a.perfil) {
    base.intensidad = {
      lecturas: [sinDato({ id: 'intensidad.zonas', bloque: 'intensidad', titulo_es: 'Tiempo en zonas', falta: { por: 'sensor' }, cobertura: { dias_ventana: rango.dias }, procedencia: proc('zonas_pulso', 'Segundos con el pulso en cada zona.', 'poblacional') })],
      polarizacion: null,
    };
  }

  // ── Progreso: una fila por familia ────────────────────────────────────────
  if (a.perfil) {
    const cubos = cubosDe({ ...rango, paso: 'semana' });
    const semanas = cubos.map((c) => c.t);
    const UNIDAD: Record<Familia, LecturaPanel['dato'] extends infer D ? (D extends { unidad: infer U } ? U : never) : never> = {
      correr: 's_km',
      remo: 's_500m',
      ski: 's_500m',
      bici: 's_1000m',
      fuerza: 'kg',
      estaciones: 'segundos',
      wod: 'segundos',
    };
    const METRICA: Record<Familia, string> = {
      correr: 'Ritmo umbral',
      remo: '2000 m',
      ski: '1000 m',
      bici: '4 min · /1000 m',
      fuerza: 'Sentadilla · 1RM est.',
      estaciones: 'Sled push 50 m',
      wod: 'Simulación HYROX',
    };
    const UMBRAL: Record<Familia, number> = {
      correr: metodo.umbrales_cambio.ritmo_umbral_s_km,
      remo: metodo.umbrales_cambio.split_umbral_s_500,
      ski: metodo.umbrales_cambio.split_umbral_s_500,
      bici: metodo.umbrales_cambio.split_umbral_s_500,
      fuerza: metodo.umbrales_cambio.rm_kg,
      estaciones: metodo.umbrales_cambio.estacion_s,
      wod: metodo.umbrales_cambio.prevision_carrera_s,
    };
    base.progreso = FAMILIAS.map((f, i) => {
      const clave = a.clave[f];
      const grande = FAMILIA_GRANDE[f];
      const muestras = enVentana.filter((d) => d.hecha && d.familia === grande).length;
      // De dónde sale la marca clave y de cuándo: la fecha del test o de la mejor serie, no la de la última sesión.
      const DE: Record<Familia, string> = { correr: 'Test de umbral', remo: 'Test de 2000 m', ski: 'Test de 1000 m', bici: 'Pieza de 4 min', fuerza: 'Tu mejor serie hecha', estaciones: 'Tu mejor sled push', wod: 'Tu última simulación' };
      const procedencia = proc(`clave_${f}`, clave ? `${DE[f]} · ${clave.fecha}` : `${METRICA[f]}: la marca que resume ${FAMILIA_NOMBRE[f].toLowerCase()}.`, clave?.ancla ?? 'poblacional');
      if (!clave || a.nunca.includes(f)) {
        return sinDato({ id: `progreso.${f}`, bloque: 'progreso', familia: f, titulo_es: METRICA[f], falta: a.nunca.includes(f) ? { por: 'ocasion' } : FALTA_HISTORIA(semanasHistoria ?? 0, 1), cobertura: { dias_ventana: rango.dias, muestras }, procedencia });
      }
      const semanasVisibles = semanas.filter((s) => s >= (a.perfil?.desde ?? s) || s === semanas[0]);
      const t = tendencia({ semanas: semanasVisibles, desde: clave.desdeValor, hasta: clave.valor, semilla: 100 + i, ruido: Math.abs(clave.valor - clave.desdeValor) * 0.35, huecos: f === 'wod' ? 0.55 : 0.12 });
      const ultimo = [...t].reverse().find((p) => p.v != null);
      const inicio = t.find((p) => p.v != null);
      return medida({
        id: `progreso.${f}`,
        bloque: 'progreso',
        familia: f,
        titulo_es: METRICA[f],
        dato: {
          valor: clave.valor,
          unidad: UNIDAD[f],
          comparacion: inicio && ultimo ? comparar({ actual: clave.valor, referencia: inicio.v!, contra: 'periodo_anterior', umbral: UMBRAL[f], etiqueta_es: `vs hace ${rango.dias} días` }) : null,
        },
        serie: serie(UNIDAD[f], 'semana', t.map((p) => ({ t: p.t, hecho: p.v }))),
        cobertura: { muestras, dias_ventana: rango.dias, dias_con_dato: muestras, pct: null, estimada_pct: clave.ancla === 'estimada' ? 100 : 0, ultimo_dato: clave.fecha > (ultimaSesion ?? '') ? clave.fecha : ultimaSesion },
        procedencia,
      });
    });
  }

  // ── Récords ───────────────────────────────────────────────────────────────
  base.records = marcarNuevos(
    a.records.filter((r) => r.fecha <= HOY).map((r, i) => ({ ...r, id: `r${i}` })),
    rango,
  ).sort((x, y) => (x.nuevo === y.nuevo ? (x.fecha < y.fecha ? 1 : -1) : x.nuevo ? -1 : 1));

  // ── Carrera ───────────────────────────────────────────────────────────────
  if (a.carrera) {
    const conDato = TRAMOS_CARRERA.filter((t) => a.tramos[t] != null);
    const completa = conDato.length === TRAMOS_CARRERA.length;
    const sumaConDato = conDato.reduce((s, t) => s + a.tramos[t]!.s, 0);
    // Sin los 17 tramos no hay tiempo previsto: sumar once tramos y compararlos con el objetivo entero sería mentir.
    const previsto = completa ? sumaConDato : null;
    const objetivo = a.carrera.objetivo_s;
    // El objetivo se reparte por tramo con el perfil de referencia del método (no en proporción a la previsión, que
    // dejaría el mismo hueco relativo en todos los tramos y no diría dónde se pierde el tiempo).
    const tramos: PrevisionTramo[] = TRAMOS_CARRERA.map((t) => {
      const p = a.tramos[t];
      if (!p) return { tramo: t, previsto_s: null, objetivo_s: null, hueco_s: null, ancla: 'poblacional' as const, de_es: 'sin marca de este tramo' };
      const obj = objetivo != null ? Math.round((REPARTO_CARRERA_DEFECTO[t] ?? 0) * objetivo) : null;
      return { tramo: t, previsto_s: p.s, objetivo_s: obj, hueco_s: obj != null ? p.s - obj : null, ancla: p.ancla, de_es: p.de };
    });
    const semanas = cubosDe({ ...rango, paso: 'semana' }).map((c) => c.t);
    const tend = previsto != null ? tendencia({ semanas, desde: previsto * (escenario === 'viejo' ? 1.0 : 1.06), hasta: previsto, semilla: 77, ruido: 40, huecos: 0 }) : [];
    const carrera: PrevisionCarrera = {
      nombre_es: a.carrera.nombre_es,
      fecha: a.carrera.fecha,
      dias: diasEntre(HOY, a.carrera.fecha),
      previsto_s: previsto,
      objetivo_s: objetivo,
      hueco_s: objetivo != null && previsto != null ? previsto - objetivo : null,
      tendencia: tend.map((p) => ({ t: p.t, v: p.v == null ? null : Math.round(p.v) })),
      tramos,
      cobertura: { con_dato: conDato.filter((t) => a.tramos[t]!.ancla !== 'poblacional').length, de: TRAMOS_CARRERA.length },
    };
    base.carrera = carrera;
  }

  // ── Recuperación ──────────────────────────────────────────────────────────
  {
    const procV = (de: string, explica: string) => proc(de, explica, a.reloj ? 'medida' : 'poblacional', a.reloj != null);
    if (!a.reloj) {
      base.recuperacion = [
        sinDato({ id: 'recuperacion.vfc', bloque: 'recuperacion', titulo_es: 'Variabilidad', falta: { por: 'dispositivo' }, procedencia: procV('vfc_noche', 'La variabilidad de cada noche, contra tu basal.') }),
        sinDato({ id: 'recuperacion.fc_reposo', bloque: 'recuperacion', titulo_es: 'Pulso en reposo', falta: { por: 'dispositivo' }, procedencia: procV('fc_reposo_noche', 'El pulso más bajo de la noche, contra tu basal.') }),
        sinDato({ id: 'recuperacion.sueno', bloque: 'recuperacion', titulo_es: 'Sueño', falta: { por: 'dispositivo' }, procedencia: procV('sueno_noche', 'Horas dormidas, contra tu basal.') }),
      ];
    } else {
      // Lo reciente y la basal se cuentan desde la ÚLTIMA noche con dato, no desde hoy: un reloj sin
      // sincronizar deja un dato viejo (que se enseña con su edad), no un dato vacío.
      const ultimaNoche = nochesTodas.filter((n) => n.vfc != null).map((n) => n.fecha).reduce<string | null>((m, f) => (m == null || f > m ? f : m), null) ?? HOY;
      const hastaBasal = sumarDias(ultimaNoche, -metodo.reciente_dias + 1);
      const basalDesde = sumarDias(ultimaNoche, -metodo.ventana_basal_dias);
      const nochesBasal = nochesTodas.filter((n) => n.fecha >= basalDesde && n.fecha < hastaBasal && n.vfc != null);
      const recientes = nochesTodas.filter((n) => n.fecha >= hastaBasal && n.fecha <= ultimaNoche);
      const enSerie = nochesTodas.filter((n) => n.fecha >= sumarDias(ultimaNoche, -27) && n.fecha <= ultimaNoche);
      const hay = nochesBasal.length >= metodo.hrv_min_nights_baseline;
      const mk = (id: string, titulo: string, k: 'vfc' | 'fc_reposo' | 'sueno_h', unidad: 'ms' | 'bpm' | 'horas', umbral: number, de: string, explica: string): LecturaPanel => {
        const basal = mediaDe(nochesBasal.map((n) => n[k]));
        const reciente = mediaDe(recientes.map((n) => n[k]));
        if (!hay || basal == null || reciente == null) {
          return sinDato({ id, bloque: 'recuperacion', titulo_es: titulo, falta: FALTA_HISTORIA(nochesBasal.length, metodo.hrv_min_nights_baseline), cobertura: { muestras: nochesBasal.length, dias_ventana: metodo.ventana_basal_dias, ultimo_dato: ultimaNoche }, procedencia: procV(de, explica) });
        }
        const sd = Math.sqrt(mediaDe(nochesBasal.map((n) => (n[k] == null ? null : (n[k]! - basal) ** 2))) ?? 0);
        return medida({
          id,
          bloque: 'recuperacion',
          titulo_es: titulo,
          dato: { valor: Math.round(reciente * 10) / 10, unidad, comparacion: comparar({ actual: reciente, referencia: basal, contra: 'basal', umbral, etiqueta_es: `vs tu basal ${unidad === 'horas' ? basal.toFixed(1).replace('.', ',') : Math.round(basal)}` }) },
          serie: serie(unidad, 'dia', enSerie.map((n) => ({ t: n.fecha, hecho: n[k] })), { banda: { lo: basal - sd, hi: basal + sd } }),
          cobertura: { muestras: recientes.filter((n) => n[k] != null).length, dias_ventana: metodo.reciente_dias, dias_con_dato: recientes.filter((n) => n[k] != null).length, pct: null, estimada_pct: 0, ultimo_dato: ultimaNoche },
          procedencia: procV(de, explica),
        });
      };
      base.recuperacion = [
        mk('recuperacion.vfc', 'Variabilidad', 'vfc', 'ms', metodo.umbrales_cambio.vfc_ms, 'vfc_noche', `Media de las últimas ${metodo.reciente_dias} noches contra tu basal de ${metodo.ventana_basal_dias} días.`),
        mk('recuperacion.fc_reposo', 'Pulso en reposo', 'fc_reposo', 'bpm', metodo.umbrales_cambio.fc_reposo_ppm, 'fc_reposo_noche', 'El pulso más bajo de la noche, contra tu basal.'),
        mk('recuperacion.sueno', 'Sueño', 'sueno_h', 'horas', metodo.umbrales_cambio.sueno_h, 'sueno_noche', 'Horas dormidas, contra tu basal.'),
      ];
      // La disposición de hoy, desde la última noche contra la basal.
      const ultima = recientes.filter((n) => n.vfc != null).slice(-1)[0];
      const basalV = mediaDe(nochesBasal.map((n) => n.vfc));
      const basalF = mediaDe(nochesBasal.map((n) => n.fc_reposo));
      const basalS = mediaDe(nochesBasal.map((n) => n.sueno_h));
      if (hay && ultima && basalV != null && basalF != null && basalS != null && ultima.fc_reposo != null && ultima.sueno_h != null && diasEntre(ultima.fecha, HOY) <= 1) {
        const puntos = Math.max(0, Math.min(100, Math.round(62 + (ultima.vfc! - basalV) * 1.6 - (ultima.fc_reposo - basalF) * 2.5 + (ultima.sueno_h - basalS) * 9)));
        // La disposición es la lectura de UNA noche contra la basal: sus muestras son las noches de la basal, no una.
        base.estado.lecturas.push(
          medida({ id: 'estado.disposicion', bloque: 'estado', titulo_es: 'Disposición', dato: { valor: puntos, unidad: 'puntos', comparacion: null }, cobertura: { muestras: nochesBasal.length, dias_ventana: 1, dias_con_dato: 1, pct: 100, estimada_pct: 0, ultimo_dato: ultima.fecha }, procedencia: procV('disposicion_hoy', palabraDisposicion(puntos, metodo.bandas_disposicion)) }),
        );
      }
    }
  }

  return base;
}

/** Cuántos kg estima el método para la fila de fuerza, desde una serie declarada: para los detalles. */
export function unaRmDe(kg: number, reps: number, metodo: MetodoAnaliticas = METODO_DEFECTO): number {
  return Math.round(unaRmEstimada(kg, reps, metodo.formula_1rm) * 2) / 2;
}

export { HOY, TRAMO_CARRERA_NOMBRE };
export type { RangoVentana };
