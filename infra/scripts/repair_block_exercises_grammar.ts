/**
 * repair_block_exercises_grammar.ts — SOLO LECTURA. Re-parsea
 * `blocks.description` (el verbatim del coach, Model A, fuente de verdad)
 * con la gramática ACTUAL (`parseNotationCell`, shared/domain/import) y
 * compara contra lo que hoy vive en `block_exercises`.
 *
 * POR QUÉ EXISTE
 * ---------------
 * `block_exercises` no se pobló con esta gramática: la construyeron scripts
 * de un solo uso (retype_run/_erg/_strength/_core_mobility/_functional_
 * blocks.ts, parse_blocks_lib/_structured.ts) ANTERIORES a la gramática
 * actual y a su contrato de honestidad (nunca inventa, degrada a `review`).
 * Verificado el 7-ago corriendo la gramática de HOY contra los 3 verbatims
 * que parecían bugs del parser (%RM leído como reps, km/h como metros,
 * descanso como trabajo): los tres se resuelven bien o degradan honestamente
 * a `review` — NINGUNO reproduce hoy. La conclusión correcta no es "arreglar
 * 3 bugs del parser", es "los datos viejos quedaron atrás de un parser mejor",
 * y de forma mucho más extendida de lo que 3 casos sugerían: corrida contra
 * las 99 filas reales de coach 60 el 7-ago, solo 0 bloques salieron
 * "ya_bien" con el comparador ingenuo de este script — ver DECISIÓN DE
 * ALCANCE abajo, esa cifra por sí sola NO es fiable todavía.
 *
 * DECISIÓN DE ALCANCE — por qué este script NO escribe nada
 * -------------------------------------------------------------
 * El primer intento incluía un modo `--apply` que rellenaba filas vacías y
 * resolvía `exercise_id` por un match exacto de nombre en minúsculas. Corrido
 * en dry-run reveló un fallo de clasificación real: `paramsHasContent()`
 * cuenta la clave `sets` como "contenido" aunque sea solo un CONTADOR
 * (`{sets:4}`, sin reps/carga) — así que un bloque con 3 filas donde 1 tiene
 * datos reales y 2 están genuinamente vacías se clasifica entero como
 * "tiene contenido" y ninguna de sus filas vacías se rellena. El resultado:
 * 71 de 99 bloques cayeron en "revisar_manual" cuando la mayoría son en
 * realidad rellenos seguros mal enrutados por una comparación a nivel de
 * BLOQUE cuando debía ser a nivel de FILA. Corregirlo bien + sustituir el
 * match de nombre exacto por el resolutor real (`resolveExercise()`,
 * fuzzy, ya existe en `web/lib/import/exercise-resolve.ts`) es más trabajo
 * del que cabe en esta sesión. Aplicar con el heurístico roto sobre la
 * ÚNICA biblioteca real de producción habría violado "cero datos falsos en
 * cuentas reales" — así que este script se deja SOLO-LECTURA, documentado,
 * listo para retomar. Ver docs/DECISIONS.md / FOCUS.md para el hallazgo y
 * el siguiente paso concreto.
 *
 * Uso: cd infra && tsx scripts/repair_block_exercises_grammar.ts [--coach=60]
 */
import { parseNotationCell } from '@fahybrid/shared/domain/import/notation';
import type { Prescription } from '@fahybrid/shared/domain/prescription/types';
import { getSql } from './_db.js';

const COACH_ARG = process.argv.find((a) => a.startsWith('--coach='));
const COACH_ID = COACH_ARG ? Number(COACH_ARG.split('=')[1]) : 60;

interface BlockRow {
  id: number;
  title: string;
  description: string;
  needs_review: boolean;
}
interface ExerciseRow {
  id: number;
  block_id: number;
  position: number;
  block_position: number;
  exercise_id: number;
  params_json: Record<string, unknown> | null;
  prescription_json: Prescription | null;
  reps_scheme: string | null;
  needs_review: boolean | null;
}

function hasRealContent(p: Prescription | null | undefined): boolean {
  if (!p) return false;
  if (p.sets && p.sets.length > 0) {
    return p.sets.some((s) => s.measure !== undefined || s.target !== undefined);
  }
  return (
    p.work_s !== undefined ||
    p.total_s !== undefined ||
    p.target !== undefined ||
    p.rounds !== undefined
  );
}

// OJO: 'sets'/'rounds' a secas son un CONTADOR, no contenido — un bloque con
// {sets:4} y nada más no tiene ni reps ni carga, es tan vacío como {}. La
// primera versión de este script los contaba como "contenido" y eso metía
// filas genuinamente vacías en el cubo "revisar_manual" en vez de "llenar".
function paramsHasContent(params: Record<string, unknown> | null): boolean {
  if (!params) return false;
  const keys = ['reps', 'load_pct', 'load_kg', 'rpe', 'duration_seconds', 'distance_meters'];
  return keys.some((k) => params[k] !== undefined && params[k] !== null);
}

async function main() {
  const sql = getSql();
  const host = process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1] ?? '?';
  process.stdout.write(
    `[repair_block_exercises_grammar] host=${host} coach=${COACH_ID} mode=dry-run (solo lectura)\n\n`,
  );

  const blocks = await sql<BlockRow[]>`
    select id, title, description, needs_review
    from blocks
    where coach_id = ${COACH_ID}
    order by id
  `;

  let emptyToFill = 0;
  let rowsToFill = 0;
  let bugCandidates = 0;
  let alreadyGood = 0;
  let stillUnresolved = 0;

  for (const block of blocks) {
    const rows = await sql<ExerciseRow[]>`
      select id, block_id, position, block_position, exercise_id,
             params_json, prescription_json, reps_scheme, needs_review
      from block_exercises
      where block_id = ${block.id}
      order by position
    `;

    // Granularidad de FILA, no de bloque: un bloque de 3 filas donde 1 tiene
    // datos reales y 2 están vacías tiene DOS candidatas a rellenar, no cero.
    const emptyRows = rows.filter(
      (r) => !hasRealContent(r.prescription_json) && !paramsHasContent(r.params_json),
    );
    const currentHasAnyContent = rows.length > emptyRows.length;

    const parsed = parseNotationCell(block.description);
    const detectedWithContent = parsed.filter(
      (l) => l.confidence === 'detected' && hasRealContent(l.prescription),
    );
    const allDetected = parsed.length > 0 && parsed.every((l) => l.confidence === 'detected');

    if (rows.length === 0 || !currentHasAnyContent) {
      // Bloque VACÍO del todo (o sin filas): candidato limpio a relleno.
      if (detectedWithContent.length > 0) {
        emptyToFill++;
        rowsToFill += rows.length;
        process.stdout.write(
          `[LLENAR] block ${block.id} "${block.title}" — ${rows.length} filas vacías → ${parsed.length} líneas frescas (${detectedWithContent.length} con contenido, allDetected=${allDetected})\n`,
        );
      } else {
        stillUnresolved++;
      }
    } else if (emptyRows.length > 0) {
      // MIXTO: alguna fila tiene datos reales, otra(s) están vacías. Cuenta
      // aparte de "llenar_vacío" (bloque entero vacío) porque aquí solo
      // haría falta tocar las filas vacías, preservando las que ya están bien.
      rowsToFill += emptyRows.length;
      process.stdout.write(
        `[PARCIAL] block ${block.id} "${block.title}" — ${emptyRows.length} de ${rows.length} filas vacías\n`,
      );
    } else if (
      JSON.stringify(rows.map((r) => r.prescription_json)) !==
      JSON.stringify(parsed.map((l) => l.prescription))
    ) {
      bugCandidates++;
      process.stdout.write(
        `[REVISAR — hay datos y difieren] block ${block.id} "${block.title}"\n  actual: ${JSON.stringify(rows.map((r) => ({ measure: r.prescription_json?.sets?.[0]?.measure, target: r.prescription_json?.sets?.[0]?.target, work_s: r.prescription_json?.work_s, rest_s: r.prescription_json?.rest_s })))}\n  fresco: ${JSON.stringify(parsed.map((l) => ({ conf: l.confidence, measure: l.prescription.sets?.[0]?.measure, target: l.prescription.sets?.[0]?.target, work_s: l.prescription.work_s, rest_s: l.prescription.rest_s })))}\n`,
      );
    } else {
      alreadyGood++;
    }
  }

  process.stdout.write(
    `\n[resumen] bloques=${blocks.length} · bloque_vacío_llenar=${emptyToFill} · filas_vacías_total=${rowsToFill} · revisar_manual=${bugCandidates} · sin_resolver_por_gramática=${stillUnresolved} · ya_bien=${alreadyGood}\n`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
