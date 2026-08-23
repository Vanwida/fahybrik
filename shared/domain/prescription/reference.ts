// LA REFERENCIA DE UN OBJETIVO — «relativo a algo que este atleta ya tiene».
//
// POR QUÉ EXISTE (card 130)
// -------------------------
// Un entrenador casi nunca escribe un número. Escribe «a ritmo HYROX», «a peso
// de competición», «5 kg por encima del peso de competición», «al 50 % del peso
// corporal». Hasta ahora `Target` sólo sabía decir cifras absolutas más un único
// caso relativo (el % del máximo en fuerza), así que una plantilla con kilos
// concretos no servía para el atleta siguiente y un ciclo había que reescribirlo
// entero por persona. Eso es justo lo contrario de lo que necesita un producto
// que se vende a más de un entrenador.
//
// En un macrociclo real de 12 semanas son más de 130 líneas, y es un criterio
// EXPLÍCITO del entrenador: «sin kilos concretos en las plantillas: porcentajes,
// RIR o referencia a peso de competición».
//
// QUÉ NO ESTÁ AQUÍ, Y ES A PROPÓSITO
// ----------------------------------
//  · El % del máximo (`percent_rm`) ya tiene su sitio en `Target` y se queda
//    donde está: funciona, el iOS instalado lo decodifica y el importador lo
//    lee. No se añade una segunda manera de decir lo mismo.
//  · El peso corporal a secas (`{kind:'bodyweight'}`) también tiene su sitio y
//    significa otra cosa: «tu propio peso como resistencia». Por eso la
//    referencia `bodyweight` de aquí EXIGE un porcentaje — «medio peso corporal
//    en la barra» es una frase distinta de «una dominada».
//  · Cargas cualitativas («carga media», «ligera», «pesada»): NO son un objetivo,
//    son una palabra de ese entrenador. Tiparlas dejaría el dato ambiguo para
//    siempre. Van al diccionario del entrenador — se le pregunta UNA vez qué
//    significa «carga media» y desde entonces se traduce sola a esta referencia
//    con su porcentaje.
//  · La marca de un test cualquiera del catálogo del coach y el «% del esfuerzo
//    máximo» quedan fuera de esta primera pieza: la primera necesita saber qué
//    métrica produce cada test y la segunda aparece UNA vez en 1.238 líneas
//    (card 133: una forma entra al vocabulario si sale en más de un entrenador o
//    muchas veces en uno; si no, es dialecto). Anunciar una referencia que el
//    resolutor no sabe traducir sería peor que no tenerla.

import { z } from 'zod';
import { resolveHyroxStationBySlug, type HyroxStationSlug } from '../hyrox/stations';

/** Las modalidades que tienen ritmo. El resto no puede anclar a un ritmo. */
export type ReferenceModality = 'run' | 'row' | 'ski' | 'bike';

export const referenceModalitySchema = z.enum(['run', 'row', 'ski', 'bike']);

/**
 * Contra qué se mide un objetivo relativo. Cada una es algo que el ATLETA posee
 * de verdad, no un adjetivo: o sale de un test suyo, o de su cuerpo, o del
 * reglamento de su carrera.
 */
export type TargetReference =
  /** Su ritmo de competición. «1.000 m Run a ritmo HYROX». */
  | { of: 'race_pace'; modality: ReferenceModality }
  /** Su ritmo de umbral, el que sale del test. Ancla de todas las zonas. */
  | { of: 'threshold_pace'; modality: ReferenceModality }
  /** El peso de esa estación en SU división y género. «Sled push a peso de competición». */
  | { of: 'competition_load'; station: HyroxStationSlug }
  /** Una fracción de su peso corporal. «al 50 % del peso corporal». */
  | { of: 'bodyweight' };

export type TargetReferenceKind = TargetReference['of'];

/** Las referencias que apuntan a un RITMO (segundos por unidad de distancia). */
export const PACE_REFERENCES = ['race_pace', 'threshold_pace'] as const;

/** Las referencias que apuntan a una CARGA (kilos). */
export const LOAD_REFERENCES = ['competition_load', 'bodyweight'] as const;

export function referenceIsPace(ref: TargetReference): boolean {
  return (PACE_REFERENCES as readonly string[]).includes(ref.of);
}

export function referenceIsLoad(ref: TargetReference): boolean {
  return (LOAD_REFERENCES as readonly string[]).includes(ref.of);
}

// El slug de estación se valida contra el catálogo REAL de estaciones
// (`hyrox/stations.ts`, que es su dueño único) en vez de repetir aquí la lista:
// el reglamento se revisa y una copia se queda vieja en silencio. La
// dependencia sólo va en este sentido — `stations.ts` importa de
// `prescription/types` en modo SOLO TIPO, así que no hay ciclo en ejecución.
export const targetReferenceSchema: z.ZodType<TargetReference> = z.discriminatedUnion('of', [
  z.object({ of: z.literal('race_pace'), modality: referenceModalitySchema }).strict(),
  z.object({ of: z.literal('threshold_pace'), modality: referenceModalitySchema }).strict(),
  z
    .object({
      of: z.literal('competition_load'),
      station: z.string().refine((s) => resolveHyroxStationBySlug(s as HyroxStationSlug) != null, {
        message: 'unknown hyrox station slug',
      }) as unknown as z.ZodType<HyroxStationSlug>,
    })
    .strict(),
  z.object({ of: z.literal('bodyweight') }).strict(),
]) as unknown as z.ZodType<TargetReference>;

/**
 * Cómo se LEE la referencia sola, en el idioma del atleta. Viaja junto al número
 * ya resuelto para que sepa POR QUÉ le tocan esos kilos o ese ritmo — un número
 * sin motivo es un número que no se cuestiona ni se ajusta.
 */
export function referencePhrase(ref: TargetReference): string {
  switch (ref.of) {
    case 'race_pace':
      return 'a ritmo de carrera';
    case 'threshold_pace':
      return 'a ritmo de umbral';
    case 'competition_load':
      return 'a peso de competición';
    case 'bodyweight':
      return 'del peso corporal';
  }
}

/** La forma mínima que necesita la frase. Estructural a propósito: así este
 *  módulo no importa `./types`, que es quien importa a este — y no hay ciclo. */
export interface RelativeShape {
  ref: TargetReference;
  percent?: number;
  percent_max?: number;
  delta_kg?: number;
  delta_kg_max?: number;
}

/**
 * El objetivo relativo ENTERO leído en voz alta, con su porcentaje o su delta:
 * «a peso de competición», «al 50 % del peso corporal», «5-10 kg por encima del
 * peso de competición». Es lo que ve el atleta mientras le falte la marca, y lo
 * que acompaña al número cuando la tiene.
 */
export function relativePhrase(t: RelativeShape): string {
  const base = referencePhrase(t.ref);
  const deLa = base.replace(/^a /, 'del ');
  if (t.percent !== undefined) {
    const pct = t.percent_max !== undefined ? `${t.percent}-${t.percent_max} %` : `${t.percent} %`;
    // El peso corporal ya se lee «del peso corporal»; el resto hay que girarlo.
    return `al ${pct} ${t.ref.of === 'bodyweight' ? base : deLa}`;
  }
  if (t.delta_kg !== undefined) {
    const hi = t.delta_kg_max;
    const amount = hi !== undefined ? `${Math.abs(t.delta_kg)}-${Math.abs(hi)} kg` : `${Math.abs(t.delta_kg)} kg`;
    return `${amount} ${t.delta_kg < 0 ? 'por debajo' : 'por encima'} ${deLa}`;
  }
  return base;
}
