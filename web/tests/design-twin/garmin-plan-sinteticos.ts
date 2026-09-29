// SESIONES SINTÉTICAS DEL PLAN COMPACTO — al límite, por cada valor y al azar.
//
// Tres usos, todos del examen (`kit-garmin-plan-compacto.test.ts`):
//   · al LÍMITE: las sesiones más grandes que el producto puede pedir (HYROX
//     completo, cientos de series, un EMOM largo, un AMRAP de seis tareas):
//     caben en el presupuesto o el test dice cuánto se pasan.
//   · POR CADA VALOR: un paso por cada valor de cada tabla del formato, para
//     que ningún código quede sin viajar aunque ninguna sesión real lo use.
//   · AL AZAR: planes válidos generados con una semilla fija, para que la ida
//     y vuelta exacta no dependa de los casos que se le ocurrieron a alguien.
//
// Nada de esto es una sesión real ni se presenta como tal: son pruebas de
// robustez del FORMATO, no ejemplos de entrenamiento.

import { REGLAS_AVISO_DEFECTO, type InfoWod, type Medida, type Objetivo, type PasoBase, type Posicion, type Tarea, type ZonasCoach } from '@/components/design-twin/kit-reloj/paso';
import type { Dobles } from '@/components/design-twin/kit-reloj/dobles';
import type { PlanSesion } from '@/components/design-twin/kit-reloj/secuencia';
import {
  CLASES,
  EJES,
  ENTORNOS,
  FASES,
  FORMATOS_WOD,
  MAQUINAS,
  MODOS_RECUPERA,
  PAPELES,
  QUIEN_MIDE,
  ROLES,
  ROXZONAS,
  SENTIDOS_AVISO,
  TIPOS_MEDIDA,
} from '@/components/design-twin/kit-garmin/plan-compacto/formato';
import { amrap } from '@/components/design-twin/screens/reloj-wod/planes';
import { corporal, ejercicio, rir, rm } from '@/components/design-twin/screens/reloj-fuerza/planes';
import { simulacionHyrox } from '@/components/design-twin/screens/reloj-circuito/planes';

const ZONAS: ZonasCoach = { techos: [138, 150, 160, 173, 192] };
export const planDe = (pasos: PasoBase[]): PlanSesion => ({ pasos, zonas: ZONAS, reglas: REGLAS_AVISO_DEFECTO });

const tiempo = (s: number): Medida => ({ tipo: 'tiempo', prescrito: s, mide: 'reloj' });
let contador = 0;
const paso = (p: Omit<PasoBase, 'id' | 'objetivos' | 'cierre' | 'fase'> & Partial<PasoBase>): PasoBase => ({
  id: `s${++contador}`,
  objetivos: [],
  cierre: 'medida',
  fase: 'principal',
  ...p,
});

// ---------------------------------------------------------------------------
// Al límite
// ---------------------------------------------------------------------------

/** HYROX completo: calentamiento + 8 × (1 km + Roxzone + estación + Roxzone) + vuelta a la calma. */
export function hyroxCompleto(): PlanSesion {
  const cal = paso({ clase: 'calentamiento', rol: 'trabajo', fase: 'calentamiento', medida: tiempo(600), objetivos: [{ eje: 'zona', min: 2, max: 2, papel: 'principal', avisa: 'solo-arriba' }], bloque: 0 });
  const vuelta = paso({ clase: 'vuelta-calma', rol: 'trabajo', fase: 'vuelta', medida: tiempo(600), bloque: 2 });
  const sim = simulacionHyrox({ pm5: true, roxzone: true, cap: 5400, run: [{ eje: 'ritmo', min: 250, max: 265, papel: 'principal' }] }).plan;
  return planDe([cal, ...sim.pasos.map((p) => ({ ...p, bloque: 1 })), vuelta]);
}

/** `series` series de fuerza con su descanso (5 por ejercicio, cada ejercicio con su ficha completa). */
export function fuerzaDeMuchasSeries(series: number, conDescanso = true): PlanSesion {
  const pasos: PasoBase[] = [];
  const ejercicios = Math.ceil(series / 5);
  for (let e = 0; e < ejercicios; e++) {
    const conteo = Math.min(5, series - e * 5);
    pasos.push(
      ...ejercicio(
        {
          clave: `e${e}`,
          nombre: `Ejercicio ${e + 1}`,
          series: conteo,
          reps: 5,
          carga: e % 2 === 0 ? rm(70, 75, 180 + e) : corporal,
          esfuerzo: rir(2),
          tempo: { excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0 },
          cue: 'concéntrica explosiva',
        },
        conDescanso ? 90 : 0,
        e,
      ),
    );
  }
  return planDe(pasos);
}

/** AMRAP de `n` tareas con carga, dosis y peso corporal alternados. */
export function amrapDeTareas(n: number): PlanSesion {
  const tareas: Tarea[] = Array.from({ length: n }, (_, k) => ({
    nombre: `Movimiento ${k + 1}`,
    dosis: { tipo: 'reps', prescrito: 8 + k, mide: 'atleta' },
    ...(k % 2 === 0 ? { carga: { kg: 9 + k, implementos: k === 2 ? 2 : undefined } } : { corporal: true }),
    mide: 'atleta',
  }));
  return planDe(amrap(tareas, 900));
}

/** EMOM de `ventanas` minutos con un ciclo de `tareas` movimientos. */
export function emomLargo(ventanas: number, tareas: number): PlanSesion {
  const ciclo: Tarea[] = Array.from({ length: tareas }, (_, k) => ({
    nombre: `Tarea ${k + 1}`,
    dosis: k % 2 === 0 ? { tipo: 'reps', prescrito: 10, mide: 'atleta' } : null,
    mide: k % 2 === 0 ? 'atleta' : 'ergo',
  }));
  const pasos = Array.from({ length: ventanas }, (_, k): PasoBase => {
    const tarea = ciclo[k % ciclo.length]!;
    return paso({
      clase: 'emom',
      rol: 'trabajo',
      medida: tiempo(60),
      nombre: tarea.nombre,
      posicion: { serie: { n: k + 1, de: ventanas } },
      bloque: 0,
      wod: { formato: 'emom', tarea, ciclo, ventanas, ventanaS: 60 },
    });
  });
  return planDe(pasos);
}

/** HYROX de dobles: cada estación lleva su turno, su pareja y su pacto (texto libre: un hueco del modelo). */
export function hyroxDobles(): PlanSesion {
  const turnos: Dobles[] = [
    { turno: 'tuyo', estacion: 'SkiErg 1km', pctTuyo: 100 },
    { turno: 'pareja', estacion: 'Sled Push 50m', pareja: 'Marta', pctTuyo: 0 },
    { turno: 'reparto', estacion: 'Wall Balls', pareja: 'Marta', tuyas: 60, suyas: 40, pctTuyo: 60, nota: 'alterna 25' },
  ];
  const pasos = turnos.map((d, k) =>
    paso({ clase: 'estacion', rol: 'trabajo', nombre: d.estacion, medida: { tipo: 'reps', prescrito: 100, mide: 'atleta' }, cierre: 'atleta', posicion: { estacion: { n: k + 1, de: turnos.length } }, dobles: d, bloque: 0 }),
  );
  return planDe(pasos);
}

// ---------------------------------------------------------------------------
// Un paso por cada valor de cada tabla
// ---------------------------------------------------------------------------

const MEDIDA_BASE: Medida = tiempo(60);

/** Al menos un paso por cada código de cada enum del formato. */
export function pasosPorCadaValor(): PasoBase[] {
  const base = (p: Partial<PasoBase>): PasoBase => paso({ clase: 'series', rol: 'trabajo', medida: MEDIDA_BASE, ...p });
  const pasos: PasoBase[] = [];
  CLASES.forEach((clase) => pasos.push(base({ clase })));
  ROLES.forEach((rol) => pasos.push(base({ rol })));
  FASES.forEach((fase) => pasos.push(base({ fase })));
  TIPOS_MEDIDA.forEach((tipo) => pasos.push(base({ medida: { tipo, prescrito: tipo === 'abierta' ? null : 30, mide: 'atleta' } })));
  QUIEN_MIDE.forEach((mide) => pasos.push(base({ medida: { tipo: 'distancia', prescrito: 400, mide } })));
  MODOS_RECUPERA.forEach((modoRecupera) => pasos.push(base({ modoRecupera })));
  ENTORNOS.forEach((entorno) => pasos.push(base({ entorno })));
  MAQUINAS.forEach((tipo, k) => pasos.push(base({ maquina: k % 2 === 0 ? { tipo, damper: 5 + k } : { tipo } })));
  ROXZONAS.forEach((roxzone) => pasos.push(base({ clase: 'roxzone', roxzone })));
  EJES.forEach((eje) => {
    PAPELES.forEach((papel) => pasos.push(base({ objetivos: [{ eje, min: eje === 'kg' ? 62.5 : 6.5, max: eje === 'kg' ? 65 : 8.5, papel }] })));
    SENTIDOS_AVISO.forEach((avisa) => pasos.push(base({ objetivos: [{ eje, min: null, max: 142, papel: 'techo', avisa }, { eje: 'rpe', min: 7, max: 7, papel: 'secundario', palabra: 'a tope' }] })));
  });
  pasos.push(base({ posicion: { tanda: { n: 2, de: 3 }, serie: { n: 4, de: 6 }, tramo: { n: 1, de: 8 }, ronda: { n: 2, de: 5 }, estacion: { n: 3, de: 4 }, slot: 'B12' } }));
  pasos.push(base({ posicion: {}, carga: { kg: 32, implementos: 2 }, tempo: { excentrica: 3, pausaAbajo: 1, concentrica: 1, pausaArriba: 0 }, cue: 'mirar el pulso', vueltaAutoM: 1000, cierre: 'atleta', bloque: 7, nombre: 'Sled Push' }));
  return pasos;
}

/** Los InfoWod de cada formato con los campos opcionales presentes y ausentes. */
export function pasosDeWod(): PasoBase[] {
  const t: Tarea = { nombre: 'Row', dosis: { tipo: 'distancia', prescrito: 500, mide: 'ergo' }, mide: 'ergo', carga: { kg: 24 }, corporal: true, corre: true };
  const sinDosis: Tarea = { nombre: 'SkiErg', dosis: null, mide: 'ergo' };
  const infos: InfoWod[] = [
    { formato: 'emom', tarea: sinDosis, ciclo: [t, sinDosis], ventanas: 10, ventanaS: 75 },
    { formato: 'amrap', tareas: [t], duracionS: 600 },
    { formato: 'puntuacion', tareas: [t, sinDosis], duracionS: 600 },
    { formato: 'fortime', tarea: t, capS: 1200 },
    { formato: 'fortime', tarea: null, capS: null },
    { formato: 'pared', trabajoS: 20, descansoS: 10, rondas: 8 },
    { formato: 'deathby', tarea: t, inicio: 2, incremento: 1, ventanaS: 60, tope: 20 },
    { formato: 'deathby', tarea: sinDosis, inicio: 1, incremento: 2, ventanaS: 60, tope: null },
  ];
  return infos.map((wod) => paso({ clase: 'amrap', rol: 'trabajo', medida: MEDIDA_BASE, wod }));
}

// ---------------------------------------------------------------------------
// Al azar, con semilla
// ---------------------------------------------------------------------------

/** mulberry32: un generador de 32 bits de una línea, reproducible con la semilla. */
export function generador(semilla: number) {
  let s = semilla >>> 0;
  const siguiente = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entero = (min: number, max: number) => min + Math.floor(siguiente() * (max - min + 1));
  const elige = <T>(xs: readonly T[]): T => xs[entero(0, xs.length - 1)]!;
  const quizas = (p = 0.5) => siguiente() < p;
  return { siguiente, entero, elige, quizas };
}

const NOMBRES = ['Wall Ball', 'SkiErg', 'Sled Push', 'Extensión de cadera en cuadrupedia', 'Weighted pull-up', 'Sentadilla búlgara', 'Row', 'KB Swing', 'Zancada con saco', 'Burpee Broad Jump'];
const CUES = ['mirar el pulso', 'concéntrica explosiva', 'respira por la nariz · 3′ de calma', 'ritmo de competición ✓'];
const PALABRAS = ['a tope', 'ritmo de carrera', 'fuerte'];

type Azar = ReturnType<typeof generador>;

/** Un valor con `decimales` cifras entre min y max. */
const decimal = (a: Azar, min: number, max: number, decimales: number) => a.entero(min * 10 ** decimales, max * 10 ** decimales) / 10 ** decimales;

function medidaAzar(a: Azar): Medida {
  const tipo = a.elige(TIPOS_MEDIDA);
  return { tipo, prescrito: tipo === 'abierta' || a.quizas(0.1) ? null : a.entero(1, 6000), mide: a.elige(QUIEN_MIDE) };
}

function tareaAzar(a: Azar): Tarea {
  const t: Tarea = { nombre: a.elige(NOMBRES), dosis: a.quizas() ? medidaAzar(a) : null, mide: a.elige(QUIEN_MIDE) };
  if (a.quizas(0.4)) t.carga = a.quizas() ? { kg: decimal(a, 1, 200, 2) } : { kg: decimal(a, 1, 60, 2), implementos: a.entero(1, 4) };
  if (a.quizas(0.2)) t.corporal = true;
  if (a.quizas(0.1)) t.corre = true;
  return t;
}

function objetivoAzar(a: Azar): Objetivo {
  const eje = a.elige(EJES);
  const valor = () => (a.quizas(0.15) ? null : eje === 'kg' ? decimal(a, 1, 300, 2) : decimal(a, 0, 500, 1));
  const o: Objetivo = { eje, min: valor(), max: valor(), papel: a.elige(PAPELES) };
  if (a.quizas(0.4)) o.avisa = a.elige(SENTIDOS_AVISO);
  if (eje === 'rpe' && a.quizas(0.5)) o.palabra = a.elige(PALABRAS);
  return o;
}

function posicionAzar(a: Azar): Posicion {
  const p: Posicion = {};
  for (const k of ['tanda', 'serie', 'tramo', 'ronda', 'estacion'] as const) {
    if (a.quizas(0.35)) {
      const de = a.entero(1, 99);
      p[k] = { n: a.entero(1, de), de };
    }
  }
  if (a.quizas(0.25)) p.slot = `${String.fromCharCode(65 + a.entero(0, 25))}${a.entero(1, 99)}`;
  return p;
}

function wodAzar(a: Azar): InfoWod {
  const formato = a.elige(FORMATOS_WOD);
  const tareas = Array.from({ length: a.entero(1, 6) }, () => tareaAzar(a));
  switch (formato) {
    case 'emom': {
      const tarea = a.elige(tareas);
      return { formato, tarea, ciclo: tareas, ventanas: a.entero(1, 60), ventanaS: a.entero(30, 300) };
    }
    case 'amrap':
    case 'puntuacion':
      return { formato, tareas, duracionS: a.entero(60, 3600) };
    case 'fortime':
      return { formato, tarea: a.quizas() ? tareas[0]! : null, capS: a.quizas() ? a.entero(60, 3600) : null };
    case 'pared':
      return { formato, trabajoS: a.entero(5, 60), descansoS: a.entero(5, 60), rondas: a.entero(1, 30) };
    case 'deathby':
      return { formato, tarea: tareas[0]!, inicio: a.entero(1, 10), incremento: a.entero(1, 5), ventanaS: 60, tope: a.quizas() ? a.entero(5, 40) : null };
  }
}

function fichaAzar(a: Azar, ejercicio: string): NonNullable<PasoBase['fuerza']> {
  const tipo = a.entero(0, 3);
  const carga =
    tipo === 0
      ? ({ tipo: 'kg', min: decimal(a, 1, 200, 2), max: decimal(a, 1, 220, 2) } as const)
      : tipo === 1
        ? ({ tipo: 'rm', pctMin: decimal(a, 40, 90, 1), pctMax: decimal(a, 50, 100, 1), rmKg: a.quizas() ? decimal(a, 40, 300, 2) : null } as const)
        : tipo === 2
          ? ({ tipo: 'corporal' } as const)
          : ({ tipo: 'tuya', ultimaKg: a.quizas() ? decimal(a, 1, 200, 2) : null, ...(a.quizas() ? { lastre: true } : {}) } as const);
  const f: NonNullable<PasoBase['fuerza']> = {
    ejercicio,
    carga,
    esfuerzo: a.quizas() ? { eje: a.quizas() ? 'rir' : 'rpe', min: decimal(a, 0, 5, 1), max: decimal(a, 5, 10, 1) } : null,
    pasoKg: decimal(a, 0.25, 5, 2),
  };
  if (a.quizas(0.3)) f.porLado = a.elige(['pierna', 'brazo', 'lado'] as const);
  if (a.quizas(0.2)) f.aproximacion = true;
  if (a.quizas(0.3)) f.vaciaKg = decimal(a, 5, 25, 2);
  return f;
}

function pasoAzar(a: Azar): PasoBase {
  const p = paso({
    clase: a.elige(CLASES),
    rol: a.elige(ROLES),
    fase: a.elige(FASES),
    medida: medidaAzar(a),
    objetivos: Array.from({ length: a.entero(0, 2) }, () => objetivoAzar(a)),
    cierre: a.quizas() ? 'atleta' : 'medida',
  });
  if (a.quizas(0.6)) p.posicion = posicionAzar(a);
  if (a.quizas(0.5)) p.nombre = a.elige(NOMBRES);
  if (a.quizas(0.25)) p.modoRecupera = a.elige(MODOS_RECUPERA);
  if (a.quizas(0.25)) p.entorno = a.elige(ENTORNOS);
  if (a.quizas(0.25)) p.carga = a.quizas() ? { kg: decimal(a, 1, 250, 2) } : { kg: decimal(a, 1, 60, 2), implementos: a.entero(1, 4) };
  if (a.quizas(0.2)) p.maquina = a.quizas() ? { tipo: a.elige(MAQUINAS), damper: a.entero(1, 10) } : { tipo: a.elige(MAQUINAS) };
  if (a.quizas(0.15)) p.tempo = { excentrica: a.entero(0, 6), pausaAbajo: a.entero(0, 3), concentrica: a.entero(0, 6), pausaArriba: a.entero(0, 3) };
  if (a.quizas(0.2)) p.cue = a.elige(CUES);
  if (a.quizas(0.15)) p.vueltaAutoM = a.elige([500, 1000, 2000]);
  if (a.quizas(0.8)) p.bloque = a.entero(0, 12);
  if (a.quizas(0.1)) p.roxzone = a.elige(ROXZONAS);
  if (a.quizas(0.25)) p.wod = wodAzar(a);
  if (a.quizas(0.25)) p.fuerza = fichaAzar(a, `x${a.entero(0, 9)}`);
  if (a.quizas(0.1)) p.dobles = { turno: a.elige(['tuyo', 'pareja', 'reparto'] as const), estacion: a.elige(NOMBRES), pctTuyo: a.entero(0, 100), ...(a.quizas() ? { pareja: 'Marta' } : {}), ...(a.quizas() ? { tuyas: a.entero(0, 50), suyas: a.entero(0, 50) } : {}), ...(a.quizas() ? { nota: 'alterna 25' } : {}) };
  return p;
}

/** Un plan válido al azar: 1–60 pasos, zonas de 3 a 9 (o ninguna) y las reglas por defecto tocadas. */
export function planAleatorio(semilla: number): PlanSesion {
  const a = generador(semilla);
  // Todo plan real tiene al menos un paso de trabajo (`hoyDe` del kit lo exige para titular la sesión).
  const pasos = Array.from({ length: a.entero(1, 60) }, (_, k) => (k === 0 ? { ...pasoAzar(a), rol: 'trabajo' as const } : pasoAzar(a)));
  const nz = a.entero(0, 9);
  const techos: number[] = [];
  for (let k = 0; k < nz; k++) techos.push((techos[k - 1] ?? 100) + a.entero(5, 20));
  const zonas: ZonasCoach | null = nz < 3 ? null : { techos, ...(a.quizas() ? { nombres: techos.map((_, k) => `Zona ${k + 1}`) } : {}) };
  return {
    pasos,
    zonas,
    reglas: { ...REGLAS_AVISO_DEFECTO, cadenciaS: a.entero(5, 60), avisarEnCalentamiento: a.quizas(), holgura: { ...REGLAS_AVISO_DEFECTO.holgura, ppm: a.entero(0, 9) } },
  };
}
