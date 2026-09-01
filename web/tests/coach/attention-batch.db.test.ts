// El CTE del barrido de atención, contra una base de datos REAL.
//
// Por qué existe: `loadBatch` es cien líneas de SQL dentro de una plantilla de
// TypeScript, así que ni el typecheck ni un test unitario pueden decir si se
// ejecuta. Un error de sintaxis, una columna que no existe o un `lateral` mal
// puesto sólo aparecen al hablar con Postgres — y el barrido corre en un cron,
// donde fallar significa que /hoy se queda en blanco sin que nadie lo vea.
//
// Sólo LEE: ni escribe ni borra, así que puede correr contra una rama de Neon
// recién clonada sin sembrar nada.

import { expect, it, beforeAll, afterAll } from 'vitest';
import { loadBatch } from '@/lib/coach/attention/recompute-batch';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('loadBatch — el CTE por atleta se ejecuta de verdad', () => {
  const sql = getTestSql();
  let coachId: number | null = null;

  beforeAll(async () => {
    // Un coach con atletas activos: es la forma del dato que el cron encuentra.
    const rows = await sql<{ id: string }[]>`
      select c.id::text as id
      from coaches c
      join athletes a on a.coach_id = c.id and a.lifecycle_status = 'activo'
      group by c.id
      order by count(a.id) desc
      limit 1
    `;
    coachId = rows[0] ? Number(rows[0].id) : null;
  });

  afterAll(async () => {
    await closeTestSql();
  });

  it('devuelve una fila por atleta con las columnas del comunicado', async () => {
    expect(coachId, 'no hay ningún coach con atletas activos en esta rama').not.toBeNull();

    const rows = await loadBatch(sql, coachId!, new Date(), null);
    expect(rows.length).toBeGreaterThan(0);

    const row = rows[0]!;
    // Que las claves EXISTAN es la mitad del test: si el `select` no las
    // proyecta, `communicationClaims` lee `undefined` y no reclama nunca nada.
    for (const key of [
      'comm_question_id',
      'comm_question_title',
      'comm_question_oldest_at',
      'comm_question_blocks',
      'comm_question_n',
      'comm_task_id',
      'comm_task_title',
      'comm_task_due_iso',
      'comm_task_n',
      'comm_protocol_id',
      'comm_protocol_title',
      'comm_protocol_anchor',
      'comm_protocol_event_iso',
      'comm_protocol_n',
    ] as const) {
      expect(row, `falta la columna ${key}`).toHaveProperty(key);
    }
  });

  it('acepta el filtro de un solo atleta (el recompute por evento)', async () => {
    expect(coachId).not.toBeNull();

    const todos = await loadBatch(sql, coachId!, new Date(), null);
    const uno = await loadBatch(sql, coachId!, new Date(), Number(todos[0]!.athlete_id));
    expect(uno).toHaveLength(1);
    expect(uno[0]!.athlete_id).toBe(todos[0]!.athlete_id);
  });
});
