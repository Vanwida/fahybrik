// TRADUCIR UN OBJETIVO RELATIVO AL NÚMERO DE ESTE ATLETA (card 130).
//
// La plantilla guarda «a peso de competición» para siempre. Aquí es donde esa
// frase se convierte en los kilos que le tocan a ESTA persona, y se hace AL
// LEER, nunca al guardar: si el número se congelara en la plantilla, la
// plantilla volvería a servir para un solo atleta y no habríamos arreglado nada.
//
// TRES REGLAS DE LA CASA QUE ESTE MÓDULO RESPETA
// ----------------------------------------------
// 1. `null` es una respuesta de primera clase. Un atleta sin test no tiene ritmo
//    de umbral, y la respuesta honesta es «todavía no lo sabemos», no un número
//    inventado ni un cero. Quien pinta enseña la frase y le lleva a hacer ESE
//    test.
// 2. Los KILOS de competición NO son nuestros. El reglamento es del deporte y
//    los kilos que un entrenador da por buenos son SU método: entran inyectados
//    (`stationLoad`), con el catálogo de estaciones como valor por defecto. Ese
//    catálogo devuelve `null` a propósito mientras no tenga fuente — un peso
//    inventado aquí es un atleta entrenando mal.
// 3. Nada se redondea a un número más bonito del que se sabe. Un porcentaje
//    produce decimales y se quedan en un decimal; no se «ajusta a discos»,
//    porque cuántos discos hay en esa sala no lo sabemos.

import type { HyroxStationLoad, HyroxStationSlug } from '../hyrox/stations';
import { hyroxStationLoad } from '../hyrox/stations';
import type { AthleteBenchmarks } from '../methodology/zones';
import { deriveModalityThresholds, resolveTarget } from '../methodology/zones';
import { isMeasuredZoneProfile } from '../methodology/zone-onboarding';
import type { RaceDivision, RaceGender } from '../../schema/races';
import type { AthleteZoneProfile } from '../../schema/methodology-system';
import {
  referencePhrase,
  relativePhrase,
  type ReferenceModality,
  type TargetReference,
} from './reference';
import type { PaceUnit, Prescription, Target } from './types';

// La frase vive en `./reference.ts` (que no importa `./types`, para que no haya
// ciclo) y se reexporta aquí, que es donde la busca quien resuelve.
export { relativePhrase } from './reference';

/** El objetivo relativo, extraído de la unión para poder tiparlo aquí. */
export type RelativeTarget = Extract<Target, { kind: 'relative' }>;

/** Un ritmo ya resuelto: los segundos y de qué marca salieron. */
export interface PaceAnchor {
  seconds: number;
  unit: PaceUnit;
  source: string;
  estimated: boolean;
}

/**
 * LAS ANCLAS DEL ATLETA — lo único que este módulo necesita saber de él.
 *
 * POR QUÉ ANCLAS Y NO «SUS MARCAS». Hay DOS fuentes de umbral en el sistema y
 * no dan siempre lo mismo: `athlete_zone_profiles` es el snapshot versionado
 * que el día del atleta ya usa para pintar sus bandas de zona, y las marcas
 * crudas (`athlete_benchmarks`) son de donde ese snapshot se calculó en su día.
 * Si esto leyera las marcas crudas, la misma pantalla podría enseñar un «ritmo
 * de umbral» que no cuadra con la banda Z4 dibujada al lado — el desajuste que
 * el snapshot existe justamente para evitar.
 *
 * Así que el resolutor no elige fuente: recibe las anclas ya resueltas, y cada
 * llamante usa la suya con su adaptador (`anchorsFromBenchmarks` aquí abajo;
 * el camino del día pasa el snapshot). Una sola verdad por pantalla.
 */
export interface AthleteAnchors {
  /** Su ritmo de competición, por modalidad. */
  racePace: Partial<Record<ReferenceModality, PaceAnchor>>;
  /** Su ritmo de umbral, por modalidad. */
  thresholdPace: Partial<Record<ReferenceModality, PaceAnchor>>;
  /** Su peso, para las referencias al peso corporal. */
  bodyweightKg?: number | null;
  /**
   * Los kilos de competición POR ESTACIÓN, YA resueltos a la división y el
   * género con los que compite. Método del entrenador, inyectable: el catálogo
   * de estaciones es el defecto y hoy contesta `null` a todo, a propósito,
   * porque sus cargas se retiraron por falta de fuente fiable.
   *
   * Devuelve `null` también cuando no se sabe con qué división compite — que en
   * este sistema NO es un atributo del atleta sino de su carrera objetivo, y un
   * atleta sin carrera objetivo no tiene peso de competición que valga.
   */
  competitionLoad?: (slug: HyroxStationSlug) => HyroxStationLoad | null;
}

/**
 * La resolución de `competitionLoad` es la MISMA para cualquier adaptador: sin
 * división o sin género no hay peso de competición que valga (el mismo trineo
 * pesa distinto en Open y en Pro) — preferimos no contestar antes que adivinar.
 * Se extrae aquí porque `anchorsFromBenchmarks` y `anchorsFromZoneProfiles`
 * (abajo) la necesitan idéntica.
 */
function competitionLoadResolver(extra: {
  division?: RaceDivision | null;
  gender?: RaceGender | null;
  stationLoad?: (
    slug: HyroxStationSlug,
    division: RaceDivision,
    gender: RaceGender,
  ) => HyroxStationLoad | null;
}): NonNullable<AthleteAnchors['competitionLoad']> {
  const { division, gender, stationLoad } = extra;
  const lookup = stationLoad ?? hyroxStationLoad;
  return division && gender ? (slug) => lookup(slug, division, gender) : () => null;
}

/**
 * El ritmo de CARRERA (el objetivo de los 8 km repartido) a partir de las
 * marcas crudas. Sólo correr lo tiene hoy: para remo y ski el atleta no guarda
 * un objetivo por estación — se puede DECIR y aún no se puede traducir, y eso
 * se contesta con la verdad (`null`).
 *
 * Exportada aparte de `anchorsFromBenchmarks` porque el camino del día
 * (`assignment-detail.ts`) la necesita SUELTA: su umbral sale del snapshot de
 * zonas (`anchorsFromZoneProfiles`, no de las marcas), pero el ritmo de
 * carrera no vive en ese snapshot y hay que resolverlo aparte igualmente.
 */
export function racePaceAnchor(benchmarks: AthleteBenchmarks): PaceAnchor | null {
  const race = resolveTarget('race pace', benchmarks);
  if (!race || race.target.kind !== 'pace') return null;
  const t = race.target;
  const seconds = t.value_s ?? t.min_s ?? t.max_s;
  if (seconds === undefined) return null;
  return { seconds, unit: t.unit, source: race.source, estimated: race.estimated };
}

/**
 * Anclas a partir de las marcas crudas. Lo usan quien NO tiene el snapshot de
 * zonas delante: la exportación a relojes de fabricante y las pruebas.
 */
export function anchorsFromBenchmarks(
  benchmarks: AthleteBenchmarks,
  extra: {
    bodyweightKg?: number | null;
    division?: RaceDivision | null;
    gender?: RaceGender | null;
    stationLoad?: (
      slug: HyroxStationSlug,
      division: RaceDivision,
      gender: RaceGender,
    ) => HyroxStationLoad | null;
  } = {},
): AthleteAnchors {
  const racePace: AthleteAnchors['racePace'] = {};
  const race = racePaceAnchor(benchmarks);
  if (race) racePace.run = race;

  const thresholdPace: AthleteAnchors['thresholdPace'] = {};
  for (const th of deriveModalityThresholds(benchmarks)) {
    // Un 5 km + offset no es un umbral. Solo viaja la marca medida.
    if (th.estimated) continue;
    thresholdPace[th.modality] = {
      seconds: Math.round(th.threshold_s),
      unit: th.pace_unit === 'per_km' ? 'per_km' : 'per_500m',
      source: th.source,
      estimated: false,
    };
  }

  return {
    racePace,
    thresholdPace,
    bodyweightKg: extra.bodyweightKg ?? null,
    competitionLoad: competitionLoadResolver(extra),
  };
}

/**
 * Anclas a partir del snapshot YA RESUELTO de `athlete_zone_profiles` — lo usa
 * el camino del día del atleta (`web/lib/athlete/assignment-detail.ts`), que ya
 * carga ese snapshot para pintar las bandas de zona y NO debe recalcular el
 * umbral desde las marcas crudas por su cuenta (ver el porqué en `AthleteAnchors`
 * arriba: dos fuentes de umbral que pueden no coincidir).
 *
 * El ritmo de CARRERA no vive en el snapshot de zonas (ese sólo guarda umbral),
 * así que viaja aparte — ya resuelto por el llamador (`resolveTarget('race
 * pace', benchmarks)`) — y sólo aplica a correr, igual que en
 * `anchorsFromBenchmarks`.
 */
export function anchorsFromZoneProfiles(
  profiles: AthleteZoneProfile[],
  extra: {
    racePace?: PaceAnchor | null;
    bodyweightKg?: number | null;
    division?: RaceDivision | null;
    gender?: RaceGender | null;
    stationLoad?: (
      slug: HyroxStationSlug,
      division: RaceDivision,
      gender: RaceGender,
    ) => HyroxStationLoad | null;
  } = {},
): AthleteAnchors {
  const thresholdPace: AthleteAnchors['thresholdPace'] = {};
  for (const p of profiles) {
    // El alta deriva bandas de un 5 km. Eso no se manda como ritmo de umbral.
    if (!isMeasuredZoneProfile(p.source, p.needs_review)) continue;
    thresholdPace[p.modality] = {
      seconds: p.threshold_s,
      unit: p.pace_unit,
      source: p.source_test_slug ?? p.source,
      estimated: false,
    };
  }

  const racePace: AthleteAnchors['racePace'] = {};
  if (extra.racePace) racePace.run = extra.racePace;

  return {
    racePace,
    thresholdPace,
    bodyweightKg: extra.bodyweightKg ?? null,
    competitionLoad: competitionLoadResolver(extra),
  };
}

export interface ResolvedRelative {
  /** El objetivo ya absoluto: lo que se manda al móvil en el campo de siempre. */
  target: Target;
  /** El porqué, en el idioma del atleta: «a peso de competición». */
  phrase: string;
  /** De qué marca salió (auditoría). */
  source: string;
  /** true cuando hubo que estimar en vez de leer una marca directa. */
  estimated: boolean;
}

/** Redondeo a un decimal. Ni más precisión de la que hay, ni menos. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Los kilos base de una referencia de carga, y cuántos implementos son. */
function loadBase(
  ref: TargetReference,
  anchors: AthleteAnchors,
): { kg: number; implements?: number; source: string } | null {
  if (ref.of === 'bodyweight') {
    const bw = anchors.bodyweightKg;
    if (bw == null || bw <= 0) return null;
    return { kg: bw, source: 'bodyweight' };
  }
  if (ref.of !== 'competition_load') return null;
  const load = anchors.competitionLoad?.(ref.station) ?? null;
  if (!load) return null;
  switch (load.kind) {
    case 'single':
    case 'sled':
      return { kg: load.kg, source: `competition_load:${ref.station}` };
    case 'per_implement':
      return { kg: load.kg, implements: load.implements, source: `competition_load:${ref.station}` };
    case 'damper':
      // El damper de un ergómetro es un ajuste de resistencia, no una carga:
      // no hay kilos que devolver y fingir que los hay sería mentir.
      return null;
    default:
      return null;
  }
}

/** El ritmo de una referencia de ritmo, leído del ancla que traiga el llamante. */
function paceTarget(ref: TargetReference, anchors: AthleteAnchors): ResolvedRelative | null {
  const anchor =
    ref.of === 'race_pace'
      ? anchors.racePace[ref.modality]
      : ref.of === 'threshold_pace'
        ? anchors.thresholdPace[ref.modality]
        : undefined;
  if (!anchor) return null;
  return {
    target: { kind: 'pace', unit: anchor.unit, value_s: anchor.seconds },
    phrase: referencePhrase(ref),
    source: anchor.source,
    estimated: anchor.estimated,
  };
}

/**
 * El objetivo relativo → el objetivo absoluto de ESTE atleta, o `null` si le
 * falta la marca. Pura: no toca base de datos ni reloj.
 */
export function resolveRelativeTarget(t: RelativeTarget, anchors: AthleteAnchors): ResolvedRelative | null {
  const paced = paceTarget(t.ref, anchors);
  if (paced) return paced;
  // Una referencia de ritmo que no resuelve NO cae al camino de la carga: son
  // cosas distintas y devolver kilos ahí sería absurdo.
  if (t.ref.of === 'race_pace' || t.ref.of === 'threshold_pace') return null;

  const base = loadBase(t.ref, anchors);
  if (!base) return null;

  let lo = base.kg;
  let hi: number | undefined;
  if (t.percent !== undefined) {
    lo = (base.kg * t.percent) / 100;
    if (t.percent_max !== undefined) hi = (base.kg * t.percent_max) / 100;
  } else if (t.delta_kg !== undefined) {
    lo = base.kg + t.delta_kg;
    if (t.delta_kg_max !== undefined) hi = base.kg + t.delta_kg_max;
  }
  // Un delta grande hacia abajo puede cruzar el cero. Cero kilos es el suelo
  // real; no existe carga negativa.
  lo = Math.max(0, round1(lo));
  if (hi !== undefined) hi = Math.max(0, round1(hi));

  const target: Target =
    hi !== undefined && hi > lo
      ? { kind: 'kg', min: lo, max: hi, ...(base.implements ? { implement_count: base.implements } : {}) }
      : { kind: 'kg', value: lo, ...(base.implements ? { implement_count: base.implements } : {}) };

  return { target, phrase: relativePhrase(t), source: base.source, estimated: false };
}

// ── Resolver una prescripción entera ────────────────────────────────────────

/** Un objetivo relativo ya traducido, listo para viajar junto a la línea. */
export interface ResolvedReference {
  /** El porqué, en el idioma del atleta: «a peso de competición». */
  phrase: string;
  /** El valor ya resuelto, o null cuando le falta la marca. */
  target: Target | null;
  /** De qué marca salió. Vacío cuando no resolvió. */
  source: string | null;
  /** true cuando hubo que estimar en vez de leer una marca directa. */
  estimated: boolean;
}

export interface ResolvedPrescription {
  /**
   * La prescripción tal y como viaja al móvil: cada objetivo relativo ya
   * SUSTITUIDO por su número absoluto.
   *
   * POR QUÉ SE SUSTITUYE Y NO SE MANDA LA FRASE CRUDA: la app ya instalada
   * convierte un tipo de objetivo que no conoce en «nada» y pintaría la línea
   * SIN objetivo, sin avisar. Mandando el número en el campo de siempre, una
   * versión vieja sigue funcionando igual que cualquier otro día, y una nueva
   * añade el porqué leyendo `references`. La frase original no se pierde: vive
   * en el plan, que es el registro; el cable es solo una vista.
   *
   * Un relativo que NO resuelve se queda SIN objetivo en el cable, a propósito:
   * es la verdad («todavía no lo sabemos»), y su frase sigue viajando en
   * `references` para que la pantalla pueda decir qué falta.
   */
  prescription: Prescription;
  /** Las frases de esta línea, en el orden en que aparecen. Vacío si no había. */
  references: ResolvedReference[];
}

/** Traduce un objetivo si es relativo; lo devuelve tal cual si no lo es. */
function swap(
  t: Target | undefined,
  anchors: AthleteAnchors,
  out: ResolvedReference[],
): Target | undefined {
  if (!t || t.kind !== 'relative') return t;
  const r = resolveRelativeTarget(t, anchors);
  out.push({
    phrase: relativePhrase(t),
    target: r?.target ?? null,
    source: r?.source ?? null,
    estimated: r?.estimated ?? false,
  });
  return r?.target;
}

/**
 * Recorre una prescripción y cambia cada objetivo relativo por el número de
 * ESTE atleta. Mira el objetivo del bloque y el de cada serie, que es donde
 * pueden vivir. Pura: ni base de datos ni fechas.
 *
 * Idempotente sobre una prescripción sin relativos: devuelve la MISMA
 * referencia de objeto y `references` vacío, para que el camino del día no
 * pague nada cuando no hay nada que resolver — que hoy es siempre.
 */
/** ¿Lleva esta línea algún objetivo relativo (bloque o alguna serie)? */
export function prescriptionHasRelativeTarget(p: Prescription | null | undefined): boolean {
  if (!p) return false;
  if (p.target?.kind === 'relative') return true;
  return p.sets?.some((s) => s.target?.kind === 'relative') ?? false;
}

export function resolvePrescriptionReferences(
  p: Prescription,
  anchors: AthleteAnchors,
): ResolvedPrescription {
  if (!prescriptionHasRelativeTarget(p)) return { prescription: p, references: [] };

  const references: ResolvedReference[] = [];
  const target = swap(p.target, anchors, references);
  const sets = p.sets?.map((s) => {
    if (s.target?.kind !== 'relative') return s;
    const resolved = swap(s.target, anchors, references);
    // Sin objetivo resuelto la serie se queda sin él, no con uno inventado.
    const { target: _drop, ...rest } = s;
    return resolved ? { ...rest, target: resolved } : rest;
  });

  const { target: _dropBlock, ...restP } = p;
  const next: Prescription = {
    ...restP,
    ...(target ? { target } : {}),
    ...(sets ? { sets } : {}),
  };
  return { prescription: next, references };
}
