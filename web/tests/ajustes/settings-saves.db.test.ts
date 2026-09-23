// Ajustes guarda CAMPO A CAMPO al salir de cada uno: cada petición lleva una
// sola clave y no puede pisar las demás, ni las de otro coach. Contra la base
// real y por las rutas que llaman los paneles.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import {
  DEFAULT_LEVEL_AXIS_LABEL,
  effectiveLevelAxisLabel,
  normalizeLevelAxisLabel,
} from '@fahybrid/shared/domain/coach/level-axis';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
const { getCoachSession } = await import('@/lib/auth/coach-session');
const profileRoute = await import('@/app/api/coach/profile/route');
const clubRoute = await import('@/app/api/coach/club/route');
const axisRoute = await import('@/app/api/coach/level-axis/route');
const thresholdsRoute = await import('@/app/api/coach/signal-thresholds/route');
const autoPublishRoute = await import('@/app/api/coach/weeks/auto-publish/route');

const req = (method: string, body: unknown) =>
  new Request('http://x', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('eje de clasificación · dominio', () => {
  test('vacío o el propio defecto se guardan como NULL; se recortan espacios', () => {
    expect(normalizeLevelAxisLabel('')).toBeNull();
    expect(normalizeLevelAxisLabel('   ')).toBeNull();
    expect(normalizeLevelAxisLabel(DEFAULT_LEVEL_AXIS_LABEL)).toBeNull();
    expect(normalizeLevelAxisLabel('  Turno   de  mañana ')).toBe('Turno de mañana');
  });
  test('sin etiqueta propia se pinta el defecto', () => {
    expect(effectiveLevelAxisLabel(null)).toBe(DEFAULT_LEVEL_AXIS_LABEL);
    expect(effectiveLevelAxisLabel('Grupo')).toBe('Grupo');
  });
});

describeWithDb('Ajustes · guardar campo a campo (DB real)', () => {
  const sql = getTestSql();
  let a: Fixture;
  let b: Fixture;
  const as = (fx: Fixture) => vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(fx.coachId) } as never);

  beforeAll(async () => {
    a = await makeCoachAndAthlete(sql);
    b = await makeCoachAndAthlete(sql);
    await sql`update coaches set bio = 'bio de A', studio_name = 'Box A' where id = ${a.coachId}`;
    await sql`update coaches set bio = 'bio de B' where id = ${b.coachId}`;
  });

  afterAll(async () => {
    await sql`delete from coach_signal_thresholds where coach_id in (${a.coachId}, ${b.coachId})`;
    await a.cleanup();
    await b.cleanup();
    await closeTestSql();
  });

  test('perfil: un PATCH de una clave no toca las demás ni al otro coach', async () => {
    as(a);
    const res = await profileRoute.PATCH(req('PATCH', { full_name: '  Ana Ruiz ' }));
    expect(res.status).toBe(200);
    const [row] = await sql<{ full_name: string; bio: string | null; studio_name: string | null }[]>`
      select full_name, bio, studio_name from coaches where id = ${a.coachId}`;
    expect(row).toEqual({ full_name: 'Ana Ruiz', bio: 'bio de A', studio_name: 'Box A' });
    const [other] = await sql<{ bio: string | null }[]>`select bio from coaches where id = ${b.coachId}`;
    expect(other?.bio).toBe('bio de B');
  });

  test('perfil: el nombre no puede quedar vacío; vaciar la bio la borra', async () => {
    as(a);
    expect((await profileRoute.PATCH(req('PATCH', { full_name: '   ' }))).status).toBe(422);
    expect((await profileRoute.PATCH(req('PATCH', { bio: '' }))).status).toBe(200);
    const [row] = await sql<{ bio: string | null }[]>`select bio from coaches where id = ${a.coachId}`;
    expect(row?.bio).toBeNull();
  });

  test('club: box y dirección van al perfil; nombre del club a la piel, sin cruzarse', async () => {
    as(a);
    expect((await clubRoute.PATCH(req('PATCH', { name: 'Club Norte' }))).status).toBe(200);
    expect((await profileRoute.PATCH(req('PATCH', { location: 'Calle Mayor 3' }))).status).toBe(200);
    const [row] = await sql<{ club_skin_name: string | null; studio_name: string | null; location: string | null }[]>`
      select club_skin_name, studio_name, location from coaches where id = ${a.coachId}`;
    expect(row).toEqual({ club_skin_name: 'Club Norte', studio_name: 'Box A', location: 'Calle Mayor 3' });
    expect((await clubRoute.PATCH(req('PATCH', { accent_hex: 'rojo' }))).status).toBe(422);
  });

  test('eje: se guarda, se lee efectivo, y vacío vuelve al defecto', async () => {
    as(a);
    const set = await axisRoute.PATCH(req('PATCH', { level_axis_label: 'Turno' }));
    expect(await set.json()).toMatchObject({ level_axis_label: 'Turno', effective_label: 'Turno' });
    as(b);
    expect(await (await axisRoute.GET()).json()).toMatchObject({ level_axis_label: null, effective_label: DEFAULT_LEVEL_AXIS_LABEL });
    as(a);
    const reset = await axisRoute.PATCH(req('PATCH', { level_axis_label: '' }));
    expect(await reset.json()).toMatchObject({ level_axis_label: null, effective_label: DEFAULT_LEVEL_AXIS_LABEL });
    expect((await axisRoute.PATCH(req('PATCH', { level_axis_label: 'x'.repeat(30) }))).status).toBe(422);
  });

  test('umbrales: uno a uno, null vuelve al defecto y lo incoherente se rechaza con el motivo', async () => {
    as(a);
    const one = await thresholdsRoute.PUT(req('PUT', { missed_sessions_min: 3 }));
    const body = (await one.json()) as { missed_sessions_min: number; custom_keys: string[]; defaults: Record<string, number> };
    expect(body.missed_sessions_min).toBe(3);
    expect(body.custom_keys).toEqual(['missed_sessions_min']);
    const bad = await thresholdsRoute.PUT(req('PUT', { readiness_caution_min: 90 }));
    expect(bad.status).toBe(422);
    const err = (await bad.json()) as { error: { details: { issues: { message: string }[] } } };
    expect(err.error.details.issues[0]?.message).toMatch(/cautela/);
    const back = (await (await thresholdsRoute.PUT(req('PUT', { missed_sessions_min: null }))).json()) as typeof body;
    expect(back.missed_sessions_min).toBe(back.defaults.missed_sessions_min);
    expect(back.custom_keys).toEqual([]);
  });

  test('publicar N días antes: se guarda, fuera de rango se rechaza, null vuelve al defecto', async () => {
    as(a);
    const set = (await (await autoPublishRoute.PATCH(req('PATCH', { auto_publish_days_before: 4 }))).json()) as {
      auto_publish_days_before: number | null;
      effective_days: number;
      default_days: number;
    };
    expect(set).toMatchObject({ auto_publish_days_before: 4, effective_days: 4 });
    expect((await autoPublishRoute.PATCH(req('PATCH', { auto_publish_days_before: 99 }))).status).toBe(422);
    const reset = (await (await autoPublishRoute.PATCH(req('PATCH', { auto_publish_days_before: null }))).json()) as typeof set;
    expect(reset.auto_publish_days_before).toBeNull();
    expect(reset.effective_days).toBe(reset.default_days);
  });
});
