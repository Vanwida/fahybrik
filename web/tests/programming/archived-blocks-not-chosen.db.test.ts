// Un bloque archivado (0236) está retirado: la Biblioteca lo sigue mostrando en
// «Archivados», pero nadie lo elige para componer. Los tres lectores que ofrecen
// bloques para USAR — el compositor de la IA y el importador
// (loadComposableBlocks), la lista del editor (listBlocks, /api/coach/blocks) y
// la búsqueda del asistente (listBlocksWithStructure, MCP search_library) —
// lo dejan fuera. Igual que ya hacían las plantillas y los niveles retirados.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadComposableBlocks } from '@/lib/dashboard/coach/ai/blocks-catalog';
import { listBlocks, listBlocksWithStructure } from '@/lib/dashboard/coach/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeLibraryBlock, type Fixture } from '../utils/db-fixtures';

describeWithDb('bloques archivados: no se eligen (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let activo = 0;
  let archivado = 0;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    activo = await makeLibraryBlock({ fx, title: 'Rodaje suave', description: '40 min Z2' });
    archivado = await makeLibraryBlock({ fx, title: 'Series viejas', description: '10x400' });
    await sql`update blocks set archived_at = now() where id = ${archivado}`;
  });

  afterAll(async () => {
    await fx?.cleanup();
    await closeTestSql();
  });

  const ids = (rows: Array<{ id: number | string }>) => rows.map((r) => Number(r.id));

  it('el compositor de la IA y el importador no lo ven', async () => {
    const got = ids(await loadComposableBlocks(fx.coachId, sql));
    expect(got).toContain(activo);
    expect(got).not.toContain(archivado);
  });

  it('la lista del editor, con y sin grupo, no lo ofrece', async () => {
    expect(ids(await listBlocks(fx.coachId, null, sql))).toEqual([activo]);
    expect(ids(await listBlocks(fx.coachId, 1, sql))).toEqual([activo]);
  });

  it('la búsqueda del asistente no lo propone', async () => {
    expect(ids(await listBlocksWithStructure(fx.coachId, null, sql))).toEqual([activo]);
  });

  it('desarchivado, vuelve a elegirse', async () => {
    await sql`update blocks set archived_at = null where id = ${archivado}`;
    expect(ids(await listBlocks(fx.coachId, null, sql)).sort()).toEqual([activo, archivado].sort());
  });
});
