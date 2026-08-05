/**
 * E2E de la cadena de importación por FOTO, contra el contenido REAL de una
 * captura enviada por el cliente (no un caso inventado).
 *
 * FUENTE DE VERDAD: `fixtures/screenshot-semana12-lectura-literal.json` —
 * transcripción literal, verbatim, de una captura real de TrainingPeaks (vista
 * calendario semanal, 7 días). NO se edita.
 *
 * `fixtures/screenshot-semana12-vision-payload.json` es la MISMA información,
 * traducida a mano al contrato que `readWeekVision` espera del modelo de
 * visión (`{weeks:[{days:[{day_of_week,cards:[...]}]}]}`). Es una TRADUCCIÓN,
 * no una copia — estas son las decisiones de traducción, para que se puedan
 * auditar contra el literal:
 *   · `dia` 3..9 del literal → `day_of_week` 1..7 (lunes..domingo), POSICIONAL:
 *     7 columnas seguidas en el orden estándar de TrainingPeaks. El literal no
 *     trae nombres de día, así que esto es una asunción declarada, no un hecho
 *     leído — si el mapeo real difiriera, solo cambiaría A QUÉ DÍA cae cada
 *     tarjeta, nunca lo que se puede o no tipar de su contenido.
 *   · `tipo_ui` → `kind`: nota→note, metricas→metrics, descanso→rest, el
 *     resto→workout. `tipo_ui` → `modality_hint`: strength→strength,
 *     running→run, ergo_remo→row (el icono, aunque el contenido sea carrera —
 *     "el icono miente", ver el propio literal), bici→bike.
 *   · Una tarjeta de solo `ejercicios:[{marca,nombre}]` (sin cuerpo con dosis)
 *     se transcribe UNA línea por ejercicio, "`marca`) `nombre`" — así es como
 *     se ve una tarjeta de lista de ejercicios de TrainingPeaks, y así la
 *     gramática ve un GROUP LABEL (A1, B…) delante de un nombre sin dosis.
 *   · `contadores` ("21 Sets 7 Exercises") y `resto_oculto` tipo "N More" se
 *     transcriben como su propia línea/como `hidden_count`, tal cual las
 *     vería el modelo.
 *   · `planificado.texto`/`.extra` (contenido EN PROSA con la dosis, o un
 *     enlace) se añade a `lines` — es contenido PLANIFICADO, nunca resultado.
 *   · Nada de `totales`/`social` (eso es REALIZADO) entra en `lines`; va a
 *     `performed` cuando existe, o se omite.
 *
 * QUÉ HACE ESTE TEST: corre la cadena completa que ya existe — `readWeekVision`
 * (modelo de visión SIMULADO vía `fetchImpl`, exactamente como
 * `vision-reader.test.ts`) → `buildImportProposal`, que YA integra gramática +
 * resolutor de ejercicios + `fillMissingWithDefaults` internamente (huecos
 * rellenados con los defaults DEL SISTEMA) — y PIN-EA, con aserciones, el
 * estado REAL observado al ejecutarla contra esta captura. Cada número de
 * este fichero salió de CORRER el código, no de calcularlo a mano.
 *
 * DOS PIEZAS SE MOCKEAN (nada de DB), tal y como se pidió:
 *
 *   1) `resolveExercise`, y de una forma DELIBERADAMENTE PESIMISTA y
 *      declarada: solo se deja resolver por la capa 2 (`GLOBAL_ALIASES` +
 *      `normalizeTerm`, el mapa y la normalización REALES, importados del
 *      módulo real — no reescritos). El escaneo de ventanas de palabras
 *      (`aliasToSlug`, privada, no exportada) SÍ se reimplementa a mano —
 *      espejo exacto de la función real, paréntesis incluidos (ver
 *      `aliasSlugFor` más abajo, con el porqué). Las capas 1 (sinónimo
 *      aprendido del coach) y 3/4 (nombre exacto/substring contra SU
 *      catálogo) se simulan siempre en MISS, porque este test no tiene
 *      manera honesta de saber qué contiene el catálogo real de un coach sin
 *      consultar la base de datos — y consultarla en cada corrida no es lo
 *      que se pidió aquí. Esto es un SUELO, no el número de producción — pero
 *      verificado UNA vez, a mano, contra el catálogo REAL (79 ejercicios,
 *      psql): ningún nombre real de esta captura que siga sin resolver tiene
 *      equivalente bajo otro nombre; el hueco es cobertura del catálogo
 *      (movilidad/activación: 7 de 79), no una traducción perdida. Ver la
 *      nota al final del fichero.
 *
 *   2) `resolveImportDefaults`, a los defaults DEL SISTEMA
 *      (`DEFAULT_IMPORT_DEFAULTS`) — el coach de la demo, recién llegado, no
 *      ha tocado esa pantalla todavía.
 */
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWeekVision } from '@/lib/import/vision-reader';
import { buildImportProposal, type ProposalDay } from '@/lib/import/build-proposal';
import { DEFAULT_IMPORT_DEFAULTS } from '@fahybrid/shared/domain/coach-import-defaults';
import {
  checkPrescriptionCompleteness,
  isExecutable,
  type Modality,
} from '@fahybrid/shared/domain/prescription';
import { GLOBAL_ALIASES, normalizeTerm } from '@/lib/import/exercise-resolve';

// ── (1) El resolutor de ejercicios, mockeado (ver el porqué en la cabecera) ─
// Espejo de `aliasToSlug` (privada, no exportada, exercise-resolve.ts). El
// paréntesis se strippea ANTES de partir en palabras — igual que la función
// real tras el arreglo del 2026-08-05 ("Dominada (lastrada)" perdía el
// calificador en silencio porque el paréntesis rompía la ventana de 2
// palabras). Si esta copia diverge de la real, el propio commit que la
// cambie debe tocar esta también — es el precio de no poder importar una
// función privada.
function aliasSlugFor(term: string): string | null {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  const exact = GLOBAL_ALIASES[normalized];
  if (exact) return exact;
  const words = normalized
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const slug = GLOBAL_ALIASES[words.slice(i, i + len).join(' ')];
      if (slug) return slug;
    }
  }
  return null;
}

// Ground truth of the REAL base catalog (`select slug from exercises where
// coach_id is null order by slug`, vía psql, 2026-08-05 — 79 filas, ANTES de
// la migración 0152). El mock de abajo asumía, sin comprobarlo, que TODA
// entrada de GLOBAL_ALIASES apunta a una fila que YA existe — cierto siempre
// hasta que 0152 escribió alias "adelantados" (p.ej. "single leg glute
// bridge" → `single-leg-glute-bridge`) para filas que NO existen todavía
// (0152 está escrita pero NO aplicada — pendiente del visto bueno del
// cliente). Sin este filtro, el suelo pesimista dejaba de serlo: un alias
// que resuelve a un slug sin fila real se contaba como "resuelto" aquí
// aunque el `resolveExercise` REAL (que sí consulta `exercises`) seguiría
// fallando hoy mismo en producción. Se re-verifica a mano cuando cambie el
// catálogo base — mismo compromiso que ya pesa sobre `aliasSlugFor` arriba.
const KNOWN_CATALOG_SLUGS = new Set([
  'ab-wheel', 'air-squat', 'assault-bike', 'atlas-stone-shoulder', 'back-squat',
  'barbell-row', 'bench-press', 'bike-erg', 'box-jump', 'box-step-up',
  'broad-jump', 'bulgarian-split-squat', 'burpee', 'cable-fly', 'clean-and-jerk',
  'deadlift', 'depth-jump', 'devil-press', 'dip', 'double-under',
  'dumbbell-snatch', 'foam-roll-lower-15min', 'front-squat', 'goblet-squat',
  'hang-power-clean', 'hanging-knee-raise', 'hip-thrust', 'hollow-hold',
  'hyrox-burpee-broad-jump', 'hyrox-farmer-carry', 'hyrox-sandbag-lunges',
  'hyrox-sled-pull', 'hyrox-sled-push', 'hyrox-wall-balls', 'jump-squat',
  'kb-clean', 'kb-swing', 'lateral-raise', 'leg-swings',
  'mobility-hip-flow-15min', 'overhead-press', 'pendlay-row', 'pistol-squat',
  'plank', 'power-clean', 'prehab-shoulder-banded-15min', 'pull-up',
  'push-press', 'push-up', 'reverse-lunge', 'romanian-deadlift', 'row', 'run',
  'run-technique-drills', 'russian-twist', 'sandbag-clean', 'side-plank',
  'single-leg-rdl', 'sit-up', 'ski-erg', 'sled-drag-backwards', 'snatch',
  'thoracic-rotation', 'thruster', 'toes-to-bar', 'turkish-get-up',
  'w23-dead-bug', 'w23-kb-overhead-walking-lunge', 'w23-nordic-curl',
  'w6-breathing-work', 'w6-high-box-jump', 'w6-sit-up-shoot',
  'w7-prehab-preventatives', 'w9-burpee-to-plate', 'walk', 'walking-lunge',
  'weighted-dip', 'weighted-pullup', 'zercher-squat-jump',
]);

vi.mock('@/lib/import/exercise-resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import/exercise-resolve')>();
  return {
    ...actual,
    resolveExercise: async (_coachId: number, term: string) => {
      const slug = aliasSlugFor(term);
      if (slug && KNOWN_CATALOG_SLUGS.has(slug)) return { exercise_id: 1, via: 'alias' as const };
      return { exercise_id: null, normalized: normalizeTerm(term) };
    },
  };
});

// ── (2) Los defaults de importación del coach, mockeados a los del sistema ──
vi.mock('@/lib/coach/import-defaults', () => ({
  resolveImportDefaults: async () => DEFAULT_IMPORT_DEFAULTS,
}));

// ── El modelo de visión, simulado — mismo patrón que vision-reader.test.ts ──
function llmReply(payload: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function fakeModel(payload: unknown): typeof fetch {
  return (async () => llmReply(payload)) as unknown as typeof fetch;
}

const VISION_PAYLOAD = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'screenshot-semana12-vision-payload.json'), 'utf-8'),
) as unknown;

const IMAGE = { image_base64: 'Zm90bw==', mime_type: 'image/png' };

let savedModel: string | undefined;
let savedKey: string | undefined;
beforeAll(() => {
  savedModel = process.env.LLM_VISION_MODEL;
  savedKey = process.env.LLM_API_KEY;
  process.env.LLM_VISION_MODEL = 'test/vision-model';
  process.env.LLM_API_KEY = 'test-key';
});
afterAll(() => {
  if (savedModel === undefined) delete process.env.LLM_VISION_MODEL;
  else process.env.LLM_VISION_MODEL = savedModel;
  if (savedKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = savedKey;
});

/** `resolveExercise`/`resolveImportDefaults` están mockeados: el id es un
 *  marcador, nunca se usa para consultar nada real. */
const COACH_ID = 999;

interface BlockOutcome {
  day_of_week: number;
  block_title: string;
  item_count: number;
  detected_item_count: number;
  incomplete_item_count: number;
  review_item_count: number;
  unresolved_item_count: number;
  unresolved_tokens: string[];
  executable: boolean;
  filled_field_count: number;
  truncated: boolean;
}

/** Corre la cadena completa y devuelve un resumen por BLOQUE — cada bloque es
 *  una tarjeta de entreno (build-proposal emite un EditorBlock por card). El
 *  estado que se lee es el FINAL (tras el relleno de defaults, ya integrado en
 *  buildImportProposal): es lo que el coach vería en la rejilla de revisión. */
async function runFullChain(): Promise<{ days: ProposalDay[]; outcomes: BlockOutcome[] }> {
  const { weeks } = await readWeekVision({ images: [IMAGE], fetchImpl: fakeModel(VISION_PAYLOAD) });
  const proposal = await buildImportProposal({ coach_id: COACH_ID, weeks });

  const days = proposal.weeks[0]!.days;
  const outcomes: BlockOutcome[] = [];

  for (const day of days) {
    for (const session of day.sessions) {
      for (const block of session.blocks) {
        const blockItemUids = new Set(block.items.map((it) => it.uid));
        const blockFlags = day.flags.filter((f) => blockItemUids.has(f.uid));
        const detectedItems = blockFlags.filter((f) => f.confidence === 'detected');
        const incompleteItems = blockFlags.filter((f) => f.confidence === 'incomplete');
        const reviewItems = blockFlags.filter((f) => f.confidence === 'review');
        const unresolvedItems = blockFlags.filter((f) => f.unresolved_exercise);
        const truncated = (day.truncations ?? []).some((t) => t.block_uid === block.uid);
        const filledCount = (day.filled ?? []).filter((f) => blockItemUids.has(f.item_uid)).length;

        const executable = block.items.every((item) => {
          const modality: Modality | null = item.exercise_modality ?? item.prescription.modality ?? null;
          return isExecutable(checkPrescriptionCompleteness(item.prescription, { modality }));
        });

        outcomes.push({
          day_of_week: day.day_of_week,
          block_title: block.title,
          item_count: block.items.length,
          detected_item_count: detectedItems.length,
          incomplete_item_count: incompleteItems.length,
          review_item_count: reviewItems.length,
          unresolved_item_count: unresolvedItems.length,
          unresolved_tokens: unresolvedItems.map((f) => f.exercise_token),
          executable,
          filled_field_count: filledCount,
          truncated,
        });
      }
    }
  }

  return { days, outcomes };
}

describe('cadena completa contra la captura real (semana 12) — tras d913a0c6 + 2d487eb8 + f202c9c5', () => {
  test('20 tarjetas transcritas → 14 tarjetas de bloque de entreno (sin cambios: la cuenta de tarjetas no la tocan estos arreglos)', async () => {
    const { outcomes } = await runFullChain();
    expect(outcomes).toHaveLength(14);
  });

  test('2 de las 14 tarjetas dan bloque ejecutable CON contenido real (esta mañana: 0) — pero NINGUNO de los dos resuelve TODOS sus ejercicios', async () => {
    const { outcomes } = await runFullChain();

    // "Running" sigue siendo un falso positivo vacío: la tarjeta no trae un
    // solo dato planificado, así que su bloque tiene 0 items — "ejecutable"
    // porque no hay nada que ejecutar. Se excluye igual que esta mañana.
    const genuinelyUsable = outcomes.filter((o) => o.executable && o.item_count > 0);
    expect(genuinelyUsable.map((o) => o.block_title)).toEqual([
      'COMPENSATORIO GLÚTEO',
      '4 × 600 + 3 × 800',
    ]);

    // De los dos, solo UNO es un arreglo de HOY: "COMPENSATORIO GLÚTEO" (día 2)
    // era el bloque que se comía sus 3 ejercicios reales tras la dosis
    // huérfana "P" — ver el test dedicado. "4 × 600 + 3 × 800" YA era
    // ejecutable esta mañana (el mismo hueco de siempre: sin modalidad
    // conocida, el gate de completitud no le exige objetivo) — no es un
    // artefacto de hoy, es un hueco preexistente sin tocar.
    // Y el listón que pidió team-lead: ninguno de los dos tiene TODOS sus
    // ejercicios resueltos a catálogo — los dos seguirían pidiendo que el
    // coach elija manualmente antes de poder confirmar.
    for (const o of genuinelyUsable) {
      expect(o.unresolved_item_count).toBe(o.item_count);
    }
  });

  test('"REFUERZO HOMBRO" (día 1): el bug de "Sets Exercises" está arreglado — los 5 ejercicios reales sobreviven como incomplete', async () => {
    const { days } = await runFullChain();
    const block = days[0]!.sessions[0]!.blocks.find((b) => b.title === 'REFUERZO HOMBRO')!;

    expect(block.items.map((it) => it.exercise_name)).toEqual([
      'Cable External Rotation',
      'Band Pull Apart',
      'Prone Y Raise',
      'Serratus wall slide',
      'Band Scapular Retraction',
    ]);
    // Ya no hay "Sets Exercises". Los 5 son `incomplete`: el nombre es real,
    // la dosis no viene en esta tarjeta — ni inventada ni perdida.
    expect(block.items.every((it) => it.prescription.sets == null)).toBe(true);
  });

  test('"COMPENSATORIO GLÚTEO" (día 2): la dosis huérfana "P" ya no se pierde — se reparte entre los 3 ejercicios reales', async () => {
    const { days } = await runFullChain();
    const block = days[1]!.sessions[0]!.blocks.find((b) => b.title === 'COMPENSATORIO GLÚTEO')!;

    expect(block.items.map((it) => it.exercise_name)).toEqual([
      'Puente de glúteo',
      'Marcha desde puente de glúteo',
      'Isometría en puente de glúteo',
    ]);
    // Ya no queda ningún item huérfano llamado "P". Los 3 llevan la MISMA
    // dosis leída de la prosa: 4 series, 12-15 reps (rango, no un punto
    // inventado), 60s de descanso — RIR 2 lo añade el relleno de defaults
    // (la prosa no decía intensidad).
    for (const it of block.items) {
      expect(it.prescription.sets).toHaveLength(4);
      expect(it.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 12, max: 15 });
      expect(it.prescription.sets![0]!.rest_s).toBe(60);
      expect(it.prescription.sets![0]!.target).toEqual({ kind: 'rir', value: 2 });
    }
  });

  test('desglose por los TRES estados: detected 21 · incomplete 17 · review 18, de 56 items (esta mañana: 51 items, sin "incomplete")', async () => {
    const { days } = await runFullChain();
    const allFlags = days.flatMap((d) => d.flags);

    const byState = {
      detected: allFlags.filter((f) => f.confidence === 'detected').length,
      incomplete: allFlags.filter((f) => f.confidence === 'incomplete').length,
      review: allFlags.filter((f) => f.confidence === 'review').length,
    };
    expect(byState).toEqual({ detected: 21, incomplete: 17, review: 18 });
    expect(allFlags).toHaveLength(56);
  });

  test('la lista LITERAL de ejercicios que no resuelven a catálogo — la definitiva: 48 de 56 items (esta mañana: 51)', async () => {
    const { days } = await runFullChain();
    const allFlags = days.flatMap((d) => d.flags);

    const unresolved = allFlags.filter((f) => f.unresolved_exercise);
    const namedMisses = unresolved.map((f) => f.exercise_token).filter((t) => t.trim().length > 0);
    expect(unresolved).toHaveLength(48);

    // La lista que de verdad importa: nombres reales de la captura que el
    // catálogo (suelo GLOBAL_ALIASES ampliado por f202c9c5) sigue sin
    // reconocer. "A)"/"FUERZA PARTE ALTA"/"OPCIONAL" son restos de parseo (la
    // cabecera "A) 4×4 | RIR 2" produce un segundo token junto al del
    // título) — no ejercicios, y se cuentan aparte (ver el test de
    // movilidad/activación más abajo, que solo cuenta ejercicios reales).
    //
    // "Scapular Push Up" pasa a esta lista en la migración 0152: antes se
    // colaba como "resuelto" por el alias genérico "push up" (2 palabras),
    // que le daba SILENCIOSAMENTE el ejercicio equivocado (Push-Up normal en
    // vez del suyo propio) — un bug real de match cruzado en producción HOY,
    // no un efecto de la migración. La 0152 añade la clave explícita de 3
    // palabras "scapular push up" (gana la ventana más larga antes que la de
    // 2), así que ahora SÍ apunta al slug correcto — pero ese slug todavía no
    // tiene fila (0152 escrita, no aplicada), así que hoy mismo cae
    // correctamente a revisión en vez de mentir. Verificado contra un mock
    // que ahora sí distingue "alias existe" de "alias con fila real" (ver
    // `KNOWN_CATALOG_SLUGS` más arriba).
    expect(namedMisses).toEqual([
      'FUERZA PARTE ALTA',
      'A)',
      'Cable External Rotation',
      'Band Pull Apart',
      'Prone Y Raise',
      'Serratus wall slide',
      'Band Scapular Retraction',
      'Puente de glúteo',
      'Marcha desde puente de glúteo',
      'Isometría en puente de glúteo',
      'Cat Cow',
      'Cossack Squat',
      'Cobra Pose',
      'Hip Flexor Stretch',
      'Bird Dog',
      'Incremental ergómetros',
      'Single Leg Glute Bridge',
      'Side Step Squat With Band',
      'Extension de cadera en cuadrúp...',
      'Diagonal Band Pull Apart',
      'Banded Front Raise',
      'Prone T Raise',
      'Scapular Push Up',
      'OPCIONAL',
      'A)',
      'Push Jerk',
      'Bici Libre',
    ]);

    // Y lo que SÍ resuelve — 8 de 56 (esta mañana: 5, hasta f202c9c5: 9 con
    // el falso positivo de "Scapular Push Up" incluido). Las 3 ocurrencias
    // restantes de traducción pura ES↔EN (catálogo sin crecer): "Dominada
    // (lastrada)" (×2, una por cada tarjeta que la lleva), "Remo", "Forward
    // Leg Swing". "Press Banca" y "Step Ups Cajón" TAMBIÉN se tradujeron en
    // f202c9c5 pero no aparecen aquí resueltos — sus líneas nunca llegan al
    // resolutor (caen a `review` con token vacío por otros motivos: la carga
    // "%", el patrón "10+10"), así que el alias nuevo no tiene nada que
    // resolver todavía en ESTA captura — ver el test de abajo.
    const resolved = allFlags.filter((f) => !f.unresolved_exercise);
    expect(resolved.map((f) => f.exercise_token)).toEqual([
      'Dominada (lastrada)',
      'Forward Leg Swing',
      'carrera',
      'carrera mi',
      'Remo',
      'Side Plank with Clam Shell Hold',
      'Banded Lateral Raise',
      'Dominada (lastrada)',
    ]);
    expect(resolved.every((f) => f.resolved_via === 'alias')).toBe(true);
  });

  test('"Press Banca" y "Step Ups Cajón" (traducidos en f202c9c5) no llegan al resolutor: sus líneas nunca produjeron un token', async () => {
    const { days } = await runFullChain();
    const allNotes = days
      .flatMap((d) => d.sessions)
      .flatMap((s) => s.blocks)
      .flatMap((b) => b.items)
      .map((it) => it.notes)
      .filter((n): n is string => !!n);

    // El texto sigue vivo (verbatim, en `notes`), pero ninguno se convirtió
    // en `exercise_token` — el alias nuevo no tiene ocasión de dispararse
    // porque `resolveExercise` nunca se llama con "Press Banca" ni "Step Ups
    // Cajón" como término. Es un hueco de GRAMÁTICA (la carga ">78-80%" y el
    // patrón "10+10" no producen token), no de traducción.
    expect(allNotes.some((n) => n.includes('Press Banca'))).toBe(true);
    expect(allNotes.some((n) => n.includes('Step Ups Cajón'))).toBe(true);
    const allTokens = days.flatMap((d) => d.flags).map((f) => f.exercise_token);
    expect(allTokens).not.toContain('Press Banca');
    expect(allTokens).not.toContain('Step Ups Cajón');
  });

  test('de los ejercicios reales que siguen sin resolver, 20 de 23 (87%) son movilidad/activación — el catálogo base solo tiene 7 de movilidad sobre 79', async () => {
    const { days } = await runFullChain();
    const allFlags = days.flatMap((d) => d.flags);
    const unresolved = allFlags.filter((f) => f.unresolved_exercise);

    // Restos de parseo, NO ejercicios — se excluyen antes de clasificar
    // (mismo criterio que el test de arriba).
    const PARSE_DEBRIS = new Set(['FUERZA PARTE ALTA', 'A)', 'OPCIONAL']);
    const realNames = [
      ...new Set(
        unresolved.map((f) => f.exercise_token.trim()).filter((t) => t && !PARSE_DEBRIS.has(t)),
      ),
    ];
    expect(realNames).toHaveLength(23);

    // Clasificación por juicio de dominio (movimiento por movimiento, no por
    // patrón de texto): rehab/prehab de hombro, activación glútea, drills de
    // movilidad de cadera/columna y estabilidad core-cuadrupedia cuentan como
    // movilidad/activación — "Scapular Push Up" entra en el mismo grupo que
    // "Prone Y/T Raise"/"Band Scapular Retraction"/"Serratus wall slide": es
    // activación de estabilizadores de la escápula, no fuerza de empuje. Lo
    // que NO cuenta: un levantamiento de fuerza (Push Jerk) y dos piezas de
    // cardio cuyo equipo exacto ni se sabe (Incremental ergómetros, Bici
    // Libre — verificado contra el catálogo: ninguno de los tres tiene
    // equivalente, ver el test de abajo).
    const NOT_MOBILITY = new Set(['Push Jerk', 'Incremental ergómetros', 'Bici Libre']);
    const mobility = realNames.filter((n) => !NOT_MOBILITY.has(n));
    expect(mobility).toHaveLength(20);
    expect(realNames.filter((n) => NOT_MOBILITY.has(n))).toHaveLength(3);
  });

  // NOTA (no es un test — no hay DB aquí a propósito): los 23 nombres reales
  // sin resolver de arriba (22 + "Scapular Push Up", que hasta la 0152 se
  // colaba como resuelto por un match cruzado con el "push up" genérico — ver
  // el comentario en el test de arriba) se verificaron a mano, UNA vez,
  // contra los 79 ejercicios reales del catálogo base (`select id, slug,
  // name, category, modality from exercises where coach_id is null`, vía
  // psql). Cero coincidencias legítimas — el hueco es COBERTURA del catálogo
  // (movilidad/activación solo tiene 7 filas de 79), no una traducción
  // perdida. Tres negativos que a primera vista PARECEN encajar y no lo hacen
  // (confirmados de forma independiente, no solo heredados de f202c9c5):
  //   · "Puente de glúteo" ≠ Hip Thrust — glúteo bajo sin carga vs extensión
  //     de cadera cargada; movimientos distintos.
  //   · "Push Jerk" ≠ Clean & Jerk ni Push Press — variante propia de la
  //     familia olímpica (jerk sin la cargada previa, con impulso de piernas
  //     distinto al push press).
  //   · "Bici Libre" ≠ BikeErg necesariamente — "libre" no dice máquina;
  //     asumir el ergómetro inventaría el equipo.
  // Si el catálogo base gana entradas de movilidad/activación, ES ESTA lista
  // la que hay que volver a cruzar — no haría falta tocar gramática ni
  // resolutor para que algo empiece a resolver solo. La migración 0152 (ver
  // infra/migrations/) siembra exactamente esta cobertura — ESCRITA, no
  // aplicada — y ya trae el alias explícito que corrige el match cruzado de
  // "Scapular Push Up" en cuanto se aplique.

  test('las tarjetas de nota y métricas siguen sin colarse como entreno (sin cambios)', async () => {
    const { days } = await runFullChain();

    expect(days[0]!.notes).toBe('SEMANA 12');
    expect(days[4]!.notes).toContain('CONTROL TEST SALTO');
    for (const day of days) {
      for (const session of day.sessions) {
        for (const block of session.blocks) {
          expect(block.title).not.toMatch(/SEMANA 12|CONTROL TEST SALTO/);
        }
      }
    }
    const allText = JSON.stringify(days);
    expect(allText).not.toContain('Sleep Hours');
    expect(allText).not.toContain('Body Battery');
  });

  test('el truncamiento sigue llegando íntegro a la propuesta: 8 de 14 (sin cambios respecto a esta mañana)', async () => {
    const { outcomes } = await runFullChain();
    const truncatedOutcomes = outcomes.filter((o) => o.truncated);
    expect(truncatedOutcomes).toHaveLength(8);
  });

  test('bug de esta mañana que YA NO existe: un título corto sin mayúsculas ("Running") ya no se fabrica como ejercicio', async () => {
    const { days } = await runFullChain();
    const allTokens = days.flatMap((d) => d.flags).map((f) => f.exercise_token);
    // Ninguna línea `incomplete` puede llevar el token "Running" — el arreglo
    // que descarta el título mal leído como ejercicio (dropTitleMisreadAsExercise)
    // lo quita antes de resolver/rellenar.
    expect(allTokens).not.toContain('Running');
  });
});
