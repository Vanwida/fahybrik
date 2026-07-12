/**
 * DOBLES LIVE PRESENCE (#48-ish live dobles) — real-DB integration tests for the
 * heartbeat writer + partner reader behind /api/athlete/dobles/live. No SQL mocked
 * (real Neon branch). Requires migration 0128 applied.
 *
 * Covers:
 *   • heartbeat upsert — two heartbeats for the same athlete leave ONE row, updated;
 *   • ownership — a heartbeat on an assignment the athlete does NOT own → 'not_found'
 *     (the route's 404), never a leak;
 *   • privacy — a 'self_only' assignment → 'session_private' (the route's 409), so a
 *     private session never emits presence;
 *   • finished-only normalization — final_time_s sent on a non-finished heartbeat is
 *     stored as NULL;
 *   • reader — GET-shaped load returns age_s (server-computed) and the finished row
 *     stays visible; an expired row (>6 h) reads as { partner: null };
 *   • no pair — loadDoublesTrainingPartner resolves null for a partnerless athlete,
 *     the decisive input that makes both verbs answer 404 no_partner.
 *
 * WRITE, do NOT run (TCP egress is blocked; Alex runs the suite against a branch).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

// Real-DB txns on a cold Neon branch endpoint exceed the 5s default. 30s headroom.
const DB_TEST_TIMEOUT_MS = 30_000;

import {
  saveDoblesLiveStatus,
  loadPartnerLiveStatus,
} from '@/lib/athlete/dobles-live';
import { loadDoublesTrainingPartner } from '@/lib/athlete/doubles-training-partner';
import { createDoublesPair } from '@/lib/dashboard/coach/doubles-pairs';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('dobles live presence — heartbeat + partner status (real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  afterAll(async () => {
    await closeTestSql();
  });

  /** A second athlete (+ its user) under the SAME coach as the fixture. */
  async function makeSecondAthlete(fx: Fixture): Promise<{ athleteId: number; userId: number }> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await sql<{ id: string }[]>`
      insert into users (email, role) values (${'live-b-' + suffix + '@test.local'}, 'athlete')
      returning id::text
    `;
    const userId = Number(user[0]!.id);
    const athlete = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userId}, ${fx.coachId}, 'Marta Ruiz')
      returning id::text
    `;
    const athleteId = Number(athlete[0]!.id);
    cleanups.push(async () => {
      // dobles_live_status + workout_assignments cascade on athlete delete; pairs
      // reference athletes on delete cascade too. Delete pairs first to be explicit.
      await sql`delete from doubles_pairs where athlete_a_id = ${athleteId} or athlete_b_id = ${athleteId}`;
      await sql`delete from workout_assignments where athlete_id = ${athleteId}`;
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
    });
    return { athleteId, userId };
  }

  /** Insert an assignment for an arbitrary athlete with an explicit visibility. */
  async function insertAssignment(
    athleteId: number,
    templateId: number,
    visibility: 'shared' | 'self_only' = 'shared',
  ): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into workout_assignments (
        athlete_id, scheduled_for, template_id, template_version, status, partner_visibility
      )
      values (${athleteId}, current_date, ${templateId}, 1, 'scheduled', ${visibility})
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  /** Fresh coach + athlete A (viewer) + athlete B (partner) linked into a pair. */
  async function setup(): Promise<{
    fx: Fixture;
    aId: number;
    b: { athleteId: number; userId: number };
    templateId: number;
  }> {
    const fx = await makeCoachAndAthlete(sql); // A = viewer/self
    cleanups.push(fx.cleanup);
    const b = await makeSecondAthlete(fx); // B = partner
    await createDoublesPair({
      coach_id: fx.coachId,
      athlete_a_id: fx.athleteId,
      athlete_b_id: b.athleteId,
      client: sql,
    });
    const templateId = await makeTemplate({ fx, name: 'Joint session' });
    return { fx, aId: fx.athleteId, b, templateId };
  }

  test(
    'heartbeat upserts — two heartbeats leave one row, updated',
    async () => {
      const { aId, templateId } = await setup();
      const assignmentId = await insertAssignment(aId, templateId);

      const r1 = await saveDoblesLiveStatus(
        {
          athleteId: aId,
          input: {
            assignment_id: assignmentId,
            phase: 'active',
            workout_title: 'El entreno de hoy',
            block_name: 'Remo ergo',
            progress_text: 'Tramo 1 de 4 · Bloque 1',
            elapsed_s: 60,
            hr_bpm: 150,
          },
        },
        sql,
      );
      expect(r1.ok).toBe(true);

      const r2 = await saveDoblesLiveStatus(
        {
          athleteId: aId,
          input: {
            assignment_id: assignmentId,
            phase: 'active',
            workout_title: 'El entreno de hoy',
            block_name: 'Sled push',
            progress_text: 'Tramo 2 de 4 · Bloque 3',
            elapsed_s: 300,
            hr_bpm: 168,
          },
        },
        sql,
      );
      expect(r2.ok).toBe(true);

      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from dobles_live_status where athlete_id = ${aId}
      `;
      expect(rows[0]!.n).toBe(1);

      const row = await sql<{ elapsed_s: number; block_name: string; progress_text: string }[]>`
        select elapsed_s, block_name, progress_text
        from dobles_live_status where athlete_id = ${aId} limit 1
      `;
      expect(row[0]!.elapsed_s).toBe(300);
      expect(row[0]!.block_name).toBe('Sled push');
      expect(row[0]!.progress_text).toBe('Tramo 2 de 4 · Bloque 3');
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'ownership — heartbeat on an assignment the athlete does not own → not_found',
    async () => {
      const { aId, b, templateId } = await setup();
      // Assignment owned by B, but A tries to broadcast it.
      const bAssignmentId = await insertAssignment(b.athleteId, templateId);

      const res = await saveDoblesLiveStatus(
        {
          athleteId: aId,
          input: {
            assignment_id: bAssignmentId,
            phase: 'active',
            workout_title: 'Ajeno',
            elapsed_s: 10,
          },
        },
        sql,
      );
      expect(res).toEqual({ ok: false, reason: 'not_found' });

      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from dobles_live_status where athlete_id = ${aId}
      `;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'privacy — a self_only assignment never emits presence → session_private',
    async () => {
      const { aId, templateId } = await setup();
      const privateAssignmentId = await insertAssignment(aId, templateId, 'self_only');

      const res = await saveDoblesLiveStatus(
        {
          athleteId: aId,
          input: {
            assignment_id: privateAssignmentId,
            phase: 'active',
            workout_title: 'Sesión privada',
            elapsed_s: 30,
          },
        },
        sql,
      );
      expect(res).toEqual({ ok: false, reason: 'session_private' });

      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from dobles_live_status where athlete_id = ${aId}
      `;
      expect(rows[0]!.n).toBe(0);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'finished-only — final_time_s on a non-finished heartbeat is stored NULL',
    async () => {
      const { aId, templateId } = await setup();
      const assignmentId = await insertAssignment(aId, templateId);

      const res = await saveDoblesLiveStatus(
        {
          athleteId: aId,
          input: {
            assignment_id: assignmentId,
            phase: 'active',
            workout_title: 'En curso',
            elapsed_s: 120,
            final_time_s: 2832, // client bug: sent on a live heartbeat
            final_rpe: 8,
          },
        },
        sql,
      );
      expect(res.ok).toBe(true);

      const row = await sql<{ final_time_s: number | null; final_rpe: string | null }[]>`
        select final_time_s, final_rpe from dobles_live_status where athlete_id = ${aId} limit 1
      `;
      expect(row[0]!.final_time_s).toBeNull();
      expect(row[0]!.final_rpe).toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'reader — partner status returns age_s, finished stays visible',
    async () => {
      const { aId, b, templateId } = await setup();
      // B (the partner) broadcasts a FINISHED session; A reads it.
      const bAssignmentId = await insertAssignment(b.athleteId, templateId);
      const saved = await saveDoblesLiveStatus(
        {
          athleteId: b.athleteId,
          input: {
            assignment_id: bAssignmentId,
            phase: 'finished',
            workout_title: 'El entreno de hoy',
            progress_text: 'Completado',
            elapsed_s: 2832,
            final_time_s: 2832,
            final_rpe: 9,
          },
        },
        sql,
      );
      expect(saved.ok).toBe(true);

      // A resolves its partner (B) and reads B's presence, exactly as GET does.
      const partner = await loadDoublesTrainingPartner(BigInt(aId), sql);
      expect(partner).not.toBeNull();
      expect(Number(partner!.partner_athlete_id)).toBe(b.athleteId);

      const status = await loadPartnerLiveStatus(
        { partnerAthleteId: Number(partner!.partner_athlete_id), partnerName: 'Marta' },
        sql,
      );
      expect(status.partner).not.toBeNull();
      expect(status.partner!.name).toBe('Marta');
      expect(status.partner!.phase).toBe('finished');
      expect(status.partner!.final_time_s).toBe(2832);
      expect(status.partner!.final_rpe).toBe(9);
      // age_s is server-computed and non-negative (row was just written).
      expect(typeof status.partner!.age_s).toBe('number');
      expect(status.partner!.age_s).toBeGreaterThanOrEqual(0);
      expect(status.partner!.age_s).toBeLessThan(60);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'reader — an expired row (>6 h) reads as { partner: null }',
    async () => {
      const { b, templateId } = await setup();
      const bAssignmentId = await insertAssignment(b.athleteId, templateId);
      await saveDoblesLiveStatus(
        {
          athleteId: b.athleteId,
          input: {
            assignment_id: bAssignmentId,
            phase: 'active',
            workout_title: 'Hace rato',
            elapsed_s: 100,
          },
        },
        sql,
      );
      // Age the row past the 6 h presence window.
      await sql`
        update dobles_live_status set updated_at = now() - interval '7 hours'
        where athlete_id = ${b.athleteId}
      `;

      const status = await loadPartnerLiveStatus(
        { partnerAthleteId: b.athleteId, partnerName: 'Marta' },
        sql,
      );
      expect(status.partner).toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'no pair — a partnerless athlete resolves null (drives 404 no_partner)',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const partner = await loadDoublesTrainingPartner(BigInt(fx.athleteId), sql);
      expect(partner).toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );
});
