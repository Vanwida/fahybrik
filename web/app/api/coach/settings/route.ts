// GET   /api/coach/settings → { max_program_weeks, test_retest_weeks }
// PATCH /api/coach/settings   body: { max_program_weeks?: n | null, test_retest_weeks?: n[] | null }
//
// Dos ajustes de método sueltos, cada uno NULL = defecto del producto:
//   · cuántas semanas puede durar un programa (`coaches.max_microcycle_weeks`);
//   · a cuántas semanas repite un test (`coaches.test_retest_weeks`), que además
//     decide cuándo salta «Toca test».

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { getMaxProgramWeeksSetting, setMaxProgramWeeks } from '@/lib/coach/microcycle-limits';
import { getTestCadenceSetting, setTestCadence } from '@/lib/coach/test-cadence';
import { MICROCICLO_ABSOLUTE_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';
import { TEST_RETEST_OPTIONS_MAX, TEST_RETEST_WEEKS_MAX } from '@fahybrid/shared/domain/coach/test-cadence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WEEKS_MIN = 2;

const patchSchema = z
  .object({
    max_program_weeks: z
      .number()
      .int(`Un número entero de semanas.`)
      .min(MAX_WEEKS_MIN, `Entre ${MAX_WEEKS_MIN} y ${MICROCICLO_ABSOLUTE_MAX_WEEKS} semanas.`)
      .max(MICROCICLO_ABSOLUTE_MAX_WEEKS, `Entre ${MAX_WEEKS_MIN} y ${MICROCICLO_ABSOLUTE_MAX_WEEKS} semanas.`)
      .nullable()
      .optional(),
    test_retest_weeks: z
      .array(
        z
          .number()
          .int('Semanas enteras.')
          .min(1, `Entre 1 y ${TEST_RETEST_WEEKS_MAX} semanas.`)
          .max(TEST_RETEST_WEEKS_MAX, `Entre 1 y ${TEST_RETEST_WEEKS_MAX} semanas.`),
      )
      .max(TEST_RETEST_OPTIONS_MAX, `Como mucho ${TEST_RETEST_OPTIONS_MAX} opciones.`)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'No hay nada que cambiar.' });

async function snapshot(coach_id: number | bigint) {
  const [max_program_weeks, test_retest_weeks] = await Promise.all([
    getMaxProgramWeeksSetting(coach_id),
    getTestCadenceSetting(coach_id),
  ]);
  return { max_program_weeks, test_retest_weeks };
}

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await snapshot(auth.session.coach_id));
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const coach_id = auth.session.coach_id;
  if (body.data.max_program_weeks !== undefined) await setMaxProgramWeeks(coach_id, body.data.max_program_weeks);
  if (body.data.test_retest_weeks !== undefined) {
    const weeks = body.data.test_retest_weeks;
    await setTestCadence(coach_id, weeks && weeks.length > 0 ? weeks : null);
  }
  return jsonOk(await snapshot(coach_id));
}
