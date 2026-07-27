// FREE SIGNUP — createFreeAthlete contra DB REAL (rama Neon de test,
// describeWithDb). WRITTEN for tsc; SKIPPED unless TEST_DATABASE_URL is set.
//
// Lo que se clava aquí (las reglas que los mocks de route no pueden probar):
//   · el alta crea users + athletes con coach_id NULL y el rol athlete;
//   · es idempotente: dos altas del mismo email convergen en UNA cuenta;
//   · una cuenta existente CON coach se adopta y devuelve su coach_id;
//   · una cuenta sin fila de atleta (un coach) se RECHAZA y no se le injerta;
//   · un email sin verificar que colisiona con una cuenta ajena se RECHAZA
//     sin tocar su apple_user_id (anti-takeover);
//   · Apple sin claim de email crea con el placeholder determinista y converge.

import { afterAll, afterEach, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

const testSql = getTestSql();

const { createFreeAthlete } = await import('@/lib/auth/free-signup');

let seq = 0;
function uniqEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}-${Math.floor(Math.random() * 1e6)}@test.local`;
}

// Teardown por email: todas las filas que estas pruebas crean (directamente o
// vía createFreeAthlete) cuelgan de un users.email único de test.local.
const createdEmails: string[] = [];
const createdCoachIds: bigint[] = [];

afterEach(async () => {
  if (createdEmails.length > 0) {
    const userRows = await testSql<{ id: string }[]>`
      select id::text as id from users where email in ${testSql(createdEmails)}
    `;
    const userIds = userRows.map((r) => BigInt(r.id));
    if (userIds.length > 0) {
      await testSql`delete from user_roles where user_id in ${testSql(userIds)}`;
      await testSql`delete from sessions where user_id in ${testSql(userIds)}`;
      await testSql`delete from athletes where user_id in ${testSql(userIds)}`;
    }
    if (createdCoachIds.length > 0) {
      await testSql`delete from coaches where id in ${testSql(createdCoachIds)}`;
      createdCoachIds.length = 0;
    }
    if (userIds.length > 0) {
      await testSql`delete from users where id in ${testSql(userIds)}`;
    }
    createdEmails.length = 0;
  }
});

afterAll(async () => {
  await closeTestSql();
});

describeWithDb('createFreeAthlete — alta free contra DB real', () => {
  test('email probado → crea users + athletes SIN coach, rol athlete, nombre del email', async () => {
    const email = uniqEmail('free-alta');
    createdEmails.push(email);

    const result = await createFreeAthlete({ email, email_verified: true }, testSql);
    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.athlete.coach_id).toBeNull();
    expect(result.user.email).toBe(email);
    // full_name = local-part del email (deriveDisplayName), nunca vacío.
    expect(result.athlete.full_name).toBe(email.split('@')[0]);

    const dbAthlete = await testSql<{ coach_id: string | null }[]>`
      select coach_id::text as coach_id from athletes where id = ${result.athlete.id}
    `;
    expect(dbAthlete[0]?.coach_id).toBeNull();

    const dbUser = await testSql<{ role: string }[]>`
      select role from users where id = ${result.user.id}
    `;
    expect(dbUser[0]?.role).toBe('athlete');

    const roles = await testSql<{ role: string }[]>`
      select role from user_roles where user_id = ${result.user.id}
    `;
    expect(roles.map((r) => r.role)).toContain('athlete');
  });

  test('idempotente: dos altas del mismo email convergen en UNA sola cuenta', async () => {
    const email = uniqEmail('free-idem');
    createdEmails.push(email);

    const first = await createFreeAthlete({ email, email_verified: true }, testSql);
    const second = await createFreeAthlete({ email, email_verified: true }, testSql);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (!first || !second) return;

    expect(second.user.id).toBe(first.user.id);
    expect(second.athlete.id).toBe(first.athlete.id);

    const count = await testSql<{ n: string }[]>`
      select count(*)::text as n from users where email = ${email}
    `;
    expect(count[0]?.n).toBe('1');
  });

  test('cuenta existente CON coach → se adopta y devuelve su coach_id (has_coach true)', async () => {
    const coachEmail = uniqEmail('free-coach-owner');
    const athleteEmail = uniqEmail('free-coached');
    createdEmails.push(coachEmail, athleteEmail);

    const coachUsers = await testSql<{ id: string }[]>`
      insert into users (email, role) values (${coachEmail}, 'coach') returning id::text as id
    `;
    const coaches = await testSql<{ id: string }[]>`
      insert into coaches (user_id, full_name)
      values (${BigInt(coachUsers[0]!.id)}, 'Coach Free Test')
      returning id::text as id
    `;
    const coachId = BigInt(coaches[0]!.id);
    createdCoachIds.push(coachId);

    const athleteUsers = await testSql<{ id: string }[]>`
      insert into users (email, role) values (${athleteEmail}, 'athlete') returning id::text as id
    `;
    await testSql`
      insert into athletes (user_id, full_name, coach_id)
      values (${BigInt(athleteUsers[0]!.id)}, 'Atleta Con Coach', ${coachId})
    `;

    const result = await createFreeAthlete({ email: athleteEmail, email_verified: true }, testSql);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.user.id).toBe(BigInt(athleteUsers[0]!.id));
    expect(result.athlete.coach_id).toBe(coachId);
  });

  test('cuenta sin fila de atleta (un coach) → RECHAZADA y sin injertos', async () => {
    const email = uniqEmail('free-coach-only');
    createdEmails.push(email);
    const users = await testSql<{ id: string }[]>`
      insert into users (email, role) values (${email}, 'coach') returning id::text as id
    `;

    const result = await createFreeAthlete({ email, email_verified: true }, testSql);
    expect(result).toBeNull();

    const athletes = await testSql<{ id: string }[]>`
      select id::text as id from athletes where user_id = ${BigInt(users[0]!.id)}
    `;
    expect(athletes).toHaveLength(0);
  });

  test('Apple con email SIN verificar que colisiona con cuenta ajena → RECHAZADA, sin enlazar', async () => {
    const email = uniqEmail('free-takeover');
    createdEmails.push(email);
    const users = await testSql<{ id: string }[]>`
      insert into users (email, role) values (${email}, 'athlete') returning id::text as id
    `;
    await testSql`
      insert into athletes (user_id, full_name) values (${BigInt(users[0]!.id)}, 'Titular Legítimo')
    `;

    const result = await createFreeAthlete(
      { email, email_verified: false, apple_user_id: `apple-evil-${Date.now()}` },
      testSql,
    );
    expect(result).toBeNull();

    const after = await testSql<{ apple_user_id: string | null }[]>`
      select apple_user_id from users where id = ${BigInt(users[0]!.id)}
    `;
    expect(after[0]?.apple_user_id).toBeNull();
  });

  test('Apple sin claim de email → placeholder determinista, y una repetición converge', async () => {
    const sub = `apple-free-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const placeholder = `apple-${sub}@privaterelay.appleid.placeholder`;
    createdEmails.push(placeholder);

    const first = await createFreeAthlete(
      { email: null, email_verified: false, apple_user_id: sub, full_name: 'Anónimo Apple' },
      testSql,
    );
    expect(first).not.toBeNull();
    if (!first) return;
    expect(first.user.email).toBe(placeholder);
    expect(first.user.apple_user_id).toBe(sub);
    expect(first.athlete.coach_id).toBeNull();
    expect(first.athlete.full_name).toBe('Anónimo Apple');

    const second = await createFreeAthlete(
      { email: null, email_verified: false, apple_user_id: sub },
      testSql,
    );
    expect(second?.user.id).toBe(first.user.id);
  });

  test('Apple con email verificado de un atleta existente sin binding → adopta Y enlaza el sub', async () => {
    const email = uniqEmail('free-link');
    createdEmails.push(email);
    const users = await testSql<{ id: string }[]>`
      insert into users (email, role) values (${email}, 'athlete') returning id::text as id
    `;
    await testSql`
      insert into athletes (user_id, full_name) values (${BigInt(users[0]!.id)}, 'Sin Binding')
    `;

    const sub = `apple-link-${Date.now()}`;
    const result = await createFreeAthlete(
      { email, email_verified: true, apple_user_id: sub },
      testSql,
    );
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.user.id).toBe(BigInt(users[0]!.id));
    expect(result.user.apple_user_id).toBe(sub);
  });
});
