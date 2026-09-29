// De la SESIÓN asignada de correr al PLAN del reloj Garmin (fase 1: solo correr).
//
// El motor propio del reloj (docs/garmin-reloj/modelo.md) no lee un .FIT: lee un
// plan de PASOS (`PlanSesion`, shared/domain/watch-plan) y lo cumple con su propio
// motor. Este módulo hace el puente que faltaba: parte de la estructura de
// carrera del coach (`runStructureForSession`, la misma que ve la app y que sigue
// el .FIT) y la APLANA a `PasoBase[]`: calentamiento, principal y vuelta a la
// calma, con sus repeticiones y recuperaciones ya desplegadas.
//
// ES PURO: recibe el detalle, las zonas del atleta y el método del coach ya
// cargados. Quien los lee de la base es `garmin-plan-source.ts`.
//
// LO QUE NO ES CORRER NO SE DEGRADA (regla de honestidad de watch-workout.ts):
//   · una línea que no es de carrera (fuerza, EMOM, AMRAP, ergo, movilidad,
//     circuito) → `soportada:false, motivo:'fase_2'`. El reloj dice «Esta sesión
//     va en la app»; jamás una versión recortada que pierda reps, carga o rondas.
//   · una línea de carrera sin estructura válida → `motivo:'sin_estructura'`:
//     un tramo a medias en la muñeca es peor que no mandarlo.
//
// MECANISMO (aquí, en código) frente a MÉTODO (dato del coach, HARD RULE Nº0):
//   · aplanar, agrupar, posicionar y resolver una zona contra el atleta es
//     mecanismo.
//   · las reglas de aviso, el vocabulario, el método del resumen, la vuelta
//     automática y el sentido del aviso son método: entran por `MetodoCoachGarmin`
//     y, si no traen nada, se usan los defectos editables del kit.

import type { Element, Repeat, Segment, RecoveryMode } from '@fahybrid/shared/domain/prescription';
import { isRepeat } from '@fahybrid/shared/domain/prescription';
import {
  resolveSegmentTarget,
  type AthleteBenchmarks,
  type AthleteHrZones,
  type CoachZone,
  type HrZoneFractions,
} from '@fahybrid/shared/domain/methodology';
import {
  REGLAS_AVISO_DEFECTO,
  type Clase,
  type Entorno,
  type Fase,
  type MetodoReloj,
  type ModoRecupera,
  type Objetivo,
  type PasoBase,
  type PlanSesion,
  type ReglasAviso,
  type SentidoAviso,
  type Vocabulario,
  type ZonasCoach,
} from '@fahybrid/shared/domain/watch-plan';
import { MAX_OBJETIVOS } from '@fahybrid/shared/domain/watch-plan/plan-compacto';
import { collectRunStructures, isRunItem, runStructureForSession, type RunStructureSource } from './run-structure-source';

// ── Contrato de entrada ──────────────────────────────────────────────────────

/** El detalle de la asignación, en la forma mínima que hace falta (bloques → líneas). */
export type DetalleGarmin = RunStructureSource;

/**
 * Las zonas del atleta, ya cargadas. Los benchmarks, las zonas de ritmo del coach
 * y los cortes de pulso resuelven una `pace_zone` a banda absoluta; `pulso` son
 * las zonas de pulso que el atleta ve en la app (`GET /api/athlete/zones`).
 */
export interface ZonasAtletaGarmin {
  benchmarks: AthleteBenchmarks;
  coachZones: CoachZone[];
  hrZoneFractions?: HrZoneFractions;
  /** `null` = sin ancla de pulso: los tramos por zona de pulso van abiertos. */
  pulso: AthleteHrZones | null;
}

/**
 * El método del coach que el reloj necesita. TODO opcional: un coach que no toca
 * nada se comporta con los defectos del kit. Lo que traiga viaja EN el plan.
 */
export interface MetodoCoachGarmin {
  /** Reglas de aviso efectivas; sin ellas, `REGLAS_AVISO_DEFECTO`. */
  reglas?: ReglasAviso;
  vocabulario?: Vocabulario;
  metodo?: MetodoReloj;
  /** Vuelta automática de un rodaje continuo, en metros. Sin dato, un kilómetro. */
  vueltaAutoM?: number;
  /** Qué dirección avisa un objetivo, por clase de paso (P9). Sin dato, ambos sentidos. */
  sentidoAviso?: Partial<Record<Clase, SentidoAviso>>;
  /** Dónde corre. La prescripción no lo dice todavía: sin dato, calle. */
  entorno?: Entorno;
}

export type MotivoNoSoportada = 'fase_2' | 'sin_estructura';

export type ResultadoPlanGarmin =
  | { soportada: true; plan: PlanSesion; entorno: Entorno }
  | { soportada: false; motivo: MotivoNoSoportada };

// ── Constantes con nombre ────────────────────────────────────────────────────

/** Un kilómetro: la vuelta automática que se llama «Kilómetro» (paso.ts). */
const VUELTA_AUTO_DEFECTO_M = 1000;
const ENTORNO_DEFECTO: Entorno = 'calle';
const MODO_RECUPERA: Record<RecoveryMode, ModoRecupera> = { trote: 'trote', caminar: 'andar', parado: 'parado' };
const FASE_DE_ROL = { warmup: 'calentamiento', main: 'principal', cooldown: 'vuelta' } as const satisfies Record<string, Fase>;

// ── Un marco de repetición y el contexto del recorrido ───────────────────────

interface Marco {
  tipo: 'tanda' | 'serie';
  n: number;
  de: number;
  /** Identidad de la repetición y posición del hijo: dos tramos de trabajo de una misma repetición no son el mismo grupo. */
  repeticion: number;
}

interface Contexto {
  entorno: Entorno;
  metodo: MetodoCoachGarmin;
  zonas: ZonasAtletaGarmin;
  pasos: PasoBase[];
  bloque: number;
  idsRepeticion: Map<Repeat, number>;
  idsGrupo: Map<string, number>;
}

// ── Objetivos ────────────────────────────────────────────────────────────────

const redondo = (n: number | undefined): number | null => (n === undefined ? null : Math.round(n));

function banda(eje: Objetivo['eje'], min: number | null, max: number | null, papel: Objetivo['papel']): Objetivo | null {
  return min === null && max === null ? null : { eje, min, max, papel };
}

/** El objetivo principal del tramo, contra ESTE atleta. Sin dato que lo resuelva, ninguno: el tramo va abierto. */
function objetivoPrincipal(seg: Segment, ctx: Contexto): Objetivo | null {
  const t = seg.target;
  if (!t) return null;
  switch (t.type) {
    case 'pace':
      return banda('ritmo', redondo(t.min_s ?? t.value_s), redondo(t.max_s ?? t.value_s), 'principal');
    case 'rpe':
      return banda('rpe', t.min ?? t.value ?? null, t.max ?? t.value ?? null, 'principal');
    case 'hr_zone':
      // El reloj resuelve la zona contra `plan.zonas` (las bandas de pulso del atleta): una sola fuente.
      return ctx.zonas.pulso ? { eje: 'zona', min: t.zone, max: t.zone, papel: 'principal', escala: 'ppm' } : null;
    case 'pace_zone': {
      const r = resolveSegmentTarget(t, ctx.zonas.benchmarks, {
        coachZones: ctx.zonas.coachZones,
        ...(ctx.zonas.hrZoneFractions ? { hrZoneFractions: ctx.zonas.hrZoneFractions } : {}),
      });
      if (r?.target.kind !== 'pace') return null;
      return banda('ritmo', redondo(r.target.min_s ?? r.target.value_s), redondo(r.target.max_s ?? r.target.value_s), 'principal');
    }
  }
}

function objetivosDe(seg: Segment, clase: Clase, ctx: Contexto): Objetivo[] {
  const objetivos: Objetivo[] = [];
  const principal = objetivoPrincipal(seg, ctx);
  if (principal) {
    const avisa = ctx.metodo.sentidoAviso?.[clase];
    objetivos.push(avisa ? { ...principal, avisa } : principal);
  }
  // Las guías secundarias no desplazan al principal; entre ellas manda la inclinación (gobernable en cinta).
  if (seg.incline_pct !== undefined) objetivos.push({ eje: 'inclinacion', min: seg.incline_pct, max: seg.incline_pct, papel: 'secundario' });
  if (seg.cadence_spm !== undefined) objetivos.push({ eje: 'cadencia', min: seg.cadence_spm, max: seg.cadence_spm, papel: 'secundario' });
  return objetivos.slice(0, MAX_OBJETIVOS);
}

// ── Un tramo → un paso ───────────────────────────────────────────────────────

function claseDe(seg: Segment, fase: Fase, pila: Marco[], tras: Element | undefined): Clase {
  if (seg.kind === 'recovery') {
    // Lo que va tras una repetición interior y dentro de la exterior es el descanso entre tandas.
    return pila.at(-1)?.tipo === 'tanda' && tras !== undefined && isRepeat(tras) ? 'descanso-tandas' : 'recuperacion';
  }
  if (fase === 'calentamiento') return 'calentamiento';
  if (fase === 'vuelta') return 'vuelta-calma';
  return pila.length > 0 ? 'series' : 'rodaje';
}

/** El descanso entre tandas sin modo dicho es un descanso (nadie lo mide); una recuperación con modo es activa. */
function rolDe(seg: Segment, clase: Clase): PasoBase['rol'] {
  if (seg.kind === 'work') return 'trabajo';
  return clase === 'descanso-tandas' && !seg.recovery_mode ? 'descanso' : 'recuperacion';
}

function idGrupo(ctx: Contexto, marco: Marco, hijo: number): number {
  const clave = `${marco.repeticion}:${hijo}`;
  let id = ctx.idsGrupo.get(clave);
  if (id === undefined) {
    id = ctx.idsGrupo.size;
    ctx.idsGrupo.set(clave, id);
  }
  return id;
}

function emitirTramo(seg: Segment, fase: Fase, pila: Marco[], tras: Element | undefined, hijo: number, ctx: Contexto): void {
  const clase = claseDe(seg, fase, pila, tras);
  const paso: PasoBase = {
    id: String(ctx.pasos.length),
    clase,
    rol: rolDe(seg, clase),
    fase,
    medida:
      seg.measure.type === 'distance'
        ? { tipo: 'distancia', prescrito: seg.measure.m, mide: ctx.entorno === 'cinta' ? 'cinta' : 'gps' }
        : { tipo: 'tiempo', prescrito: seg.measure.s, mide: 'reloj' },
    objetivos: objetivosDe(seg, clase, ctx),
    entorno: ctx.entorno,
    cierre: 'medida',
    bloque: ctx.bloque,
  };
  if (seg.recovery_mode) paso.modoRecupera = MODO_RECUPERA[seg.recovery_mode];
  if (clase === 'rodaje') paso.vueltaAutoM = ctx.metodo.vueltaAutoM ?? VUELTA_AUTO_DEFECTO_M;
  if (seg.kind === 'work' && pila.length > 0) {
    // «Tanda 2/3 · Serie 4/6» sale de los marcos; el grupo, de la repetición más interior.
    const posicion: NonNullable<PasoBase['posicion']> = {};
    for (const m of pila) posicion[m.tipo] = { n: m.n, de: m.de };
    paso.posicion = posicion;
    const interior = pila[pila.length - 1]!;
    paso.grupo = { id: idGrupo(ctx, interior, hijo), veces: interior.de };
  }
  ctx.pasos.push(paso);
}

/**
 * Despliega un elemento del árbol. La última vuelta de una repetición no cierra
 * con su recuperación («6 × (800 m / r 2′30″)» son seis series y cinco descansos):
 * lo que sigue a la repetición (el descanso entre tandas, la vuelta a la calma) es
 * lo que separa, no una recuperación de más.
 */
function desplegar(el: Element, fase: Fase, pila: Marco[], tras: Element | undefined, hijo: number, ctx: Contexto): void {
  if (!isRepeat(el)) return emitirTramo(el, fase, pila, tras, hijo, ctx);
  let repeticion = ctx.idsRepeticion.get(el);
  if (repeticion === undefined) {
    repeticion = ctx.idsRepeticion.size;
    ctx.idsRepeticion.set(el, repeticion);
  }
  const tipo = el.elements.some(isRepeat) ? 'tanda' : 'serie';
  for (let n = 1; n <= el.times; n++) {
    const marco: Marco = { tipo, n, de: el.times, repeticion };
    el.elements.forEach((hijoEl, i) => {
      const ultimoDeLaUltima = n === el.times && i === el.elements.length - 1;
      if (ultimoDeLaUltima && !isRepeat(hijoEl) && hijoEl.kind === 'recovery') return;
      desplegar(hijoEl, fase, [...pila, marco], el.elements[i - 1], i, ctx);
    });
  }
}

// ── Zonas de pulso ───────────────────────────────────────────────────────────

/** Las zonas de pulso del atleta como las lee el reloj: el techo de cada zona, y de dónde salen. */
function zonasDePulso(pulso: AthleteHrZones | null): ZonasCoach | null {
  if (!pulso) return null;
  return {
    techos: pulso.bands.map((b) => b.max_bpm),
    // Solo se dice «medida» cuando un test la produjo; una cifra declarada o inferida es estimada (G6).
    procedencia: pulso.confidence === 'measured' ? 'medida' : 'estimada',
  };
}

// ── Entrada pública ──────────────────────────────────────────────────────────

/**
 * El plan del reloj de una sesión de correr, o por qué no puede llevarlo en la
 * fase 1. Puro y determinista: mismo detalle, mismas zonas y mismo método →
 * mismo plan (y por tanto misma huella).
 */
export function buildGarminPlan(
  detalle: DetalleGarmin | null,
  zonas: ZonasAtletaGarmin,
  metodo: MetodoCoachGarmin = {},
): ResultadoPlanGarmin {
  const items = detalle?.blocks.flatMap((b) => b.items) ?? [];
  if (items.length === 0) return { soportada: false, motivo: 'sin_estructura' };
  if (items.some((i) => !isRunItem(i))) return { soportada: false, motivo: 'fase_2' };
  // Toda línea de carrera tiene que dar estructura: una a medias no viaja.
  if (collectRunStructures(detalle).length !== items.length) return { soportada: false, motivo: 'sin_estructura' };
  const estructura = runStructureForSession(detalle);
  if (!estructura) return { soportada: false, motivo: 'sin_estructura' };

  const entorno = metodo.entorno ?? ENTORNO_DEFECTO;
  const ctx: Contexto = { entorno, metodo, zonas, pasos: [], bloque: 0, idsRepeticion: new Map(), idsGrupo: new Map() };
  for (const fase of estructura) {
    for (const el of fase.elements) {
      desplegar(el, FASE_DE_ROL[fase.role], [], undefined, 0, ctx);
      ctx.bloque += 1;
    }
  }

  const plan: PlanSesion = {
    pasos: ctx.pasos,
    zonas: zonasDePulso(zonas.pulso),
    reglas: metodo.reglas ?? REGLAS_AVISO_DEFECTO,
    ...(metodo.vocabulario ? { vocabulario: metodo.vocabulario } : {}),
    ...(metodo.metodo ? { metodo: metodo.metodo } : {}),
  };
  return { soportada: true, plan, entorno };
}
