// La PREVISUALIZACIÓN viva del contexto de un mensaje (ampliación de la
// migración 0186, docs/DECISIONS.md 12-ago "El chat aprende SOBRE QUÉ va el
// mensaje"). Ver `web/lib/chat/context-preview.ts`.
//
// QUÉ CUBRE ESTA SUITE
// --------------------
//   · los cuatro `kind` con datos reales (session sin/con `sub`, exercise, race)
//   · el estado done/pending de una sesión
//   · el borde honesto: una entidad que SE BORRÓ después de citarse (la
//     etiqueta congelada sobrevive; la previsualización cae a null/false)
//   · el lote: N contextos no disparan N consultas — se cuenta con el hook
//     `debug` real de `postgres`, que fira por cada round-trip a la conexión,
//     no por cada fragmento SQL construido en JS (así una nested helper como
//     `messageColumns` no infla el recuento).
//
// Contra DB real (Neon test branch) — se salta con aviso cuando no hay
// TEST_DATABASE_URL, igual que el resto de `tests/chat/*.db.test.ts`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { resolveContextPreviews, previewKey } from '@/lib/chat/context-preview';
import { raceDayLabel } from '@/lib/chat/context';
import type { ChatContext } from '@/lib/chat/schema';
import { addDays, isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import { closeTestSql, describeWithDb, getTestDbUrl, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

describeWithDb('resolveContextPreviews (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  // session SIN sub — 3 bloques con reloj conocido (30 min).
  let templateA = 0;
  let assignmentPending = ''; // status 'scheduled'
  let assignmentDone = ''; // status 'completed', MISMA plantilla que la pendiente

  // session CON sub — una línea de fuerza real.
  let templateB = 0;
  let assignmentB = '';
  let backSquatSegmentId = '';

  // exercise
  let cardioExerciseId = 0; // category 'cardio', modality 'row' → dos etiquetas
  let strengthExerciseId = 0; // category 'strength', modality 'strength' → colapsa a una

  // race
  let raceIds: string[] = [];
  let raceFutureId = '';
  let racePastId = '';
  let raceTodayId = '';
  let raceNoGoalId = '';

  const todayBox = startOfDayInBox(new Date());

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);

    // ── session sin sub ──────────────────────────────────────────────────
    templateA = await makeTemplate({ fx, name: 'Fuerza A (preview)' });
    const warmupEx = await makeExercise({ fx, name: 'Bike suave' });
    const mainEx = await makeExercise({ fx, name: 'Circuito funcional' });
    const cooldownEx = await makeExercise({ fx, name: 'Movilidad' });

    await sql`
      insert into template_segments
        (template_id, position, block_position, block_title, exercise_id, params_json, prescription_json)
      values
        (${templateA}, 0, 0, 'Calentamiento', ${warmupEx}, '{}'::jsonb,
         ${sql.json({ scheme: 'steady', total_s: 300, modality: 'bike' } as never)}),
        (${templateA}, 1, 1, 'Series', ${mainEx}, '{}'::jsonb,
         ${sql.json({ scheme: 'steady', total_s: 1200, modality: 'functional' } as never)}),
        (${templateA}, 2, 2, 'Vuelta a la calma', ${cooldownEx}, '{}'::jsonb,
         ${sql.json({ scheme: 'steady', total_s: 300, modality: 'mobility' } as never)})
    `;

    assignmentPending = String(
      await makeAssignment({ fx, templateId: templateA, scheduledForIso: '2026-09-01', status: 'scheduled' }),
    );
    assignmentDone = String(
      await makeAssignment({ fx, templateId: templateA, scheduledForIso: '2026-09-08', status: 'completed' }),
    );

    // ── session con sub ──────────────────────────────────────────────────
    templateB = await makeTemplate({ fx, name: 'Fuerza B (preview)' });
    const backSquatEx = await makeExercise({ fx, name: 'Back squat (preview)' });
    const segRows = await sql<{ id: string }[]>`
      insert into template_segments (template_id, position, exercise_id, params_json, prescription_json)
      values (
        ${templateB}, 0, ${backSquatEx}, '{}'::jsonb,
        ${sql.json({
          scheme: 'sets',
          modality: 'strength',
          sets: [
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 90 },
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 90 },
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 90 },
            { measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 80 }, rest_s: 90 },
          ],
        } as never)}
      )
      returning id::text
    `;
    backSquatSegmentId = segRows[0]!.id;
    assignmentB = String(
      await makeAssignment({ fx, templateId: templateB, scheduledForIso: '2026-09-02', status: 'completed' }),
    );

    // ── exercise ──────────────────────────────────────────────────────────
    cardioExerciseId = await makeExercise({ fx, name: 'Remo 500m (preview)', category: 'cardio', modality: 'row' });
    strengthExerciseId = await makeExercise({
      fx,
      name: 'Peso muerto (preview)',
      category: 'strength',
      modality: 'strength',
    });

    // ── race ──────────────────────────────────────────────────────────────
    const mk = async (offsetDays: number, goalSeconds: number | null) => {
      const iso = isoDateString(addDays(todayBox, offsetDays));
      const rows = await sql<{ id: string }[]>`
        insert into races (
          athlete_id, name, event_type, format, division, gender_category, priority,
          race_date, status, source, goal_time_seconds
        ) values (
          ${fx.athleteId}, 'HYROX Preview', 'hyrox', 'singles', 'open', 'men', 'target',
          ${iso}::date, 'registered', 'manual', ${goalSeconds}
        )
        returning id::text
      `;
      return rows[0]!.id;
    };
    raceFutureId = await mk(91, 5100); // 1:25:00
    racePastId = await mk(-12, null);
    raceTodayId = await mk(0, 3600); // 1:00:00
    raceNoGoalId = await mk(30, null);
    raceIds = [raceFutureId, racePastId, raceTodayId, raceNoGoalId];
  });

  afterAll(async () => {
    if (raceIds.length > 0) {
      await sql`delete from races where id in ${sql(raceIds)}`;
    }
    await fx.cleanup();
    await closeTestSql();
  });

  describe('kind: session — sin sub', () => {
    it('reutiliza loadTemplateSummaries: bloques + reloj conocido', async () => {
      const ctx: ChatContext = {
        kind: 'session',
        ref: assignmentPending,
        sub: null,
        label: 'Fuerza A (preview) · mar 1',
      };
      const previews = await resolveContextPreviews(sql, [ctx]);
      expect(previews.get(previewKey(ctx))).toEqual({
        preview: 'Calentamiento · Series · Vuelta a la calma · 30 min',
        exists: true,
        state: 'pending',
      });
    });

    it('estado done — misma plantilla, otro assignment', async () => {
      const ctx: ChatContext = {
        kind: 'session',
        ref: assignmentDone,
        sub: null,
        label: 'Fuerza A (preview) · mar 8',
      };
      const previews = await resolveContextPreviews(sql, [ctx]);
      const p = previews.get(previewKey(ctx));
      expect(p?.state).toBe('done');
      expect(p?.exists).toBe(true);
      expect(p?.preview).toBe('Calentamiento · Series · Vuelta a la calma · 30 min');
    });

    it('borde honesto — el assignment se BORRA después de citarse', async () => {
      const templateId = await makeTemplate({ fx, name: 'Efímera (preview)' });
      const exId = await makeExercise({ fx, name: 'Ejercicio efímero' });
      await sql`
        insert into template_segments (template_id, position, exercise_id, params_json)
        values (${templateId}, 0, ${exId}, '{}'::jsonb)
      `;
      const assignId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-09-15' });
      const ctx: ChatContext = {
        kind: 'session',
        ref: String(assignId),
        sub: null,
        label: 'Efímera (preview) · mar 15', // la etiqueta CONGELADA, no se toca
      };

      const before = await resolveContextPreviews(sql, [ctx]);
      expect(before.get(previewKey(ctx))?.exists).toBe(true);

      await sql`delete from workout_assignments where id = ${assignId}`;

      const after = await resolveContextPreviews(sql, [ctx]);
      expect(after.get(previewKey(ctx))).toEqual({ preview: null, exists: false, state: null });
      // La etiqueta congelada del propio objeto de entrada nunca se tocó — es
      // el llamante (`context-preview` solo añade preview/exists/state) quien
      // la conserva; aquí solo se confirma que la resolución no la necesitó.
      expect(ctx.label).toBe('Efímera (preview) · mar 15');
    });
  });

  describe('kind: session — con sub', () => {
    it('reutiliza prescriptionToText: reps, carga, descanso de ESA línea', async () => {
      const ctx: ChatContext = {
        kind: 'session',
        ref: assignmentB,
        sub: backSquatSegmentId,
        label: 'Back squat (preview) · Fuerza B (preview), mié 2',
      };
      const previews = await resolveContextPreviews(sql, [ctx]);
      expect(previews.get(previewKey(ctx))).toEqual({
        preview: "4×5 @ 80% RM · descanso 90''",
        exists: true,
        state: 'done',
      });
    });

    it('borde honesto — la LÍNEA citada se borra, el entreno sigue existiendo', async () => {
      const templateId = await makeTemplate({ fx, name: 'Con línea efímera' });
      const exId = await makeExercise({ fx, name: 'Línea efímera' });
      const segRows = await sql<{ id: string }[]>`
        insert into template_segments (template_id, position, exercise_id, params_json, prescription_json)
        values (${templateId}, 0, ${exId}, '{}'::jsonb, ${sql.json({ scheme: 'steady', total_s: 60 } as never)})
        returning id::text
      `;
      const segId = segRows[0]!.id;
      const assignId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-09-16', status: 'completed' });
      const ctx: ChatContext = {
        kind: 'session',
        ref: String(assignId),
        sub: segId,
        label: 'Línea efímera · Con línea efímera, mié 16',
      };

      await sql`delete from template_segments where id = ${segId}`;

      const previews = await resolveContextPreviews(sql, [ctx]);
      // El entreno sigue siendo navegable (por eso `state` sigue poblado con
      // el estado REAL del assignment) pero la línea concreta ya no está: su
      // dosis no se inventa.
      expect(previews.get(previewKey(ctx))).toEqual({ preview: null, exists: false, state: 'done' });
    });
  });

  describe('kind: exercise', () => {
    it('categoría + modalidad, del vocabulario del catálogo', async () => {
      const ctx: ChatContext = { kind: 'exercise', ref: String(cardioExerciseId), sub: null, label: 'Remo 500m' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      expect(previews.get(previewKey(ctx))).toEqual({ preview: 'Cardio · Remo', exists: true, state: null });
    });

    it('categoría === modalidad → colapsa a una sola etiqueta', async () => {
      const ctx: ChatContext = {
        kind: 'exercise',
        ref: String(strengthExerciseId),
        sub: null,
        label: 'Peso muerto',
      };
      const previews = await resolveContextPreviews(sql, [ctx]);
      expect(previews.get(previewKey(ctx))).toEqual({ preview: 'Fuerza', exists: true, state: null });
    });

    it('inexistente → exists false, preview null', async () => {
      const ctx: ChatContext = { kind: 'exercise', ref: '999999999', sub: null, label: 'Lo que sea' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      expect(previews.get(previewKey(ctx))).toEqual({ preview: null, exists: false, state: null });
    });
  });

  describe('kind: race', () => {
    it('futura — fecha · en N días · objetivo', async () => {
      const ctx: ChatContext = { kind: 'race', ref: raceFutureId, sub: null, label: 'HYROX Preview · x' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      const expectedDate = raceDayLabel(isoDateString(addDays(todayBox, 91)));
      expect(previews.get(previewKey(ctx))).toEqual({
        preview: `${expectedDate} · en 91 días · objetivo 1:25:00`,
        exists: true,
        state: null,
      });
    });

    it('pasada — cuenta atrás en negativo lee "hace N días"', async () => {
      const ctx: ChatContext = { kind: 'race', ref: racePastId, sub: null, label: 'HYROX Preview · y' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      const expectedDate = raceDayLabel(isoDateString(addDays(todayBox, -12)));
      expect(previews.get(previewKey(ctx))).toEqual({
        preview: `${expectedDate} · hace 12 días`,
        exists: true,
        state: null,
      });
    });

    it('hoy — sin número, "hoy"', async () => {
      const ctx: ChatContext = { kind: 'race', ref: raceTodayId, sub: null, label: 'HYROX Preview · z' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      const expectedDate = raceDayLabel(isoDateString(todayBox));
      expect(previews.get(previewKey(ctx))).toEqual({
        preview: `${expectedDate} · hoy · objetivo 1:00:00`,
        exists: true,
        state: null,
      });
    });

    it('sin objetivo fijado — la línea no promete uno', async () => {
      const ctx: ChatContext = { kind: 'race', ref: raceNoGoalId, sub: null, label: 'HYROX Preview · w' };
      const previews = await resolveContextPreviews(sql, [ctx]);
      const p = previews.get(previewKey(ctx));
      expect(p?.preview).not.toContain('objetivo');
      expect(p?.exists).toBe(true);
    });

    it('borde honesto — la carrera se BORRA después de citarse', async () => {
      const iso = isoDateString(addDays(todayBox, 5));
      const rows = await sql<{ id: string }[]>`
        insert into races (
          athlete_id, name, event_type, format, division, gender_category, priority,
          race_date, status, source
        ) values (
          ${fx.athleteId}, 'Efímera race', 'hyrox', 'singles', 'open', 'men', 'target',
          ${iso}::date, 'registered', 'manual'
        )
        returning id::text
      `;
      const raceId = rows[0]!.id;
      const ctx: ChatContext = { kind: 'race', ref: raceId, sub: null, label: 'Efímera race · alguna fecha' };

      const before = await resolveContextPreviews(sql, [ctx]);
      expect(before.get(previewKey(ctx))?.exists).toBe(true);

      await sql`delete from races where id = ${raceId}`;

      const after = await resolveContextPreviews(sql, [ctx]);
      expect(after.get(previewKey(ctx))).toEqual({ preview: null, exists: false, state: null });
    });
  });

  describe('el lote — N contextos no disparan N consultas', () => {
    it('11 contextos (3 kinds, varias plantillas compartidas) resuelven en un puñado fijo de consultas', async () => {
      const contexts: ChatContext[] = [
        { kind: 'session', ref: assignmentPending, sub: null, label: 'x' },
        { kind: 'session', ref: assignmentDone, sub: null, label: 'x' },
        { kind: 'session', ref: assignmentB, sub: backSquatSegmentId, label: 'x' },
        { kind: 'exercise', ref: String(cardioExerciseId), sub: null, label: 'x' },
        { kind: 'exercise', ref: String(strengthExerciseId), sub: null, label: 'x' },
        { kind: 'race', ref: raceFutureId, sub: null, label: 'x' },
        { kind: 'race', ref: racePastId, sub: null, label: 'x' },
        { kind: 'race', ref: raceTodayId, sub: null, label: 'x' },
        { kind: 'race', ref: raceNoGoalId, sub: null, label: 'x' },
        // Repetir una referencia no debe sumar una consulta más: el batching
        // deduplica por ref antes de tocar la base.
        { kind: 'session', ref: assignmentPending, sub: null, label: 'x' },
        { kind: 'exercise', ref: String(cardioExerciseId), sub: null, label: 'x' },
      ];

      const url = getTestDbUrl();
      if (!url) throw new Error('unreachable — suite is gated by hasTestDb()');
      const queries: string[] = [];
      const counting = postgres(url, {
        ssl: 'require',
        max: 1,
        prepare: false,
        debug: (_conn, query) => {
          queries.push(query);
        },
      });
      try {
        // Conexión en frío: postgres.js dispara SU PROPIA consulta única de
        // introspección de tipos array (`pg_catalog.pg_type`) la primera vez
        // que liga un parámetro `::bigint[]`, cacheada para el resto de la
        // vida de la conexión. Es contabilidad del driver, no una consulta de
        // negocio — se "calienta" aparte para que el recuento de abajo mida
        // SOLO lo que dispara `resolveContextPreviews`.
        await counting`select array[1::bigint]`;
        queries.length = 0;

        const previews = await resolveContextPreviews(counting as never, contexts);
        // Cada context recibe una entrada — el resultado no se recorta por el
        // batching interno.
        for (const c of contexts) expect(previews.has(previewKey(c))).toBe(true);

        // El punto que demuestra el lote: 11 contextos, con 3 `kind` y varias
        // referencias repetidas, resuelven en 5 consultas — muy por debajo de
        // 11 y sin escalar con N. session = existencia (1, comparte sin-sub y
        // con-sub) + summaries de plantilla (1) + líneas con-sub (1); exercise
        // = 1; race = 1.
        expect(queries.length).toBe(5);
        expect(queries.length).toBeLessThan(contexts.length);
      } finally {
        await counting.end({ timeout: 5 });
      }
    });

    it('cero contextos no toca la base', async () => {
      const url = getTestDbUrl();
      if (!url) throw new Error('unreachable — suite is gated by hasTestDb()');
      const queries: string[] = [];
      const counting = postgres(url, {
        ssl: 'require',
        max: 1,
        prepare: false,
        debug: (_conn, query) => {
          queries.push(query);
        },
      });
      try {
        const previews = await resolveContextPreviews(counting as never, []);
        expect(previews.size).toBe(0);
        expect(queries.length).toBe(0);
      } finally {
        await counting.end({ timeout: 5 });
      }
    });
  });
});
