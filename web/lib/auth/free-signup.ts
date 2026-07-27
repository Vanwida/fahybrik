// FREE SIGNUP — alta abierta de atleta SIN coach, detrás de un único flag de entorno.
//
// El login de atleta es find-only ("LOGIN NEVER CREATES", lib/auth/users.ts):
// hoy nadie puede darse de alta solo. El tier free invierte esa decisión SOLO
// cuando FREE_SIGNUP=1 — producción no define la variable, así que con el flag
// apagado el comportamiento actual queda intacto (mismo patrón de puerta única
// que demo-access.ts: el flag, y solo el flag, la abre).
//
// La creación vive aquí, en UNA función compartida por los dos caminos de
// entrada (código por email y Sign in with Apple), para que las reglas de
// seguridad no puedan divergir:
//   · solo se converge sobre una cuenta existente cuando la pertenencia del
//     email está PROBADA (el código llegó a ese buzón, o email_verified del
//     identity token de Apple); un email sin verificar jamás enlaza con una
//     cuenta ajena (mismo guardarraíl anti-takeover que findAthleteForApple).
//   · una cuenta existente sin fila de atleta (un coach) NUNCA recibe una: el
//     alta free no injerta identidades de atleta en logins de coach.
//   · un apple_user_id ya ligado a OTRA cuenta se rechaza (nunca se re-apunta).
// Devuelve null al rechazar; el caller responde EXACTAMENTE igual que hoy ante
// cuenta inexistente (invalid_code / no_account), sin filtrar nada.
//
// El atleta nace SIN coach (athletes.coach_id queda null, nullable desde 0001)
// y sin perfil: dob/sex/etc. los da él en el onboarding, nunca un placeholder.

import { sql, type Sql, type TransactionClient } from '../db';
import { deriveDisplayName } from '../identity/display-name';
import type { AppleAuthResult, UserRow } from './users';

/**
 * El ÚNICO interruptor del alta free. Producción no define FREE_SIGNUP →
 * false → login find-only exacto de siempre.
 */
export function isFreeSignupEnabled(): boolean {
  return process.env.FREE_SIGNUP === '1';
}

export interface FreeSignupIdentity {
  /** Email de la identidad; null solo en Apple sin claim de email. */
  email: string | null;
  /**
   * true cuando la pertenencia del email está probada: el camino email-code lo
   * está por construcción (el código se recibió en ese buzón); el camino Apple
   * pasa el claim email_verified del identity token ya verificado.
   */
  email_verified: boolean;
  /** sub del identity token de Apple; ausente en el camino email. */
  apple_user_id?: string | null;
  /** Nombre que envía el cliente SIWA en el primer alta (hint opcional). */
  full_name?: string | null;
}

type UserSel = {
  id: string;
  email: string;
  apple_user_id: string | null;
  role: UserRow['role'];
};

type AthleteSel = {
  id: string;
  user_id: string;
  full_name: string;
  onboarded_at: Date | null;
  coach_id: string | null;
};

function toResult(user: UserSel, athlete: AthleteSel): AppleAuthResult {
  return {
    user: {
      id: BigInt(user.id),
      email: user.email,
      apple_user_id: user.apple_user_id,
      role: user.role,
    },
    athlete: {
      id: BigInt(athlete.id),
      user_id: BigInt(athlete.user_id),
      full_name: athlete.full_name,
      onboarded_at: athlete.onboarded_at,
      coach_id: athlete.coach_id == null ? null : BigInt(athlete.coach_id),
    },
  };
}

async function selectAthleteByUserId(
  tx: TransactionClient,
  userId: bigint,
): Promise<AthleteSel | null> {
  const rows = await tx<AthleteSel[]>`
    select id::text as id, user_id::text as user_id, full_name, onboarded_at,
           coach_id::text as coach_id
    from athletes
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Find-or-create del atleta free — idempotente y a prueba de carreras (una
 * transacción; el insert usa `on conflict (email) do nothing` y re-resuelve,
 * así dos peticiones simultáneas del mismo alta convergen en una sola cuenta).
 * Los callers solo llegan aquí tras un find-only nulo Y con el flag encendido.
 */
export async function createFreeAthlete(
  identity: FreeSignupIdentity,
  client: Sql = sql,
): Promise<AppleAuthResult | null> {
  const appleUserId = identity.apple_user_id ?? null;
  const realEmail = identity.email ? identity.email.toLowerCase() : null;
  if (!realEmail && !appleUserId) return null;

  // Apple sin claim de email: placeholder determinista derivado del sub (mismo
  // formato que partner/redeem) — único por identidad, así una carrera converge.
  const email = realEmail ?? `apple-${appleUserId}@privaterelay.appleid.placeholder`;

  // El placeholder solo puede chocar con una fila creada para este mismo sub de
  // Apple, así que adoptar esa cuenta es seguro aunque no haya claim verificado.
  const canAdoptByEmail = identity.email_verified || realEmail == null;

  const fullName =
    identity.full_name?.trim() ||
    (realEmail ? deriveDisplayName({ email: realEmail }) : '') ||
    'Atleta';

  return await client.begin(async (tx) => {
    // Adopción de una cuenta ya existente (carrera con el find-only del caller,
    // o un segundo intento del mismo alta). Reglas anti-takeover arriba.
    const adopt = async (): Promise<AppleAuthResult | null> => {
      let userRow: UserSel | undefined;

      if (appleUserId) {
        const byApple = await tx<UserSel[]>`
          select id::text as id, email, apple_user_id, role
          from users
          where apple_user_id = ${appleUserId}
            and deleted_at is null
          limit 1
        `;
        userRow = byApple[0];
      }

      if (!userRow) {
        const byEmail = await tx<UserSel[]>`
          select id::text as id, email, apple_user_id, role
          from users
          where email = ${email}
            and deleted_at is null
          limit 1
        `;
        const existing = byEmail[0];
        if (existing) {
          // Email sin verificar → jamás enlazar con una cuenta ajena.
          if (!canAdoptByEmail) return null;
          // Apple id ya ligado a OTRA identidad → jamás re-apuntar.
          if (appleUserId && existing.apple_user_id && existing.apple_user_id !== appleUserId) {
            return null;
          }
          userRow = existing;
        }
      }

      if (!userRow) return null;

      const userId = BigInt(userRow.id);
      // Cuenta sin fila de atleta (un coach) → el alta free no la toca.
      const athlete = await selectAthleteByUserId(tx, userId);
      if (!athlete) return null;

      if (appleUserId && !userRow.apple_user_id) {
        const linked = await tx<UserSel[]>`
          update users
          set apple_user_id = ${appleUserId}, last_seen_at = now()
          where id = ${userId}
          returning id::text as id, email, apple_user_id, role
        `;
        userRow = linked[0] ?? userRow;
      } else {
        await tx`update users set last_seen_at = now() where id = ${userId}`;
      }

      return toResult(userRow, athlete);
    };

    const adopted = await adopt();
    if (adopted) return adopted;

    // Nada que adoptar y sin cuenta que crear encima de un email ajeno sin
    // verificar → alta nueva de verdad. Si el insert pierde la carrera del
    // email (do nothing → 0 filas), se re-resuelve por adopción.
    const inserted = await tx<UserSel[]>`
      insert into users (email, apple_user_id, role, last_seen_at)
      values (${email}, ${appleUserId}, 'athlete', now())
      on conflict (email) do nothing
      returning id::text as id, email, apple_user_id, role
    `;
    const newUser = inserted[0];
    if (!newUser) return await adopt();

    const userId = BigInt(newUser.id);
    const athleteRows = await tx<AthleteSel[]>`
      insert into athletes (user_id, full_name)
      values (${userId}, ${fullName})
      returning id::text as id, user_id::text as user_id, full_name, onboarded_at,
                coach_id::text as coach_id
    `;
    const athlete = athleteRows[0];
    if (!athlete) throw new Error('free_signup_athlete_insert_failed');

    // Authz: user_roles es la fuente de verdad de roles (0041). Idempotente.
    await tx`
      insert into user_roles (user_id, role)
      values (${userId}, 'athlete')
      on conflict (user_id, role) do nothing
    `;

    return toResult(newUser, athlete);
  });
}
