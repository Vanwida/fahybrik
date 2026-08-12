// resolveMessageContext — propiedad + etiqueta del contexto de un mensaje
// (migración 0186, docs/DECISIONS.md 2026-08-12 "El chat aprende SOBRE QUÉ va
// el mensaje").
//
// EL FALLO QUE ESTO PREVIENE
// --------------------------
// Cada resolución es UNA consulta con la propiedad DENTRO del WHERE (nunca un
// select previo + un check separado), así que "no existe" y "es de otro coach/
// atleta" tienen que colapsar al MISMO resultado (null) — si algún día alguien
// separa esa comprobación en dos pasos, un id ajeno podría filtrar si existe.
//
// Contra DB real: lo que se prueba ES el SQL (joins, ownership, el merge de
// `coach_exercise_overrides`). Se salta con aviso cuando no hay
// TEST_DATABASE_URL.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveMessageContext } from '@/lib/chat/context';
import { getOrCreateThread, listMessages, sendMessage } from '@/lib/chat/service';
import { upsertCoachExerciseOverride } from '@/lib/exercises/coach-override';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('resolveMessageContext (DB real)', () => {
  const sql = getTestSql();
  let mine: Fixture;
  let other: Fixture; // otro coach + otro atleta — el caso "ajeno"

  // session
  let templateId = 0;
  let assignmentId = '';
  let otherAssignmentId = '';
  let segmentId = '';
  let segmentExerciseId = 0;

  // exercise
  let baseExerciseId = 0; // coach_id null — visible a todos
  let ownExerciseId = 0; // PROPIO de `mine` — invisible a `other`

  // race
  let raceId = '';
  let otherRaceId = '';

  const raceIds: string[] = [];

  beforeAll(async () => {
    mine = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);

    templateId = await makeTemplate({ fx: mine, name: 'Fuerza A' });
    segmentExerciseId = await makeExercise({ fx: mine, name: 'Back squat' });

    const assignId = await makeAssignment({
      fx: mine,
      templateId,
      scheduledForIso: '2026-08-18', // martes — "mar 18"
    });
    assignmentId = String(assignId);

    const otherTemplateId = await makeTemplate({ fx: other, name: 'Otro entreno' });
    const otherAssignId = await makeAssignment({
      fx: other,
      templateId: otherTemplateId,
      scheduledForIso: '2026-08-19',
    });
    otherAssignmentId = String(otherAssignId);

    const segRows = await sql<{ id: string }[]>`
      insert into template_segments (template_id, position, exercise_id, params_json)
      values (${templateId}, 0, ${segmentExerciseId}, '{}'::jsonb)
      returning id::text as id
    `;
    segmentId = segRows[0]!.id;

    baseExerciseId = await makeExercise({ fx: mine, name: 'Wall Ball' }); // coachId omitido = BASE
    ownExerciseId = await makeExercise({ fx: mine, name: 'Ejercicio Propio', coachId: mine.coachId });

    const raceRows = await sql<{ id: string }[]>`
      insert into races (
        athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, status, source
      ) values (
        ${mine.athleteId}, 'HYROX Barcelona', 'hyrox', 'singles', 'open', 'men', 'target',
        '2026-10-04'::date, 'registered', 'manual'
      )
      returning id::text as id
    `;
    raceId = raceRows[0]!.id;
    raceIds.push(raceId);

    const otherRaceRows = await sql<{ id: string }[]>`
      insert into races (
        athlete_id, name, event_type, format, division, gender_category, priority,
        race_date, status, source
      ) values (
        ${other.athleteId}, 'HYROX de otro', 'hyrox', 'singles', 'open', 'men', 'target',
        '2026-11-01'::date, 'registered', 'manual'
      )
      returning id::text as id
    `;
    otherRaceId = otherRaceRows[0]!.id;
    raceIds.push(otherRaceId);
  });

  afterAll(async () => {
    // Las carreras cascadean con el atleta (races.athlete_id on delete cascade),
    // pero se limpian explícitas antes por si el orden de fixtures cambia.
    if (raceIds.length > 0) {
      await sql`delete from races where id in ${sql(raceIds)}`;
    }
    await other.cleanup();
    await mine.cleanup();
    await closeTestSql();
  });

  describe('kind: session', () => {
    it('propia, sin sub → el entreno entero, "título · día abreviado"', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: assignmentId },
      });
      expect(ctx).toEqual({
        kind: 'session',
        ref: assignmentId,
        sub: null,
        label: 'Fuerza A · mar 18',
      });
    });

    it('propia, con sub → el ejercicio DENTRO del entreno, "ejercicio · título, día"', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: assignmentId, sub: segmentId },
      });
      expect(ctx).toEqual({
        kind: 'session',
        ref: assignmentId,
        sub: segmentId,
        label: 'Back squat · Fuerza A, mar 18',
      });
    });

    it('ajena — el entreno de otro atleta resuelve IGUAL que uno inexistente', async () => {
      const foreign = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: otherAssignmentId },
      });
      const inexistent = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: '999999999' },
      });
      expect(foreign).toBeNull();
      expect(inexistent).toBeNull();
    });

    it('sub que no pertenece a la plantilla de esa sesión → null (misma respuesta)', async () => {
      // segmentId existe, pero bajo la plantilla de OTRO fixture — el join por
      // template_id lo descarta aunque el id del segmento sea real.
      const otherTemplateId = await makeTemplate({ fx: other, name: 'Plantilla ajena' });
      const otherExerciseId = await makeExercise({ fx: other, name: 'Ejercicio ajeno' });
      const rows = await sql<{ id: string }[]>`
        insert into template_segments (template_id, position, exercise_id, params_json)
        values (${otherTemplateId}, 0, ${otherExerciseId}, '{}'::jsonb)
        returning id::text as id
      `;
      const foreignSegmentId = rows[0]!.id;

      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: assignmentId, sub: foreignSegmentId },
      });
      expect(ctx).toBeNull();
    });

    it('ref no numérico → null, nunca un error de SQL', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: 'not-a-number' },
      });
      expect(ctx).toBeNull();
    });
  });

  describe('kind: exercise', () => {
    it('BASE (coach_id null) — visible a cualquier coach', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(other.coachId),
        input: { kind: 'exercise', ref: String(baseExerciseId) },
      });
      expect(ctx).toEqual({ kind: 'exercise', ref: String(baseExerciseId), sub: null, label: 'Wall Ball' });
    });

    it('PROPIO — visible a SU coach', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'exercise', ref: String(ownExerciseId) },
      });
      expect(ctx).toEqual({
        kind: 'exercise',
        ref: String(ownExerciseId),
        sub: null,
        label: 'Ejercicio Propio',
      });
    });

    it('PROPIO de otro coach — invisible, MISMA respuesta que inexistente', async () => {
      const foreign = await resolveMessageContext({
        sql,
        athlete_id: BigInt(other.athleteId),
        coach_id: BigInt(other.coachId),
        input: { kind: 'exercise', ref: String(ownExerciseId) },
      });
      const inexistent = await resolveMessageContext({
        sql,
        athlete_id: BigInt(other.athleteId),
        coach_id: BigInt(other.coachId),
        input: { kind: 'exercise', ref: '999999999' },
      });
      expect(foreign).toBeNull();
      expect(inexistent).toBeNull();
    });

    it('personalizado (override) — SU coach ve el nombre forkeado, el resto ve el BASE', async () => {
      await upsertCoachExerciseOverride(sql, {
        coach_id: BigInt(mine.coachId),
        exercise_id: BigInt(baseExerciseId),
        patch: { name: 'Wall Ball (mi variante)' },
      });
      try {
        const mineView = await resolveMessageContext({
          sql,
          athlete_id: BigInt(mine.athleteId),
          coach_id: BigInt(mine.coachId),
          input: { kind: 'exercise', ref: String(baseExerciseId) },
        });
        const otherView = await resolveMessageContext({
          sql,
          athlete_id: BigInt(other.athleteId),
          coach_id: BigInt(other.coachId),
          input: { kind: 'exercise', ref: String(baseExerciseId) },
        });
        expect(mineView?.label).toBe('Wall Ball (mi variante)');
        expect(otherView?.label).toBe('Wall Ball');
      } finally {
        await sql`
          delete from coach_exercise_overrides
          where coach_id = ${mine.coachId} and exercise_id = ${baseExerciseId}
        `;
      }
    });
  });

  describe('kind: race', () => {
    it('propia — "nombre · día mes"', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'race', ref: raceId },
      });
      expect(ctx).toEqual({
        kind: 'race',
        ref: raceId,
        sub: null,
        label: 'HYROX Barcelona · 4 oct',
      });
    });

    it('ajena — MISMA respuesta que inexistente', async () => {
      const foreign = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'race', ref: otherRaceId },
      });
      const inexistent = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'race', ref: '999999999' },
      });
      expect(foreign).toBeNull();
      expect(inexistent).toBeNull();
    });
  });

  it('sin contexto en el mensaje → null, sin tocar la base', async () => {
    const ctx = await resolveMessageContext({
      sql,
      athlete_id: BigInt(mine.athleteId),
      coach_id: BigInt(mine.coachId),
      input: undefined,
    });
    expect(ctx).toBeNull();
  });

  describe('sendMessage — persiste y devuelve el contexto ya resuelto', () => {
    it('con contexto: las 4 columnas se guardan y el DTO las trae de vuelta', async () => {
      const ctx = await resolveMessageContext({
        sql,
        athlete_id: BigInt(mine.athleteId),
        coach_id: BigInt(mine.coachId),
        input: { kind: 'session', ref: assignmentId },
      });
      expect(ctx).not.toBeNull();

      const { thread_id } = await getOrCreateThread({
        sql,
        coach_id: BigInt(mine.coachId),
        athlete_id: BigInt(mine.athleteId),
      });

      const saved = await sendMessage({
        sql,
        thread_id,
        sender_user_id: BigInt(mine.athleteUserId),
        sender_role: 'athlete',
        input: { body: '¿cuántas series hago?' },
        context: ctx,
      });
      // La terna congelada es la MISMA de `resolveMessageContext`; la
      // previsualización (0186 ampliación, ver context-preview.db.test.ts) se
      // añade encima — el único segmento del fixture ('Fuerza A', sin
      // block_title ni prescription_json) es "1 bloque · Sin detallar", y el
      // assignment nace 'scheduled' → pendiente.
      const expected = { ...ctx, preview: '1 bloque · Sin detallar', exists: true, state: 'pending' };
      expect(saved.context).toEqual(expected);

      const { messages } = await listMessages({ sql, thread_id, cursor: null, limit: 5 });
      const reread = messages.find((m) => m.id === saved.id);
      expect(reread?.context).toEqual(expected);
    });

    it('sin contexto: el DTO trae `context: null` explícito (no ausente)', async () => {
      const { thread_id } = await getOrCreateThread({
        sql,
        coach_id: BigInt(mine.coachId),
        athlete_id: BigInt(mine.athleteId),
      });
      const saved = await sendMessage({
        sql,
        thread_id,
        sender_user_id: BigInt(mine.athleteUserId),
        sender_role: 'athlete',
        input: { body: 'sin contexto, como siempre' },
      });
      expect(saved.context).toBeNull();
    });
  });

  it('la DB rechaza context_sub con un kind distinto de session, aunque la app no lo intente', async () => {
    const { thread_id } = await getOrCreateThread({
      sql,
      coach_id: BigInt(mine.coachId),
      athlete_id: BigInt(mine.athleteId),
    });
    await expect(
      sql`
        insert into chat_messages (
          thread_id, sender_user_id, sender_role, body,
          context_kind, context_ref, context_sub, context_label
        ) values (
          ${thread_id}::bigint, ${mine.athleteUserId}, 'athlete', 'x',
          'race', ${raceId}, 'algo', 'HYROX Barcelona · 4 oct'
        )
      `,
    ).rejects.toThrow();
  });
});
