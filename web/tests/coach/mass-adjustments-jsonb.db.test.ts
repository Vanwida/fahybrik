// applyAdjustment / rollbackAdjustment — jsonb real + restauración exacta (DB real).
//
// EL FALLO QUE ESTO CIERRA
// ------------------------
// `web/lib/coach/mass-adjustments.ts` escribía sus columnas jsonb con
// `${JSON.stringify(x)}::jsonb`. postgres.js aprende por el cast que el
// parámetro es jsonb y vuelve a serializar la cadena, así que la columna
// acababa guardando un jsonb de tipo *string* (ver `lib/json-column.ts` y
// docs/DECISIONS.md 2026-08-09). El lector que de verdad se rompía era
// `rollbackAdjustment`: lee `coach_mass_adjustment_targets.prior_state_json`
// esperando el objeto `{notes, scheduled_for, status}` para restaurar
// `workout_assignments`. Con la forma doblada cada propiedad era `undefined`
// y la restauración escribía basura sobre el entreno del atleta.
//
// Ahora se escribe con `tx.json(toJsonValue(x))`. Este test ejecuta el
// servicio de verdad (applyAdjustment + rollbackAdjustment) contra una rama
// de Neon real, porque lo que se prueba es cómo aterriza el valor en la
// columna y qué lee `rollbackAdjustment` de vuelta — un cliente falso no
// reproduce ni la serialización ni la restauración.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { applyAdjustment, rollbackAdjustment } from '@/lib/coach/mass-adjustments';
import { makeAssignment, makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

// Ventana lejos de cualquier dato real (docs/DECISIONS.md usa el mismo patrón
// con FUTURE_WEEK) para no pisar nada del coach de pruebas y para que
// `windowForPayload` (ventana de 1 semana por defecto) la contenga sin dudas.
const TEST_NOW = new Date('2099-06-01T10:00:00Z');
const SCHEDULED_FOR = '2099-06-03';
const ORIGINAL_NOTES = 'nota original antes del ajuste (test)';
const NOTE_BODY = 'nota de ajuste masivo (test)';

describeWithDb('applyAdjustment/rollbackAdjustment — columnas jsonb reales, nunca string (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let assignmentId: number;
  let adjustmentId: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    const templateId = await makeTemplate({
      fx,
      name: 'Plantilla ajuste masivo (test)',
      format: 'strength_block',
    });
    assignmentId = await makeAssignment({
      fx,
      templateId,
      scheduledForIso: SCHEDULED_FOR,
      status: 'scheduled',
      notes: ORIGINAL_NOTES,
    });

    // 'private_note' es el payload más simple que recorre el camino
    // "existing assignments" de applyAdjustment (NO 'insert_session', que
    // guarda prior_state_json = null y no ejerce la restauración).
    const applied = await applyAdjustment({
      coach_id: fx.coachId,
      applied_by_user_id: fx.coachUserId,
      scope: { kind: 'selection', athlete_ids: [fx.athleteId] },
      payload: { type: 'private_note', body: NOTE_BODY },
      excluded_athlete_ids: [],
      now: TEST_NOW,
      client: sql,
    });
    adjustmentId = Number(applied.adjustment_id);
  });

  afterAll(async () => {
    if (adjustmentId != null) {
      // audit_log no tiene FK real hacia coach_mass_adjustments (entity_id es
      // un bigint suelto): si no se borra explícito, no cascadea con nada.
      await sql`
        delete from audit_log
        where entity_type = 'coach_mass_adjustments' and entity_id = ${adjustmentId}
      `;
      await sql`delete from coach_mass_adjustment_targets where adjustment_id = ${adjustmentId}`;
      await sql`delete from coach_mass_adjustments where id = ${adjustmentId}`;
    }
    // workout_assignments/templates/athlete/coach/users (y con ellos, en
    // cascada, la notification que applyAdjustment insertó para el atleta).
    await fx?.cleanup();
    await closeTestSql();
  });

  it('apply: coach_mass_adjustments guarda scope_filter_json/adjustment_payload/athletes_affected_json como object/array real', async () => {
    const rows = await sql<
      Array<{
        scope_shape: string;
        payload_shape: string;
        affected_shape: string;
        scope_kind: string | null;
        payload_body: string | null;
        first_affected_name: string | null;
      }>
    >`
      select jsonb_typeof(scope_filter_json)      as scope_shape,
             jsonb_typeof(adjustment_payload)      as payload_shape,
             jsonb_typeof(athletes_affected_json)  as affected_shape,
             scope_filter_json     ->> 'kind'      as scope_kind,
             adjustment_payload    ->> 'body'       as payload_body,
             athletes_affected_json -> 0 ->> 'full_name' as first_affected_name
      from coach_mass_adjustments
      where id = ${adjustmentId}
    `;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    expect(row.scope_shape).toBe('object');
    expect(row.payload_shape).toBe('object');
    expect(row.affected_shape).toBe('array');
    // Explícito: con la forma doblada `jsonb_typeof` habría devuelto 'string'.
    expect([row.scope_shape, row.payload_shape, row.affected_shape]).not.toContain('string');

    // Con la forma doblada estos `->>` habrían sido NULL siempre.
    expect(row.scope_kind).toBe('selection');
    expect(row.payload_body).toBe(NOTE_BODY);
    expect(row.first_affected_name).toBe('Test Athlete');
  });

  it('apply: coach_mass_adjustment_targets.prior_state_json es el objeto real que necesita rollback', async () => {
    const rows = await sql<
      Array<{
        shape: string;
        assignment_id: string | null;
        prior_notes: string | null;
        prior_scheduled_for: string | null;
        prior_status: string | null;
      }>
    >`
      select jsonb_typeof(prior_state_json)        as shape,
             assignment_id::text                    as assignment_id,
             prior_state_json ->> 'notes'           as prior_notes,
             prior_state_json ->> 'scheduled_for'   as prior_scheduled_for,
             prior_state_json ->> 'status'          as prior_status
      from coach_mass_adjustment_targets
      where adjustment_id = ${adjustmentId}
    `;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;

    expect(row.shape).toBe('object');
    expect(row.shape).not.toBe('string');
    expect(row.assignment_id).toBe(String(assignmentId));
    // Exactamente lo que rollbackAdjustment necesita leer para restaurar.
    expect(row.prior_notes).toBe(ORIGINAL_NOTES);
    expect(row.prior_scheduled_for).toBe(SCHEDULED_FOR);
    expect(row.prior_status).toBe('scheduled');
  });

  it('apply: audit_log.diff_json (accion create) es objeto real', async () => {
    const rows = await sql<Array<{ shape: string; adj_type: string | null }>>`
      select jsonb_typeof(diff_json) as shape, diff_json ->> 'type' as adj_type
      from audit_log
      where entity_type = 'coach_mass_adjustments'
        and entity_id = ${adjustmentId}
        and action = 'create'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shape).toBe('object');
    expect(rows[0]!.shape).not.toBe('string');
    expect(rows[0]!.adj_type).toBe('private_note');
  });

  it('rollback: restaura workout_assignments EXACTAMENTE al estado previo — el lector que estaba corrupto', async () => {
    // Antes de deshacer: el ajuste debe haber tocado `notes` de verdad. Si no,
    // comprobar "se restauró" más abajo sería trivialmente cierto sin haber
    // probado nada.
    const beforeRollback = await sql<Array<{ notes: string | null }>>`
      select notes from workout_assignments where id = ${assignmentId}
    `;
    expect(beforeRollback[0]!.notes).not.toBe(ORIGINAL_NOTES);
    expect(beforeRollback[0]!.notes).toContain(ORIGINAL_NOTES);
    expect(beforeRollback[0]!.notes).toContain(NOTE_BODY);

    const result = await rollbackAdjustment({
      coach_id: fx.coachId,
      rolled_back_by_user_id: fx.coachUserId,
      adjustment_id: adjustmentId,
      now: new Date(TEST_NOW.getTime() + 60 * 60 * 1000),
      client: sql,
    });
    expect(result).toEqual({ ok: true });

    const rows = await sql<Array<{ notes: string | null; scheduled_for: string; status: string }>>`
      select notes, to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for, status
      from workout_assignments
      where id = ${assignmentId}
    `;
    expect(rows).toHaveLength(1);
    // Con la forma doblada, `prior.notes`/`prior.scheduled_for`/`prior.status`
    // eran `undefined` (propiedad sobre un string) y esta restauración
    // escribía basura en vez del estado previo.
    expect(rows[0]!.notes).toBe(ORIGINAL_NOTES);
    expect(rows[0]!.scheduled_for).toBe(SCHEDULED_FOR);
    expect(rows[0]!.status).toBe('scheduled');

    const auditRows = await sql<Array<{ shape: string }>>`
      select jsonb_typeof(diff_json) as shape
      from audit_log
      where entity_type = 'coach_mass_adjustments'
        and entity_id = ${adjustmentId}
        and action = 'restore'
    `;
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.shape).toBe('object');
    expect(auditRows[0]!.shape).not.toBe('string');
  });
});
