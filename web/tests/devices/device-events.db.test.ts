/**
 * El registro técnico de los aparatos (0273): un reenvío es el mismo evento, lo
 * de un atleta nunca pisa lo de otro aunque compartan instalación, y a los 30
 * días se borra.
 */
import { afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';

import { deviceEventsBatchSchema, pruneDeviceEvents, recordDeviceEvents, type DeviceEvent } from '@/lib/devices/device-events';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

function ev(install: string, seq: number, over: Partial<DeviceEvent> = {}): DeviceEvent {
  return deviceEventsBatchSchema.parse({
    events: [{
      install_id: install, seq, device: 'phone', kind: 'link', name: 'start_watch_app',
      at: '2026-09-24T21:00:00.000Z', outcome: 'failed', code: 7, domain: 'WCErrorDomain',
      detail: 'watch app not installed', app_version: '1.0', app_build: '101', os_version: '26.0', device_model: 'iPhone17,1',
      ...over,
    }],
  }).events[0]!;
}

describeWithDb('device_events', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  test('un reenvío del mismo lote no duplica; un evento nuevo sí entra', async () => {
    const A = await makeCoachAndAthlete(sql);
    const install = randomUUID();
    try {
      const batch = [ev(install, 1), ev(install, 2, { name: 'mirroring_started', outcome: 'ok', code: null })];
      expect(await recordDeviceEvents({ athleteId: BigInt(A.athleteId), events: batch, sql })).toEqual({ stored: 2, duplicates: 0 });
      expect(await recordDeviceEvents({ athleteId: BigInt(A.athleteId), events: [...batch, ev(install, 3)], sql })).toEqual({ stored: 1, duplicates: 2 });
      const rows = await sql<{ seq: string; name: string; code: number | null }[]>`
        select seq::text as seq, name, code from device_events where athlete_id = ${A.athleteId} order by seq`;
      expect(rows.map((r) => [r.seq, r.name, r.code])).toEqual([['1', 'start_watch_app', 7], ['2', 'mirroring_started', null], ['3', 'start_watch_app', 7]]);
    } finally {
      await A.cleanup();
    }
  });

  test('dos atletas en la misma instalación (móvil compartido) no se pisan', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    const install = randomUUID();
    try {
      await recordDeviceEvents({ athleteId: BigInt(A.athleteId), events: [ev(install, 1)], sql });
      expect(await recordDeviceEvents({ athleteId: BigInt(B.athleteId), events: [ev(install, 1)], sql })).toEqual({ stored: 1, duplicates: 0 });
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('a los 30 días se borra: el escritor poda lo suyo, el cron lo de todos', async () => {
    const A = await makeCoachAndAthlete(sql);
    const B = await makeCoachAndAthlete(sql);
    const install = randomUUID();
    try {
      await recordDeviceEvents({ athleteId: BigInt(A.athleteId), events: [ev(install, 1)], sql });
      await recordDeviceEvents({ athleteId: BigInt(B.athleteId), events: [ev(install, 1)], sql });
      await sql`update device_events set received_at = now() - interval '31 days' where athlete_id in ${sql([A.athleteId, B.athleteId])}`;

      // A vuelve a enviar: lo suyo viejo se va; lo de B sigue hasta el cron.
      await recordDeviceEvents({ athleteId: BigInt(A.athleteId), events: [ev(install, 2)], sql });
      const left = await sql<{ athlete_id: string; seq: string }[]>`
        select athlete_id::text as athlete_id, seq::text as seq from device_events
        where athlete_id in ${sql([A.athleteId, B.athleteId])} order by athlete_id, seq`;
      expect(left).toEqual([{ athlete_id: String(A.athleteId), seq: '2' }, { athlete_id: String(B.athleteId), seq: '1' }]);

      expect(await pruneDeviceEvents(sql)).toBeGreaterThanOrEqual(1);
      const afterCron = await sql`select 1 from device_events where athlete_id = ${B.athleteId}`;
      expect(afterCron).toHaveLength(0);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('el esquema: un detail largo se recorta, un nombre inválido rompe el lote', () => {
    expect(ev(randomUUID(), 1, { detail: 'x'.repeat(1000) }).detail).toHaveLength(300);
    expect(() => ev(randomUUID(), 1, { name: 'Start Watch' })).toThrow();
    expect(() => ev(randomUUID(), -1)).toThrow();
  });
});
