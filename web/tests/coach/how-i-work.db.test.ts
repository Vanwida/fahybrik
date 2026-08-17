// Real-DB — un coach vacío no hereda el método de otro. Se salta sin
// TEST_DATABASE_URL.

import { afterAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';
import {
  deleteHowIWorkPdf,
  getHowIWork,
  getHowIWorkPdfBytes,
  putHowIWorkPdf,
  upsertHowIWorkText,
} from '@/lib/coach/how-i-work';

const PDF_BYTES = Buffer.from('%PDF-1.4\n%EOF\n', 'utf8');

describeWithDb('coach_how_i_work: vacío no copia; guardar y releer', () => {
  const sql = getTestSql();

  afterAll(async () => {
    await closeTestSql();
  });

  test('A escribe texto y PDF; B sin fila sigue vacío; A relee lo suyo', async () => {
    const a = await makeCoachAndAthlete(sql);
    const b = await makeCoachAndAthlete(sql);
    try {
      const emptyB = await getHowIWork(b.coachId, sql);
      expect(emptyB.has_method).toBe(false);
      expect(emptyB.body_text).toBeNull();
      expect(emptyB.pdf).toBeNull();

      await upsertHowIWorkText(a.coachId, 'Primero estaciones, luego carrera', sql);
      await putHowIWorkPdf(
        a.coachId,
        { filename: 'metodo.pdf', bytes: PDF_BYTES, byte_size: PDF_BYTES.length },
        sql,
      );

      const stillB = await getHowIWork(b.coachId, sql);
      expect(stillB.has_method).toBe(false);
      expect(stillB.body_text).toBeNull();
      expect(await getHowIWorkPdfBytes(b.coachId, sql)).toBeNull();

      const readA = await getHowIWork(a.coachId, sql);
      expect(readA.has_method).toBe(true);
      expect(readA.body_text).toBe('Primero estaciones, luego carrera');
      expect(readA.pdf?.filename).toBe('metodo.pdf');

      const bytesA = await getHowIWorkPdfBytes(a.coachId, sql);
      expect(bytesA?.byte_size).toBe(PDF_BYTES.length);

      const afterDelete = await deleteHowIWorkPdf(a.coachId, sql);
      expect(afterDelete.pdf).toBeNull();
      expect(afterDelete.has_method).toBe(true);
      expect(afterDelete.body_text).toBe('Primero estaciones, luego carrera');
    } finally {
      await sql`delete from coach_how_i_work where coach_id in (${a.coachId}, ${b.coachId})`;
      await a.cleanup();
      await b.cleanup();
    }
  });
});
