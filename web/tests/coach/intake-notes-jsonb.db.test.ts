// commitIntake escribe intake_notes_json con sql.json — no con ::jsonb doblado.
//
// EL BUG QUE ESTO CIERRA
// -----------------------
// `commitIntake` (web/lib/coach/intake.ts) escribía
// `intake_notes_json = ${JSON.stringify(snapshot)}::jsonb`. Con postgres.js eso
// guarda un jsonb de tipo *string*, no un objeto (el driver aprende por el cast
// que el parámetro es jsonb y vuelve a serializar la cadena). El lector real de
// la IA — `buildAthleteContextPack` en
// shared/domain/coach/coach-ia-context.ts:91 — hace
//   select intake_notes_json ->> 'level' as level from athletes where id = ...
// que con la forma doblada devuelve NULL SIEMPRE, así que el contexto que se le
// pasa a la IA perdía el nivel del atleta sin avisar. El fix usa
// `${client.json(toJsonValue(snapshot))}` (lib/json-column.ts).
//
// Este test ejecuta `commitIntake` DE VERDAD (no un fake) contra una rama de
// Neon real y lee la columna con el MISMO operador `->>'level'` que usa
// coach-ia-context.ts — un cliente falso no reproduce la serialización de
// postgres.js, así que no puede detectar este bug.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { commitIntake } from '@/lib/coach/intake';
import type { IntakeCommitInput } from '@/lib/coach/intake-schema';

describeWithDb('commitIntake — intake_notes_json aterriza como objeto (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    // Coach + atleta suyo, SIN intake completado — la precondición que
    // commitIntake exige (intake_completed_at IS NULL, athlete.coach_id = coach_id).
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  it("guarda un objeto jsonb real y ->>'level' devuelve el nivel — el lector de la IA", async () => {
    const payload: IntakeCommitInput = {
      target_event_id: 1,
      block_specs: [{ type: 'Microciclo 1', weeks: 4 }],
      level: 3,
      baseline_tests: [],
      // send:false evita abrir chat_threads/notifications — fuera del alcance
      // de este test (solo importa cómo aterriza intake_notes_json).
      welcome: { send: false, body: null },
      acknowledged_warnings: [],
      notes: null,
    };

    const result = await commitIntake({
      athlete_id: fx.athleteId,
      coach_id: fx.coachId,
      coach_user_id: fx.coachUserId,
      payload,
      client: sql,
    });

    expect(result.athlete_id).toBe(String(fx.athleteId));
    expect(result.welcome_sent).toBe(false);

    const rows = await sql<
      { shape: string; level: string | null; welcome_sent: string | null }[]
    >`
      select jsonb_typeof(intake_notes_json)      as shape,
             intake_notes_json ->> 'level'         as level,
             intake_notes_json ->> 'welcome_sent'  as welcome_sent
      from athletes
      where id = ${fx.athleteId}
    `;
    expect(rows).toHaveLength(1);

    // Con la forma doblada esto sería 'string', no 'object'.
    expect(rows[0]!.shape).toBe('object');
    // EXACTAMENTE el lector de coach-ia-context.ts:91. Con la forma doblada
    // devolvía NULL siempre, aunque el snapshot llevara la clave `level`.
    expect(rows[0]!.level).toBe('3');
    // Segunda clave del mismo objeto, para confirmar que no es una coincidencia
    // de una sola clave: todo el snapshot aterriza legible por SQL.
    expect(rows[0]!.welcome_sent).toBe('false');
  });
});
