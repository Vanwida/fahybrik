// MCP connector auth: Clerk OAuth access token → the coach whose club it acts as.
//
// Two hops, and they answer different questions:
//
//   1. AUTHENTICATION (`verifyMcpToken`) — is this a real, live Clerk OAuth
//      token? Clerk answers. Out comes an `AuthInfo` whose `extra.userId` is the
//      Clerk user that granted the connector access.
//   2. AUTHORIZATION (`coachFromAuthInfo`) — is that human a member of a club?
//      OUR DB answers, through the same resolver the dashboard uses. A perfectly
//      valid token from someone who is not a coach gets nothing.
//
// The second hop runs on EVERY tool call rather than once per connection. That
// is deliberate: a membership revoked mid-conversation has to stop the next
// question, not the next reconnect. It is one indexed lookup.

import { auth } from '@clerk/nextjs/server';
import { verifyClerkToken } from '@clerk/mcp-tools/server';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  getCoachSessionForClerkUser,
  type CoachSession,
} from '@/lib/auth/coach-session';

/**
 * Told to the assistant, verbatim, when the token is valid but its owner is not
 * a coach in this system. Written for a person to read: it says what is wrong
 * and what would fix it, and it does NOT hint at which accounts do exist.
 */
export const NOT_A_COACH_MESSAGE =
  'Esta cuenta no es de ningún coach de la plataforma, así que no hay ningún club al que dar acceso. Entra primero al panel con la cuenta con la que llevas a tus atletas y vuelve a conectar el asistente.';

/** Raised when the caller authenticated fine but is nobody's coach. */
export class McpNotACoachError extends Error {
  constructor() {
    super(NOT_A_COACH_MESSAGE);
    this.name = 'McpNotACoachError';
  }
}

/**
 * Bearer verifier for `withMcpAuth`. Returns undefined for anything that is not
 * a live Clerk OAuth token, which `withMcpAuth` turns into a 401 carrying the
 * `WWW-Authenticate` pointer to our protected-resource metadata — the handshake
 * that makes a client start the OAuth dance instead of just failing.
 *
 * `acceptsToken: 'oauth_token'` is what makes `auth()` read the Authorization
 * header instead of a session cookie. It needs clerkMiddleware to have run over
 * the request, which is why /api/[transport] stays INSIDE the middleware matcher
 * while staying OUT of `isProtectedRoute` (see proxy.ts).
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const clerkAuth = await auth({ acceptsToken: 'oauth_token' });
  return verifyClerkToken(clerkAuth, bearerToken);
}

/**
 * The Clerk user id carried by a verified token, or null when the shape is not
 * what `verifyClerkToken` produces. Reading `extra.userId` through a guard
 * rather than a cast means a future change in that contract surfaces as "not a
 * coach" instead of as a `coach_id` of `undefined` reaching a WHERE clause.
 */
export function clerkUserIdFromAuthInfo(authInfo: AuthInfo | undefined): string | null {
  const userId = authInfo?.extra?.userId;
  return typeof userId === 'string' && userId.length > 0 ? userId : null;
}

/**
 * The coach session every tool must be handed before it touches data.
 * Throws `McpNotACoachError` rather than returning null so no tool can forget to
 * check and end up querying with an undefined `coach_id`.
 */
export async function coachFromAuthInfo(
  authInfo: AuthInfo | undefined,
): Promise<CoachSession> {
  const clerkUserId = clerkUserIdFromAuthInfo(authInfo);
  if (!clerkUserId) throw new McpNotACoachError();

  const session = await getCoachSessionForClerkUser(clerkUserId);
  if (!session) throw new McpNotACoachError();

  return session;
}
