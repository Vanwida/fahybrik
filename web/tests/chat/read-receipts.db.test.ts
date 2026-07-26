// Acuses de lectura y contadores de no leídos, contra base de datos real.
//
// EL FALLO QUE ESTO CIERRA
// ------------------------
// `markRead` sellaba TODOS los mensajes del hilo hasta el corte, incluidos los del
// propio lector. `read_at` significa "el destinatario lo ha leído", así que abrir
// la conversación pintaba un doble check en la pantalla del otro por mensajes que
// nadie había leído. Un coach abriendo el hilo para escribir marcaba como leídos
// sus propios mensajes de ayer, y el atleta veía que se los habían leído.
//
// Va contra una rama de Neon de verdad porque lo que se está probando ES el SQL:
// el filtro por autor, el corte por id y el contador del hilo. Un mock del
// cliente no ejercitaría nada de eso. Se salta con aviso cuando no hay
// TEST_DATABASE_URL — nunca en verde falso.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { markRead, sendMessage } from '@/lib/chat/service';

describeWithDb('acuses de lectura y no leídos (DB real)', () => {
  const sql = getTestSql();

  let coachUserId = 0;
  let coachId = 0;
  let athleteUserId = 0;
  let athleteId = 0;
  let threadId = '';
  const userIds: number[] = [];

  const uniqueEmail = (tag: string) =>
    `chat-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  beforeAll(async () => {
    const coachUser = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('coach')}, 'coach'::user_role)
      returning id::text as id
    `;
    coachUserId = Number(coachUser[0]!.id);
    userIds.push(coachUserId);

    const coach = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${coachUserId}, 'Coach de prueba')
      returning id::text as id
    `;
    coachId = Number(coach[0]!.id);

    const athleteUser = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('athlete')}, 'athlete'::user_role)
      returning id::text as id
    `;
    athleteUserId = Number(athleteUser[0]!.id);
    userIds.push(athleteUserId);

    const athlete = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${athleteUserId}, ${coachId}, 'Atleta de prueba')
      returning id::text as id
    `;
    athleteId = Number(athlete[0]!.id);

    const thread = await sql<{ id: string }[]>`
      insert into chat_threads (coach_id, athlete_id) values (${coachId}, ${athleteId})
      returning id::text as id
    `;
    threadId = thread[0]!.id;
  });

  afterAll(async () => {
    // Los mensajes van primero: `chat_messages.sender_user_id` referencia a users
    // con ON DELETE RESTRICT, así que borrar el usuario sin vaciarlos falla.
    if (threadId) {
      await sql`delete from chat_messages where thread_id = ${threadId}::bigint`;
      await sql`delete from chat_threads where id = ${threadId}::bigint`;
    }
    if (userIds.length > 0) {
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await closeTestSql();
  });

  async function send(role: 'coach' | 'athlete', body: string) {
    return sendMessage({
      sql,
      thread_id: threadId,
      sender_user_id: BigInt(role === 'coach' ? coachUserId : athleteUserId),
      sender_role: role,
      input: { body },
    });
  }

  async function readAtOf(messageId: string): Promise<string | null> {
    const rows = await sql<{ read_at: string | null }[]>`
      select read_at::text from chat_messages where id = ${messageId}::bigint
    `;
    return rows[0]?.read_at ?? null;
  }

  async function unreadCounters() {
    const rows = await sql<{ coach: number; athlete: number }[]>`
      select unread_for_coach as coach, unread_for_athlete as athlete
      from chat_threads where id = ${threadId}::bigint
    `;
    return rows[0]!;
  }

  it('cada envío sube el contador del OTRO lado, nunca el propio', async () => {
    await send('coach', 'Hola, ¿cómo fue la serie?');
    expect(await unreadCounters()).toEqual({ coach: 0, athlete: 1 });

    await send('athlete', 'Dura, pero entera.');
    expect(await unreadCounters()).toEqual({ coach: 1, athlete: 1 });
  });

  it('el coach al leer NO sella sus propios mensajes', async () => {
    const mine = await send('coach', 'Perfecto, mañana suave.');
    const theirs = await send('athlete', 'Entendido.');

    const result = await markRead({
      sql,
      thread_id: threadId,
      reader_role: 'coach',
      up_to_message_id: theirs.id,
    });

    // Solo se sellan los del atleta: los dos que llevaba sin leer.
    expect(result.marked).toBe(2);
    expect(await readAtOf(theirs.id)).not.toBeNull();
    expect(await readAtOf(mine.id)).toBeNull();
  });

  it('leer pone a cero el contador del lector y deja el del otro intacto', async () => {
    await send('coach', 'Sin leer por el atleta.');
    const theirs = await send('athlete', 'Sin leer por el coach.');
    const before = await unreadCounters();
    expect(before.coach).toBeGreaterThan(0);
    expect(before.athlete).toBeGreaterThan(0);

    await markRead({
      sql,
      thread_id: threadId,
      reader_role: 'coach',
      up_to_message_id: theirs.id,
    });

    const after = await unreadCounters();
    expect(after.coach).toBe(0);
    expect(after.athlete).toBe(before.athlete);
  });

  it('no sella nada posterior al corte', async () => {
    const cutoff = await send('athlete', 'Una duda más.');
    const later = await send('athlete', 'Y otra.');

    await markRead({
      sql,
      thread_id: threadId,
      reader_role: 'coach',
      up_to_message_id: cutoff.id,
    });

    expect(await readAtOf(cutoff.id)).not.toBeNull();
    expect(await readAtOf(later.id)).toBeNull();
  });

  it('el atleta al leer sella los del coach, y no al revés', async () => {
    const fromCoach = await send('coach', 'Te lo miro y te digo.');
    const fromAthlete = await send('athlete', 'Gracias.');

    await markRead({
      sql,
      thread_id: threadId,
      reader_role: 'athlete',
      up_to_message_id: fromAthlete.id,
    });

    expect(await readAtOf(fromCoach.id)).not.toBeNull();
    // El último del atleta es SUYO: leerlo él no lo convierte en leído por el coach.
    expect(await readAtOf(fromAthlete.id)).toBeNull();
    expect((await unreadCounters()).athlete).toBe(0);
  });

  it('marcar con un id que no es del hilo no toca nada', async () => {
    const before = await unreadCounters();
    const result = await markRead({
      sql,
      thread_id: threadId,
      reader_role: 'coach',
      up_to_message_id: '999999999',
    });
    expect(result.marked).toBe(0);
    expect(await unreadCounters()).toEqual(before);
  });

  it('el DTO devuelve el rol guardado, no uno deducido del usuario', async () => {
    const fromCoach = await send('coach', 'Rol guardado.');
    const fromAthlete = await send('athlete', 'También.');
    expect(fromCoach.sender_role).toBe('coach');
    expect(fromAthlete.sender_role).toBe('athlete');
  });
});
