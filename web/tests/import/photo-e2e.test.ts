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
 *      declarada: solo se deja resolver por la capa 2 (`GLOBAL_ALIASES`, el
 *      mapa estático real, importado del módulo real — no reescrito aquí) —
 *      la capa determinista que NO depende del catálogo de ningún coach
 *      concreto. Las capas 1 (sinónimo aprendido del coach) y 3/4 (nombre
 *      exacto/substring contra SU catálogo) se simulan siempre en MISS,
 *      porque este test no tiene manera honesta de saber qué contiene el
 *      catálogo real de un coach sin consultar la base de datos — y
 *      consultarla no es lo que se pidió aquí. Esto es un SUELO, no el número
 *      de producción: un coach cuyo catálogo ya tenga "Bird Dog" o "Cat Cow"
 *      (movimientos de rehab/movilidad genéricos, nada de nicho) resolverá
 *      más que esto.
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
function aliasSlugFor(term: string): string | null {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  const exact = GLOBAL_ALIASES[normalized];
  if (exact) return exact;
  const words = normalized.split(' ');
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const slug = GLOBAL_ALIASES[words.slice(i, i + len).join(' ')];
      if (slug) return slug;
    }
  }
  return null;
}

vi.mock('@/lib/import/exercise-resolve', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/import/exercise-resolve')>();
  return {
    ...actual,
    resolveExercise: async (_coachId: number, term: string) => {
      const slug = aliasSlugFor(term);
      if (slug) return { exercise_id: 1, via: 'alias' as const };
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

describe('cadena completa contra la captura real (semana 12)', () => {
  test('20 tarjetas transcritas → 14 tarjetas de bloque de entreno (una de ellas, "Running", sin ni un dato planificado)', async () => {
    const { days, outcomes } = await runFullChain();

    const totalCards =
      days.reduce((n, d) => n + d.sessions.reduce((m, s) => m + s.blocks.length, 0), 0) +
      // notas/métricas/descanso no generan bloque: se cuentan aparte por día.
      (days.some((d) => d.notes?.includes('SEMANA 12')) ? 1 : 0) +
      (days.some((d) => d.notes?.includes('CONTROL TEST SALTO')) ? 1 : 0) +
      (days.some((d) => d.state === 'rest') ? 1 : 0) +
      // 3 tarjetas de métricas — se descartan sin dejar rastro (ver el test
      // dedicado más abajo), así que se cuentan a mano contra el literal.
      3;

    expect(outcomes).toHaveLength(14);
    expect(totalCards).toBe(20);
  });

  test('0 de las 14 tarjetas de entreno producen un bloque ejecutable con contenido real', async () => {
    const { outcomes } = await runFullChain();

    // La verdad mecánica: `isExecutable` da positivo en 3 bloques. Los tres son
    // artefactos, no aciertos — el test que sigue lo desglosa uno a uno.
    // "Running" pasa VACÍO: la tarjeta no traía ni un dato planificado (todo
    // era lo REALIZADO), así que el bloque tiene CERO items — "ejecutable"
    // porque no hay nada que ejecutar, no porque haya un entreno completo.
    const mechanicallyExecutable = outcomes.filter((o) => o.executable);
    expect(mechanicallyExecutable.map((o) => o.block_title)).toEqual([
      'REFUERZO HOMBRO',
      'Running',
      '4 × 600 + 3 × 800',
    ]);

    // Y NINGUNO de los dos es un acierto real: cero tarjetas producen un
    // bloque ejecutable Y con el contenido que el coach realmente escribió.
    const genuinelyUsable = outcomes.filter(
      (o) => o.executable && o.item_count > 0 && o.unresolved_item_count < o.item_count,
    );
    expect(genuinelyUsable).toHaveLength(0);
  });

  test('"REFUERZO HOMBRO" (día 1): el guardián de contra-palabras no cubre inglés — "Sets Exercises" se tipa como ejercicio falso y se COME los 5 reales', async () => {
    const { days } = await runFullChain();
    const block = days[0]!.sessions[0]!.blocks.find((b) => b.title === 'REFUERZO HOMBRO')!;

    // La tarjeta real trae 5 ejercicios (Cable External Rotation, Band Pull
    // Apart, Prone Y Raise, Serratus wall slide, Band Scapular Retraction).
    // Ninguno sobrevive: el bloque tiene UN item, y es la línea de contadores
    // mal leída como ejercicio.
    expect(block.items).toHaveLength(1);
    expect(block.items[0]!.exercise_name).toBe('Sets Exercises');
    // "0/10 Sets 0/5 Exercises" — el "0/10" se lee como secuencia de reps.
    // DOSE_WORD_ONLY_RE (shared/domain/import/result.ts) cubre "sets" pero NO
    // "exercises" (su lista es solo española: rounds/rondas/series/reps/
    // repeticiones/veces/ejercicios/min/seg), así que el guardián de
    // contra-palabras — que si cazara "Sets Exercises" lo mandaría a review —
    // no dispara, y la línea se tipa `detected` con una dosis inventada.
    expect(block.items[0]!.prescription.sets?.map((s) => s.measure)).toEqual([
      { kind: 'reps', value: 0 },
      { kind: 'reps', value: 10 },
    ]);
  });

  test('"COMPENSATORIO GLÚTEO" (día 2): la dosis en PROSA se tipa bien, pero queda huérfana — el nombre real (3 ejercicios) se pierde', async () => {
    const { days } = await runFullChain();
    const block = days[1]!.sessions[0]!.blocks.find((b) => b.title === 'COMPENSATORIO GLÚTEO')!;

    // "P: Realiza 4 series de entre 12-15 repeticiones... 1 minuto de
    // descanso" SÍ se tipa: 4 series, rango 12-15 reps, 60s de descanso.
    const prose = block.items.find((it) => it.exercise_name === 'P')!;
    expect(prose.prescription.sets).toHaveLength(4);
    expect(prose.prescription.sets![0]!.measure).toEqual({ kind: 'reps', value: 12, max: 15 });
    expect(prose.prescription.sets![0]!.rest_s).toBe(60);

    // Pero el NOMBRE real del movimiento no sobrevive: "P" es lo que queda de
    // "P:" tras strippear la etiqueta, no un ejercicio. Los tres nombres reales
    // ("Puente de glúteo", "Marcha desde puente de glúteo", "Isometría en
    // puente de glúteo") caen aparte, sin dosis, a `review`.
    expect(prose.exercise_id).toBeNull();
    const reviewNames = block.items
      .filter((it) => it !== prose)
      .map((it) => it.notes)
      .filter((n): n is string => !!n);
    expect(reviewNames).toEqual([
      '1) Puente de glúteo',
      '2) Marcha desde puente de glúteo',
      '3) Isometría en puente de glúteo',
    ]);
  });

  test('49 de 51 items no resuelven a catálogo (contra el suelo de GLOBAL_ALIASES) — lista literal de tokens no vacíos', async () => {
    const { days } = await runFullChain();
    const allFlags = days.flatMap((d) => d.flags);

    expect(allFlags).toHaveLength(51);
    const unresolved = allFlags.filter((f) => f.unresolved_exercise);
    expect(unresolved).toHaveLength(49);

    const namedMisses = unresolved.map((f) => f.exercise_token).filter((t) => t.trim().length > 0);
    expect(namedMisses).toEqual([
      'FUERZA PARTE ALTA',
      'A)',
      'Sets Exercises',
      'P',
      'Incremental ergómetros',
      'Remo',
      'OPCIONAL',
      'A)',
      'Bici Libre',
    ]);
    // Y NINGUNO de los ~30 nombres reales del literal (Cable External
    // Rotation, Band Pull Apart, Cat Cow, Cossack Squat, Bird Dog, Side Plank
    // with Clam Shell Hold, Push Jerk, Encogimientos KTB…) aparece aquí — no
    // es que fallen al resolver: la gramática nunca los tipa (van a `review`
    // con `exercise_token: ''`), así que ni siquiera LLEGAN al resolutor.
    for (const real of ['Cable External Rotation', 'Cat Cow', 'Bird Dog', 'Push Jerk']) {
      expect(namedMisses).not.toContain(real);
    }

    // Lo que SÍ resuelve: solo dos líneas de "carrera" (alias global 'run'),
    // dentro de TRANSICIONES CARRERA.
    const resolved = allFlags.filter((f) => !f.unresolved_exercise);
    expect(resolved.map((f) => f.exercise_token)).toEqual(['carrera', 'carrera mi']);
    expect(resolved.every((f) => f.resolved_via === 'alias')).toBe(true);
  });

  test('las tarjetas de nota y métricas se descartan del entreno correctamente', async () => {
    const { days } = await runFullChain();

    // Notas: van a ProposalDay.notes, NUNCA a un bloque/item.
    expect(days[0]!.notes).toBe('SEMANA 12');
    expect(days[4]!.notes).toContain('CONTROL TEST SALTO');
    for (const day of days) {
      for (const session of day.sessions) {
        for (const block of session.blocks) {
          expect(block.title).not.toMatch(/SEMANA 12|CONTROL TEST SALTO/);
        }
      }
    }

    // Métricas: se descartan SIN dejar rastro — ni bloque, ni nota, ni ningún
    // otro campo de ProposalDay. Correcto (no son entreno), pero es bueno que
    // conste: si algún día se quisiera que el coach viera "dormiste 6h58" en
    // algún sitio, hoy NO llega a ninguna parte de la propuesta.
    const allText = JSON.stringify(days);
    expect(allText).not.toContain('Sleep Hours');
    expect(allText).not.toContain('Body Battery');
  });

  test('el truncamiento llega ÍNTEGRO a la propuesta: 8 de las 14 tarjetas de entreno siguen marcadas truncadas', async () => {
    const { outcomes, days } = await runFullChain();

    // 12 de las 20 tarjetas del literal están cortadas por la UI, pero 4 de
    // esas 12 son tarjetas de métricas/nota (no generan bloque) — de las 14
    // de entreno, las cortadas son 8.
    const truncatedOutcomes = outcomes.filter((o) => o.truncated);
    expect(truncatedOutcomes).toHaveLength(8);

    // El contador explícito ("4 More", "3 More") sobrevive como hidden_count;
    // un corte sin contador ("Descanso 1:30...", "Notas...") queda con null —
    // nunca se inventa un número que no estaba.
    const movilidad = days[2]!.truncations!.find((t) => t.block_uid ===
      days[2]!.sessions[0]!.blocks.find((b) => b.title === 'MOVILIDAD GENERAL')!.uid)!;
    expect(movilidad.hidden_count).toBe(4);

    const fuerzaAlta = days[0]!.truncations!.find((t) => t.block_uid ===
      days[0]!.sessions[0]!.blocks.find((b) => b.title.startsWith('FUERZA PARTE ALTA'))!.uid)!;
    expect(fuerzaAlta.hidden_count).toBeNull();
  });

  test('el relleno de defaults SOLO propone descanso/RIR/reps sobre líneas ya tipadas — nunca inventa sobre una review', async () => {
    const { days } = await runFullChain();
    const allFilled = days.flatMap((d) => d.filled ?? []);

    // 51 items en total, pero solo 9 recibieron algún relleno — exactamente
    // los que la gramática SÍ tipó como fuerza con series (los que cayeron a
    // review, la inmensa mayoría, no reciben nada: no hay estructura donde
    // colgar un default).
    const filledItemUids = new Set(allFilled.map((f) => f.item_uid));
    expect(filledItemUids.size).toBe(9);
    expect(allFilled.every((f) => f.field === 'rest' || f.field === 'intensity')).toBe(true);
    // Nunca reps fuera de fuerza-sin-medida en este fixture: cada línea que sí
    // tipó fuerza ya traía sus repeticiones (4×4, RIR 2) o su rango (12-15).
    expect(allFilled.some((f) => f.field === 'reps')).toBe(false);
  });
});
