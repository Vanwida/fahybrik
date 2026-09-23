// La bandeja de Mensajes contra base de datos real: qué es «por responder», qué
// quita «hecho» y cuándo vuelve, que abrir un hilo solo lee ESE hilo, que «marcar
// sin leer» no miente al atleta, que la búsqueda casa por nombre y por texto sin
// tildes, y que nada cruza de un coach a otro. Lo que se prueba ES el SQL (las
// laterales, el filtro por dueño, la comparación con los overrides), así que un
// mock no ejercitaría nada.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { loadMensajesInbox } from '@/lib/dashboard/v2/mensajes-data';
import { markRead, markThreadUnreadForCoach } from '@/lib/chat/service';
import { applyOverrides } from '@/lib/coach/attention/overrides';
import { BroadcastForbiddenError, resolveBroadcastRecipients } from '@/lib/chat/broadcast';

describeWithDb('bandeja de Mensajes (DB real)', () => {
  const sql = getTestSql();
  const userIds: number[] = [];
  const coachIds: number[] = [];
  const athleteIds: number[] = [];
  const threadIds: number[] = [];
  const seqIds: number[] = [];

  const NOW = new Date();
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  let coachA = 0;
  let coachAUser = 0;
  let coachB = 0;
  const A: Record<string, { id: number; user: number; thread: number }> = {};
  let bAthlete = 0;

  async function user(role: 'coach' | 'athlete', label: string): Promise<number> {
    const r = await sql<{ id: string }[]>`
      insert into users (email, role) values (${`msj-${label}-${tag}@test.local`}, ${role}::user_role) returning id::text as id
    `;
    const id = Number(r[0]!.id);
    userIds.push(id);
    return id;
  }
  async function coach(label: string): Promise<{ id: number; user: number }> {
    const u = await user('coach', label);
    const r = await sql<{ id: string }[]>`insert into coaches (user_id, full_name) values (${u}, ${label}) returning id::text as id`;
    coachIds.push(Number(r[0]!.id));
    return { id: Number(r[0]!.id), user: u };
  }
  async function athlete(coachId: number, name: string): Promise<{ id: number; user: number; thread: number }> {
    const u = await user('athlete', name.replace(/\W/g, ''));
    const a = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name) values (${u}, ${coachId}, ${name}) returning id::text as id
    `;
    const id = Number(a[0]!.id);
    athleteIds.push(id);
    const t = await sql<{ id: string }[]>`
      insert into chat_threads (coach_id, athlete_id) values (${coachId}, ${id}) returning id::text as id
    `;
    threadIds.push(Number(t[0]!.id));
    return { id, user: u, thread: Number(t[0]!.id) };
  }
  async function say(threadId: number, senderUser: number, role: 'coach' | 'athlete', body: string, at: Date, read = false) {
    const r = await sql<{ id: string }[]>`
      insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at, read_at)
      values (${threadId}, ${senderUser}, ${role}, ${body}, ${at.toISOString()}::timestamptz, ${read ? at.toISOString() : null}::timestamptz)
      returning id::text as id
    `;
    await sql`
      update chat_threads set last_message_at = ${at.toISOString()}::timestamptz,
        unread_for_coach = unread_for_coach + ${role === 'athlete' && !read ? 1 : 0}
      where id = ${threadId}
    `;
    return r[0]!.id;
  }
  const inboxA = (q?: string) => loadMensajesInbox({ coach_id: coachA, q, now: NOW, client: sql });
  const rowOf = async (key: string) => (await inboxA()).threads.find((t) => t.athlete_id === String(A[key]!.id))!;

  beforeAll(async () => {
    const ca = await coach('Coach A');
    coachA = ca.id;
    coachAUser = ca.user;
    coachB = (await coach('Coach B')).id;

    A.waiting = await athlete(coachA, `Martí Esperando ${tag}`);
    A.replied = await athlete(coachA, `Laia Contestada ${tag}`);
    A.done = await athlete(coachA, `Pau Hecho ${tag}`);
    A.other = await athlete(coachA, `Nil Otro ${tag}`);
    bAthlete = (await athlete(coachB, `Martí Ajeno ${tag}`)).id;

    // Esperando: escribió él lo último, dos mensajes sin respuesta (el más viejo hace 20 h).
    await say(A.waiting.thread, coachAUser, 'coach', 'Mañana series de 400', ago(30), true);
    await say(A.waiting.thread, A.waiting.user, 'athlete', '¿Qué peso pongo si no llego al pautado?', ago(20));
    await say(A.waiting.thread, A.waiting.user, 'athlete', 'Y otra cosa', ago(19));
    // Contestada: escribió él, contestó el coach.
    await say(A.replied.thread, A.replied.user, 'athlete', 'Hecho el entreno', ago(10), true);
    await say(A.replied.thread, coachAUser, 'coach', 'Genial', ago(9));
    // Para marcar hecho.
    await say(A.done.thread, A.done.user, 'athlete', 'Gracias por el plan', ago(8));
    // Otro hilo sin leer, para el alcance de la lectura.
    await say(A.other.thread, A.other.user, 'athlete', 'Hola coach', ago(3));
    // El atleta de otro coach dice algo que casaría con la búsqueda.
    const bThread = threadIds[threadIds.length - 1]!;
    await say(bThread, userIds[userIds.length - 1]!, 'athlete', '¿Qué peso pongo hoy?', ago(2));
  });

  afterAll(async () => {
    await sql`delete from coach_alert_overrides where athlete_id = any(${athleteIds}::bigint[])`;
    await sql`delete from athlete_sequence_progress where athlete_id = any(${athleteIds}::bigint[])`;
    if (seqIds.length) await sql`delete from program_sequences where id = any(${seqIds}::bigint[])`;
    await sql`delete from chat_messages where thread_id = any(${threadIds}::bigint[])`;
    await sql`delete from chat_threads where id = any(${threadIds}::bigint[])`;
    await sql`delete from athletes where id = any(${athleteIds}::bigint[])`;
    await sql`delete from coaches where id = any(${coachIds}::bigint[])`;
    await sql`delete from users where id = any(${userIds}::bigint[])`;
    await closeTestSql();
  });

  describe('por responder', () => {
    it('el atleta escribió lo último → por responder, con la espera desde su PRIMER mensaje sin respuesta', async () => {
      const t = await rowOf('waiting');
      expect(t.state).toBe('por_responder');
      expect(t.waiting?.count).toBe(2);
      expect(Math.round((NOW.getTime() - Date.parse(t.waiting!.since)) / 3_600_000)).toBe(20);
      expect(t.last_message?.from).toBe('athlete');
    });

    it('el coach contestó → al día (leído o no da igual)', async () => {
      const t = await rowOf('replied');
      expect(t.state).toBe('al_dia');
      expect(t.waiting).toBeNull();
    });

    it('abrirlo NO lo contesta: leído sigue por responder', async () => {
      const lastId = await sql<{ id: string }[]>`
        select max(id)::text as id from chat_messages where thread_id = ${A.waiting.thread}
      `;
      await markRead({ sql, thread_id: String(A.waiting.thread), reader_role: 'coach', up_to_message_id: lastId[0]!.id });
      const t = await rowOf('waiting');
      expect(t.unread).toBe(0);
      expect(t.state).toBe('por_responder');
    });

    it('marcado «hecho» → sale de por responder y entra en Hechas', async () => {
      await applyOverrides({
        coach_id: coachA,
        targets: [{ athlete_id: String(A.done.id), signal_kind: 'message_unanswered' }],
        action: 'done',
        now: ago(1),
        client: sql,
      });
      const t = await rowOf('done');
      expect(t.state).toBe('hecho');
    });

    it('vuelve a escribir tras el «hecho» → otra espera, por responder otra vez', async () => {
      await say(A.done.thread, A.done.user, 'athlete', 'Una duda más', ago(0.5));
      const t = await rowOf('done');
      expect(t.state).toBe('por_responder');
      expect(t.waiting?.count).toBe(2);
    });

    it('posponer 1 día → pospuesto con fecha; hasta nueva señal → pospuesto sin fecha', async () => {
      await applyOverrides({
        coach_id: coachA,
        targets: [{ athlete_id: String(A.done.id), signal_kind: 'message_unanswered' }],
        action: 'snooze',
        until: '1d',
        now: NOW,
        client: sql,
      });
      let t = await rowOf('done');
      expect(t.state).toBe('pospuesto');
      expect(t.snoozed_until).not.toBeNull();

      await applyOverrides({
        coach_id: coachA,
        targets: [{ athlete_id: String(A.done.id), signal_kind: 'message_unanswered' }],
        action: 'snooze',
        until: 'signal',
        now: NOW,
        client: sql,
      });
      t = await rowOf('done');
      expect(t.state).toBe('pospuesto');
      expect(t.snoozed_until).toBeNull();
    });
  });

  describe('alcance de la lectura', () => {
    it('leer un hilo no toca los no leídos de otro', async () => {
      const before = await rowOf('other');
      expect(before.unread).toBe(1);
      const lastId = await sql<{ id: string }[]>`select max(id)::text as id from chat_messages where thread_id = ${A.waiting.thread}`;
      await markRead({ sql, thread_id: String(A.waiting.thread), reader_role: 'coach', up_to_message_id: lastId[0]!.id });
      expect((await rowOf('other')).unread).toBe(1);
      const unreadMsgs = await sql<{ n: number }[]>`
        select count(*)::int as n from chat_messages where thread_id = ${A.other.thread} and read_at is null
      `;
      expect(unreadMsgs[0]!.n).toBe(1);
    });

    it('marcar sin leer vuelve a contar el hilo sin tocar los acuses del atleta', async () => {
      const readBefore = await sql<{ n: number }[]>`
        select count(*)::int as n from chat_messages where thread_id = ${A.replied.thread} and read_at is not null
      `;
      expect(await markThreadUnreadForCoach({ sql, coach_id: coachA, athlete_id: A.replied.id })).toBe(true);
      expect((await rowOf('replied')).unread).toBe(1);
      const readAfter = await sql<{ n: number }[]>`
        select count(*)::int as n from chat_messages where thread_id = ${A.replied.thread} and read_at is not null
      `;
      expect(readAfter[0]!.n).toBe(readBefore[0]!.n);
    });

    it('un coach no puede marcar sin leer el hilo de un atleta ajeno', async () => {
      expect(await markThreadUnreadForCoach({ sql, coach_id: coachA, athlete_id: bAthlete })).toBe(false);
    });
  });

  describe('búsqueda y dueño', () => {
    it('la bandeja solo trae los hilos del coach', async () => {
      const ids = (await inboxA()).threads.map((t) => Number(t.athlete_id));
      expect(ids).not.toContain(bAthlete);
      expect(ids).toEqual(expect.arrayContaining([A.waiting.id, A.replied.id, A.done.id, A.other.id]));
    });

    it('por nombre, sin tildes ni orden de palabras', async () => {
      const res = await inboxA(`esperando marti ${tag}`);
      expect(res.threads.map((t) => t.athlete_id)).toEqual([String(A.waiting.id)]);
      expect(res.threads[0]!.match).toBeNull();
    });

    it('por texto de cualquier mensaje, con el mensaje que casa', async () => {
      const res = await inboxA('que peso PONGO');
      const mine = res.threads.filter((t) => athleteIds.includes(Number(t.athlete_id)));
      expect(mine.map((t) => t.athlete_id)).toEqual([String(A.waiting.id)]);
      expect(mine[0]!.match?.preview).toBe('¿Qué peso pongo si no llego al pautado?');
      // El «¿Qué peso pongo hoy?» del atleta del otro coach no aparece.
      expect(res.threads.map((t) => Number(t.athlete_id))).not.toContain(bAthlete);
    });
  });

  describe('enviar a varios', () => {
    it('resuelve grupos a sus miembros activos, sin repetidos', async () => {
      const g = await sql<{ id: string }[]>`
        insert into program_sequences (coach_id, name) values (${coachA}, ${`Grupo ${tag}`}) returning id::text as id
      `;
      const groupId = Number(g[0]!.id);
      seqIds.push(groupId);
      await sql`
        insert into athlete_sequence_progress (athlete_id, coach_id, sequence_id, status)
        values (${A.other.id}, ${coachA}, ${groupId}, 'active'), (${A.replied.id}, ${coachA}, ${groupId}, 'left')
      `;
      const ids = await resolveBroadcastRecipients({
        coach_id: coachA,
        athlete_ids: [String(A.waiting.id), String(A.other.id)],
        group_ids: [String(groupId)],
        client: sql,
      });
      expect(ids).toEqual([A.waiting.id, A.other.id].sort((a, b) => a - b));
    });

    it('un atleta o un grupo ajeno hace fallar el envío entero', async () => {
      await expect(
        resolveBroadcastRecipients({ coach_id: coachA, athlete_ids: [String(bAthlete)], group_ids: [], client: sql }),
      ).rejects.toBeInstanceOf(BroadcastForbiddenError);
      const gb = await sql<{ id: string }[]>`
        insert into program_sequences (coach_id, name) values (${coachB}, ${`Grupo B ${tag}`}) returning id::text as id
      `;
      seqIds.push(Number(gb[0]!.id));
      await expect(
        resolveBroadcastRecipients({ coach_id: coachA, athlete_ids: [], group_ids: [gb[0]!.id], client: sql }),
      ).rejects.toBeInstanceOf(BroadcastForbiddenError);
    });
  });
});
