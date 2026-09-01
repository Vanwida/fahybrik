// Una columna jsonb guarda un OBJETO, nunca la cadena que lo representa.
//
// EL FALLO QUE ESTO CIERRA
// ------------------------
// `${JSON.stringify(x)}::jsonb` parece escribir un objeto y no lo hace:
// postgres.js aprende por el cast que el parámetro es jsonb y vuelve a
// serializar la cadena, así que la columna acaba guardando un jsonb de tipo
// *string*. Lo que se rompe no avisa igual en todos lados:
//   - `columna->>'clave'` devuelve NULL SIEMPRE (silencioso);
//   - `jsonb_array_length(columna)` LANZA «cannot get array length of a
//     scalar» (500 en el historial de la revisión semanal);
//   - un lector JS que espera objeto recibe una cadena y lee `undefined` en
//     cada propiedad (la restauración de un ajuste masivo escribía basura).
// Ver docs/DECISIONS.md 2026-08-09.
//
// Va contra una rama de Neon real porque lo que se prueba ES cómo aterriza el
// valor en la columna: un cliente falso no reproduce la serialización.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { toJsonValue } from '@/lib/json-column';
import { listHistory, saveReview } from '@/lib/coach/weekly-review';
import { recordAudit } from '@/lib/audit/record-edit';
import { createNutritionEntry } from '@/lib/nutrition/entries';

/** Lunes fuera de todo rango real, para no pisar datos del coach. */
const FUTURE_WEEK = '2099-01-04';

describe('toJsonValue — deja el valor listo para sql.json', () => {
  it('convierte BigInt en Number (sql.json revienta sobre BigInt)', () => {
    expect(toJsonValue({ id: BigInt(42), nested: [{ other: BigInt(7) }] })).toEqual({
      id: 42,
      nested: [{ other: 7 }],
    });
  });

  it('pasa objetos y arrays tal cual, y undefined se vuelve null', () => {
    expect(toJsonValue({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' });
    expect(toJsonValue([1, 2])).toEqual([1, 2]);
    expect(toJsonValue(undefined)).toBeNull();
  });
});

describeWithDb('columnas jsonb: se guarda el objeto (DB real)', () => {
  const sql = getTestSql();
  let coachId: number | null = null;
  let athleteId: number | null = null;
  const auditEntity = `jsonb-shape-${Date.now()}`;

  beforeAll(async () => {
    const coaches = await sql<{ id: string }[]>`
      select c.id::text as id from coaches c
      join athletes a on a.coach_id = c.id
      group by c.id order by count(a.id) desc limit 1
    `;
    coachId = coaches[0] ? Number(coaches[0].id) : null;
    const athletes = await sql<{ id: string }[]>`
      select id::text as id from athletes where coach_id = ${coachId} limit 1
    `;
    athleteId = athletes[0] ? Number(athletes[0].id) : null;
  });

  afterAll(async () => {
    if (coachId != null) {
      await sql`
        delete from coach_weekly_reviews
        where coach_id = ${coachId} and iso_week_start = ${FUTURE_WEEK}::date
      `;
    }
    await sql`delete from audit_log where entity_type = ${auditEntity}`;
    if (athleteId != null) {
      await sql`
        delete from nutrition_entries
        where athlete_id = ${athleteId} and logged_for = ${FUTURE_WEEK}::date
      `;
    }
    await closeTestSql();
  });

  it('coach_weekly_reviews: los cuatro jsonb, y el historial (que lee con SQL) no revienta', async () => {
    expect(coachId, 'no hay ningún coach con atletas en esta rama').not.toBeNull();

    await saveReview({
      coach_id: coachId!,
      iso_week_start: FUTURE_WEEK,
      // `approve`: el historial filtra `status <> 'draft'`.
      action: 'approve',
      notes: [{ id: 'n1', body: 'nota de prueba', created_at: '2099-01-04T09:00:00Z' }],
      client: sql,
    });

    const rows = await sql<
      {
        snapshot: string;
        decisions: string;
        notes: string;
        plan_edits: string;
        n: string | null;
        active: string | null;
      }[]
    >`
      select jsonb_typeof(snapshot_json)   as snapshot,
             jsonb_typeof(decisions_json)  as decisions,
             jsonb_typeof(notes_json)      as notes,
             jsonb_typeof(plan_edits_json) as plan_edits,
             notes_json -> 0 ->> 'body'    as n,
             snapshot_json ->> 'active_athlete_count' as active
      from coach_weekly_reviews
      where coach_id = ${coachId!} and iso_week_start = ${FUTURE_WEEK}::date
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.snapshot).toBe('object');
    expect(rows[0]!.decisions).toBe('array');
    expect(rows[0]!.notes).toBe('array');
    expect(rows[0]!.plan_edits).toBe('array');
    // Con la forma doblada estos dos `->>` serían NULL, y el historial mostraba
    // 0 atletas activos sin que nada fallase.
    expect(rows[0]!.n).toBe('nota de prueba');
    expect(rows[0]!.active).not.toBeNull();

    // `listHistory` hace `jsonb_array_length(decisions_json)`, que LANZA sobre
    // un escalar: con la forma doblada el endpoint del historial daba 500.
    const history = await listHistory({ coach_id: coachId!, client: sql });
    const mine = history.find((h) => h.iso_week_start === FUTURE_WEEK);
    expect(mine, 'la revisión recién guardada no aparece en el historial').toBeDefined();
    expect(mine!.notes_count).toBe(1);
  });

  it('audit_log.diff_json: objeto consultable por clave', async () => {
    await recordAudit(sql, {
      entity_type: auditEntity,
      entity_id: BigInt(1),
      action: 'update',
      actor: { kind: 'ai', user_id: null },
      diff: { field: 'title', from: 'a', to: 'b' },
    });

    const rows = await sql<{ shape: string; extracted: string | null }[]>`
      select jsonb_typeof(diff_json) as shape, diff_json ->> 'to' as extracted
      from audit_log where entity_type = ${auditEntity}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.shape).toBe('object');
    expect(rows[0]!.extracted).toBe('b');
  });

  it('nutrition_entries.raw: objeto, aunque hoy sólo lo lea la auditoría', async () => {
    expect(athleteId, 'no hay ningún atleta en esta rama').not.toBeNull();

    const entry = await createNutritionEntry({
      athlete_id: BigInt(athleteId!),
      input: {
        logged_for: FUTURE_WEEK,
        name: 'prueba jsonb',
        kcal: 100,
        protein_g: 10,
        carbs_g: 5,
        fat_g: 2,
        raw: { provider: 'test', off_id: '123' },
      },
      client: sql,
    });

    const rows = await sql<{ shape: string; extracted: string | null }[]>`
      select jsonb_typeof(raw) as shape, raw ->> 'provider' as extracted
      from nutrition_entries where id = ${entry.id}::bigint
    `;
    expect(rows[0]!.shape).toBe('object');
    expect(rows[0]!.extracted).toBe('test');
  });
});
